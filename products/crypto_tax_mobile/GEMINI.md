# Crypto.com → TurboTax Mobile (VC - Crypto Products)

A mobile companion application for the "Crypto.com → TurboTax Converter," designed to automate the conversion of transaction history into tax-ready formats (Form 8949 and Schedule 1) directly on mobile devices.

## Project Overview

- **Core Purpose:** To provide a portable, offline-capable mobile experience for users who manage their cryptocurrency on mobile devices.
- **Technologies:** 
    - **Framework:** [Flet](https://flet.dev/) (Python wrapper for Flutter).
    - **Language:** Python 3.x.
    - **Key Libraries:** `flet`, `zipfile`, `csv`, `io`, `datetime`.
- **Architecture:** 
    - Follows a Model-View-Controller (MVC) or Event-Driven architecture typical of Flet applications.
    - **Logic Layer (Shared):** Reuses the parser, calculator, and exporter logic from the `products/crypto_tax` web project.
    - **UI Layer (Mobile):** Built with Flet's Flutter-based components for a modern and responsive cross-platform interface.
- **Privacy & Security:** All data processing occurs locally on the device using Python. No financial data is transmitted to external servers.

## Building and Running

### Development Environment (Desktop)
1.  **Navigate to the product directory:**
    ```bash
    cd products/crypto_tax_mobile
    ```
2.  **Installation:**
    ```bash
    pip install flet
    ```
3.  **Run the Application (Desktop Preview):**
    ```bash
    flet run main.py
    ```

### Mobile Deployment
1.  **Install Flet Build Tools:**
    ```bash
    pip install "flet[all]"
    ```
2.  **Build for Android (APK):**
    ```bash
    flet build apk
    ```
3.  **Build for iOS:**
    ```bash
    flet build ios
    ```

## Development Conventions

- **State Management:** Local state within the Flet `page` lifecycle for tracking selected files, cost-basis methods, and calculation results.
- **Logic Migration:** The core logic should be imported or copied from `products/crypto_tax/src` to ensure consistency between the web and mobile platforms.
- **UI Design:** Prioritize a clean, single-page interface with clear feedback (SnackBars, Progress Indicators) for file selection and conversion events.
- **Testing:** New UI components should be tested through desktop previews (`flet run`), while core logic should be validated using existing tests in `products/crypto_tax/tests`.

## Key Files (Planned)

- `main.py`: Entry point for the Flet application, containing the UI layout and event handlers.
- `requirements.txt`: List of Python dependencies (primarily `flet`).
- `design/design_doc.md`: Comprehensive design specification including goals, architecture, and technology stack.
- `design/implementation_plan.md`: Step-by-step roadmap for project execution.
- `src/`: Directory for housing the migrated logic layer (Parser, Calculator, Exporter).
