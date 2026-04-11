/**
 * Exporter: converts a TaxReport into TurboTax-compatible CSV strings.
 *
 * TurboTax accepts cryptocurrency transactions in a CSV with these columns
 * (Form 8949 / Schedule D layout):
 *
 *   Currency Name     – description of the asset (e.g. "1.5 BTC")
 *   Purchase Date     – date acquired  (MM/DD/YYYY)
 *   Cost Basis (USD)  – your cost in USD
 *   Date Sold         – date disposed  (MM/DD/YYYY)
 *   Proceeds (USD)    – amount received in USD
 *   Gain or Loss (USD)– gain or loss
 *   Term              – "Long-term" or "Short-term"
 *
 * Income (staking rewards, interest, cashback, etc.) is reported on Schedule 1
 * (Other Income) and exported to a separate CSV with columns:
 *
 *   Currency Name          – asset symbol
 *   Date Received          – date of receipt (MM/DD/YYYY)
 *   Amount Received        – quantity of crypto
 *   Fair Market Value (USD)– value in USD on receipt date
 *   Income Type            – description / transaction kind
 */

const DATE_FMT_OPTS = { month: "2-digit", day: "2-digit", year: "numeric" };

/**
 * Format a Date as MM/DD/YYYY using UTC values.
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Escape a value for CSV (wrap in quotes if it contains commas, quotes, or newlines).
 * @param {string|number} val
 * @returns {string}
 */
function csvEscape(val) {
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a CSV row string.
 * @param {Array} fields
 * @returns {string}
 */
function csvRow(fields) {
  return fields.map(csvEscape).join(",");
}

/**
 * Generate TurboTax-compatible CSV strings from a TaxReport.
 *
 * @param {import('./calculator').TaxReport} report
 * @returns {{ capitalGainsCsv: string, incomeCsv: string }}
 */
function exportTurboTaxCsv(report) {
  // ── Capital-gains CSV (Form 8949 / Schedule D) ────────────────────────────
  const cgRows = [
    csvRow([
      "Currency Name",
      "Purchase Date",
      "Cost Basis (USD)",
      "Date Sold",
      "Proceeds (USD)",
      "Gain or Loss (USD)",
      "Term",
    ]),
  ];

  for (const evt of report.taxEvents) {
    const assetLabel = `${fmtQty(evt.quantity)} ${evt.currency}`;
    cgRows.push(
      csvRow([
        assetLabel,
        formatDate(evt.dateAcquired),
        evt.costBasisUsd.toFixed(2),
        formatDate(evt.dateSold),
        evt.proceedsUsd.toFixed(2),
        evt.gainLossUsd.toFixed(2),
        evt.isLongTerm ? "Long-term" : "Short-term",
      ])
    );
  }

  const capitalGainsCsv = cgRows.join("\n") + "\n";

  // ── Income CSV (Schedule 1) ───────────────────────────────────────────────
  const incRows = [
    csvRow([
      "Currency Name",
      "Date Received",
      "Amount Received",
      "Fair Market Value (USD)",
      "Income Type",
    ]),
  ];

  for (const evt of report.incomeEvents) {
    incRows.push(
      csvRow([
        evt.currency,
        formatDate(evt.dateReceived),
        fmtQty(evt.quantity),
        evt.fairMarketValueUsd.toFixed(2),
        evt.description,
      ])
    );
  }

  const incomeCsv = incRows.join("\n") + "\n";

  return { capitalGainsCsv, incomeCsv };
}

/**
 * Generate a human-readable plain-text summary.
 *
 * @param {import('./calculator').TaxReport} report
 * @param {string} method
 * @returns {string}
 */
function exportSummaryTxt(report, method) {
  const lines = [
    "============================================================",
    "  CRYPTO TAX SUMMARY",
    `  Method: ${method}`,
    "============================================================",
    "",
    `  Short-term capital gains/losses : ${fmtUsd(report.totalShortTermGainLoss)}`,
    `  Long-term  capital gains/losses : ${fmtUsd(report.totalLongTermGainLoss)}`,
    `  Total capital gains/losses      : ${fmtUsd(report.totalGainLoss)}`,
    `  Ordinary income (crypto)        : ${fmtUsd(report.totalOrdinaryIncome)}`,
    "",
    `  Total taxable events  : ${report.taxEvents.length}`,
    `  Total income events   : ${report.incomeEvents.length}`,
    "============================================================",
  ];
  return lines.join("\n");
}

function fmtQty(qty) {
  // Use up to 8 significant digits, no trailing zeros
  return parseFloat(qty.toPrecision(8)).toString();
}

function fmtUsd(amount) {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

// Export for Node.js (tests) and browser (global)
if (typeof module !== "undefined" && module.exports) {
  module.exports = { exportTurboTaxCsv, exportSummaryTxt, formatDate, csvEscape, csvRow };
}
