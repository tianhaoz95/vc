"""Tests for the Crypto.com CSV parser."""

import pytest
from datetime import datetime

from src.parser import parse_csv, CryptoTransaction

# ── Helpers ────────────────────────────────────────────────────────────────────

HEADER = (
    "Timestamp (UTC),Transaction Description,Currency,Amount,"
    "To Currency,To Amount,Native Currency,Native Amount,"
    "Native Amount (in USD),Transaction Kind\n"
)


def make_csv(*rows: str) -> str:
    return HEADER + "\n".join(rows)


# ── Basic parsing ──────────────────────────────────────────────────────────────

class TestParseCsv:
    def test_single_purchase(self):
        csv = make_csv(
            "2021-03-10 12:00:00,Buy BTC,BTC,0.5,,,"
            "USD,-20000,-20000,crypto_purchase"
        )
        txs = parse_csv(csv)
        assert len(txs) == 1
        tx = txs[0]
        assert tx.currency == "BTC"
        assert tx.amount == pytest.approx(0.5)
        assert tx.native_amount_usd == pytest.approx(-20000)
        assert tx.transaction_kind == "crypto_purchase"

    def test_exchange_row(self):
        csv = make_csv(
            "2021-06-01 09:00:00,ETH to BTC,ETH,-2,BTC,0.1,"
            "USD,-4000,-4000,crypto_exchange"
        )
        txs = parse_csv(csv)
        assert len(txs) == 1
        tx = txs[0]
        assert tx.currency == "ETH"
        assert tx.to_currency == "BTC"
        assert tx.to_amount == pytest.approx(0.1)

    def test_income_row(self):
        csv = make_csv(
            "2021-07-01 00:00:00,Crypto Earn Interest,CRO,100,,,"
            "USD,5,5,crypto_earn_interest_paid"
        )
        txs = parse_csv(csv)
        assert len(txs) == 1
        assert txs[0].is_income is True

    def test_empty_to_currency_is_none(self):
        csv = make_csv(
            "2021-01-01 00:00:00,Deposit,BTC,1,,,"
            "USD,30000,30000,crypto_deposit"
        )
        txs = parse_csv(csv)
        assert txs[0].to_currency is None

    def test_multiple_rows(self):
        csv = make_csv(
            "2021-01-01 00:00:00,Buy,BTC,1,,,USD,-30000,-30000,crypto_purchase",
            "2021-06-01 00:00:00,Sell,BTC,-0.5,,,USD,20000,20000,crypto_purchase",
        )
        txs = parse_csv(csv)
        assert len(txs) == 2

    def test_bytes_input_with_bom(self):
        raw = ("\ufeff" + make_csv(
            "2021-01-01 00:00:00,Buy,ETH,2,,,USD,-4000,-4000,crypto_purchase"
        )).encode("utf-8")
        txs = parse_csv(raw)
        assert len(txs) == 1

    def test_empty_csv_returns_empty_list(self):
        txs = parse_csv(HEADER)
        assert txs == []

    def test_timestamp_parsing(self):
        csv = make_csv(
            "2022-12-31 23:59:59,Buy,BTC,0.01,,,USD,-300,-300,crypto_purchase"
        )
        txs = parse_csv(csv)
        assert txs[0].timestamp == datetime(2022, 12, 31, 23, 59, 59)

    def test_is_sale_for_negative_amount(self):
        csv = make_csv(
            "2022-01-01 00:00:00,Sell BTC,BTC,-0.5,,,USD,15000,15000,crypto_purchase"
        )
        txs = parse_csv(csv)
        assert txs[0].is_sale is True

    def test_is_acquisition_for_positive_purchase(self):
        csv = make_csv(
            "2022-01-01 00:00:00,Buy BTC,BTC,0.5,,,USD,-15000,-15000,crypto_purchase"
        )
        txs = parse_csv(csv)
        assert txs[0].is_acquisition is True

    def test_malformed_row_is_skipped(self):
        bad = HEADER + "NOT A DATE,Buy,BTC,1,,,USD,-100,-100,crypto_purchase\n"
        import warnings
        with warnings.catch_warnings(record=True):
            txs = parse_csv(bad)
        assert len(txs) == 0

    def test_comma_in_numbers(self):
        csv = make_csv(
            '2021-01-01 00:00:00,Buy BTC,BTC,"1,000",,,USD,"-50,000","-50,000",crypto_purchase'
        )
        txs = parse_csv(csv)
        assert txs[0].amount == pytest.approx(1000)
