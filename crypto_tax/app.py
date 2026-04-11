"""
Crypto.com → TurboTax Converter
Flask web application entry point.
"""

import io
import zipfile
from flask import (
    Flask,
    render_template,
    request,
    send_file,
    jsonify,
)

from src.parser import parse_csv
from src.calculator import calculate_taxes, METHOD_DESCRIPTIONS, VALID_METHODS
from src.exporter import export_turbotax_csv, export_summary_txt

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB limit


@app.route("/")
def index():
    return render_template(
        "index.html",
        methods=list(VALID_METHODS),
        method_descriptions=METHOD_DESCRIPTIONS,
    )


@app.route("/convert", methods=["POST"])
def convert():
    """
    POST /convert
    Form fields:
      file   – the crypto.com CSV file
      method – one of FIFO | LIFO | HIFO
    Returns a ZIP archive containing:
      - capital_gains.csv   (Form 8949 / TurboTax upload)
      - income.csv          (Schedule 1 ordinary income)
      - summary.txt         (human-readable summary)
    """
    if "file" not in request.files:
        return jsonify({"error": "No file part in the request."}), 400

    uploaded = request.files["file"]
    if uploaded.filename == "":
        return jsonify({"error": "No file selected."}), 400

    method = request.form.get("method", "FIFO").upper()
    if method not in VALID_METHODS:
        return jsonify({"error": f"Invalid method. Choose from {VALID_METHODS}."}), 400

    try:
        raw = uploaded.read()
        transactions = parse_csv(raw)
    except Exception:
        return jsonify({"error": "Failed to parse CSV. Please ensure the file is a valid Crypto.com export."}), 400

    if not transactions:
        return jsonify({"error": "No valid transactions found in the uploaded file."}), 400

    try:
        report = calculate_taxes(transactions, method=method)
    except Exception:
        return jsonify({"error": "An error occurred while calculating taxes. Please check your file and try again."}), 500

    cg_csv, income_csv = export_turbotax_csv(report)
    summary = export_summary_txt(report, method)

    # Pack everything into a ZIP for download
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("capital_gains.csv", cg_csv)
        zf.writestr("income.csv", income_csv)
        zf.writestr("summary.txt", summary)
    zip_buf.seek(0)

    return send_file(
        zip_buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name="turbotax_crypto_report.zip",
    )


@app.route("/api/methods")
def api_methods():
    """Return available tax methods and their descriptions."""
    return jsonify(
        {
            m: {"description": METHOD_DESCRIPTIONS[m]}
            for m in VALID_METHODS
        }
    )


if __name__ == "__main__":
    app.run(debug=False)
