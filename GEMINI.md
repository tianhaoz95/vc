# VC - Crypto Products Repository

A collection of tools and products focused on cryptocurrency utilities, specifically tax reporting and portfolio management.

## Repository Overview

- **Core Purpose:** To provide a suite of tools for crypto enthusiasts and professionals to manage their assets and taxes.
- **Project Structure:**
    - `products/`: Contains individual products and tools.
        - `crypto_tax/`: A Flask-based web application for converting Crypto.com App CSV exports into TurboTax-ready files.
        - `crypto_tax_mobile/`: (Planned) Mobile companion app for the tax converter.

## Products

### 1. Crypto.com → TurboTax Converter (`products/crypto_tax`)

- **Purpose:** Automates the conversion of transaction history into tax-ready formats (Form 8949 and Schedule 1).
- **Technologies:** Python 3, Flask, Pytest.
- **Key Features:**
    - Support for FIFO, LIFO, and HIFO cost-basis methods.
    - Classification of taxable, income, and non-taxable events.
    - Long-term/Short-term holding period calculation (> 365 days).
    - Generates a ZIP archive with `capital_gains.csv`, `income.csv`, and a `summary.txt` report.

## Building and Running

Since this is a multi-product repository, each product has its own setup and execution instructions.

### Crypto.com → TurboTax Converter

1.  **Navigate to the product directory:**
    ```bash
    cd products/crypto_tax
    ```
2.  **Installation:**
    ```bash
    pip install -r requirements.txt
    ```
3.  **Run the Application:**
    ```bash
    python app.py
    ```
4.  **Run Tests:**
    ```bash
    python -m pytest tests/ -v
    ```

## Development Conventions

- **Mono-repo Structure:** Each major product should be housed in its own directory under `products/`.
- **Instructional Context:** Each sub-project should maintain its own `GEMINI.md` file with project-specific details (architecture, specific conventions, and detailed build instructions).
- **Documentation:** Root-level `README.md` provides a high-level overview, while `GEMINI.md` provides deep instructional context for LLM-based agents.
- **Testing:** New features or bug fixes must include corresponding tests within the product's `tests/` directory. High test coverage (e.g., > 70%) is encouraged.
- **Styling & Design:** For web applications, prioritize clean, functional UIs with vanilla CSS unless a specific framework is required.
