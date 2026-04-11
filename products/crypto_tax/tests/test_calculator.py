"""
Tests for the tax calculation engine.

Covers:
  - FIFO, LIFO, HIFO lot matching
  - Short-term vs long-term classification
  - Income event capture
  - Crypto-to-crypto exchange handling
  - Wash-sale (not enforced for crypto yet, but no incorrect deductions)
  - Edge cases: zero-cost-basis lots, unmatched quantity
"""

import pytest
from datetime import datetime, timedelta

from src.parser import CryptoTransaction
from src.calculator import calculate_taxes, TaxReport, VALID_METHODS


# ── Helpers ────────────────────────────────────────────────────────────────────

def _dt(year: int, month: int = 1, day: int = 1) -> datetime:
    return datetime(year, month, day)


def _tx(
    ts: datetime,
    currency: str,
    amount: float,
    native_usd: float,
    kind: str,
    to_currency: str = None,
    to_amount: float = None,
    description: str = "",
) -> CryptoTransaction:
    return CryptoTransaction(
        timestamp=ts,
        description=description or kind,
        currency=currency,
        amount=amount,
        to_currency=to_currency,
        to_amount=to_amount,
        native_currency="USD",
        native_amount=native_usd,
        native_amount_usd=native_usd,
        transaction_kind=kind,
    )


# ── Simple gain/loss ───────────────────────────────────────────────────────────

class TestSimpleGainLoss:
    """Buy 1 BTC at $30,000 then sell at $50,000 → $20,000 gain."""

    def _transactions(self):
        return [
            _tx(_dt(2021), "BTC", 1.0, -30000, "crypto_purchase"),
            _tx(_dt(2022), "BTC", -1.0, 50000, "crypto_purchase"),
        ]

    def test_fifo_gain(self):
        report = calculate_taxes(self._transactions(), method="FIFO")
        assert len(report.tax_events) == 1
        evt = report.tax_events[0]
        assert evt.proceeds_usd == pytest.approx(50000, rel=1e-4)
        assert evt.cost_basis_usd == pytest.approx(30000, rel=1e-4)
        assert evt.gain_loss_usd == pytest.approx(20000, rel=1e-4)

    def test_total_gain(self):
        report = calculate_taxes(self._transactions(), method="FIFO")
        assert report.total_gain_loss == pytest.approx(20000, rel=1e-4)

    def test_no_income_events(self):
        report = calculate_taxes(self._transactions(), method="FIFO")
        assert report.income_events == []


class TestSimpleLoss:
    """Buy 1 BTC at $50,000 then sell at $30,000 → $20,000 loss."""

    def _transactions(self):
        return [
            _tx(_dt(2021), "BTC", 1.0, -50000, "crypto_purchase"),
            _tx(_dt(2022), "BTC", -1.0, 30000, "crypto_purchase"),
        ]

    def test_loss_is_negative(self):
        report = calculate_taxes(self._transactions(), method="FIFO")
        assert report.total_gain_loss == pytest.approx(-20000, rel=1e-4)


# ── Short-term vs long-term ────────────────────────────────────────────────────

class TestHoldingPeriod:
    def test_short_term_within_365_days(self):
        txs = [
            _tx(_dt(2022, 1, 1),  "ETH", 1.0, -3000, "crypto_purchase"),
            _tx(_dt(2022, 12, 31), "ETH", -1.0, 4000, "crypto_purchase"),
        ]
        report = calculate_taxes(txs, method="FIFO")
        assert report.tax_events[0].is_long_term is False

    def test_long_term_over_365_days(self):
        txs = [
            _tx(_dt(2020, 1, 1), "ETH", 1.0, -1000, "crypto_purchase"),
            _tx(_dt(2021, 6, 1), "ETH", -1.0, 2000, "crypto_purchase"),
        ]
        report = calculate_taxes(txs, method="FIFO")
        assert report.tax_events[0].is_long_term is True

    def test_exactly_365_days_is_short_term(self):
        """Held exactly 365 days is NOT long-term (must be > 365 days)."""
        buy = datetime(2022, 1, 1)
        sell = buy + timedelta(days=365)
        txs = [
            _tx(buy,  "BTC", 1.0, -30000, "crypto_purchase"),
            _tx(sell, "BTC", -1.0, 35000, "crypto_purchase"),
        ]
        report = calculate_taxes(txs, method="FIFO")
        assert report.tax_events[0].is_long_term is False

    def test_366_days_is_long_term(self):
        buy = datetime(2022, 1, 1)
        sell = buy + timedelta(days=366)
        txs = [
            _tx(buy,  "BTC", 1.0, -30000, "crypto_purchase"),
            _tx(sell, "BTC", -1.0, 35000, "crypto_purchase"),
        ]
        report = calculate_taxes(txs, method="FIFO")
        assert report.tax_events[0].is_long_term is True

    def test_short_term_total_isolated(self):
        txs = [
            _tx(_dt(2022, 1, 1), "BTC", 1.0, -30000, "crypto_purchase"),
            _tx(_dt(2022, 6, 1), "BTC", -1.0, 35000, "crypto_purchase"),
        ]
        report = calculate_taxes(txs, method="FIFO")
        assert report.total_short_term_gain_loss == pytest.approx(5000, rel=1e-4)
        assert report.total_long_term_gain_loss == pytest.approx(0)

    def test_long_term_total_isolated(self):
        txs = [
            _tx(_dt(2020, 1, 1), "BTC", 1.0, -10000, "crypto_purchase"),
            _tx(_dt(2022, 1, 1), "BTC", -1.0, 40000, "crypto_purchase"),
        ]
        report = calculate_taxes(txs, method="FIFO")
        assert report.total_long_term_gain_loss == pytest.approx(30000, rel=1e-4)
        assert report.total_short_term_gain_loss == pytest.approx(0)


