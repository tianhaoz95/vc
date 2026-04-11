# Design Document: Crypto.com → TurboTax Mobile

## 1. Introduction
The objective is to create a mobile application version of the existing "Crypto.com → TurboTax Converter" web application using **Flet**. This mobile app will allow users to upload their Crypto.com CSV exports, choose a cost-basis method (FIFO, LIFO, HIFO), and download a ZIP archive containing TurboTax-ready CSV files and a summary report.

## 2. Goals & Objectives
- **Portability:** Provide a mobile-first experience for users who manage their crypto on their phones.
- **Code Reuse:** Leverage the existing Python logic (`parser.py`, `calculator.py`, `exporter.py`) with minimal changes.
- **Offline Capability:** Perform all calculations locally on the device without requiring a backend server for processing.
- **Modern UI:** Deliver a responsive and intuitive interface using Flet's Flutter-based components.

## 3. Technology Stack
- **Framework:** [Flet](https://flet.dev/) (Python wrapper for Flutter).
- **Core Logic:** Python 3.x.
- **Key Libraries:** 
    - `flet` (UI)
    - `zipfile` (Archive generation)
    - `csv`, `io`, `datetime` (Standard libraries)
- **Deployment:** Flet apps can be packaged for Android (APK/AAB) and iOS using `flet build`.

## 4. Architecture
The mobile app will follow a simple **Model-View-Controller (MVC)** or **Event-Driven** architecture typical of Flet applications.

### 4.1 Components
- **Logic Layer (Reused):**
    - `parser.py`: Decodes and sanitizes the input CSV.
    - `calculator.py`: Matches lots and calculates gains/losses.
    - `exporter.py`: Formats the results into CSV and TXT strings.
- **UI Layer (New):**
    - `main.py`: The Flet entry point. Handles the `page` lifecycle, state management, and UI layout.
    - `file_picker`: An `ft.FilePicker` instance for both selecting the input CSV and saving the output ZIP.
- **State Management:**
    - Local state within the Flet `page` or a dedicated state object to track the selected file, chosen method, and calculation results.

### 4.2 Data Flow
1. User clicks "Select CSV" -> Opens `FilePicker` (upload mode).
2. User selects a cost-basis method (Radio buttons or Dropdown).
3. User clicks "Convert" -> App reads file bytes, runs `parser`, `calculator`, and `exporter`.
4. App generates a ZIP archive in memory (`io.BytesIO`).
5. User clicks "Save Report" -> Opens `FilePicker` (save mode) to store the ZIP on the device.

## 5. UI/UX Design
- **Single Page Interface:** A clean, centered layout containing:
    - **Header:** Title and brief instruction.
    - **Upload Section:** Button to pick the CSV, displaying the selected filename.
    - **Settings Section:** Radio buttons for FIFO (default), LIFO, and HIFO, with tooltips/descriptions for each.
    - **Action Section:** "Convert & Save" button (enabled only after file selection).
    - **Feedback Section:** Progress indicators (if needed) and success/error messages.
- **Theme:** Dark/Light mode support (defaulting to system settings).

## 6. Security & Privacy
- **Local Processing:** All data remains on the user's device. No financial data is sent to a server.
- **Permissions:** 
    - **Android:** May require `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` (handled via `FilePicker`).
    - **iOS:** Sandboxed by default; `FilePicker` handles access to the Files app.

## 7. Viability Assessment
Flet is **highly viable** for this project because:
- The core logic is already written in Python and is pure-logic (no OS-level dependencies).
- Flet's `FilePicker` provides a native experience for selecting and saving files on mobile.
- The performance requirements for crypto tax calculations (parsing thousands of rows) are well within the capabilities of modern mobile processors running Python.
