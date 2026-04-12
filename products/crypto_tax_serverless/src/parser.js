/**
 * Parser for the Crypto.com App CSV export format.
 *
 * Crypto.com App CSV columns:
 *   Timestamp (UTC)          – date/time of the transaction (e.g. "2021-01-15 10:30:00")
 *   Transaction Description  – human-readable label
 *   Currency                 – asset symbol (e.g. BTC, ETH)
 *   Amount                   – quantity of Currency (can be negative for sends)
 *   To Currency              – target asset for swaps/exchanges
 *   To Amount                – quantity of To Currency
 *   Native Currency          – fiat currency code (e.g. USD)
 *   Native Amount            – fiat value (negative for purchases)
 *   Native Amount (in USD)   – value expressed in USD
 *   Transaction Kind         – machine-readable event type
 *
 * Taxable event categories:
 *   SALE_KINDS      – disposals that trigger a capital-gain/loss calculation
 *   INCOME_KINDS    – receipts treated as ordinary income at fair-market value
 *   IGNORED_KINDS   – non-taxable events (transfers, fiat movements, etc.)
 */

// Disposals: selling, swapping, or spending crypto → capital gain/loss
const SALE_KINDS = new Set([
  "crypto_exchange",            // swap one crypto for another inside the app
  "crypto_wallet_swap_debited", // debit leg of an in-wallet swap
  "crypto_to_fiat_exchange",    // sell crypto for fiat
  "card_top_up",                // top up Crypto.com Visa card with crypto
  "dust_conversion_debited",    // dust → CRO conversion (debit leg)
  "crypto_purchase",            // when Amount is negative (spending crypto to buy fiat)
]);

// Income receipts: treated as ordinary income at fair-market value
const INCOME_KINDS = new Set([
  "crypto_earn_interest_paid",           // Earn / Savings interest
  "referral_gift",                       // referral bonuses
  "referral_card_cashback",              // card cashback paid in CRO
  "card_rebate",                         // subscription service rebates (e.g. Amazon Prime, Netflix)
  "reimbursement",                       // fee reimbursements
  "reimbursement_reverted",              // reversal – treated as negative income
  "crypto_payment",                      // payment received in crypto
  "supercharger_reward_to_app_credited", // Supercharger rewards
  "crypto_earn_extra_interest_paid",     // bonus Earn interest
  "card_cashback_reverted",              // cashback reversal (negative income)
  "dust_conversion_credited",            // CRO received in dust conversion
  "crypto_wallet_swap_credited",         // credit leg of in-wallet swap (income)
  "mco_stake_reward",                    // MCO staking reward
  "crypto_viban_exchange",               // VIBAN purchase credited
  "viban_purchase",                      // purchase via virtual IBAN
]);

// Non-taxable: deposits, withdrawals, fiat moves – no tax event
const IGNORED_KINDS = new Set([
  "crypto_deposit",
  "crypto_withdrawal",
  "fiat_deposit",
  "fiat_withdrawal",
  "crypto_transfer",
  "exchange_to_crypto_transfer",
  "crypto_to_exchange_transfer",
  "supercharger_deposit",
  "supercharger_withdrawal",
  "lockup_lock",
  "lockup_unlock",
  "lockup_upgrade",
  "dynamic_coin_swap_bonus_exchange_deposit",
]);

/**
 * Represents a single Crypto.com transaction.
 */
class CryptoTransaction {
  constructor({
    timestamp,
    description,
    currency,
    amount,
    toCurrency,
    toAmount,
    nativeCurrency,
    nativeAmount,
    nativeAmountUsd,
    transactionKind,
  }) {
    this.timestamp = timestamp;           // Date object
    this.description = description;       // string
    this.currency = currency;             // string e.g. "BTC"
    this.amount = amount;                 // number (positive = received, negative = sent)
    this.toCurrency = toCurrency;         // string|null
    this.toAmount = toAmount;             // number|null
    this.nativeCurrency = nativeCurrency; // string e.g. "USD"
    this.nativeAmount = nativeAmount;     // number
    this.nativeAmountUsd = nativeAmountUsd; // number
    this.transactionKind = transactionKind; // string
  }