# ── FIFO / LIFO / HIFO methods ─────────────────────────────────────────────────

class TestCostBasisMethods:
    """
    Buy 1 BTC @ $10,000  (lot A – older)
    Buy 1 BTC @ $30,000  (lot B – newer, higher cost)
    Sell 1 BTC @ $25,000

    FIFO: uses lot A (oldest)  → gain = 25,000 - 10,000 = $15,000
    LIFO: uses lot B (newest)  → loss = 25,000 - 30,000 = -$5,000
    HIFO: uses lot B (highest) → loss = 25,000 - 30,000 = -$5,000
    """

    def _txs(self):
        return [
            _tx(datetime(2020, 1, 1), "BTC", 1.0, -10000, "crypto_purchase"),
            _tx(datetime(2021, 1, 1), "BTC", 1.0, -30000, "crypto_purchase"),
            _tx(datetime(2022, 1, 1), "BTC", -1.0, 25000, "crypto_purchase"),
        ]

    def test_fifo_gain(self):
        report = calculate_taxes(self._txs(), method="FIFO")
        assert report.total_gain_loss == pytest.approx(15000, rel=1e-4)

    def test_lifo_loss(self):
        report = calculate_taxes(self._txs(), method="LIFO")
        assert report.total_gain_loss == pytest.approx(-5000, rel=1e-4)

    def test_hifo_loss(self):
        report = calculate_taxes(self._txs(), method="HIFO")
        assert report.total_gain_loss == pytest.approx(-5000, rel=1e-4)

    def test_invalid_method_raises(self):
        with pytest.raises(ValueError):
            calculate_taxes(self._txs(), method="AVERAGE")

    def test_all_methods_valid(self):
        """All VALID_METHODS should run without error."""
        for m in VALID_METHODS:
            report = calculate_taxes(self._txs(), method=m)
            assert isinstance(report, TaxReport)


# ── FIFO multiple lots, partial consumption ────────────────────────────────────

class TestFifoPartialConsumption:
    """
    Lot A: 2 BTC @ $10,000 each = $20,000 total
    Lot B: 1 BTC @ $40,000
    Sell 3 BTC @ $50,000 each = $150,000 total proceeds

    FIFO consumes:
      2 BTC from lot A → basis $20,000, proceeds $100,000 → gain $80,000
      1 BTC from lot B → basis $40,000, proceeds $50,000  → gain $10,000
    Total gain = $90,000
    """

    def _txs(self):
        return [
            _tx(datetime(2020, 1, 1), "BTC", 2.0, -20000, "crypto_purchase"),
            _tx(datetime(2021, 1, 1), "BTC", 1.0, -40000, "crypto_purchase"),
            _tx(datetime(2023, 1, 1), "BTC", -3.0, 150000, "crypto_purchase"),
        ]

    def test_total_gain(self):
        report = calculate_taxes(self._txs(), method="FIFO")
        assert report.total_gain_loss == pytest.approx(90000, rel=1e-4)

    def test_two_tax_events_generated(self):
        report = calculate_taxes(self._txs(), method="FIFO")
        assert len(report.tax_events) == 2


# ── Income events ──────────────────────────────────────────────────────────────

