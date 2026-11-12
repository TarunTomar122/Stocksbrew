/**
 * The read of a pasted or imported portfolio: each stock with our call, the
 * sector mix and the reports coming up. Pure (no server imports): the server
 * loads the facts (lib/import/read.ts), the page works out the mix from them,
 * with the share counts that only ever live in the browser.
 *
 * Everything shown to a signed-out visitor is open on every plan: the call
 * and its date, a reason with any price level taken out, the sector, today's
 * move and the next earnings date. Price zones are never in here.
 */

export type ReadCall = "Add" | "Hold" | "Trim";

export type ReadStock = {
  instrument_id: string;
  ticker: string;
  name: string;
  sector: string | null;
  price: number | null;
  day_pct: number | null;
  /** When the price was taken (ISO). */
  price_at: string | null;
  call: ReadCall | null;
  /** Day the call was made (YYYY-MM-DD). */
  call_at: string | null;
  /** Why, in one sentence, with any price level removed. */
  reason: string | null;
  earnings_date: string | null;
  earnings_time: "bmo" | "amc" | null;
};

export type ReadFacts = {
  stocks: ReadStock[];
  /** New York day today (YYYY-MM-DD). */
  today: string;
  as_of: string;
};

export type SectorSlice = { sector: string; pct: number; tickers: string[] };

export type PortfolioReadResult = {
  /** When the facts were loaded (ISO), for the as-of line. */
  asOf: string;
  sectors: SectorSlice[];
  /** "value" when every stock has shares and a price, else "count". */
  weighting: "value" | "count";
  /** Reporting in the next 30 days, soonest first. */
  upcoming: Array<{ ticker: string; date: string; time: "bmo" | "amc" | null; days: number }>;
};

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** First sentence of a reason, so each stock gets one line. The sentence is never cut. */
export function firstSentence(text: string | null | undefined): string | null {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const [first] = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/);
  return first ?? clean;
}

/**
 * The sector mix and the reports coming up. `shares` maps instrument id to
 * share count, when the person gave them; with shares for every stock the mix
 * is by value, otherwise every stock counts the same.
 */
export function buildPortfolioRead(facts: ReadFacts, shares: Record<string, number | null | undefined> = {}): PortfolioReadResult {
  const stocks = facts.stocks;
  const values = stocks.map((stock) => {
    const n = shares[stock.instrument_id];
    return fin(n) && n > 0 && fin(stock.price) ? n * stock.price : null;
  });
  const byValue = stocks.length > 0 && values.every((value) => value !== null);
  const weights = byValue ? (values as number[]) : stocks.map(() => 1);
  const total = weights.reduce((sum, w) => sum + w, 0);

  // Sector mix.
  const bySector = new Map<string, { weight: number; tickers: string[] }>();
  stocks.forEach((stock, index) => {
    const sector = stock.sector || "Other";
    const slot = bySector.get(sector) ?? { weight: 0, tickers: [] };
    slot.weight += weights[index]!;
    slot.tickers.push(stock.ticker);
    bySector.set(sector, slot);
  });
  const sectors: SectorSlice[] = [...bySector.entries()]
    .map(([sector, slot]) => ({ sector, pct: total > 0 ? (slot.weight / total) * 100 : 0, tickers: slot.tickers }))
    .sort((a, b) => b.pct - a.pct || a.sector.localeCompare(b.sector));

  // Earnings coming up.
  const upcoming = stocks
    .filter((stock) => stock.earnings_date && stock.earnings_date >= facts.today)
    .map((stock) => ({ ticker: stock.ticker, date: stock.earnings_date!, time: stock.earnings_time, days: daysBetween(facts.today, stock.earnings_date!) }))
    .filter((item) => item.days <= 30)
    .sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));

  return {
    asOf: facts.as_of,
    sectors,
    weighting: byValue ? "value" : "count",
    upcoming,
  };
}
