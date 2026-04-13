# VC - Crypto Products Repository

A collection of tools and products focused on cryptocurrency utilities, specifically tax reporting and portfolio management.

## Repository Overview

- **Core Purpose:** To provide a suite of tools for crypto enthusiasts and professionals to manage their assets and taxes.
- **Project Structure:**
    - `products/`: Contains individual products and tools.
        - `crypto_tax/`: A Flask-based web application for converting Crypto.com App CSV exports into TurboTax-ready files.
        - `crypto_tax_serverless/`: A purely client-side version of the tax converter running in the browser.
        - `crypto_tax_mobile/`: Flet-based mobile companion app for the tax converter.
        - `ai_profile/`: A serverless developer profile site with a WebLLM-powered on-device AI sidebar.

## Products

### 1. Crypto.com → TurboTax Converter (Web)
Automates the conversion of transaction history into tax-ready formats.
- **Location:** `./products/crypto_tax`
- **Documentation:** See [products/crypto_tax/GEMINI.md](./products/crypto_tax/GEMINI.md) for detailed architecture and instructions.

### 2. Crypto.com → TurboTax Serverless (Browser)
Zero-infrastructure, high-privacy tax conversion tool.
- **Location:** `./products/crypto_tax_serverless`
- **Documentation:** See [products/crypto_tax_serverless/GEMINI.md](./products/crypto_tax_serverless/GEMINI.md) for detailed architecture and instructions.

### 3. Crypto.com → TurboTax Mobile (Flet)
Portable, offline-first mobile app for tax conversion.
- **Location:** `./products/crypto_tax_mobile`
- **Documentation:** See [products/crypto_tax_mobile/GEMINI.md](./products/crypto_tax_mobile/GEMINI.md) for detailed architecture and instructions.

### 4. AI Developer Profile
Serverless developer portfolio site with a sidebar AI agent running entirely in the browser.
- **Location:** `./products/ai_profile`
- **Documentation:** See [products/ai_profile/GEMINI.md](./products/ai_profile/GEMINI.md) for detailed architecture and instructions.

### 5. autopilot-dev
An autonomous worker→reviewer coding-agent loop driven by a markdown task plan.
- **Location:** `./products/autopilot_dev`
- **Documentation:** See [products/autopilot_dev/GEMINI.md](./products/autopilot_dev/GEMINI.md) for detailed architecture and instructions.


## Development Conventions

- **Mono-repo Structure:** Each major product should be housed in its own directory under `products/`.
- **Instructional Context:** Each sub-project **MUST** maintain its own `GEMINI.md` file with project-specific details (architecture, specific conventions, and detailed build instructions).
- **Documentation:** Root-level `README.md` provides a high-level overview, while `GEMINI.md` provides deep instructional context for LLM-based agents.
- **Testing:** New features or bug fixes must include corresponding tests within the product's `tests/` directory. High test coverage is encouraged.
- **Styling & Design:** For web applications, prioritize clean, functional UIs with vanilla CSS. For mobile, use Flet's Material-based components.