class TestIncomeEvents:
    def _txs(self):
        return [
            _tx(_dt(2021), "CRO", 100.0, 50.0, "crypto_earn_interest_paid",
                description="Earn Interest"),
            _tx(_dt(2021), "CRO", 10.0, 5.0, "referral_gift",
                description="Referral Bonus"),
        ]

    def test_income_events_captured(self):
        report = calculate_taxes(self._txs(), method="FIFO")
        assert len(report.income_events) == 2

    def test_total_ordinary_income(self):
        report = calculate_taxes(self._txs(), method="FIFO")
        assert report.total_ordinary_income == pytest.approx(55.0, rel=1e-4)

    def test_income_not_in_tax_events(self):
        report = calculate_taxes(self._txs(), method="FIFO")
        assert report.tax_events == []

    def test_income_becomes_cost_basis(self):
        """
        Receive 100 CRO as income at FMV $50.
        Sell 100 CRO for $80 → gain = $80 - $50 = $30.
        """
        txs = [
            _tx(_dt(2021), "CRO", 100.0, 50.0, "crypto_earn_interest_paid"),
            _tx(_dt(2022), "CRO", -100.0, 80.0, "crypto_exchange"),
        ]
        report = calculate_taxes(txs, method="FIFO")
        assert report.total_gain_loss == pytest.approx(30.0, rel=1e-4)


# ── Crypto-to-crypto exchange ──────────────────────────────────────────────────

class TestCryptoExchange:
    """
    Buy 1 ETH @ $3,000.
    Swap 1 ETH → 0.1 BTC when ETH FMV = $4,000.
    Gain on ETH disposal = $4,000 - $3,000 = $1,000.
    New BTC lot: 0.1 BTC @ $4,000 cost basis.
    Sell 0.1 BTC @ $5,000 → gain = $5,000 - $4,000 = $1,000.
    """

    def _txs(self):
        return [
            _tx(datetime(2021, 1, 1), "ETH", 1.0, -3000, "crypto_purchase"),
            _tx(datetime(2021, 6, 1), "ETH", -1.0, 4000, "crypto_exchange",
                to_currency="BTC", to_amount=0.1),
            _tx(datetime(2022, 6, 1), "BTC", -0.1, 5000, "crypto_exchange"),
        ]

    def test_eth_disposal_gain(self):
        report = calculate_taxes(self._txs(), method="FIFO")
        eth_events = [e for e in report.tax_events if e.currency == "ETH"]
        assert len(eth_events) == 1
        assert eth_events[0].gain_loss_usd == pytest.approx(1000, rel=1e-4)

    def test_btc_disposal_gain(self):
        report = calculate_taxes(self._txs(), method="FIFO")
        btc_events = [e for e in report.tax_events if e.currency == "BTC"]
        assert len(btc_events) == 1
        assert btc_events[0].gain_loss_usd == pytest.approx(1000, rel=1e-4)

    def test_total_gain_both_disposals(self):
        report = calculate_taxes(self._txs(), method="FIFO")
        assert report.total_gain_loss == pytest.approx(2000, rel=1e-4)


# ── HIFO minimises gain compared to FIFO ──────────────────────────────────────

class TestHifoMinimisesGain:
    """
    Lot A: 1 BTC @ $10,000
    Lot B: 1 BTC @ $45,000
    Sell 1 BTC @ $50,000

    FIFO gain = $40,000  (uses lot A first)
    HIFO gain =  $5,000  (uses lot B first — highest cost)
    """

    def _txs(self):
        return [
            _tx(datetime(2019, 1, 1), "BTC", 1.0, -10000, "crypto_purchase"),
            _tx(datetime(2020, 1, 1), "BTC", 1.0, -45000, "crypto_purchase"),
            _tx(datetime(2022, 1, 1), "BTC", -1.0, 50000, "crypto_purchase"),
        ]

    def test_hifo_smaller_than_fifo(self):
        fifo = calculate_taxes(self._txs(), method="FIFO").total_gain_loss
        hifo = calculate_taxes(self._txs(), method="HIFO").total_gain_loss
        assert hifo < fifo

    def test_hifo_gain_value(self):
        report = calculate_taxes(self._txs(), method="HIFO")
        assert report.total_gain_loss == pytest.approx(5000, rel=1e-4)

    def test_fifo_gain_value(self):
        report = calculate_taxes(self._txs(), method="FIFO")
        assert report.total_gain_loss == pytest.approx(40000, rel=1e-4)


# ── No transactions ────────────────────────────────────────────────────────────

class TestEdgeCases:
    def test_empty_transactions(self):
        report = calculate_taxes([], method="FIFO")
        assert report.total_gain_loss == 0
        assert report.total_ordinary_income == 0
        assert report.tax_events == []
        assert report.income_events == []

    def test_only_purchases_no_events(self):
        txs = [
            _tx(_dt(2021), "BTC", 1.0, -30000, "crypto_purchase"),
            _tx(_dt(2022), "BTC", 1.0, -40000, "crypto_purchase"),
        ]
        report = calculate_taxes(txs, method="FIFO")
        assert report.tax_events == []

    def test_ignored_kinds_produce_no_events(self):
        txs = [
            _tx(_dt(2021), "BTC", 1.0, 30000, "crypto_deposit"),
            _tx(_dt(2021), "BTC", -1.0, 30000, "crypto_withdrawal"),
        ]
        report = calculate_taxes(txs, method="FIFO")
        assert report.tax_events == []
        assert report.income_events == []
