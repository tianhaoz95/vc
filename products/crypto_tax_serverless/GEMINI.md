# Crypto.com → TurboTax Serverless

A purely client-side version of the Crypto.com tax converter that runs entirely in the browser.

## Project Overview

- **Core Purpose:** To provide a zero-infrastructure, high-privacy tax conversion tool.
- **Technologies:** 
    - **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+).
    - **Parsing/Logic:** Shared JS logic in `src/`.
    - **Testing:** Jest.
    - **Deployment:** Firebase Hosting.
- **Privacy:** Calculations are performed in the browser using the user's local hardware. No CSV data is uploaded to a server.

## Building and Running

### Development
1.  **Navigate to the product directory:**
    ```bash
    cd products/crypto_tax_serverless
    ```
2.  **Installation:**
    ```bash
    npm install
    ```
3.  **Run Tests:**
    ```bash
    npm test
    ```
4.  **Local Preview:**
    Open `index.html` in a web browser or use a local static server.

## Deployment

### Automated (GitHub Actions)
Pushes to the `products/crypto_tax_serverless/` directory trigger a GitHub Action (`.github/workflows/deploy-serverless.yml`) that deploys the site to Firebase Hosting.
- **Site ID:** `vc-crypto-tax`
- **Secret Required:** `FIREBASE_TOKEN`

### Manual
1.  **Ensure Firebase CLI is installed:**
    ```bash
    npx -y firebase-tools@latest --version
    ```
2.  **Deploy:**
    ```bash
    npx -y firebase-tools@latest deploy --only hosting:vc-crypto-tax
    ```

## Project Structure
- `index.html`: Main entry point and UI.
- `src/`: Core logic (parser, calculator, exporter) implemented in JavaScript.
- `tests/`: Jest test suite.
- `firebase.json`: Hosting configuration.
