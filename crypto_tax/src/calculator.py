"""
Tax calculation engine.

Supported cost-basis methods
-----------------------------
FIFO  – First In, First Out  (IRS default for crypto; Rev. Proc. 2024-28)
LIFO  – Last In, First Out   (allowed with specific identification)
HIFO  – Highest In, First Out (minimises gains; allowed with specific ID)

Tax holding period
------------------
Short-term: asset held ≤ 365 days  → ordinary income tax rates
Long-term : asset held >  365 days  → preferential capital-gains rates
            (0 %, 15 %, or 20 % depending on income bracket)

Taxable events
--------------
1. Selling crypto for fiat (USD)
2. Swapping/exchanging one crypto for another
3. Spending crypto on goods / services (card top-up, etc.)
4. Receiving crypto as income (staking, interest, referral, cashback)

Non-taxable events
------------------
• Buying crypto with fiat
• Transferring crypto between your own wallets
• Depositing / withdrawing fiat

Income treatment
----------------
Crypto received as income is reported at its fair-market value (USD) on the
date of receipt as ordinary income.  The same USD value also becomes the
cost basis for any future disposal of those coins.

References
----------
IRS Notice 2014-21, Rev. Rul. 2019-24, Rev. Proc. 2024-28
"""

from __future__ import annotations

import collections
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Deque, Dict, List, Optional, Tuple

from .parser import CryptoTransaction

# ── Data structures ────────────────────────────────────────────────────────────

@dataclass
class Lot:
    """A single acquisition lot (a quantity of one asset bought at one time)."""
    currency: str
    acquired: datetime
    quantity: float      # remaining quantity in this lot
    cost_basis_usd: float  # total USD cost for the *remaining* quantity

    @property
    def unit_cost(self) -> float:
        if self.quantity == 0:
            return 0.0
        return self.cost_basis_usd / self.quantity


@dataclass
class TaxEvent:
    """A single disposed lot matched against an acquisition lot."""
    currency: str
    description: str
    date_acquired: datetime
    date_sold: datetime
    quantity: float
    proceeds_usd: float      # sale price (USD) for this quantity
    cost_basis_usd: float    # cost (USD) for this quantity
    gain_loss_usd: float     # proceeds − cost
    is_long_term: bool       # True when held > 365 days
    event_type: str          # "sale", "exchange", "income"


@dataclass
class IncomeEvent:
    """Crypto received as ordinary income."""
    currency: str
    description: str
    date_received: datetime
    quantity: float
    fair_market_value_usd: float  # total USD value on receipt date


@dataclass
class TaxReport:
    tax_events: List[TaxEvent] = field(default_factory=list)
    income_events: List[IncomeEvent] = field(default_factory=list)

    @property
    def total_short_term_gain_loss(self) -> float:
        return sum(e.gain_loss_usd for e in self.tax_events if not e.is_long_term)

    @property
    def total_long_term_gain_loss(self) -> float:
        return sum(e.gain_loss_usd for e in self.tax_events if e.is_long_term)

    @property
    def total_ordinary_income(self) -> float:
        return sum(e.fair_market_value_usd for e in self.income_events)

    @property
    def total_gain_loss(self) -> float:
        return self.total_short_term_gain_loss + self.total_long_term_gain_loss


# ── Cost-basis method implementations ─────────────────────────────────────────

LONG_TERM_DAYS = 365  # IRS rule: > 365 days = long-term


def _is_long_term(acquired: datetime, sold: datetime) -> bool:
    return (sold - acquired).days > LONG_TERM_DAYS


class _LotPool:
    """Manages a pool of acquisition lots for one currency."""

    def __init__(self, method: str):
        self.method = method.upper()
        self._lots: List[Lot] = []

    def add(self, lot: Lot):
        self._lots.append(lot)

    def _ordered_lots(self) -> List[Lot]:
        """Return lots in the order they should be consumed."""
        if self.method == "FIFO":
            return sorted(self._lots, key=lambda l: l.acquired)
        if self.method == "LIFO":
            return sorted(self._lots, key=lambda l: l.acquired, reverse=True)
        if self.method == "HIFO":
            return sorted(self._lots, key=lambda l: l.unit_cost, reverse=True)
        raise ValueError(f"Unknown method: {self.method}")

    def consume(
        self, quantity: float, sale_date: datetime, proceeds_usd: float, description: str, event_type: str
    ) -> Tuple[List[TaxEvent], float]:
        """
        Consume `quantity` from the pool and return matched TaxEvents plus any
        remaining quantity that could not be matched (i.e. cost-basis unknown).
        """
        remaining = quantity
        tax_events: List[TaxEvent] = []

        # Build ordered list of lots (excluding fully-consumed ones)
        ordered = [l for l in self._ordered_lots() if l.quantity > 0]

        for lot in ordered:
            if remaining <= 0:
                break
            consumed = min(lot.quantity, remaining)
            unit_proceeds = (proceeds_usd / quantity) if quantity > 0 else 0.0
            lot_proceeds = unit_proceeds * consumed
            lot_cost = lot.unit_cost * consumed

            tax_events.append(
                TaxEvent(
                    currency=lot.currency,
                    description=description,
                    date_acquired=lot.acquired,
                    date_sold=sale_date,
                    quantity=consumed,
                    proceeds_usd=round(lot_proceeds, 8),
                    cost_basis_usd=round(lot_cost, 8),
                    gain_loss_usd=round(lot_proceeds - lot_cost, 8),
                    is_long_term=_is_long_term(lot.acquired, sale_date),
                    event_type=event_type,
                )
            )

            lot.quantity -= consumed
            lot.cost_basis_usd -= lot_cost
            remaining -= consumed

        return tax_events, remaining


