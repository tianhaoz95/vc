# Crypto.com → TurboTax Converter

A Flask web application that converts **Crypto.com App CSV exports** into TurboTax-ready CSV files for tax reporting.

## Project Overview

- **Core Purpose:** Automates the conversion of crypto transaction history into tax-ready formats (Form 8949 and Schedule 1).
- **Primary Technologies:** Python 3, Flask, Pytest.
- **Architecture:**
    - `app.py`: Flask entry point, handles file uploads and route orchestration.
    - `src/parser.py`: Parses the raw Crypto.com CSV into internal `CryptoTransaction` objects.
    - `src/calculator.py`: The tax engine. Matches disposals against acquisition lots using FIFO, LIFO, or HIFO methods.
    - `src/exporter.py`: Generates the final ZIP archive containing `capital_gains.csv`, `income.csv`, and `summary.txt`.
    - `templates/`: Jinja2 templates for the web interface.
    - `tests/`: Comprehensive test suite for all modules.

## Building and Running

### Prerequisites
- Python 3.8+
- Virtual environment (recommended)

### Installation
```bash
pip install -r requirements.txt
```

### Running the Application
```bash
python app.py
```
The app will be available at `http://127.0.0.1:5000`.

### Running Tests
```bash
python -m pytest tests/ -v
```
Use `pytest --cov=src tests/` to check code coverage.

## Development Conventions

### Data Modeling
- Use `dataclasses` for core entities (`CryptoTransaction`, `Lot`, `TaxEvent`, `IncomeEvent`).
- Assets and amounts are handled as `float` (ensure precision for crypto decimals where possible).

### Tax Logic
- **Methods:** FIFO (default), LIFO, and HIFO are supported.
- **Holding Period:** Long-term is defined as `> 365 days`.
- **Taxable Events:**
    - Sales of crypto for fiat.
    - Crypto-to-crypto swaps (treated as disposal + acquisition).
    - Spending crypto (e.g., card top-ups).
- **Income Events:** Staking, interest, and rewards are treated as ordinary income at FMV.

### Parsing & Classification
- Transactions are classified into `SALE_KINDS`, `INCOME_KINDS`, and `IGNORED_KINDS` in `src/parser.py`.
- New transaction types from Crypto.com updates should be added to these sets.

### Testing
- All core logic in `src/` should have corresponding tests in `tests/`.
- Maintain high test coverage (currently 74 tests).
- Mock file uploads in `test_app.py` for end-to-end route testing.
