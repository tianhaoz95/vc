# VC - Crypto Products Repository

A collection of tools and products focused on cryptocurrency utilities, specifically tax reporting and portfolio management.

## Repository Overview

- **Core Purpose:** To provide a suite of tools for crypto enthusiasts and professionals to manage their assets and taxes.
- **Project Structure:**
    - `products/`: Contains individual products and tools.
        - `crypto_tax/`: A Flask-based web application for converting Crypto.com App CSV exports into TurboTax-ready files.
        - `crypto_tax_mobile/`: Flet-based mobile companion app for the tax converter.

## Products

### 1. Crypto.com → TurboTax Converter (Web)
Automates the conversion of transaction history into tax-ready formats.
- **Location:** `./products/crypto_tax`
- **Documentation:** See [products/crypto_tax/GEMINI.md](./products/crypto_tax/GEMINI.md) for detailed architecture and instructions.

### 2. Crypto.com → TurboTax Mobile (Flet)
Portable, offline-first mobile app for tax conversion.
- **Location:** `./products/crypto_tax_mobile`
- **Documentation:** See [products/crypto_tax_mobile/GEMINI.md](./products/crypto_tax_mobile/GEMINI.md) for detailed architecture and instructions.

## Development Conventions

- **Mono-repo Structure:** Each major product should be housed in its own directory under `products/`.
- **Instructional Context:** Each sub-project **MUST** maintain its own `GEMINI.md` file with project-specific details (architecture, specific conventions, and detailed build instructions).
- **Documentation:** Root-level `README.md` provides a high-level overview, while `GEMINI.md` provides deep instructional context for LLM-based agents.
- **Testing:** New features or bug fixes must include corresponding tests within the product's `tests/` directory. High test coverage is encouraged.
- **Styling & Design:** For web applications, prioritize clean, functional UIs with vanilla CSS. For mobile, use Flet's Material-based components.