# ── Main calculator ────────────────────────────────────────────────────────────

VALID_METHODS = ("FIFO", "LIFO", "HIFO")

METHOD_DESCRIPTIONS = {
    "FIFO": (
        "First In, First Out (FIFO) — IRS default. "
        "The oldest lots are disposed of first. "
        "Generally produces larger long-term gains over time."
    ),
    "LIFO": (
        "Last In, First Out (LIFO) — requires specific identification. "
        "The most recently acquired lots are disposed of first. "
        "May produce more short-term gains but can minimise long-term gains."
    ),
    "HIFO": (
        "Highest In, First Out (HIFO) — requires specific identification. "
        "The lots with the highest cost basis are disposed of first. "
        "This strategy minimizes taxable gains (or maximizes deductible losses)."
    ),
}


def calculate_taxes(
    transactions: List[CryptoTransaction],
    method: str = "FIFO",
) -> TaxReport:
    """
    Process a list of CryptoTransactions and produce a TaxReport.

    Parameters
    ----------
    transactions : list of CryptoTransaction
        Must be in chronological order.
    method : str
        One of "FIFO", "LIFO", "HIFO".
    """
    if method.upper() not in VALID_METHODS:
        raise ValueError(f"method must be one of {VALID_METHODS}, got {method!r}")

    method = method.upper()
    report = TaxReport()

    # One lot pool per currency
    pools: Dict[str, _LotPool] = collections.defaultdict(lambda: _LotPool(method))

    # Sort chronologically to ensure correct lot ordering
    ordered = sorted(transactions, key=lambda t: t.timestamp)

    for tx in ordered:
        currency = tx.currency
        amount = tx.amount
        kind = tx.transaction_kind
        usd = abs(tx.native_amount_usd)
        ts = tx.timestamp
        desc = tx.description or kind

        # ── Income events ────────────────────────────────────────────────────
        if tx.is_income:
            income_usd = usd if usd > 0 else 0.0
            report.income_events.append(
                IncomeEvent(
                    currency=currency,
                    description=desc,
                    date_received=ts,
                    quantity=abs(amount),
                    fair_market_value_usd=round(income_usd, 8),
                )
            )
            # Income receipts also become acquisition lots (FMV = cost basis)
            if abs(amount) > 0 and income_usd > 0:
                pools[currency].add(
                    Lot(
                        currency=currency,
                        acquired=ts,
                        quantity=abs(amount),
                        cost_basis_usd=income_usd,
                    )
                )
            continue

        # ── Acquisitions (buying crypto for fiat) ───────────────────────────
        if tx.is_acquisition:
            cost = usd  # USD paid
            if amount > 0 and cost >= 0:
                pools[currency].add(
                    Lot(
                        currency=currency,
                        acquired=ts,
                        quantity=amount,
                        cost_basis_usd=cost,
                    )
                )
            continue

        # ── Disposals (sales / swaps / spending) ────────────────────────────
        if tx.is_sale:
            disposed_qty = abs(amount)
            proceeds = usd  # USD received (or FMV of what was received)

            events, unmatched = pools[currency].consume(
                quantity=disposed_qty,
                sale_date=ts,
                proceeds_usd=proceeds,
                description=desc,
                event_type="exchange" if tx.to_currency else "sale",
            )
            report.tax_events.extend(events)

            # If proceeds came from a crypto-to-crypto swap, record the
            # incoming asset as a new acquisition at the same USD FMV.
            if tx.to_currency and tx.to_amount and abs(tx.to_amount) > 0:
                pools[tx.to_currency].add(
                    Lot(
                        currency=tx.to_currency,
                        acquired=ts,
                        quantity=abs(tx.to_amount),
                        cost_basis_usd=proceeds,
                    )
                )
            continue

        # All other kinds are non-taxable; skip silently.

    return report
