"use strict";

const { CryptoTransaction } = require("../src/parser");
const {
  calculateTaxes,
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
