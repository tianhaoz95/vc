/**
 * Tax calculation engine.
 *
 * Supported cost-basis methods
 * -----------------------------
 * FIFO  – First In, First Out  (IRS default for crypto; Rev. Proc. 2024-28)
 * LIFO  – Last In, First Out   (allowed with specific identification)
 * HIFO  – Highest In, First Out (minimises gains; allowed with specific ID)
 *
 * Tax holding period
 * ------------------
 * Short-term: asset held ≤ 365 days  → ordinary income tax rates
 * Long-term : asset held >  365 days  → preferential capital-gains rates
 *             (0%, 15%, or 20% depending on income bracket)
 *
 * Taxable events
 * --------------
 * 1. Selling crypto for fiat (USD)
 * 2. Swapping/exchanging one crypto for another
 * 3. Spending crypto on goods/services (card top-up, etc.)
 * 4. Receiving crypto as income (staking, interest, referral, cashback)
 *
 * Non-taxable events
 * ------------------
 * • Buying crypto with fiat
 * • Transferring crypto between your own wallets
 * • Depositing/withdrawing fiat
 *
 * Income treatment
 * ----------------
 * Crypto received as income is reported at its fair-market value (USD) on the
 * date of receipt as ordinary income. The same USD value also becomes the
 * cost basis for any future disposal of those coins.
 *
 * References
 * ----------
 * IRS Notice 2014-21, Rev. Rul. 2019-24, Rev. Proc. 2024-28
 */

const LONG_TERM_DAYS = 365; // IRS rule: > 365 days = long-term

const VALID_METHODS = ["FIFO", "LIFO", "HIFO"];

const METHOD_DESCRIPTIONS = {
  FIFO: {
    name: "First In, First Out (FIFO)",
    description:
      "The IRS default method (Rev. Proc. 2024-28). The oldest acquired lots " +
      "are disposed of first. Generally produces more long-term gains over time " +
      "as you hold assets longer before selling.",
    pros: ["IRS default — no special election required", "Favors long-term rates over time"],
    cons: ["May produce larger gains when older low-cost lots are sold first"],
  },
  LIFO: {
    name: "Last In, First Out (LIFO)",
    description:
      "Requires specific identification. The most recently acquired lots are " +
      "disposed of first. May produce more short-term gains but can reduce " +
      "gains when recent purchases had higher cost basis.",
    pros: ["Can reduce gains in falling markets", "Useful for tax-loss harvesting"],
    cons: [
      "Requires specific identification election",
      "Tends to produce more short-term gains",
    ],
  },
  HIFO: {
    name: "Highest In, First Out (HIFO)",
    description:
      "Requires specific identification. The lots with the highest cost basis " +
      "are disposed of first regardless of acquisition date. This strategy " +
      "minimizes taxable gains (or maximizes deductible losses) in any market.",
    pros: [
      "Minimizes taxable gains / maximizes losses",
      "Best strategy for minimizing current-year tax liability",
    ],
    cons: [
      "Requires specific identification election",
      "More complex record-keeping",
    ],
  },
};

const TAX_RULES = [
  {
    title: "Taxable Events",
    rules: [
      "Selling cryptocurrency for fiat (USD) triggers a capital gain or loss.",
      "Swapping one cryptocurrency for another (crypto-to-crypto exchange) is treated as a taxable disposal at fair-market value.",
      "Spending cryptocurrency on goods or services (e.g., Crypto.com Visa card top-up) is a taxable disposal.",
      "Receiving cryptocurrency as income (staking rewards, interest, referral bonuses, cashback) is taxable as ordinary income at the fair-market value on the date of receipt.",
    ],
  },
  {
    title: "Non-Taxable Events",
    rules: [
      "Buying cryptocurrency with fiat currency is NOT a taxable event.",
      "Transferring cryptocurrency between your own wallets is NOT taxable.",
      "Depositing or withdrawing fiat currency is NOT taxable.",
    ],
  },
  {
    title: "Holding Period Rules",
    rules: [
      "Short-term: Asset held ≤ 365 days — taxed at ordinary income rates (same as your income tax bracket).",
      "Long-term: Asset held > 365 days — taxed at preferential capital gains rates (0%, 15%, or 20% depending on income).",
    ],
  },
  {
    title: "Cost Basis",
    rules: [
      "Cost basis is the original USD value paid to acquire the cryptocurrency.",
      "For income receipts (staking, etc.), the cost basis equals the fair-market value on the date of receipt.",
      "For crypto-to-crypto swaps, the cost basis of the received asset equals the fair-market value of the disposed asset.",
    ],
  },
  {
    title: "Legal References",
    rules: [
      "IRS Notice 2014-21: Cryptocurrency is treated as property for federal tax purposes.",
      "Rev. Rul. 2019-24: Hard forks and airdrops are taxable as ordinary income.",
      "Rev. Proc. 2024-28: FIFO is the default method; specific identification (LIFO/HIFO) requires an election.",
    ],
  },
];

