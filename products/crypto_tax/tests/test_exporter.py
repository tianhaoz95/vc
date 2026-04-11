"""Tests for the TurboTax CSV exporter."""

import csv
import io
import pytest
from datetime import datetime

from src.calculator import TaxReport, TaxEvent, IncomeEvent
from src.exporter import export_turbotax_csv, export_summary_txt

DATE_FMT = "%m/%d/%Y"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _tax_event(
    currency="BTC",
    acquired=datetime(2020, 1, 1),
    sold=datetime(2022, 1, 1),
    qty=1.0,
    proceeds=50000.0,
    basis=30000.0,
    long_term=True,
    event_type="sale",
):
    return TaxEvent(
        currency=currency,
        description="Test sale",
        date_acquired=acquired,
        date_sold=sold,
        quantity=qty,
        proceeds_usd=proceeds,
        cost_basis_usd=basis,
        gain_loss_usd=round(proceeds - basis, 8),
        is_long_term=long_term,
        event_type=event_type,
    )


def _income_event(
    currency="CRO",
    received=datetime(2021, 6, 1),
    qty=100.0,
    fmv=50.0,
):
    return IncomeEvent(
        currency=currency,
        description="Earn interest",
        date_received=received,
        quantity=qty,
        fair_market_value_usd=fmv,
    )


def _parse_csv(text: str):
    return list(csv.DictReader(io.StringIO(text)))


# ── Capital-gains CSV ──────────────────────────────────────────────────────────

class TestCapitalGainsCsv:
    def test_header_columns(self):
        report = TaxReport(tax_events=[_tax_event()])
        cg, _ = export_turbotax_csv(report)
        rows = _parse_csv(cg)
        assert set(rows[0].keys()) == {
            "Currency Name",
            "Purchase Date",
            "Cost Basis (USD)",
            "Date Sold",
            "Proceeds (USD)",
            "Gain or Loss (USD)",
            "Term",
        }

    def test_values_match_event(self):
        evt = _tax_event(qty=0.5, proceeds=25000, basis=15000, long_term=True)
        report = TaxReport(tax_events=[evt])
        cg, _ = export_turbotax_csv(report)
        rows = _parse_csv(cg)
        assert rows[0]["Currency Name"] == "0.5 BTC"
        assert rows[0]["Proceeds (USD)"] == "25000.00"
        assert rows[0]["Cost Basis (USD)"] == "15000.00"
        assert rows[0]["Gain or Loss (USD)"] == "10000.00"
        assert rows[0]["Term"] == "Long-term"

    def test_short_term_label(self):
        report = TaxReport(tax_events=[_tax_event(long_term=False)])
        cg, _ = export_turbotax_csv(report)
        rows = _parse_csv(cg)
        assert rows[0]["Term"] == "Short-term"

    def test_date_format_mm_dd_yyyy(self):
        report = TaxReport(tax_events=[_tax_event(
            acquired=datetime(2020, 3, 5),
            sold=datetime(2022, 11, 27),
        )])
        cg, _ = export_turbotax_csv(report)
        rows = _parse_csv(cg)
        assert rows[0]["Purchase Date"] == "03/05/2020"
        assert rows[0]["Date Sold"] == "11/27/2022"

    def test_loss_shows_negative(self):
        evt = _tax_event(proceeds=10000, basis=30000, long_term=False)
        report = TaxReport(tax_events=[evt])
        cg, _ = export_turbotax_csv(report)
        rows = _parse_csv(cg)
        assert float(rows[0]["Gain or Loss (USD)"]) == pytest.approx(-20000, rel=1e-4)

    def test_empty_tax_events_gives_header_only(self):
        report = TaxReport()
        cg, _ = export_turbotax_csv(report)
        rows = _parse_csv(cg)
        assert rows == []

    def test_multiple_rows(self):
        report = TaxReport(tax_events=[_tax_event(), _tax_event(currency="ETH")])
        cg, _ = export_turbotax_csv(report)
        rows = _parse_csv(cg)
        assert len(rows) == 2


# ── Income CSV ─────────────────────────────────────────────────────────────────

class TestIncomeCsv:
    def test_header_columns(self):
        report = TaxReport(income_events=[_income_event()])
        _, inc = export_turbotax_csv(report)
        rows = _parse_csv(inc)
        assert set(rows[0].keys()) == {
            "Currency Name",
            "Date Received",
            "Amount Received",
            "Fair Market Value (USD)",
            "Income Type",
        }

    def test_values_match_event(self):
        report = TaxReport(income_events=[_income_event(qty=200, fmv=100)])
        _, inc = export_turbotax_csv(report)
        rows = _parse_csv(inc)
        assert rows[0]["Currency Name"] == "CRO"
        assert float(rows[0]["Amount Received"]) == pytest.approx(200, rel=1e-4)
        assert rows[0]["Fair Market Value (USD)"] == "100.00"

    def test_date_format(self):
        report = TaxReport(income_events=[_income_event(received=datetime(2021, 7, 4))])
        _, inc = export_turbotax_csv(report)
        rows = _parse_csv(inc)
        assert rows[0]["Date Received"] == "07/04/2021"

    def test_empty_income_gives_header_only(self):
        report = TaxReport()
        _, inc = export_turbotax_csv(report)
        rows = _parse_csv(inc)
        assert rows == []


# ── Summary text ───────────────────────────────────────────────────────────────

class TestSummaryTxt:
    def test_contains_method(self):
        report = TaxReport()
        txt = export_summary_txt(report, "HIFO")
        assert "HIFO" in txt

    def test_contains_totals(self):
        report = TaxReport(
            tax_events=[_tax_event(proceeds=50000, basis=30000, long_term=True)],
            income_events=[_income_event(fmv=100)],
        )
        txt = export_summary_txt(report, "FIFO")
        assert "20000.00" in txt   # long-term gain
        assert "100.00" in txt     # ordinary income

    def test_contains_short_term_label(self):
        report = TaxReport()
        txt = export_summary_txt(report, "LIFO")
        assert "Short-term" in txt

    def test_contains_long_term_label(self):
        report = TaxReport()
        txt = export_summary_txt(report, "LIFO")
        assert "Long-term" in txt
