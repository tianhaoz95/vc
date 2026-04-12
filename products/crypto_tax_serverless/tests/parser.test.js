"use strict";

const {
  parseCsv,
  parseTimestamp,
  parseFloat_,
  splitCsvLine,
  CryptoTransaction,
  SALE_KINDS,
  INCOME_KINDS,
  IGNORED_KINDS,
} = require("../src/parser");

// ── splitCsvLine ──────────────────────────────────────────────────────────────

describe("splitCsvLine", () => {
  test("splits simple fields", () => {
    expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  test("handles quoted fields with commas", () => {
    expect(splitCsvLine('"hello, world",foo,bar')).toEqual([
      "hello, world",
      "foo",
      "bar",
    ]);
  });

  test("handles escaped quotes inside quoted field", () => {
    expect(splitCsvLine('"say ""hi""",end')).toEqual(['say "hi"', "end"]);
  });

  test("handles empty fields", () => {
    expect(splitCsvLine("a,,c")).toEqual(["a", "", "c"]);
  });

  test("handles trailing comma", () => {
    const result = splitCsvLine("a,b,");
    expect(result).toEqual(["a", "b", ""]);
  });
});

// ── parseTimestamp ────────────────────────────────────────────────────────────

describe("parseTimestamp", () => {
  test("parses YYYY-MM-DD HH:MM:SS format", () => {
    const d = parseTimestamp("2021-01-15 10:30:00");
    expect(d.getUTCFullYear()).toBe(2021);
    expect(d.getUTCMonth()).toBe(0); // January = 0
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCHours()).toBe(10);
    expect(d.getUTCMinutes()).toBe(30);
    expect(d.getUTCSeconds()).toBe(0);
  });

  test("parses ISO format YYYY-MM-DDTHH:MM:SS", () => {
    const d = parseTimestamp("2022-06-01T12:00:00");
    expect(d.getUTCFullYear()).toBe(2022);
    expect(d.getUTCMonth()).toBe(5); // June = 5
    expect(d.getUTCDate()).toBe(1);
  });

  test("parses MM/DD/YYYY HH:MM format", () => {
    const d = parseTimestamp("01/15/2021 10:30");
    expect(d.getUTCFullYear()).toBe(2021);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(15);
  });

  test("throws for unrecognized format", () => {
    expect(() => parseTimestamp("not-a-date")).toThrow();
  });

  test("handles leading/trailing whitespace", () => {
    const d = parseTimestamp("  2021-01-01 00:00:00  ");
    expect(d.getUTCFullYear()).toBe(2021);
  });
});

// ── parseFloat_ ───────────────────────────────────────────────────────────────

describe("parseFloat_", () => {
  test("parses simple number", () => {
    expect(parseFloat_("1234.56")).toBeCloseTo(1234.56);
  });

  test("parses number with commas", () => {
    expect(parseFloat_("1,234.56")).toBeCloseTo(1234.56);
  });

  test("returns null for empty string", () => {
    expect(parseFloat_("")).toBeNull();
  });

  test("returns null for dash", () => {
    expect(parseFloat_("-")).toBeNull();
  });

  test("returns null for null input", () => {
    expect(parseFloat_(null)).toBeNull();
  });

  test("parses negative number", () => {
    expect(parseFloat_("-30000")).toBeCloseTo(-30000);
  });
});

// ── parseCsv ─────────────────────────────────────────────────────────────────

const SAMPLE_CSV = `Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind
2021-01-01 00:00:00,Buy BTC,BTC,1.0,,,USD,-30000,-30000,crypto_purchase
2022-06-01 00:00:00,Sell BTC,BTC,-1.0,,,USD,50000,50000,crypto_purchase
2021-07-01 00:00:00,Earn Interest,CRO,500.0,,,USD,50,50,crypto_earn_interest_paid
2021-03-01 00:00:00,Swap ETH to BTC,ETH,-1.0,BTC,0.05,USD,4000,4000,crypto_exchange
`;

describe("parseCsv", () => {
  test("parses the correct number of transactions", () => {
    const txs = parseCsv(SAMPLE_CSV);
    expect(txs).toHaveLength(4);
  });

  test("parses timestamp correctly", () => {
    const txs = parseCsv(SAMPLE_CSV);
    expect(txs[0].timestamp.getUTCFullYear()).toBe(2021);
    expect(txs[0].timestamp.getUTCMonth()).toBe(0);
    expect(txs[0].timestamp.getUTCDate()).toBe(1);
  });

  test("parses currency and amount", () => {
    const txs = parseCsv(SAMPLE_CSV);
    expect(txs[0].currency).toBe("BTC");
    expect(txs[0].amount).toBeCloseTo(1.0);
  });

  test("parses negative amount for sale", () => {
    const txs = parseCsv(SAMPLE_CSV);
    const sell = txs.find(t => t.amount < 0 && t.currency === "BTC");
    expect(sell).toBeDefined();
    expect(sell.amount).toBeCloseTo(-1.0);
  });

  test("parses To Currency and To Amount for swap", () => {
    const txs = parseCsv(SAMPLE_CSV);
    const swap = txs.find(t => t.toCurrency === "BTC");
    expect(swap).toBeDefined();
    expect(swap.toAmount).toBeCloseTo(0.05);
  });

  test("parses native amount USD", () => {
    const txs = parseCsv(SAMPLE_CSV);
    expect(txs[0].nativeAmountUsd).toBeCloseTo(-30000);
  });

  test("parses transaction kind", () => {
    const txs = parseCsv(SAMPLE_CSV);
    expect(txs[0].transactionKind).toBe("crypto_purchase");
  });

  test("handles BOM prefix", () => {
    const withBom = "\uFEFF" + SAMPLE_CSV;
    const txs = parseCsv(withBom);
    expect(txs).toHaveLength(4);
  });

  test("returns empty array for header-only CSV", () => {
    const txs = parseCsv(
      "Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind\n"
    );
    expect(txs).toHaveLength(0);
  });

  test("skips blank lines", () => {
    const csv = SAMPLE_CSV + "\n\n\n";
    const txs = parseCsv(csv);
    expect(txs).toHaveLength(4);
  });
});

// ── CryptoTransaction.isSale ──────────────────────────────────────────────────

describe("CryptoTransaction.isSale", () => {
  function makeTx(kind, amount) {
    return new CryptoTransaction({
      timestamp: new Date(),
      description: "",
      currency: "BTC",
      amount,
      toCurrency: null,
      toAmount: null,
      nativeCurrency: "USD",
      nativeAmount: 0,
      nativeAmountUsd: 0,
      transactionKind: kind,
    });
  }

  test("crypto_purchase with negative amount is a sale", () => {
    expect(makeTx("crypto_purchase", -1).isSale).toBe(true);
  });

  test("crypto_purchase with positive amount is NOT a sale", () => {
    expect(makeTx("crypto_purchase", 1).isSale).toBe(false);
  });

  test("crypto_exchange is a sale", () => {
    expect(makeTx("crypto_exchange", -1).isSale).toBe(true);
  });

  test("crypto_to_fiat_exchange is a sale", () => {
    expect(makeTx("crypto_to_fiat_exchange", -1).isSale).toBe(true);
  });

  test("card_top_up is a sale", () => {
    expect(makeTx("card_top_up", -50).isSale).toBe(true);
  });

  test("dynamic_coin_swap_debited is a sale", () => {
    expect(makeTx("dynamic_coin_swap_debited", -1).isSale).toBe(true);
  });

  test("interest_swap_debited is a sale", () => {
    expect(makeTx("interest_swap_debited", -1).isSale).toBe(true);
  });

  test("crypto_deposit is NOT a sale", () => {
    expect(makeTx("crypto_deposit", 1).isSale).toBe(false);
  });
});

// ── CryptoTransaction.isIncome ────────────────────────────────────────────────

describe("CryptoTransaction.isIncome", () => {
  function makeTx(kind) {
    return new CryptoTransaction({
      timestamp: new Date(),
      description: "",
      currency: "CRO",
      amount: 100,
      toCurrency: null,
      toAmount: null,
      nativeCurrency: "USD",
      nativeAmount: 50,
      nativeAmountUsd: 50,
      transactionKind: kind,
    });
  }

  test("crypto_earn_interest_paid is income", () => {
    expect(makeTx("crypto_earn_interest_paid").isIncome).toBe(true);
  });

  test("referral_gift is income", () => {
    expect(makeTx("referral_gift").isIncome).toBe(true);
  });

  test("mco_stake_reward is income", () => {
    expect(makeTx("mco_stake_reward").isIncome).toBe(true);
  });

  test("airdrop_to_exchange_transfer is income", () => {
    expect(makeTx("airdrop_to_exchange_transfer").isIncome).toBe(true);
  });

  test("trading_incentive_paid is income", () => {
    expect(makeTx("trading_incentive_paid").isIncome).toBe(true);
  });

  test("gift_card_reward_to_app_credited is income", () => {
    expect(makeTx("gift_card_reward_to_app_credited").isIncome).toBe(true);
  });

  test("pay_checkout_reward is income", () => {
    expect(makeTx("pay_checkout_reward").isIncome).toBe(true);
  });

  test("dynamic_coin_swap_credited is income", () => {
    expect(makeTx("dynamic_coin_swap_credited").isIncome).toBe(true);
  });

  test("interest_swap_credited is income", () => {
    expect(makeTx("interest_swap_credited").isIncome).toBe(true);
  });

  test("admin_wallet_credited is income", () => {
    expect(makeTx("admin_wallet_credited").isIncome).toBe(true);
  });

  test("crypto_purchase is NOT income", () => {
    expect(makeTx("crypto_purchase").isIncome).toBe(false);
  });

  test("crypto_deposit is NOT income", () => {
    expect(makeTx("crypto_deposit").isIncome).toBe(false);
  });

  test("crypto_earn_program_created is NOT income", () => {
    expect(makeTx("crypto_earn_program_created").isIncome).toBe(false);
  });

  test("crypto_earn_program_withdrawn is NOT income", () => {
    expect(makeTx("crypto_earn_program_withdrawn").isIncome).toBe(false);
  });
});

// ── Transaction kind sets ─────────────────────────────────────────────────────

describe("Transaction kind sets", () => {
  test("SALE_KINDS, INCOME_KINDS, IGNORED_KINDS are disjoint", () => {
    const allKinds = [...SALE_KINDS, ...INCOME_KINDS, ...IGNORED_KINDS];
    const unique = new Set(allKinds);
    expect(unique.size).toBe(allKinds.length);
  });
});