/**
 * Represents a single acquisition lot.
 */
class Lot {
  constructor({ currency, acquired, quantity, costBasisUsd }) {
    this.currency = currency;
    this.acquired = acquired;       // Date
    this.quantity = quantity;       // number
    this.costBasisUsd = costBasisUsd; // total USD cost for the remaining quantity
  }

  get unitCost() {
    if (this.quantity === 0) return 0;
    return this.costBasisUsd / this.quantity;
  }
}

/**
 * Represents a single disposed lot matched against an acquisition lot.
 */
class TaxEvent {
  constructor({
    currency,
    description,
    dateAcquired,
    dateSold,
    quantity,
    proceedsUsd,
    costBasisUsd,
    gainLossUsd,
    isLongTerm,
    eventType,
  }) {
    this.currency = currency;
    this.description = description;
    this.dateAcquired = dateAcquired; // Date
    this.dateSold = dateSold;         // Date
    this.quantity = quantity;
    this.proceedsUsd = proceedsUsd;
    this.costBasisUsd = costBasisUsd;
    this.gainLossUsd = gainLossUsd;
    this.isLongTerm = isLongTerm;
    this.eventType = eventType; // "sale", "exchange", "income"
  }
}

/**
 * Represents crypto received as ordinary income.
 */
class IncomeEvent {
  constructor({ currency, description, dateReceived, quantity, fairMarketValueUsd }) {
    this.currency = currency;
    this.description = description;
    this.dateReceived = dateReceived; // Date
    this.quantity = quantity;
    this.fairMarketValueUsd = fairMarketValueUsd;
  }
}

/**
 * Aggregated tax report.
 */
class TaxReport {
  constructor() {
    this.taxEvents = [];    // TaxEvent[]
    this.incomeEvents = []; // IncomeEvent[]
  }

  get totalShortTermGainLoss() {
    return this.taxEvents
      .filter((e) => !e.isLongTerm)
      .reduce((sum, e) => sum + e.gainLossUsd, 0);
  }

  get totalLongTermGainLoss() {
    return this.taxEvents
      .filter((e) => e.isLongTerm)
      .reduce((sum, e) => sum + e.gainLossUsd, 0);
  }

  get totalOrdinaryIncome() {
    return this.incomeEvents.reduce((sum, e) => sum + e.fairMarketValueUsd, 0);
  }

  get totalGainLoss() {
    return this.totalShortTermGainLoss + this.totalLongTermGainLoss;
  }
}

/**
 * Returns the number of days between two Date objects.
 */
