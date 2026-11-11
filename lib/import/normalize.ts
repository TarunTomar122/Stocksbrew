/**
 * Holdings import: the shapes every input becomes, and the cleanup that turns
 * what a model or a pasted file says into rows we can check.
 *
 * Pure, with no server imports, so the parse route, the review table and the
 * tests all run the same rules. Nothing here decides whether a ticker is one
 * we cover; that is lib/import/resolve.ts.
 */

export type ImportConfidence = "high" | "medium" | "low";

/** Where a row came from. */
export type ImportInput = "image" | "text" | "csv";

/** One holding as read from the input, before we check the ticker. */
export type ParsedHolding = {
  /** Cleaned ticker ("BRK.B"), or null when the input only had a name. */
  ticker: string | null;
  /** Company name as written, when the input showed one. */
  name: string | null;
  shares: number | null;
  /** Average cost per share. */
  averageCost: number | null;
  /** Position value as shown, used only when shares are missing. */
  marketValue: number | null;
  confidence: ImportConfidence;
  /**
   * A word read as a ticker only because of where it stood (lowercase text
   * like "aapl, msft"). Dropped quietly when it is not a stock we cover, so
   * "I own some" never shows up as three unknown tickers.
   */
  guess?: boolean;
  /**
   * The screen showed money in another currency (an ISO code like "EUR").
   * Its costs and values are dropped, since we keep dollars; the shares stay.
   */
  currency?: string;
};

/** What the vision or text model is asked to return (lib/import/vision.ts). */
export type ModelHolding = {
  ticker: string | null;
  name: string | null;
  shares: number | string | null;
  average_cost: number | string | null;
  market_value: number | string | null;
  /** ISO code of the money amounts on that row, as shown ("USD", "EUR"). */
  currency?: string | null;
  confidence: string | null;
};

/** Most rows a single import keeps. A broker screen rarely shows more than 40. */
export const MAX_IMPORT_ROWS = 100;

const TICKER_RE = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

/** Exchange and country tags a broker or a model glues onto a symbol. */
const EXCHANGE_TAGS = /^(NASDAQ|NYSE|NYSEARCA|NYSEAMERICAN|AMEX|ARCA|BATS|CBOE|OTC|OTCMKTS|US)$/;

/**
 * "$aapl", "AAPL US", "NASDAQ:AAPL", "BRK B", "brk/b", "BRK-B" and "BRK.B"
 * all become a clean symbol ("AAPL", "BRK.B"). Anything that still does not
 * look like a US ticker is null.
 */
export function cleanTicker(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let text = raw.trim().toUpperCase().replace(/^\$+/, "");
  if (!text) return null;
  // "NASDAQ:AAPL" and "AAPL:US"
  if (text.includes(":")) {
    const parts = text.split(":").map((part) => part.trim()).filter(Boolean);
    text = parts.find((part) => !EXCHANGE_TAGS.test(part)) ?? "";
  }
  // "AAPL US", "AAPL.US", "AAPL-US"
  text = text.replace(/[\s.-]+(US|USA)$/, "");
  // "BRK B", "BRK/B", "BRK-B", "BRK.B" are one class share
  const classShare = text.match(/^([A-Z]{1,4})[\s/.-]([A-Z])$/);
  if (classShare) text = `${classShare[1]}.${classShare[2]}`;
  text = text.replace(/\s+/g, "");
  return TICKER_RE.test(text) ? text : null;
}

/**
 * A number as a broker prints it: "1,234.50", "$12.30", "12 sh", "1.5K".
 * Accounting negatives "(12.30)" and minus signs come back negative; the
 * caller decides whether a negative makes sense. Dashes and blanks are null.
 */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  let text = raw.trim();
  if (!text || /^[-–—]+$/.test(text) || /^n\/?a$/i.test(text)) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/[−–]/g, "-");
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  }
  text = text.replace(/^[+]/, "").replace(/(US\$|\$|USD|€|£)/gi, "").replace(/\b(shares?|sh|units?)\b\.?/gi, "").trim();
  const suffix = text.match(/([kmb])$/i);
  let scale = 1;
  if (suffix) {
    scale = { k: 1e3, m: 1e6, b: 1e9 }[suffix[1]!.toLowerCase() as "k" | "m" | "b"];
    text = text.slice(0, -1).trim();
  }
  text = text.replace(/,/g, "");
  if (!/^\d*\.?\d+$/.test(text)) return null;
  const value = Number(text) * scale;
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** A positive amount under `max`, else null. Shares and prices are never negative here (no shorts). */
function positive(value: number | null, max: number): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0 || value > max) return null;
  return value;
}

export function cleanConfidence(raw: unknown): ImportConfidence {
  return raw === "high" || raw === "medium" || raw === "low" ? raw : "medium";
}

