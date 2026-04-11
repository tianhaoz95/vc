"""
Parser for the Crypto.com App CSV export format.

Crypto.com App CSV columns:
  Timestamp (UTC)          – date/time of the transaction (e.g. "2021-01-15 10:30:00")
  Transaction Description  – human-readable label
  Currency                 – asset symbol (e.g. BTC, ETH)
  Amount                   – quantity of Currency (can be negative for sends)
  To Currency              – target asset for swaps/exchanges
  To Amount                – quantity of To Currency
  Native Currency          – fiat currency code (e.g. USD)
  Native Amount            – fiat value (negative for purchases)
  Native Amount (in USD)   – value expressed in USD
  Transaction Kind         – machine-readable event type (see TRANSACTION_KINDS below)

Taxable event categories
-----------------------
SALE_KINDS      – disposals that trigger a capital-gain/loss calculation
INCOME_KINDS    – receipts treated as ordinary income at fair-market value
IGNORED_KINDS   – non-taxable events (transfers, fiat movements, etc.)
"""

import csv
import io
from datetime import datetime
from dataclasses import dataclass, field
from typing import List, Optional

# ── Transaction kind constants ────────────────────────────────────────────────

# Disposals: selling, swapping, or spending crypto → capital gain/loss
SALE_KINDS = {
    "crypto_exchange",           # swap one crypto for another inside the app
    "crypto_wallet_swap_debited",# debit leg of an in-wallet swap
    "crypto_to_fiat_exchange",   # sell crypto for fiat
    "card_top_up",               # top up Crypto.com Visa card with crypto
    "dust_conversion_debited",   # dust → CRO conversion (debit leg)
    "crypto_purchase",           # when Amount is negative (spending crypto to buy fiat)
}

# Income receipts: treated as ordinary income at fair-market value
INCOME_KINDS = {
    "crypto_earn_interest_paid",          # Earn / Savings interest
    "referral_gift",                      # referral bonuses
    "referral_card_cashback",             # card cashback paid in CRO
    "reimbursement",                      # fee reimbursements
    "reimbursement_reverted",             # reversal – treated as negative income
    "crypto_payment",                     # payment received in crypto
    "supercharger_reward_to_app_credited",# Supercharger rewards
    "crypto_earn_extra_interest_paid",    # bonus Earn interest
    "card_cashback_reverted",             # cashback reversal (negative income)
    "dust_conversion_credited",           # CRO received in dust conversion
    "crypto_wallet_swap_credited",        # credit leg of in-wallet swap (income)
    "mco_stake_reward",                   # MCO staking reward
    "crypto_viban_exchange",              # VIBAN purchase credited
    "viban_purchase",                     # purchase via virtual IBAN
}

# Non-taxable: deposits, withdrawals, fiat moves – no tax event
IGNORED_KINDS = {
    "crypto_deposit",
    "crypto_withdrawal",
    "fiat_deposit",
    "fiat_withdrawal",
    "crypto_transfer",
    "exchange_to_crypto_transfer",
    "crypto_to_exchange_transfer",
    "supercharger_deposit",
    "supercharger_withdrawal",
    "lockup_lock",
    "lockup_unlock",
    "lockup_upgrade",
    "dynamic_coin_swap_bonus_exchange_deposit",
}

# ── Data class ─────────────────────────────────────────────────────────────────

@dataclass
class CryptoTransaction:
    timestamp: datetime
    description: str
    currency: str
    amount: float          # positive = received; negative = sent
    to_currency: Optional[str]
    to_amount: Optional[float]
    native_currency: str
    native_amount: float   # positive = received; negative = paid
    native_amount_usd: float
    transaction_kind: str

    @property
    def is_sale(self) -> bool:
        """True when the transaction is a disposal (capital event)."""
        if self.transaction_kind in SALE_KINDS:
            # crypto_purchase is only a disposal when the user *spends* crypto
            # (Amount < 0 means crypto went out)
            if self.transaction_kind == "crypto_purchase":
                return self.amount < 0
            return True
        return False

    @property
    def is_income(self) -> bool:
        """True when the transaction is ordinary income."""
        return self.transaction_kind in INCOME_KINDS

    @property
    def is_acquisition(self) -> bool:
        """
        True when the transaction adds crypto to the user's holdings
        (used to build the cost-basis lot inventory).
        Includes: fiat purchases, swap credits, income receipts.
        """
        return self.amount > 0 and (
            self.transaction_kind in {
                "crypto_purchase",
                "crypto_exchange",         # credit leg handled separately
                "crypto_wallet_swap_credited",
                "viban_purchase",
                "crypto_viban_exchange",
            }
            or self.is_income
        )


# ── CSV parser ────────────────────────────────────────────────────────────────

TIMESTAMP_FORMATS = [
    "%Y-%m-%d %H:%M:%S",
    "%m/%d/%Y %H:%M",
    "%Y-%m-%dT%H:%M:%S",
]


def _parse_timestamp(raw: str) -> datetime:
    raw = raw.strip()
    for fmt in TIMESTAMP_FORMATS:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    raise ValueError(f"Unrecognized timestamp format: {raw!r}")


def _parse_float(raw: str) -> Optional[float]:
    raw = raw.strip().replace(",", "")
    if raw == "" or raw == "-":
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def parse_csv(file_content: str) -> List[CryptoTransaction]:
    """
    Parse a Crypto.com App CSV export and return a list of CryptoTransaction.

    Accepts both str and bytes (decoded as UTF-8).
    """
    if isinstance(file_content, bytes):
        file_content = file_content.decode("utf-8-sig")  # handle BOM

    reader = csv.DictReader(io.StringIO(file_content))

    # Normalise header names: strip whitespace and collapse inner spaces
    raw_fields = reader.fieldnames or []
    field_map = {f: f.strip() for f in raw_fields}

    transactions: List[CryptoTransaction] = []

    for row in reader:
        # Re-key the row with normalised field names
        row = {field_map.get(k, k): v for k, v in row.items()}

        try:
            timestamp = _parse_timestamp(row.get("Timestamp (UTC)", ""))
            currency = row.get("Currency", "").strip()
            amount = _parse_float(row.get("Amount", "")) or 0.0
            to_currency = row.get("To Currency", "").strip() or None
            to_amount = _parse_float(row.get("To Amount", ""))
            native_currency = row.get("Native Currency", "USD").strip()
            native_amount = _parse_float(row.get("Native Amount", "")) or 0.0
            native_usd = _parse_float(row.get("Native Amount (in USD)", ""))
            if native_usd is None:
                native_usd = native_amount  # fallback
            kind = row.get("Transaction Kind", "").strip()

            transactions.append(
                CryptoTransaction(
                    timestamp=timestamp,
                    description=row.get("Transaction Description", "").strip(),
                    currency=currency,
                    amount=amount,
                    to_currency=to_currency,
                    to_amount=to_amount,
                    native_currency=native_currency,
                    native_amount=native_amount,
                    native_amount_usd=native_usd,
                    transaction_kind=kind,
                )
            )
        except (ValueError, KeyError) as exc:
            # Skip malformed rows but surface the problem in development
            import warnings
            warnings.warn(f"Skipping row due to parse error: {exc} — row={dict(row)}")
            continue

    return transactions
