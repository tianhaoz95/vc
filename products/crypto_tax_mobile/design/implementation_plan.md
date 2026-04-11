# Implementation Plan: Crypto.com → TurboTax Mobile

This plan outlines the steps required to port the Python logic from `products/crypto_tax` to a Flet-based mobile application.

## Phase 1: Environment Setup
1.  **Initialize Project:**
    - Create `products/crypto_tax_mobile/main.py` as the Flet entry point.
    - Create `products/crypto_tax_mobile/requirements.txt` with `flet`.
    - Create a Python virtual environment specifically for the mobile app.
2.  **Logic Migration:**
    - Copy the `src/` directory from `products/crypto_tax` into `products/crypto_tax_mobile/`.
    - Alternatively, link or use a shared directory if the repo structure allows (copying is safer for distinct deployment).

## Phase 2: Logic Integration
1.  **Modify Exporter (if needed):**
    - Ensure `exporter.py` methods remain pure and return strings/bytes.
2.  **Adapter/Wrapper:**
    - Create an adapter in `main.py` that handles the conversion workflow, mirroring the Flask `convert()` route's logic.

## Phase 3: UI Development
1.  **Base Layout:**
    - Implement the basic Flet `page` structure with standard padding and themes.
2.  **File Picker Integration:**
    - Initialize `ft.FilePicker` for selecting files.
    - Implement `on_result` for the pick-file dialog to capture the selected CSV's path and bytes.
3.  **UI Components:**
    - Header with app icon and title.
    - `ft.ElevatedButton` for "Select CSV".
    - `ft.RadioGroup` for selecting FIFO, LIFO, or HIFO.
    - `ft.ElevatedButton` for "Convert & Save ZIP".
    - `ft.Text` labels to show chosen file and selected method.
    - `ft.SnackBar` for success/error notifications.
4.  **Save Dialog Integration:**
    - Implement `file_picker.save_file()` to allow the user to choose a save location for the generated ZIP.

## Phase 4: Testing & Refinement
1.  **Local Desktop Testing:**
    - Run the Flet app on a desktop (`python main.py`) to verify the core workflow (picking, converting, saving).
2.  **Permission Handling:**
    - Test on mobile simulators/emulators to verify file storage access.
3.  **Error Handling:**
    - Handle edge cases: invalid CSVs, no file selected, cancelation of file pickers.

## Phase 5: Packaging & Deployment
1.  **Install Flet Build Tools:**
    - Install `flet` with the `[all]` extra if needed for building.
2.  **Configure `pyproject.toml` (Optional):**
    - Add metadata (name, version, icon, splash screen).
3.  **Build for Android:**
    - Run `flet build apk` (requires Flutter SDK and Android SDK).
4.  **Build for iOS:**
    - Run `flet build ios` (requires macOS, Xcode, and CocoaPods).

## Detailed Workflow in `main.py`
```python
import flet as ft
from src.parser import parse_csv
from src.calculator import calculate_taxes
from src.exporter import export_turbotax_csv, export_summary_txt
import io
import zipfile

def main(page: ft.Page):
    page.title = "Crypto.com Tax Converter"
    page.theme_mode = ft.ThemeMode.LIGHT
    
    # State
    selected_file = None
    selected_method = "FIFO"
    generated_zip_bytes = None

    # UI Handlers
    def on_pick_file_result(e: ft.FilePickerResultEvent):
        nonlocal selected_file
        if e.files:
            selected_file = e.files[0]
            file_label.value = f"Selected: {selected_file.name}"
            page.update()

    def on_save_file_result(e: ft.FilePickerResultEvent):
        if e.path and generated_zip_bytes:
            with open(e.path, "wb") as f:
                f.write(generated_zip_bytes)
            page.snack_bar = ft.SnackBar(ft.Text("Report saved successfully!"))
            page.snack_bar.open = True
            page.update()

    # Core logic triggered by "Convert"
    def start_conversion(e):
        nonlocal generated_zip_bytes
        if not selected_file: return
        
        # Read file bytes (Flet handles reading differently on mobile vs web)
        # Use selected_file.path on desktop/mobile
        with open(selected_file.path, "rb") as f:
            raw = f.read()
        
        # Run tax logic
        transactions = parse_csv(raw)
        report = calculate_taxes(transactions, method=selected_method)
        cg_csv, income_csv = export_turbotax_csv(report)
        summary = export_summary_txt(report, selected_method)
        
        # Pack ZIP
        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("capital_gains.csv", cg_csv)
            zf.writestr("income.csv", income_csv)
            zf.writestr("summary.txt", summary)
        
        generated_zip_bytes = zip_buf.getvalue()
        
        # Trigger Save Dialog
        file_picker.save_file(file_name="crypto_tax_report.zip")

    # Components
    file_picker = ft.FilePicker(on_result=on_pick_file_result)
    save_picker = ft.FilePicker(on_result=on_save_file_result)
    page.overlay.append(file_picker)
    page.overlay.append(save_picker)
    # ... build rest of the UI ...
```
