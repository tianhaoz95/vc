# Crypto.com → TurboTax Converter (Serverless)

A **100% client-side** web application that converts Crypto.com App CSV exports into TurboTax-ready files — entirely in the browser, with zero backend. No data ever leaves your device.

## Features

- 📂 **Drag-and-drop or click-to-upload** CSV import
- ⚖️ **Three cost-basis methods**: FIFO (IRS default), LIFO, and HIFO
- 📋 **Tax rules panel** explaining the rules applied (IRS Notice 2014-21, Rev. Rul. 2019-24, Rev. Proc. 2024-28)
- 📊 **Interactive results table** with capital gains/losses and income events
- ⬇️ **Three downloadable files**:
  - `capital_gains.csv` — Form 8949 / Schedule D format for TurboTax
  - `income.csv` — Schedule 1 ordinary income events
  - `summary.txt` — Human-readable tax summary
- 🔒 **Privacy-first**: all processing is local; no server, no tracking

## Usage

1. **Open `index.html`** in any modern browser (no server required).
2. Export your transaction history from the Crypto.com App:
   - Go to **Accounts → Transaction History → Export to CSV**
3. Upload the CSV file using the drag-and-drop zone or the file picker.
4. Select your preferred cost-basis method.
5. Click **Convert CSV**.
6. Review your results and download the output files.

## Project Structure

```
crypto_tax_serverless/
├── index.html          # Single-page app UI (no build step required)
├── src/
│   ├── parser.js       # Crypto.com CSV parser
│   ├── calculator.js   # FIFO / LIFO / HIFO tax calculation engine
│   └── exporter.js     # TurboTax CSV and summary text exporter
├── tests/
│   ├── parser.test.js      # Parser unit tests
│   ├── calculator.test.js  # Calculator unit tests (all methods, edge cases)
│   └── exporter.test.js    # Exporter unit tests
├── package.json        # Jest test runner config
└── README.md
```

## Input Format (Crypto.com App CSV)

The app expects the standard Crypto.com App transaction history export with these columns:

| Column | Description |
|---|---|
| `Timestamp (UTC)` | Date/time of the transaction |
| `Transaction Description` | Human-readable label |
| `Currency` | Asset symbol (e.g., BTC, ETH) |
| `Amount` | Quantity (negative = sent) |
| `To Currency` | Target asset for swaps |
| `To Amount` | Quantity of target asset |
| `Native Currency` | Fiat currency code |
| `Native Amount` | Fiat value |
| `Native Amount (in USD)` | USD value |
| `Transaction Kind` | Machine-readable event type |

## Output Format (TurboTax)

### Capital Gains CSV (Form 8949 / Schedule D)

| Column | Description |
|---|---|
| `Currency Name` | Asset and quantity (e.g., "1.5 BTC") |
| `Purchase Date` | Date acquired (MM/DD/YYYY) |
| `Cost Basis (USD)` | Original purchase cost |
| `Date Sold` | Date disposed (MM/DD/YYYY) |
| `Proceeds (USD)` | Sale proceeds in USD |
| `Gain or Loss (USD)` | Net capital gain or loss |
| `Term` | "Long-term" or "Short-term" |

### Income CSV (Schedule 1)

| Column | Description |
|---|---|
| `Currency Name` | Asset symbol |
| `Date Received` | Date of receipt (MM/DD/YYYY) |
| `Amount Received` | Quantity received |
| `Fair Market Value (USD)` | USD value on receipt date |
| `Income Type` | Description / transaction kind |

## Tax Calculation Rules

### Taxable Events
- **Sale**: Selling crypto for fiat → capital gain or loss
- **Exchange**: Swapping one crypto for another → treated as disposal at FMV
- **Spending**: Using crypto for goods/services → capital gain or loss
- **Income**: Staking, interest, referral bonuses, cashback → ordinary income at FMV

### Non-Taxable Events
- Buying crypto with fiat
- Transferring between own wallets
- Depositing/withdrawing fiat

### Holding Period
- **Short-term**: Held ≤ 365 days → taxed at ordinary income rates
- **Long-term**: Held > 365 days → taxed at preferential rates (0%, 15%, or 20%)

### Cost-Basis Methods

| Method | Description | Best For |
|---|---|---|
| **FIFO** | First In, First Out — oldest lots disposed first | IRS default; no election required |
| **LIFO** | Last In, First Out — newest lots disposed first | Falling markets / recent high-cost purchases |
| **HIFO** | Highest In, First Out — highest-cost lots disposed first | Minimizing current-year gains |

### Legal References
- **IRS Notice 2014-21**: Cryptocurrency is property for tax purposes
- **Rev. Rul. 2019-24**: Hard forks / airdrops are taxable income
- **Rev. Proc. 2024-28**: FIFO is the default; LIFO/HIFO require specific identification election

## Running Tests

```bash
npm install
npm test
```

Tests use **Jest** and cover:
- CSV parsing (timestamp formats, quoted fields, BOM handling)
- FIFO / LIFO / HIFO cost-basis matching
- Short-term vs. long-term classification
- Income event capture and cost-basis carryover
- Crypto-to-crypto exchange handling
- TurboTax CSV export format
- Edge cases (empty input, out-of-order transactions, multiple currencies)

Current coverage: **97%+ statements, 100% functions**.

## Disclaimer

This tool is for informational purposes only and does not constitute tax, legal, or financial advice. Consult a qualified tax professional for your specific situation. Tax laws vary and change; always verify the output with a CPA or tax advisor before filing.