  /** True when the transaction is a disposal (capital event). */
  get isSale() {
    if (SALE_KINDS.has(this.transactionKind)) {
      if (this.transactionKind === "crypto_purchase") {
        return this.amount < 0;
      }
      return true;
    }
    return false;
  }

  /** True when the transaction is ordinary income. */
  get isIncome() {
    return INCOME_KINDS.has(this.transactionKind);
  }

  /**
   * True when the transaction adds crypto to the user's holdings
   * (used to build the cost-basis lot inventory).
   */
  get isAcquisition() {
    const acquisitionKinds = new Set([
      "crypto_purchase",
      "crypto_exchange",
      "crypto_wallet_swap_credited",
      "viban_purchase",
      "crypto_viban_exchange",
    ]);
    return (
      this.amount > 0 &&
      (acquisitionKinds.has(this.transactionKind) || this.isIncome)
    );
  }
}

const TIMESTAMP_FORMATS = [
  // "2021-01-15 10:30:00"
  /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
  // "01/15/2021 10:30"
  /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/,
  // "2021-01-15T10:30:00"
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/,
];

/**
 * Parse a timestamp string to a Date object.
 * @param {string} raw
 * @returns {Date}
 */
function parseTimestamp(raw) {
  raw = raw.trim();

  // Try ISO-style "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS"
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  }

  // Try "MM/DD/YYYY HH:MM"
  m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  if (m) {
    return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], 0));
  }

  // Fallback: let the browser try
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;

  throw new Error(`Unrecognized timestamp format: ${raw}`);
}

/**
 * Parse a numeric string (handles commas, empty strings).
 * @param {string} raw
 * @returns {number|null}
 */
function parseFloat_(raw) {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/,/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * Parse a CSV string exported from the Crypto.com App into CryptoTransaction objects.
 *
 * @param {string} csvContent - Raw CSV text (UTF-8, with or without BOM)
 * @returns {CryptoTransaction[]}
 */
function parseCsv(csvContent) {
  // Strip BOM if present
  if (csvContent.charCodeAt(0) === 0xfeff) {
    csvContent = csvContent.slice(1);
  }

  const lines = csvContent.split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());

  const transactions = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx] : "";
    });

    try {
      const timestamp = parseTimestamp(row["Timestamp (UTC)"] || "");
      const currency = (row["Currency"] || "").trim();
      const amount = parseFloat_(row["Amount"]) || 0;
      const toCurrency = (row["To Currency"] || "").trim() || null;
      const toAmount = parseFloat_(row["To Amount"]);
      const nativeCurrency = (row["Native Currency"] || "USD").trim();
      const nativeAmount = parseFloat_(row["Native Amount"]) || 0;
      let nativeUsd = parseFloat_(row["Native Amount (in USD)"]);
      if (nativeUsd === null) nativeUsd = nativeAmount;
      const kind = (row["Transaction Kind"] || "").trim();

      transactions.push(
        new CryptoTransaction({
          timestamp,
          description: (row["Transaction Description"] || "").trim(),
          currency,
          amount,
          toCurrency,
          toAmount,
          nativeCurrency,
          nativeAmount,
          nativeAmountUsd: nativeUsd,
          transactionKind: kind,
        })
      );
    } catch (e) {
      console.warn(`Skipping row ${i + 1}: ${e.message}`);
    }
  }

  return transactions;
}

/**
 * Split a single CSV line respecting quoted fields.
 * @param {string} line
 * @returns {string[]}
 */
function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// Export for Node.js (tests) and browser (global)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CryptoTransaction,
    parseCsv,
    parseTimestamp,
    parseFloat_,
    splitCsvLine,
    SALE_KINDS,
    INCOME_KINDS,
    IGNORED_KINDS,
  };
}
