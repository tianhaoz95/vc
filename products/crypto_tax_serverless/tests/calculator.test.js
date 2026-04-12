"use strict";

const { CryptoTransaction } = require("../src/parser");
const {
  calculateTaxes,
  filterReportByYear,
  TaxReport,
  VALID_METHODS,
  isLongTerm,
  daysDiff,
} = require("../src/calculator");

// ── Helper factories ──────────────────────────────────────────────────────────

function dt(year, month = 1, day = 1) {
  return new Date(Date.UTC(year, month - 1, day));
}

function tx({
  timestamp,
  currency,
  amount,
  nativeUsd,
  kind,
  toCurrency = null,
  toAmount = null,
  description = "",
}) {
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

// ── isLongTerm / daysDiff ─────────────────────────────────────────────────────

describe("daysDiff", () => {
  test("same day is 0 days", () => {
    const d = dt(2022, 1, 1);
    expect(daysDiff(d, d)).toBe(0);
  });

  test("exactly 365 days apart", () => {
    const a = dt(2022, 1, 1);
    const b = new Date(a.getTime() + 365 * 24 * 60 * 60 * 1000);
    expect(daysDiff(a, b)).toBe(365);
  });
});

describe("isLongTerm", () => {
  test("366 days is long-term", () => {
    const buy = dt(2022, 1, 1);
    const sell = new Date(buy.getTime() + 366 * 24 * 60 * 60 * 1000);
    expect(isLongTerm(buy, sell)).toBe(true);
  });

  test("365 days is NOT long-term (must be > 365)", () => {
    const buy = dt(2022, 1, 1);
    const sell = new Date(buy.getTime() + 365 * 24 * 60 * 60 * 1000);
    expect(isLongTerm(buy, sell)).toBe(false);
  });

  test("364 days is short-term", () => {
    const buy = dt(2022, 1, 1);
    const sell = new Date(buy.getTime() + 364 * 24 * 60 * 60 * 1000);
    expect(isLongTerm(buy, sell)).toBe(false);
  });
});

// ── Simple gain / loss ────────────────────────────────────────────────────────

describe("Simple gain calculation", () => {
  const transactions = [
    tx({ timestamp: dt(2021, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -30000, kind: "crypto_purchase" }),
    tx({ timestamp: dt(2022, 6, 1), currency: "BTC", amount: -1.0, nativeUsd: 50000, kind: "crypto_purchase" }),
  ];

  test("FIFO: $20,000 gain on BTC purchase then sale", () => {
    const report = calculateTaxes(transactions, "FIFO");
    expect(report.taxEvents).toHaveLength(1);
    expect(report.taxEvents[0].proceedsUsd).toBeCloseTo(50000);
    expect(report.taxEvents[0].costBasisUsd).toBeCloseTo(30000);
    expect(report.taxEvents[0].gainLossUsd).toBeCloseTo(20000);
  });

  test("total gain/loss equals $20,000", () => {
    const report = calculateTaxes(transactions, "FIFO");
    expect(report.totalGainLoss).toBeCloseTo(20000);
  });

  test("no income events for simple buy/sell", () => {
    const report = calculateTaxes(transactions, "FIFO");
    expect(report.incomeEvents).toHaveLength(0);
  });
});

describe("Simple loss calculation", () => {
  const transactions = [
    tx({ timestamp: dt(2021, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -50000, kind: "crypto_purchase" }),
    tx({ timestamp: dt(2022, 1, 1), currency: "BTC", amount: -1.0, nativeUsd: 30000, kind: "crypto_purchase" }),
  ];

  test("FIFO: $20,000 loss", () => {
    const report = calculateTaxes(transactions, "FIFO");
    expect(report.totalGainLoss).toBeCloseTo(-20000);
  });
});

// ── Holding period ────────────────────────────────────────────────────────────

describe("Holding period classification", () => {
  test("held < 365 days is short-term", () => {
    const txs = [
      tx({ timestamp: dt(2022, 1, 1), currency: "ETH", amount: 1.0, nativeUsd: -3000, kind: "crypto_purchase" }),
      tx({ timestamp: dt(2022, 12, 31), currency: "ETH", amount: -1.0, nativeUsd: 4000, kind: "crypto_purchase" }),
    ];
    const report = calculateTaxes(txs, "FIFO");
    expect(report.taxEvents[0].isLongTerm).toBe(false);
  });

  test("held > 365 days is long-term", () => {
    const txs = [
      tx({ timestamp: dt(2020, 1, 1), currency: "ETH", amount: 1.0, nativeUsd: -1000, kind: "crypto_purchase" }),
      tx({ timestamp: dt(2021, 6, 1), currency: "ETH", amount: -1.0, nativeUsd: 2000, kind: "crypto_purchase" }),
    ];
    const report = calculateTaxes(txs, "FIFO");
    expect(report.taxEvents[0].isLongTerm).toBe(true);
  });

  test("exactly 365 days is short-term (must be > 365)", () => {
    const buy = dt(2022, 1, 1);
    const sell = new Date(buy.getTime() + 365 * 24 * 60 * 60 * 1000);
    const txs = [
      tx({ timestamp: buy, currency: "BTC", amount: 1.0, nativeUsd: -30000, kind: "crypto_purchase" }),
      tx({ timestamp: sell, currency: "BTC", amount: -1.0, nativeUsd: 35000, kind: "crypto_purchase" }),
    ];
    const report = calculateTaxes(txs, "FIFO");
    expect(report.taxEvents[0].isLongTerm).toBe(false);
  });

  test("short-term total is isolated from long-term", () => {
    const txs = [
      tx({ timestamp: dt(2022, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -30000, kind: "crypto_purchase" }),
      tx({ timestamp: dt(2022, 6, 1), currency: "BTC", amount: -1.0, nativeUsd: 35000, kind: "crypto_purchase" }),
    ];
    const report = calculateTaxes(txs, "FIFO");
    expect(report.totalShortTermGainLoss).toBeCloseTo(5000);
    expect(report.totalLongTermGainLoss).toBeCloseTo(0);
  });

  test("long-term total is isolated from short-term", () => {
    const txs = [
      tx({ timestamp: dt(2020, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -10000, kind: "crypto_purchase" }),
      tx({ timestamp: dt(2022, 1, 1), currency: "BTC", amount: -1.0, nativeUsd: 40000, kind: "crypto_purchase" }),
    ];
    const report = calculateTaxes(txs, "FIFO");
    expect(report.totalLongTermGainLoss).toBeCloseTo(30000);
    expect(report.totalShortTermGainLoss).toBeCloseTo(0);
  });
});

// ── FIFO / LIFO / HIFO ───────────────────────────────────────────────────────

describe("Cost-basis methods (FIFO / LIFO / HIFO)", () => {
  /**
   * Buy 1 BTC @ $10,000 (lot A – older)
   * Buy 1 BTC @ $30,000 (lot B – newer, higher cost)
   * Sell 1 BTC @ $25,000
   *
   * FIFO: uses lot A → gain = 25,000 - 10,000 = $15,000
   * LIFO: uses lot B → loss = 25,000 - 30,000 = -$5,000
   * HIFO: uses lot B → loss = 25,000 - 30,000 = -$5,000
   */
  const transactions = [
    tx({ timestamp: dt(2020, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -10000, kind: "crypto_purchase" }),
    tx({ timestamp: dt(2021, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -30000, kind: "crypto_purchase" }),
    tx({ timestamp: dt(2022, 1, 1), currency: "BTC", amount: -1.0, nativeUsd: 25000, kind: "crypto_purchase" }),
  ];

  test("FIFO: gain = $15,000 (uses oldest lot)", () => {
    const report = calculateTaxes(transactions, "FIFO");
    expect(report.totalGainLoss).toBeCloseTo(15000);
  });

  test("LIFO: loss = -$5,000 (uses newest lot)", () => {
    const report = calculateTaxes(transactions, "LIFO");
    expect(report.totalGainLoss).toBeCloseTo(-5000);
  });

  test("HIFO: loss = -$5,000 (uses highest cost lot)", () => {
    const report = calculateTaxes(transactions, "HIFO");
    expect(report.totalGainLoss).toBeCloseTo(-5000);
  });

  test("invalid method throws", () => {
    expect(() => calculateTaxes(transactions, "AVERAGE")).toThrow();
  });

  test("all VALID_METHODS run without error", () => {
    for (const m of VALID_METHODS) {
      const report = calculateTaxes(transactions, m);
      expect(report).toBeInstanceOf(TaxReport);
    }
  });
});

// ── HIFO minimises gains ──────────────────────────────────────────────────────

describe("HIFO minimises gains compared to FIFO", () => {
  /**
   * Lot A: 1 BTC @ $10,000
   * Lot B: 1 BTC @ $45,000
   * Sell 1 BTC @ $50,000
   * FIFO gain = $40,000; HIFO gain = $5,000
   */
  const transactions = [
    tx({ timestamp: dt(2019, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -10000, kind: "crypto_purchase" }),
    tx({ timestamp: dt(2020, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -45000, kind: "crypto_purchase" }),
    tx({ timestamp: dt(2022, 1, 1), currency: "BTC", amount: -1.0, nativeUsd: 50000, kind: "crypto_purchase" }),
  ];

  test("HIFO gain is less than FIFO gain", () => {
    const fifo = calculateTaxes(transactions, "FIFO").totalGainLoss;
    const hifo = calculateTaxes(transactions, "HIFO").totalGainLoss;
    expect(hifo).toBeLessThan(fifo);
  });

  test("HIFO gain = $5,000", () => {
    expect(calculateTaxes(transactions, "HIFO").totalGainLoss).toBeCloseTo(5000);
  });

  test("FIFO gain = $40,000", () => {
    expect(calculateTaxes(transactions, "FIFO").totalGainLoss).toBeCloseTo(40000);
  });
});

// ── Multi-lot partial consumption ─────────────────────────────────────────────

describe("FIFO partial lot consumption", () => {
  /**
   * Lot A: 2 BTC @ $10,000 each = $20,000 total
   * Lot B: 1 BTC @ $40,000
   * Sell 3 BTC @ $50,000 each = $150,000 total proceeds
   *
   * FIFO consumes:
   *   2 BTC from lot A → basis $20,000, proceeds $100,000 → gain $80,000
   *   1 BTC from lot B → basis $40,000, proceeds  $50,000 → gain $10,000
   * Total gain = $90,000
   */
  const transactions = [
    tx({ timestamp: dt(2020, 1, 1), currency: "BTC", amount: 2.0, nativeUsd: -20000, kind: "crypto_purchase" }),
    tx({ timestamp: dt(2021, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -40000, kind: "crypto_purchase" }),
    tx({ timestamp: dt(2023, 1, 1), currency: "BTC", amount: -3.0, nativeUsd: 150000, kind: "crypto_purchase" }),
  ];

  test("total gain = $90,000", () => {
    const report = calculateTaxes(transactions, "FIFO");
    expect(report.totalGainLoss).toBeCloseTo(90000);
  });

  test("generates two tax events (one per lot)", () => {
    const report = calculateTaxes(transactions, "FIFO");
    expect(report.taxEvents).toHaveLength(2);
  });
});

// ── Income events ─────────────────────────────────────────────────────────────

describe("Income events", () => {
  const transactions = [
    tx({ timestamp: dt(2021, 1, 1), currency: "CRO", amount: 100.0, nativeUsd: 50.0, kind: "crypto_earn_interest_paid", description: "Earn Interest" }),
    tx({ timestamp: dt(2021, 2, 1), currency: "CRO", amount: 10.0, nativeUsd: 5.0, kind: "referral_gift", description: "Referral Bonus" }),
  ];

  test("two income events captured", () => {
    const report = calculateTaxes(transactions, "FIFO");
    expect(report.incomeEvents).toHaveLength(2);
  });

  test("total ordinary income = $55", () => {
    const report = calculateTaxes(transactions, "FIFO");
    expect(report.totalOrdinaryIncome).toBeCloseTo(55);
  });

  test("income events do NOT appear in tax events", () => {
    const report = calculateTaxes(transactions, "FIFO");
    expect(report.taxEvents).toHaveLength(0);
  });

  test("income becomes cost basis for future disposal", () => {
    const txs = [
      tx({ timestamp: dt(2021, 1, 1), currency: "CRO", amount: 100.0, nativeUsd: 50.0, kind: "crypto_earn_interest_paid" }),
      tx({ timestamp: dt(2022, 1, 1), currency: "CRO", amount: -100.0, nativeUsd: 80.0, kind: "crypto_exchange" }),
    ];
    const report = calculateTaxes(txs, "FIFO");
    expect(report.totalGainLoss).toBeCloseTo(30);
  });
});

// ── Crypto-to-crypto exchange ─────────────────────────────────────────────────

describe("Crypto-to-crypto exchange", () => {
  /**
   * Buy 1 ETH @ $3,000.
   * Swap 1 ETH → 0.1 BTC when ETH FMV = $4,000.
   * Gain on ETH disposal = $4,000 - $3,000 = $1,000.
   * New BTC lot: 0.1 BTC @ $4,000 cost basis.
   * Sell 0.1 BTC @ $5,000 → gain = $5,000 - $4,000 = $1,000.
   */
  const transactions = [
    tx({ timestamp: dt(2021, 1, 1), currency: "ETH", amount: 1.0, nativeUsd: -3000, kind: "crypto_purchase" }),
    tx({ timestamp: dt(2021, 6, 1), currency: "ETH", amount: -1.0, nativeUsd: 4000, kind: "crypto_exchange", toCurrency: "BTC", toAmount: 0.1 }),
    tx({ timestamp: dt(2022, 6, 1), currency: "BTC", amount: -0.1, nativeUsd: 5000, kind: "crypto_exchange" }),
  ];

  test("ETH disposal gain = $1,000", () => {
    const report = calculateTaxes(transactions, "FIFO");
    const ethEvents = report.taxEvents.filter(e => e.currency === "ETH");
    expect(ethEvents).toHaveLength(1);
    expect(ethEvents[0].gainLossUsd).toBeCloseTo(1000);
  });

  test("BTC disposal gain = $1,000", () => {
    const report = calculateTaxes(transactions, "FIFO");
    const btcEvents = report.taxEvents.filter(e => e.currency === "BTC");
    expect(btcEvents).toHaveLength(1);
    expect(btcEvents[0].gainLossUsd).toBeCloseTo(1000);
  });

  test("total gain from both disposals = $2,000", () => {
    const report = calculateTaxes(transactions, "FIFO");
    expect(report.totalGainLoss).toBeCloseTo(2000);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  test("empty transactions produces zero report", () => {
    const report = calculateTaxes([], "FIFO");
    expect(report.totalGainLoss).toBe(0);
    expect(report.totalOrdinaryIncome).toBe(0);
    expect(report.taxEvents).toHaveLength(0);
    expect(report.incomeEvents).toHaveLength(0);
  });

  test("only purchases produce no tax events", () => {
    const txs = [
      tx({ timestamp: dt(2021, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -30000, kind: "crypto_purchase" }),
      tx({ timestamp: dt(2022, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -40000, kind: "crypto_purchase" }),
    ];
    const report = calculateTaxes(txs, "FIFO");
    expect(report.taxEvents).toHaveLength(0);
  });

  test("ignored kinds (deposit/withdrawal) produce no events", () => {
    const txs = [
      tx({ timestamp: dt(2021, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: 30000, kind: "crypto_deposit" }),
      tx({ timestamp: dt(2021, 2, 1), currency: "BTC", amount: -1.0, nativeUsd: 30000, kind: "crypto_withdrawal" }),
    ];
    const report = calculateTaxes(txs, "FIFO");
    expect(report.taxEvents).toHaveLength(0);
    expect(report.incomeEvents).toHaveLength(0);
  });

  test("method is case-insensitive", () => {
    const txs = [
      tx({ timestamp: dt(2021, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -30000, kind: "crypto_purchase" }),
      tx({ timestamp: dt(2022, 1, 1), currency: "BTC", amount: -1.0, nativeUsd: 50000, kind: "crypto_purchase" }),
    ];
    const report = calculateTaxes(txs, "fifo");
    expect(report.totalGainLoss).toBeCloseTo(20000);
  });

  test("multiple currencies are tracked independently", () => {
    const txs = [
      tx({ timestamp: dt(2021, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -10000, kind: "crypto_purchase" }),
      tx({ timestamp: dt(2021, 1, 1), currency: "ETH", amount: 5.0, nativeUsd: -5000, kind: "crypto_purchase" }),
      tx({ timestamp: dt(2022, 1, 1), currency: "BTC", amount: -1.0, nativeUsd: 15000, kind: "crypto_purchase" }),
      tx({ timestamp: dt(2022, 1, 1), currency: "ETH", amount: -5.0, nativeUsd: 10000, kind: "crypto_purchase" }),
    ];
    const report = calculateTaxes(txs, "FIFO");
    const btcGain = report.taxEvents.filter(e => e.currency === "BTC").reduce((s, e) => s + e.gainLossUsd, 0);
    const ethGain = report.taxEvents.filter(e => e.currency === "ETH").reduce((s, e) => s + e.gainLossUsd, 0);
    expect(btcGain).toBeCloseTo(5000);
    expect(ethGain).toBeCloseTo(5000);
    expect(report.totalGainLoss).toBeCloseTo(10000);
  });

  test("transactions are processed in chronological order regardless of input order", () => {
    const txs = [
      tx({ timestamp: dt(2022, 6, 1), currency: "BTC", amount: -1.0, nativeUsd: 50000, kind: "crypto_purchase" }),
      tx({ timestamp: dt(2021, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -30000, kind: "crypto_purchase" }),
    ];
    const report = calculateTaxes(txs, "FIFO");
    expect(report.totalGainLoss).toBeCloseTo(20000);
  });

  test("card_top_up is treated as a disposal (capital event)", () => {
    const txs = [
      tx({ timestamp: dt(2021, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -30000, kind: "crypto_purchase" }),
      tx({ timestamp: dt(2022, 1, 1), currency: "BTC", amount: -0.01, nativeUsd: 500, kind: "card_top_up" }),
    ];
    const report = calculateTaxes(txs, "FIFO");
    expect(report.taxEvents).toHaveLength(1);
  });
});

// ── TaxReport properties ──────────────────────────────────────────────────────

describe("TaxReport computed properties", () => {
  test("totalGainLoss = short-term + long-term", () => {
    const txs = [
      // Short-term purchase and sale (within same year)
      tx({ timestamp: dt(2022, 1, 1), currency: "ETH", amount: 1.0, nativeUsd: -3000, kind: "crypto_purchase" }),
      tx({ timestamp: dt(2022, 6, 1), currency: "ETH", amount: -1.0, nativeUsd: 4000, kind: "crypto_purchase" }),
      // Long-term purchase and sale (> 365 days)
      tx({ timestamp: dt(2020, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -10000, kind: "crypto_purchase" }),
      tx({ timestamp: dt(2022, 1, 1), currency: "BTC", amount: -1.0, nativeUsd: 15000, kind: "crypto_purchase" }),
    ];
    const report = calculateTaxes(txs, "FIFO");
    expect(report.totalGainLoss).toBeCloseTo(
      report.totalShortTermGainLoss + report.totalLongTermGainLoss
    );
  });
});

// ── filterReportByYear ────────────────────────────────────────────────────────

describe("filterReportByYear", () => {
  const txs = [
    // 2023 buy
    tx({ timestamp: dt(2023, 1, 1), currency: "BTC", amount: 1.0, nativeUsd: -20000, kind: "crypto_purchase" }),
    // 2024 sale → capital event in 2024
    tx({ timestamp: dt(2024, 6, 1), currency: "BTC", amount: -0.5, nativeUsd: 15000, kind: "crypto_purchase" }),
    // 2025 sale → capital event in 2025
    tx({ timestamp: dt(2025, 3, 1), currency: "BTC", amount: -0.5, nativeUsd: 18000, kind: "crypto_purchase" }),
    // 2024 income
    tx({ timestamp: dt(2024, 2, 1), currency: "CRO", amount: 100, nativeUsd: 30, kind: "crypto_earn_interest_paid" }),
    // 2025 income
    tx({ timestamp: dt(2025, 5, 1), currency: "CRO", amount: 50, nativeUsd: 15, kind: "crypto_earn_interest_paid" }),
  ];

  test("null year returns full report unchanged", () => {
    const report = calculateTaxes(txs, "FIFO");
    const filtered = filterReportByYear(report, null);
    expect(filtered.taxEvents).toHaveLength(report.taxEvents.length);
    expect(filtered.incomeEvents).toHaveLength(report.incomeEvents.length);
  });

  test("year 2024 returns only 2024 events", () => {
    const report = calculateTaxes(txs, "FIFO");
    const filtered = filterReportByYear(report, 2024);
    expect(filtered.taxEvents).toHaveLength(1);
    expect(filtered.taxEvents[0].dateSold.getUTCFullYear()).toBe(2024);
    expect(filtered.incomeEvents).toHaveLength(1);
    expect(filtered.incomeEvents[0].dateReceived.getUTCFullYear()).toBe(2024);
  });

  test("year 2025 returns only 2025 events", () => {
    const report = calculateTaxes(txs, "FIFO");
    const filtered = filterReportByYear(report, 2025);
    expect(filtered.taxEvents).toHaveLength(1);
    expect(filtered.taxEvents[0].dateSold.getUTCFullYear()).toBe(2025);
    expect(filtered.incomeEvents).toHaveLength(1);
    expect(filtered.incomeEvents[0].dateReceived.getUTCFullYear()).toBe(2025);
  });

  test("year with no events returns empty report", () => {
    const report = calculateTaxes(txs, "FIFO");
    const filtered = filterReportByYear(report, 2023);
    expect(filtered.taxEvents).toHaveLength(0);
    expect(filtered.incomeEvents).toHaveLength(0);
  });

  test("cost basis from prior years is still applied correctly when filtering", () => {
    // Buy 1 BTC in 2023 @ $20,000 total → $20,000 per BTC
    // Sell 0.5 BTC in 2024 for $15,000 → gain = 15,000 - 10,000 = $5,000
    const report = calculateTaxes(txs, "FIFO");
    const filtered2024 = filterReportByYear(report, 2024);
    expect(filtered2024.taxEvents[0].gainLossUsd).toBeCloseTo(5000);
  });
});

// ── ignoredIncomeKinds option ─────────────────────────────────────────────────

describe("calculateTaxes with ignoredIncomeKinds", () => {
  const txs = [
    tx({ timestamp: dt(2023, 1, 1), currency: "CRO", amount: 200, nativeUsd: 60, kind: "referral_card_cashback" }),
    tx({ timestamp: dt(2023, 6, 1), currency: "CRO", amount: 100, nativeUsd: 30, kind: "crypto_earn_interest_paid" }),
  ];

  test("without ignore option, both income events are reported", () => {
    const report = calculateTaxes(txs, "FIFO");
    expect(report.incomeEvents).toHaveLength(2);
    expect(report.totalOrdinaryIncome).toBeCloseTo(90);
  });

  test("ignoring referral_card_cashback removes it from income but keeps interest", () => {
    const report = calculateTaxes(txs, "FIFO", {
      ignoredIncomeKinds: ["referral_card_cashback"],
    });
    expect(report.incomeEvents).toHaveLength(1);
    expect(report.incomeEvents[0].fairMarketValueUsd).toBeCloseTo(30);
    expect(report.totalOrdinaryIncome).toBeCloseTo(30);
  });

  test("ignoring all income kinds results in zero ordinary income", () => {
    const report = calculateTaxes(txs, "FIFO", {
      ignoredIncomeKinds: ["referral_card_cashback", "crypto_earn_interest_paid"],
    });
    expect(report.incomeEvents).toHaveLength(0);
    expect(report.totalOrdinaryIncome).toBe(0);
  });

  test("ignored income crypto is still tracked as $0-cost-basis acquisition for future disposal", () => {
    const txsWithSale = [
      tx({ timestamp: dt(2023, 1, 1), currency: "CRO", amount: 100, nativeUsd: 50, kind: "referral_card_cashback" }),
      tx({ timestamp: dt(2024, 1, 1), currency: "CRO", amount: -100, nativeUsd: 80, kind: "crypto_exchange" }),
    ];
    const report = calculateTaxes(txsWithSale, "FIFO", {
      ignoredIncomeKinds: ["referral_card_cashback"],
    });
    expect(report.incomeEvents).toHaveLength(0);
    // The 100 CRO was tracked at $0 cost basis, sold for $80 → gain = $80
    expect(report.taxEvents).toHaveLength(1);
    expect(report.taxEvents[0].gainLossUsd).toBeCloseTo(80);
  });

  test("ignoredIncomeKinds accepts a Set as well as an array", () => {
    const report = calculateTaxes(txs, "FIFO", {
      ignoredIncomeKinds: new Set(["referral_card_cashback"]),
    });
    expect(report.incomeEvents).toHaveLength(1);
  });
});

// ── card_rebate (Amazon Prime, Netflix, etc.) ─────────────────────────────────

describe("card_rebate income events", () => {
  const amazonPrimeTx = tx({
    timestamp: dt(2023, 3, 1),
    currency: "CRO",
    amount: 10,
    nativeUsd: 5,
    kind: "card_rebate",
    description: "Card Rebate: Amazon Prime",
  });

  const netflixTx = tx({
    timestamp: dt(2023, 4, 1),
    currency: "CRO",
    amount: 8,
    nativeUsd: 4,
    kind: "card_rebate",
    description: "Card Rebate: Netflix",
  });

  const cashbackTx = tx({
    timestamp: dt(2023, 5, 1),
    currency: "CRO",
    amount: 50,
    nativeUsd: 25,
    kind: "referral_card_cashback",
    description: "CRO Cashback",
  });

  test("card_rebate transactions are counted as ordinary income by default", () => {
    const report = calculateTaxes([amazonPrimeTx, netflixTx], "FIFO");
    expect(report.incomeEvents).toHaveLength(2);
    expect(report.totalOrdinaryIncome).toBeCloseTo(9);
  });

  test("card_rebate description is preserved in income event", () => {
    const report = calculateTaxes([amazonPrimeTx], "FIFO");
    expect(report.incomeEvents[0].description).toBe("Card Rebate: Amazon Prime");
  });

  test("ignoring card_rebate excludes Amazon Prime and Netflix rebates from income", () => {
    const report = calculateTaxes([amazonPrimeTx, netflixTx, cashbackTx], "FIFO", {
      ignoredIncomeKinds: ["card_rebate"],
    });
    expect(report.incomeEvents).toHaveLength(1);
    expect(report.incomeEvents[0].description).toBe("CRO Cashback");
    expect(report.totalOrdinaryIncome).toBeCloseTo(25);
  });

  test("ignoring both card_rebate and referral_card_cashback excludes all cashback income", () => {
    const report = calculateTaxes([amazonPrimeTx, netflixTx, cashbackTx], "FIFO", {
      ignoredIncomeKinds: ["card_rebate", "referral_card_cashback"],
    });
    expect(report.incomeEvents).toHaveLength(0);
    expect(report.totalOrdinaryIncome).toBe(0);
  });

  test("ignored card_rebate crypto is tracked as $0-cost-basis lot for future disposal", () => {
    const txsWithSale = [
      tx({ timestamp: dt(2023, 1, 1), currency: "CRO", amount: 10, nativeUsd: 5, kind: "card_rebate", description: "Card Rebate: Amazon Prime" }),
      tx({ timestamp: dt(2024, 1, 1), currency: "CRO", amount: -10, nativeUsd: 15, kind: "crypto_exchange" }),
    ];
    const report = calculateTaxes(txsWithSale, "FIFO", {
      ignoredIncomeKinds: ["card_rebate"],
    });
    expect(report.incomeEvents).toHaveLength(0);
    // $0 cost basis, sold for $15 → gain = $15
    expect(report.taxEvents).toHaveLength(1);
    expect(report.taxEvents[0].gainLossUsd).toBeCloseTo(15);
    expect(report.taxEvents[0].costBasisUsd).toBeCloseTo(0);
  });

  test("ignoring referral_card_cashback (CRO reward) also excludes card_rebate (Netflix/Spotify/Amazon)", () => {
    // When the user unchecks "CRO reward" in the UI, card_rebate subscription
    // rebates (Netflix, Spotify, Amazon Prime) must also be excluded because
    // both are CRO card reward benefits controlled by the same toggle.
    const all = [amazonPrimeTx, netflixTx, cashbackTx];
    const reportAll = calculateTaxes(all, "FIFO");
    expect(reportAll.incomeEvents).toHaveLength(3);
    expect(reportAll.totalOrdinaryIncome).toBeCloseTo(34);

    const reportNoCashback = calculateTaxes(all, "FIFO", {
      ignoredIncomeKinds: ["referral_card_cashback"],
    });
    // All three events (cashback + 2 rebates) should be excluded
    expect(reportNoCashback.incomeEvents).toHaveLength(0);
    expect(reportNoCashback.totalOrdinaryIncome).toBe(0);

    // Ignoring only card_rebate still leaves the CRO cashback event
    const reportNoRebate = calculateTaxes(all, "FIFO", {
      ignoredIncomeKinds: ["card_rebate"],
    });
    expect(reportNoRebate.incomeEvents).toHaveLength(1);
    expect(reportNoRebate.totalOrdinaryIncome).toBeCloseTo(25);
  });

  test("unchecking CRO reward excludes Netflix, Spotify, and Amazon Prime rebates", () => {
    // Regression test: verifies the exact user-facing scenario reported as a bug.
    // Unchecking the CRO reward option should exclude ALL subscription rebates
    // paid via card_rebate even when card_rebate is not listed explicitly.
    const netflixRebate = tx({
      timestamp: dt(2024, 1, 10),
      currency: "CRO",
      amount: 12,
      nativeUsd: 6,
      kind: "card_rebate",
      description: "Card Rebate: Netflix",
    });
    const spotifyRebate = tx({
      timestamp: dt(2024, 2, 10),
      currency: "CRO",
      amount: 10,
      nativeUsd: 5,
      kind: "card_rebate",
      description: "Card Rebate: Spotify",
    });
    const amazonRebate = tx({
      timestamp: dt(2024, 3, 10),
      currency: "CRO",
      amount: 15,
      nativeUsd: 7.5,
      kind: "card_rebate",
      description: "Card Rebate: Amazon Prime",
    });
    const croCashback = tx({
      timestamp: dt(2024, 4, 1),
      currency: "CRO",
      amount: 80,
      nativeUsd: 40,
      kind: "referral_card_cashback",
      description: "CRO Cashback",
    });

    // Without any filter: all four events are ordinary income
    const reportAll = calculateTaxes(
      [netflixRebate, spotifyRebate, amazonRebate, croCashback],
      "FIFO"
    );
    expect(reportAll.incomeEvents).toHaveLength(4);
    expect(reportAll.totalOrdinaryIncome).toBeCloseTo(6 + 5 + 7.5 + 40);

    // User unchecks "CRO reward" → only referral_card_cashback in ignoredIncomeKinds.
    // Netflix, Spotify, and Amazon Prime rebates must also disappear.
    const reportCroUnchecked = calculateTaxes(
      [netflixRebate, spotifyRebate, amazonRebate, croCashback],
      "FIFO",
      { ignoredIncomeKinds: ["referral_card_cashback"] }
    );
    expect(reportCroUnchecked.incomeEvents).toHaveLength(0);
    expect(reportCroUnchecked.totalOrdinaryIncome).toBe(0);
  });
});

// ── Additional tax calculation correctness tests ──────────────────────────────

describe("Short-term vs long-term holding period classification", () => {
  test("asset held exactly 365 days is short-term", () => {
    const buy = dt(2022, 1, 1);
    const sell = new Date(buy.getTime() + 365 * 24 * 60 * 60 * 1000);
    const txs = [
      tx({ timestamp: buy, currency: "ETH", amount: 1, nativeUsd: -2000, kind: "crypto_purchase" }),
      new CryptoTransaction({ timestamp: sell, description: "sell", currency: "ETH", amount: -1, toCurrency: null, toAmount: null, nativeCurrency: "USD", nativeAmount: 3000, nativeAmountUsd: 3000, transactionKind: "crypto_to_fiat_exchange" }),
    ];
    const report = calculateTaxes(txs, "FIFO");
    expect(report.taxEvents[0].isLongTerm).toBe(false);
    expect(report.totalShortTermGainLoss).toBeCloseTo(1000);
    expect(report.totalLongTermGainLoss).toBe(0);
  });

  test("asset held 366 days is long-term", () => {
    const buy = dt(2022, 1, 1);
    const sell = new Date(buy.getTime() + 366 * 24 * 60 * 60 * 1000);
    const txs = [
      tx({ timestamp: buy, currency: "ETH", amount: 1, nativeUsd: -2000, kind: "crypto_purchase" }),
      new CryptoTransaction({ timestamp: sell, description: "sell", currency: "ETH", amount: -1, toCurrency: null, toAmount: null, nativeCurrency: "USD", nativeAmount: 3000, nativeAmountUsd: 3000, transactionKind: "crypto_to_fiat_exchange" }),
    ];
    const report = calculateTaxes(txs, "FIFO");
    expect(report.taxEvents[0].isLongTerm).toBe(true);
    expect(report.totalLongTermGainLoss).toBeCloseTo(1000);
    expect(report.totalShortTermGainLoss).toBe(0);
  });
});

describe("Multiple income kinds combined", () => {
  const txs = [
    tx({ timestamp: dt(2023, 1, 1), currency: "CRO", amount: 100, nativeUsd: 50, kind: "referral_card_cashback", description: "CRO Cashback" }),
    tx({ timestamp: dt(2023, 2, 1), currency: "CRO", amount: 20, nativeUsd: 10, kind: "card_rebate", description: "Card Rebate: Amazon Prime" }),
    tx({ timestamp: dt(2023, 3, 1), currency: "CRO", amount: 15, nativeUsd: 7.5, kind: "card_rebate", description: "Card Rebate: Netflix" }),
    tx({ timestamp: dt(2023, 4, 1), currency: "ETH", amount: 0.5, nativeUsd: 900, kind: "crypto_earn_interest_paid" }),
    tx({ timestamp: dt(2023, 5, 1), currency: "BTC", amount: 0.01, nativeUsd: 300, kind: "referral_gift" }),
  ];

  test("all income kinds are reported when no filter applied", () => {
    const report = calculateTaxes(txs, "FIFO");
    expect(report.incomeEvents).toHaveLength(5);
    expect(report.totalOrdinaryIncome).toBeCloseTo(50 + 10 + 7.5 + 900 + 300);
  });

  test("ignoring cashback kinds leaves interest and referral income intact", () => {
    const report = calculateTaxes(txs, "FIFO", {
      ignoredIncomeKinds: ["referral_card_cashback", "card_rebate"],
    });
    expect(report.incomeEvents).toHaveLength(2);
    expect(report.totalOrdinaryIncome).toBeCloseTo(900 + 300);
  });

  test("totalGainLoss equals shortTerm + longTerm gain/loss", () => {
    const report = calculateTaxes(txs, "FIFO");
    expect(report.totalGainLoss).toBeCloseTo(
      report.totalShortTermGainLoss + report.totalLongTermGainLoss
    );
  });
});

describe("Capital gain/loss with staking income then sale", () => {
  test("staking income sets cost basis; subsequent sale produces correct gain", () => {
    const txs = [
      tx({ timestamp: dt(2022, 1, 1), currency: "ETH", amount: 2, nativeUsd: 4000, kind: "crypto_earn_interest_paid" }),
      new CryptoTransaction({ timestamp: dt(2023, 6, 1), description: "sell staking rewards", currency: "ETH", amount: -2, toCurrency: null, toAmount: null, nativeCurrency: "USD", nativeAmount: 6000, nativeAmountUsd: 6000, transactionKind: "crypto_to_fiat_exchange" }),
    ];
    const report = calculateTaxes(txs, "FIFO");
    // Income: 2 ETH @ $2000/ETH = $4000
    expect(report.totalOrdinaryIncome).toBeCloseTo(4000);
    // Sale: 2 ETH @ $3000 proceeds vs $2000 cost basis → $2000 long-term gain (held > 365 days)
    expect(report.taxEvents).toHaveLength(1);
    expect(report.taxEvents[0].gainLossUsd).toBeCloseTo(2000);
    expect(report.taxEvents[0].isLongTerm).toBe(true);
  });
});

describe("FIFO vs LIFO vs HIFO lot ordering", () => {
  // Buy 1 BTC cheap, then 1 BTC expensive, then sell 1 BTC
  const txs = [
    tx({ timestamp: dt(2021, 1, 1), currency: "BTC", amount: 1, nativeUsd: -10000, kind: "crypto_purchase" }),
    tx({ timestamp: dt(2022, 1, 1), currency: "BTC", amount: 1, nativeUsd: -40000, kind: "crypto_purchase" }),
    new CryptoTransaction({ timestamp: dt(2022, 6, 1), description: "sell", currency: "BTC", amount: -1, toCurrency: null, toAmount: null, nativeCurrency: "USD", nativeAmount: 50000, nativeAmountUsd: 50000, transactionKind: "crypto_to_fiat_exchange" }),
  ];

  test("FIFO uses oldest lot first → gain = $40,000", () => {
    const report = calculateTaxes(txs, "FIFO");
    expect(report.taxEvents[0].costBasisUsd).toBeCloseTo(10000);
    expect(report.taxEvents[0].gainLossUsd).toBeCloseTo(40000);
  });

  test("LIFO uses newest lot first → gain = $10,000", () => {
    const report = calculateTaxes(txs, "LIFO");
    expect(report.taxEvents[0].costBasisUsd).toBeCloseTo(40000);
    expect(report.taxEvents[0].gainLossUsd).toBeCloseTo(10000);
  });

  test("HIFO uses highest-cost lot first → gain = $10,000", () => {
    const report = calculateTaxes(txs, "HIFO");
    expect(report.taxEvents[0].costBasisUsd).toBeCloseTo(40000);
    expect(report.taxEvents[0].gainLossUsd).toBeCloseTo(10000);
  });
});

describe("crypto-to-crypto swap tax treatment", () => {
  test("swapping BTC for ETH triggers a capital-gain event and creates ETH acquisition lot", () => {
    const txs = [
      tx({ timestamp: dt(2021, 1, 1), currency: "BTC", amount: 1, nativeUsd: -30000, kind: "crypto_purchase" }),
      new CryptoTransaction({
        timestamp: dt(2022, 6, 1),
        description: "BTC→ETH swap",
        currency: "BTC",
        amount: -1,
        toCurrency: "ETH",
        toAmount: 20,
        nativeCurrency: "USD",
        nativeAmount: -50000,
        nativeAmountUsd: 50000,
        transactionKind: "crypto_exchange",
      }),
      new CryptoTransaction({ timestamp: dt(2023, 1, 1), description: "sell ETH", currency: "ETH", amount: -20, toCurrency: null, toAmount: null, nativeCurrency: "USD", nativeAmount: 60000, nativeAmountUsd: 60000, transactionKind: "crypto_to_fiat_exchange" }),
    ];
    const report = calculateTaxes(txs, "FIFO");
    // BTC disposal: $50k proceeds vs $30k cost → $20k gain (long-term, held > 365 days)
    expect(report.taxEvents[0].gainLossUsd).toBeCloseTo(20000);
    expect(report.taxEvents[0].isLongTerm).toBe(true);
    // ETH disposal: $60k proceeds vs $50k cost (FMV from BTC swap) → $10k gain
    expect(report.taxEvents[1].gainLossUsd).toBeCloseTo(10000);
    expect(report.totalGainLoss).toBeCloseTo(30000);
  });
});

describe("filterReportByYear", () => {
  const txs = [
    tx({ timestamp: dt(2021, 6, 1), currency: "BTC", amount: 1, nativeUsd: -30000, kind: "crypto_purchase" }),
    new CryptoTransaction({ timestamp: dt(2022, 3, 1), description: "sell 2022", currency: "BTC", amount: -0.5, toCurrency: null, toAmount: null, nativeCurrency: "USD", nativeAmount: 25000, nativeAmountUsd: 25000, transactionKind: "crypto_to_fiat_exchange" }),
    new CryptoTransaction({ timestamp: dt(2023, 3, 1), description: "sell 2023", currency: "BTC", amount: -0.5, toCurrency: null, toAmount: null, nativeCurrency: "USD", nativeAmount: 15000, nativeAmountUsd: 15000, transactionKind: "crypto_to_fiat_exchange" }),
    tx({ timestamp: dt(2022, 1, 1), currency: "ETH", amount: 1, nativeUsd: 1000, kind: "crypto_earn_interest_paid" }),
    tx({ timestamp: dt(2023, 1, 1), currency: "ETH", amount: 0.5, nativeUsd: 800, kind: "crypto_earn_interest_paid" }),
  ];

  test("filtering by 2022 returns only 2022 disposal and income events", () => {
    const full = calculateTaxes(txs, "FIFO");
    const report2022 = filterReportByYear(full, 2022);
    expect(report2022.taxEvents).toHaveLength(1);
    expect(report2022.taxEvents[0].dateSold.getUTCFullYear()).toBe(2022);
    expect(report2022.incomeEvents).toHaveLength(1);
    expect(report2022.incomeEvents[0].dateReceived.getUTCFullYear()).toBe(2022);
    expect(report2022.totalOrdinaryIncome).toBeCloseTo(1000);
  });

  test("filtering by 2023 returns only 2023 disposal and income events", () => {
    const full = calculateTaxes(txs, "FIFO");
    const report2023 = filterReportByYear(full, 2023);
    expect(report2023.taxEvents).toHaveLength(1);
    expect(report2023.taxEvents[0].dateSold.getUTCFullYear()).toBe(2023);
    expect(report2023.incomeEvents).toHaveLength(1);
    expect(report2023.totalOrdinaryIncome).toBeCloseTo(800);
  });

  test("null year returns unfiltered report", () => {
    const full = calculateTaxes(txs, "FIFO");
    const report = filterReportByYear(full, null);
    expect(report.taxEvents).toHaveLength(full.taxEvents.length);
    expect(report.incomeEvents).toHaveLength(full.incomeEvents.length);
  });
});
