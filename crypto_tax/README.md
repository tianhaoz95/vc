# Crypto.com → TurboTax Converter

A Flask web application that converts the **Crypto.com App CSV export** into
TurboTax-ready CSV files so you can report your crypto taxes in minutes.

---

## Features

| Feature | Details |
|---|---|
| **Upload UI** | Drag-and-drop or browse for your Crypto.com CSV |
| **3 cost-basis methods** | FIFO (IRS default), LIFO, HIFO — pick the strategy that works best for you |
| **Tax rule display** | Rules shown directly in the UI (taxable events, holding periods, income treatment) |
| **TurboTax-ready output** | `capital_gains.csv` (Form 8949) + `income.csv` (Schedule 1) |
| **Summary report** | `summary.txt` with short-term, long-term, and income totals |
| **74 tests** | Parser, calculator, exporter, and end-to-end Flask tests |

---

## U.S. Crypto Tax Rules Applied

### Taxable Events
- **Selling** crypto for USD
- **Swapping** one cryptocurrency for another (treated as disposal + re-acquisition at FMV)
- **Spending** crypto on goods/services (e.g. Crypto.com Visa card top-up)

### Non-Taxable Events
- Buying crypto with fiat (USD)
- Transferring crypto between your own wallets
- Depositing or withdrawing fiat

### Holding Period
| Period | Type | Tax Rate |
|---|---|---|
| ≤ 365 days | **Short-term** | Ordinary income rates |
| > 365 days | **Long-term** | 0 %, 15 %, or 20 % (income-dependent) |

### Crypto Income
Staking rewards, Earn interest, referral bonuses, and cashback are **ordinary income**
at fair-market value on the date received.  
The same FMV becomes the cost basis for future disposals.

**References:** IRS Notice 2014-21 · Rev. Rul. 2019-24 · Rev. Proc. 2024-28

---

## Cost-Basis Methods

### FIFO — First In, First Out *(IRS default)*
Oldest acquisition lots are disposed of first.  
Generally produces larger long-term gains over time.

### LIFO — Last In, First Out *(requires specific identification)*
Most recently acquired lots are disposed of first.  
Can reduce long-term gains but may increase short-term gains.

### HIFO — Highest In, First Out *(requires specific identification)*
Lots with the **highest cost basis** are disposed of first.  
Minimizes taxable gains (or maximizes deductible losses).

---

## Crypto.com CSV Format

Export from the **Crypto.com App**: *Accounts → History → Export icon (top right)*.

Expected columns:

```
Timestamp (UTC), Transaction Description, Currency, Amount,
To Currency, To Amount, Native Currency, Native Amount,
Native Amount (in USD), Transaction Kind
```

Supported `Transaction Kind` values include:

| Kind | Treatment |
|---|---|
| `crypto_purchase` | Buy (acquisition) or sell (disposal if Amount < 0) |
| `crypto_exchange` | Swap — disposal of source + acquisition of target |
| `crypto_earn_interest_paid` | Ordinary income |
| `referral_gift` | Ordinary income |
| `referral_card_cashback` | Ordinary income |
| `reimbursement` | Ordinary income |
| `supercharger_reward_to_app_credited` | Ordinary income |
| `card_top_up` | Disposal (spending crypto) |
| `dust_conversion_debited/credited` | Disposal / income |
| `crypto_deposit` / `crypto_withdrawal` | Non-taxable transfer |
| `fiat_deposit` / `fiat_withdrawal` | Non-taxable |

---

## Output Files

The download is a **ZIP archive** containing:

| File | Purpose |
|---|---|
| `capital_gains.csv` | Form 8949 — upload directly to TurboTax under *Investments & Savings → Cryptocurrency* |
| `income.csv` | Ordinary income (staking, interest, cashback) to report on Schedule 1 |
| `summary.txt` | Totals: short-term gains, long-term gains, total crypto income |

### `capital_gains.csv` columns

```
Currency Name, Purchase Date, Cost Basis (USD), Date Sold,
Proceeds (USD), Gain or Loss (USD), Term
```

### `income.csv` columns

```
Currency Name, Date Received, Amount Received,
Fair Market Value (USD), Income Type
```

---

## Setup & Run

```bash
# 1. Create a virtual environment (optional but recommended)
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start the app
python app.py
# → http://127.0.0.1:5000
```

---

## Running Tests

```bash
cd crypto_tax
python -m pytest tests/ -v
```

74 tests covering:
- CSV parser (timestamp formats, BOM handling, malformed rows, all transaction kinds)
- Tax calculator (FIFO/LIFO/HIFO lot matching, holding-period classification, income events, crypto-to-crypto exchanges)
- Exporter (column names, date formats, gain/loss values, empty reports)
- Flask routes (upload, conversion, error handling, ZIP contents, end-to-end gain calculations)

---

## Disclaimer

> This tool is for **informational purposes only** and does not constitute tax advice.  
> Consult a qualified tax professional for your specific situation.