/** "eur", "€" and "EUR " become "EUR"; dollars and anything unreadable are null (we treat those as dollars). */
export function foreignCurrency(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().toUpperCase();
  const symbols: Record<string, string> = { "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR", "C$": "CAD", "A$": "AUD", "CHF": "CHF" };
  const code = symbols[text] ?? text;
  if (!/^[A-Z]{3}$/.test(code) || code === "USD") return null;
  return code;
}

/** Rows a broker shows next to positions that are not positions: cash, sweep funds, totals, pending orders. */
const NOT_A_POSITION = /\b(cash|money market|sweep|core position|buying power|pending|account total|grand total|margin balance|settlement|guthaben|verrechnungskonto)\b/i;

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  return name && name.length <= 80 ? name : null;
}

/** Shares up to a billion; prices up to a million a share; values up to a trillion. */
export const LIMITS = { shares: 1_000_000_000, price: 1_000_000, value: 1_000_000_000_000 } as const;

/**
 * Model rows into clean holdings: tickers cleaned, numbers parsed, negatives
 * and impossible values dropped to null, rows with neither a ticker nor a
 * name thrown away. A row whose numbers had to be dropped is never "high".
 */
export function normalizeModelHoldings(rows: unknown): ParsedHolding[] {
  if (!Array.isArray(rows)) return [];
  const out: ParsedHolding[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Partial<ModelHolding>;
    const ticker = cleanTicker(row.ticker);
    const name = cleanName(row.name);
    if (!ticker && !name) continue;
    // A sweep fund or a cash line the reader listed anyway ("HELD IN MONEY MARKET").
    if (!ticker && name && NOT_A_POSITION.test(name)) continue;
    const sharesRaw = parseAmount(row.shares);
    const costRaw = parseAmount(row.average_cost);
    const valueRaw = parseAmount(row.market_value);
    const shares = positive(sharesRaw, LIMITS.shares);
    const currency = foreignCurrency(row.currency);
    // Euros saved as dollars would be wrong on every gain we show, so only the share count is kept.
    const averageCost = currency ? null : positive(costRaw, LIMITS.price);
    const marketValue = currency ? null : positive(valueRaw, LIMITS.value);
    let confidence = cleanConfidence(row.confidence);
    const dropped = (sharesRaw !== null && shares === null) || (!currency && costRaw !== null && averageCost === null);
    if ((dropped || currency) && confidence === "high") confidence = "medium";
    if (!ticker && confidence !== "low") confidence = "medium";
    out.push({ ticker, name, shares, averageCost, marketValue, confidence, ...(currency ? { currency } : {}) });
  }
  return mergeDuplicates(out);
}

const RANK: Record<ImportConfidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * The same stock twice (two screenshots that overlap, or two lots) becomes
 * one row. Two different share counts are added together only when the rows
 * came from different lots of the same input; when they match exactly they
 * are the same row seen twice. The average cost is weighted by shares.
 */
export function mergeDuplicates(rows: ParsedHolding[]): ParsedHolding[] {
  const byKey = new Map<string, ParsedHolding>();
  const order: string[] = [];
  for (const row of rows) {
    const key = row.ticker ?? `name:${(row.name ?? "").toLowerCase()}`;
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, { ...row });
      order.push(key);
      continue;
    }
    const sameRow =
      seen.shares === row.shares && seen.averageCost === row.averageCost && seen.marketValue === row.marketValue;
    if (sameRow) {
      if (RANK[row.confidence] > RANK[seen.confidence]) seen.confidence = row.confidence;
      continue;
    }
    const shares = seen.shares !== null && row.shares !== null ? seen.shares + row.shares : seen.shares ?? row.shares;
    let averageCost = seen.averageCost ?? row.averageCost;
    if (seen.shares !== null && row.shares !== null && seen.averageCost !== null && row.averageCost !== null) {
      averageCost = (seen.shares * seen.averageCost + row.shares * row.averageCost) / (seen.shares + row.shares);
    }
    const marketValue = seen.marketValue !== null && row.marketValue !== null ? seen.marketValue + row.marketValue : seen.marketValue ?? row.marketValue;
    byKey.set(key, {
      ticker: seen.ticker,
      name: seen.name ?? row.name,
      shares,
      averageCost: averageCost === null ? null : Math.round(averageCost * 10_000) / 10_000,
      marketValue,
      ...((seen.currency ?? row.currency) ? { currency: seen.currency ?? row.currency } : {}),
      // Two lots added together is a guess on our side, so it is never "high".
      confidence: RANK[seen.confidence] < RANK[row.confidence] ? seen.confidence : row.confidence === "high" ? "medium" : row.confidence,
    });
  }
  return order.map((key) => byKey.get(key)!).slice(0, MAX_IMPORT_ROWS);
}
