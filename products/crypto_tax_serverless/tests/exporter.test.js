"use strict";

const { CryptoTransaction } = require("../src/parser");
const { calculateTaxes } = require("../src/calculator");
const { exportTurboTaxCsv, exportSummaryTxt, formatDate, csvEscape, csvRow } = require("../src/exporter");

// ── formatDate ────────────────────────────────────────────────────────────────

describe("formatDate", () => {
  test("formats date as MM/DD/YYYY", () => {
    const d = new Date(Date.UTC(2021, 0, 15)); // Jan 15, 2021
    expect(formatDate(d)).toBe("01/15/2021");
  });

  test("pads month and day with zeros", () => {
    const d = new Date(Date.UTC(2022, 2, 5)); // Mar 5, 2022
    expect(formatDate(d)).toBe("03/05/2022");
  });

  test("handles December 31", () => {
    const d = new Date(Date.UTC(2023, 11, 31)); // Dec 31, 2023
    expect(formatDate(d)).toBe("12/31/2023");
  });
});

// ── csvEscape ─────────────────────────────────────────────────────────────────

describe("csvEscape", () => {
  test("returns plain string unchanged", () => {
    expect(csvEscape("hello")).toBe("hello");
  });

  test("wraps string with comma in double quotes", () => {
    expect(csvEscape("hello, world")).toBe('"hello, world"');
  });

  test("wraps string with double quote and escapes internal quotes", () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  test("wraps string with newline", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  test("converts number to string", () => {
    expect(csvEscape(12345.67)).toBe("12345.67");
  });
});

// ── csvRow ────────────────────────────────────────────────────────────────────

describe("csvRow", () => {
  test("joins fields with commas", () => {
    expect(csvRow(["a", "b", "c"])).toBe("a,b,c");
  });

  test("escapes fields with commas", () => {
    expect(csvRow(["name, inc", "value"])).toBe('"name, inc",value');
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function dt(year, month = 1, day = 1) {
  return new Date(Date.UTC(year, month - 1, day));
}

function tx({ timestamp, currency, amount, nativeUsd, kind, toCurrency = null, toAmount = null, description = "" }) {
  return new CryptoTransaction({
    timestamp,
    description: description || kind,
    currency,
    amount,
    toCurrency,
    toAmount,
    nativeCurrency: "USD",
    nativeAmount: nativeUsd,
    nativeAmountUsd: nativeUsd,
    transactionKind: kind,
  });
}

// ── exportTurboTaxCsv ─────────────────────────────────────────────────────────

describe("exportTurboTaxCsv", () => {
  const transactions = [
    tx({ timestamp: dt(2021, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -30000, kind: "crypto_purchase" }),
    tx({ timestamp: dt(2022, 6, 1), currency: "BTC", amount: -1.0, nativeUsd: 50000, kind: "crypto_purchase" }),
    tx({ timestamp: dt(2021, 7, 1), currency: "CRO", amount: 500.0, nativeUsd: 50.0, kind: "crypto_earn_interest_paid", description: "Earn Interest" }),
  ];

  let report;
  let capitalGainsCsv, incomeCsv;

  beforeAll(() => {
    report = calculateTaxes(transactions, "FIFO");
    ({ capitalGainsCsv, incomeCsv } = exportTurboTaxCsv(report));
  });

  test("capitalGainsCsv is a non-empty string", () => {
    expect(typeof capitalGainsCsv).toBe("string");
    expect(capitalGainsCsv.length).toBeGreaterThan(0);
  });

  test("capitalGainsCsv has correct header row", () => {
    const firstLine = capitalGainsCsv.split("\n")[0];
    expect(firstLine).toContain("Currency Name");
    expect(firstLine).toContain("Purchase Date");
    expect(firstLine).toContain("Cost Basis (USD)");
    expect(firstLine).toContain("Date Sold");
    expect(firstLine).toContain("Proceeds (USD)");
    expect(firstLine).toContain("Gain or Loss (USD)");
    expect(firstLine).toContain("Term");
  });

  test("capitalGainsCsv has one data row for the sale", () => {
    const lines = capitalGainsCsv.split("\n").filter(l => l.trim());
    expect(lines).toHaveLength(2); // header + 1 data row
  });

  test("capitalGainsCsv data row contains correct gain amount", () => {
    const dataLine = capitalGainsCsv.split("\n")[1];
    expect(dataLine).toContain("20000.00");
  });

  test("capitalGainsCsv data row shows correct term", () => {
    const dataLine = capitalGainsCsv.split("\n")[1];
    // Bought Jan 2021, sold Jun 2022 → long-term (> 365 days)
    expect(dataLine).toContain("Long-term");
  });

  test("capitalGainsCsv data row shows correct dates in MM/DD/YYYY format", () => {
    const dataLine = capitalGainsCsv.split("\n")[1];
    expect(dataLine).toContain("01/01/2021"); // purchase date
    expect(dataLine).toContain("06/01/2022"); // sale date
  });

  test("incomeCsv is a non-empty string", () => {
    expect(typeof incomeCsv).toBe("string");
    expect(incomeCsv.length).toBeGreaterThan(0);
  });

  test("incomeCsv has correct header row", () => {
    const firstLine = incomeCsv.split("\n")[0];
    expect(firstLine).toContain("Currency Name");
    expect(firstLine).toContain("Date Received");
    expect(firstLine).toContain("Amount Received");
    expect(firstLine).toContain("Fair Market Value (USD)");
    expect(firstLine).toContain("Income Type");
  });

  test("incomeCsv has one data row for the interest event", () => {
    const lines = incomeCsv.split("\n").filter(l => l.trim());
    expect(lines).toHaveLength(2); // header + 1 data row
  });

  test("incomeCsv data row contains correct FMV", () => {
    const dataLine = incomeCsv.split("\n")[1];
    expect(dataLine).toContain("50.00");
  });

  test("incomeCsv data row contains correct currency", () => {
    const dataLine = incomeCsv.split("\n")[1];
    expect(dataLine).toContain("CRO");
  });

  test("incomeCsv data row contains correct date", () => {
    const dataLine = incomeCsv.split("\n")[1];
    expect(dataLine).toContain("07/01/2021");
  });
});

// ── Empty report export ───────────────────────────────────────────────────────

describe("exportTurboTaxCsv with empty report", () => {
  test("produces only header rows when no events", () => {
    const { calculateTaxes: calc } = require("../src/calculator");
    const report = calc([], "FIFO");
    const { capitalGainsCsv, incomeCsv } = exportTurboTaxCsv(report);
    const cgLines = capitalGainsCsv.split("\n").filter(l => l.trim());
    const incLines = incomeCsv.split("\n").filter(l => l.trim());
    expect(cgLines).toHaveLength(1); // header only
    expect(incLines).toHaveLength(1);
  });
});

// ── exportSummaryTxt ──────────────────────────────────────────────────────────

describe("exportSummaryTxt", () => {
  const transactions = [
    tx({ timestamp: dt(2021, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -30000, kind: "crypto_purchase" }),
    tx({ timestamp: dt(2022, 6, 1), currency: "BTC", amount: -1.0, nativeUsd: 50000, kind: "crypto_purchase" }),
    tx({ timestamp: dt(2021, 7, 1), currency: "CRO", amount: 100.0, nativeUsd: 40.0, kind: "crypto_earn_interest_paid" }),
  ];

  let report, summary;

  beforeAll(() => {
    report = calculateTaxes(transactions, "FIFO");
    summary = exportSummaryTxt(report, "FIFO");
  });

  test("summary is a non-empty string", () => {
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });

  test("contains method name", () => {
    expect(summary).toContain("FIFO");
  });

  test("contains total gain/loss", () => {
    expect(summary).toContain("20000.00");
  });

  test("contains ordinary income", () => {
    expect(summary).toContain("40.00");
  });

  test("contains event counts", () => {
    expect(summary).toContain("1"); // 1 tax event
  });

  test("summary changes with different method name", () => {
    const lifoSummary = exportSummaryTxt(report, "LIFO");
    expect(lifoSummary).toContain("LIFO");
  });
});

// ── LIFO/HIFO export produces different amounts than FIFO ─────────────────────

describe("Different methods produce different CSV output", () => {
  const transactions = [
    tx({ timestamp: dt(2020, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -10000, kind: "crypto_purchase" }),
    tx({ timestamp: dt(2021, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -30000, kind: "crypto_purchase" }),
    tx({ timestamp: dt(2022, 1, 1), currency: "BTC", amount: -1.0, nativeUsd: 25000, kind: "crypto_purchase" }),
  ];

  test("FIFO and LIFO produce different gain amounts in CSV", () => {
    const fifoReport = calculateTaxes(transactions, "FIFO");
    const lifoReport = calculateTaxes(transactions, "LIFO");
    const { capitalGainsCsv: fifoCsv } = exportTurboTaxCsv(fifoReport);
    const { capitalGainsCsv: lifoCsv } = exportTurboTaxCsv(lifoReport);
    expect(fifoCsv).not.toBe(lifoCsv);
  });

  test("FIFO CSV contains gain amount 15000.00", () => {
    const report = calculateTaxes(transactions, "FIFO");
    const { capitalGainsCsv } = exportTurboTaxCsv(report);
    expect(capitalGainsCsv).toContain("15000.00");
  });

  test("LIFO CSV contains loss amount -5000.00", () => {
    const report = calculateTaxes(transactions, "LIFO");
    const { capitalGainsCsv } = exportTurboTaxCsv(report);
    expect(capitalGainsCsv).toContain("-5000.00");
  });
});