function daysDiff(acquired, sold) {
  return Math.floor((sold.getTime() - acquired.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Returns true if the asset was held for more than 365 days.
 */
function isLongTerm(acquired, sold) {
  return daysDiff(acquired, sold) > LONG_TERM_DAYS;
}

/**
 * Manages a pool of acquisition lots for a single currency.
 */
class LotPool {
  constructor(method) {
    this.method = method.toUpperCase();
    this._lots = []; // Lot[]
  }

  add(lot) {
    this._lots.push(lot);
  }

  _orderedLots() {
    const active = this._lots.filter((l) => l.quantity > 0);
    if (this.method === "FIFO") {
      return active.slice().sort((a, b) => a.acquired - b.acquired);
    }
    if (this.method === "LIFO") {
      return active.slice().sort((a, b) => b.acquired - a.acquired);
    }
    if (this.method === "HIFO") {
      return active.slice().sort((a, b) => b.unitCost - a.unitCost);
    }
    throw new Error(`Unknown method: ${this.method}`);
  }

  /**
   * Consume `quantity` from the pool and return matched TaxEvents plus any
   * remaining unmatched quantity.
   *
   * @param {object} params
   * @returns {{ taxEvents: TaxEvent[], unmatched: number }}
   */
  consume({ quantity, saleDate, proceedsUsd, description, eventType }) {
    let remaining = quantity;
    const taxEvents = [];
    const ordered = this._orderedLots();

    for (const lot of ordered) {
      if (remaining <= 0) break;

      const consumed = Math.min(lot.quantity, remaining);
      const unitProceeds = quantity > 0 ? proceedsUsd / quantity : 0;
      const lotProceeds = unitProceeds * consumed;
      const lotCost = lot.unitCost * consumed;

      taxEvents.push(
        new TaxEvent({
          currency: lot.currency,
          description,
          dateAcquired: lot.acquired,
          dateSold: saleDate,
          quantity: consumed,
          proceedsUsd: round8(lotProceeds),
          costBasisUsd: round8(lotCost),
          gainLossUsd: round8(lotProceeds - lotCost),
          isLongTerm: isLongTerm(lot.acquired, saleDate),
          eventType,
        })
      );

      lot.quantity -= consumed;
      lot.costBasisUsd -= lotCost;
      remaining -= consumed;
    }

    return { taxEvents, unmatched: remaining };
  }
}

function round8(n) {
  return Math.round(n * 1e8) / 1e8;
}

/**
 * Process a list of CryptoTransactions and produce a TaxReport.
 *
 * @param {import('./parser').CryptoTransaction[]} transactions
 * @param {string} method - "FIFO", "LIFO", or "HIFO"
 * @returns {TaxReport}
 */
function calculateTaxes(transactions, method = "FIFO") {
  method = method.toUpperCase();
  if (!VALID_METHODS.includes(method)) {
    throw new Error(`method must be one of ${VALID_METHODS.join(", ")}, got "${method}"`);
  }

  const report = new TaxReport();

  // One lot pool per currency
  const pools = {};
  const getPool = (currency) => {
    if (!pools[currency]) pools[currency] = new LotPool(method);
    return pools[currency];
  };

  // Sort chronologically
  const ordered = transactions.slice().sort((a, b) => a.timestamp - b.timestamp);

  for (const tx of ordered) {
    const currency = tx.currency;
    const amount = tx.amount;
    const usd = Math.abs(tx.nativeAmountUsd);
    const ts = tx.timestamp;
    const desc = tx.description || tx.transactionKind;

    // ── Income events ──────────────────────────────────────────────────────
    if (tx.isIncome) {
      const incomeUsd = usd > 0 ? usd : 0;
      report.incomeEvents.push(
        new IncomeEvent({
          currency,
          description: desc,
          dateReceived: ts,
          quantity: Math.abs(amount),
          fairMarketValueUsd: round8(incomeUsd),
        })
      );
      // Income receipts also become acquisition lots (FMV = cost basis)
      if (Math.abs(amount) > 0 && incomeUsd > 0) {
        getPool(currency).add(
          new Lot({
            currency,
            acquired: ts,
            quantity: Math.abs(amount),
            costBasisUsd: incomeUsd,
          })
        );
      }
      continue;
    }

    // ── Acquisitions (buying crypto for fiat) ──────────────────────────────
    if (tx.isAcquisition) {
      const cost = usd;
      if (amount > 0 && cost >= 0) {
        getPool(currency).add(
          new Lot({
            currency,
            acquired: ts,
            quantity: amount,
            costBasisUsd: cost,
          })
        );
      }
      continue;
    }

    // ── Disposals (sales / swaps / spending) ──────────────────────────────
    if (tx.isSale) {
      const disposedQty = Math.abs(amount);
      const proceeds = usd;

      const { taxEvents } = getPool(currency).consume({
        quantity: disposedQty,
        saleDate: ts,
        proceedsUsd: proceeds,
        description: desc,
        eventType: tx.toCurrency ? "exchange" : "sale",
      });
      report.taxEvents.push(...taxEvents);

      // If proceeds came from a crypto-to-crypto swap, record the
      // incoming asset as a new acquisition at the same USD FMV.
      if (tx.toCurrency && tx.toAmount && Math.abs(tx.toAmount) > 0) {
        getPool(tx.toCurrency).add(
          new Lot({
            currency: tx.toCurrency,
            acquired: ts,
            quantity: Math.abs(tx.toAmount),
            costBasisUsd: proceeds,
          })
        );
      }
      continue;
    }

    // All other kinds are non-taxable; skip silently.
  }

  return report;
}

// Export for Node.js (tests) and browser (global)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    calculateTaxes,
    TaxReport,
    TaxEvent,
    IncomeEvent,
    Lot,
    LotPool,
    VALID_METHODS,
    METHOD_DESCRIPTIONS,
    TAX_RULES,
    isLongTerm,
    daysDiff,
  };
}
