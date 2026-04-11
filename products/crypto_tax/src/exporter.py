"""
Exporter: converts a TaxReport into TurboTax-compatible CSV files.

TurboTax accepts cryptocurrency transactions in a CSV with these columns
(Form 8949 / Schedule D layout):

  Currency Name     – description of the asset (e.g. "1.5 BTC")
  Purchase Date     – date acquired  (MM/DD/YYYY)
  Cost Basis (USD)  – your cost in USD
  Date Sold         – date disposed  (MM/DD/YYYY)
  Proceeds (USD)    – amount received in USD

Income (staking rewards, interest, cashback, etc.) is reported on Schedule 1
(Other Income) and exported to a separate CSV with columns:

  Currency Name     – asset symbol
  Date Received     – date of receipt (MM/DD/YYYY)
  Amount Received   – quantity of crypto
  Fair Market Value (USD) – value in USD on receipt date
  Income Type       – description / transaction kind
"""

import csv
import io
from typing import Tuple

from .calculator import TaxReport

DATE_FMT = "%m/%d/%Y"


def export_turbotax_csv(report: TaxReport) -> Tuple[str, str]:
    """
    Generate two CSV strings suitable for TurboTax upload.

    Returns
    -------
    (capital_gains_csv, income_csv) : Tuple[str, str]
        capital_gains_csv – Form 8949 / Schedule D disposals
        income_csv        – Schedule 1 ordinary-income receipts
    """
    # ── Capital-gains CSV (Form 8949) ─────────────────────────────────────────
    cg_buf = io.StringIO()
    cg_writer = csv.writer(cg_buf)
    cg_writer.writerow(
        [
            "Currency Name",
            "Purchase Date",
            "Cost Basis (USD)",
            "Date Sold",
            "Proceeds (USD)",
            "Gain or Loss (USD)",
            "Term",
        ]
    )

    for evt in report.tax_events:
        asset_label = f"{evt.quantity:.8g} {evt.currency}"
        cg_writer.writerow(
            [
                asset_label,
                evt.date_acquired.strftime(DATE_FMT),
                f"{evt.cost_basis_usd:.2f}",
                evt.date_sold.strftime(DATE_FMT),
                f"{evt.proceeds_usd:.2f}",
                f"{evt.gain_loss_usd:.2f}",
                "Long-term" if evt.is_long_term else "Short-term",
            ]
        )

    # ── Income CSV (Schedule 1) ───────────────────────────────────────────────
    inc_buf = io.StringIO()
    inc_writer = csv.writer(inc_buf)
    inc_writer.writerow(
        [
            "Currency Name",
            "Date Received",
            "Amount Received",
            "Fair Market Value (USD)",
            "Income Type",
        ]
    )

    for evt in report.income_events:
        inc_writer.writerow(
            [
                evt.currency,
                evt.date_received.strftime(DATE_FMT),
                f"{evt.quantity:.8g}",
                f"{evt.fair_market_value_usd:.2f}",
                evt.description,
            ]
        )

    return cg_buf.getvalue(), inc_buf.getvalue()


def export_summary_txt(report: TaxReport, method: str) -> str:
    """Return a human-readable plain-text summary of the tax report."""
    lines = [
        "=" * 60,
        "  CRYPTO TAX SUMMARY",
        f"  Method: {method}",
        "=" * 60,
        "",
        f"  Short-term capital gains/losses : ${report.total_short_term_gain_loss:>12.2f}",
        f"  Long-term  capital gains/losses : ${report.total_long_term_gain_loss:>12.2f}",
        f"  Total capital gains/losses      : ${report.total_gain_loss:>12.2f}",
        f"  Ordinary income (crypto)        : ${report.total_ordinary_income:>12.2f}",
        "",
        f"  Total taxable events  : {len(report.tax_events)}",
        f"  Total income events   : {len(report.income_events)}",
        "=" * 60,
    ]
    return "\n".join(lines)
