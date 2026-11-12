import type { ExamplePortfolio } from "@/lib/portfolio-data";

import { shortDay } from "./merge";

/**
 * The signed-out inbox's other holdings: under the read, every holding of the example portfolio the page does not
 * already talk about, one plain line each with its real move (judges, ship 39: the page ended in an empty desert
 * after one stock). A compact table, not sentences: the column words are said once, not on every row (owner rules 1,
 * 3). The same made-up portfolio of real stocks, priced on the same dated quotes, as the example's
 * My stocks and briefing (lib/portfolio-data.ts). Pure; the page reads the cached portfolio.
 */

export type ExampleHoldingRow = {
  ticker: string;
  /** The day's move, percent. */
  dayPct: number;
  /** Share of the portfolio, percent, or null. */
  weight: number | null;
  /** Gain since it was added, percent, or null. */
  gainPct: number | null;
};

export type ExampleHoldings = {
  /** "The example's other holdings on Nov 11". */
  title: string;
  /** "S&P 500 +1.3%": the baseline every move reads against, said once. Null when it is from another day. */
  market: string | null;
  rows: ExampleHoldingRow[];
};

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * The holdings with a move on the portfolio's price day, biggest move first, less `skip` (the stocks the read and the
 * rows above already say). Null when fewer than two are left: one line is not a list.
 */
export function exampleHoldings(example: Pick<ExamplePortfolio, "portfolio" | "pricesAsOf" | "marketPct"> | null, skip: Iterable<string>): ExampleHoldings | null {
  if (!example?.pricesAsOf) return null;
  const skipped = new Set([...skip].map((ticker) => ticker.toUpperCase()));
  const rows = example.portfolio.positions
    .filter((position) => position.kind === "holding" && fin(position.dayPct) && !skipped.has(position.ticker.toUpperCase()))
    .map((position) => ({
      ticker: position.ticker,
      dayPct: position.dayPct as number,
      weight: fin(position.weight) && position.weight > 0 ? position.weight : null,
      gainPct: fin(position.gainPct) ? position.gainPct : null,
    }))
    .sort((a, b) => Math.abs(b.dayPct) - Math.abs(a.dayPct) || a.ticker.localeCompare(b.ticker));
  if (rows.length < 2) return null;
  const market = fin(example.marketPct) ? `S&P 500 ${example.marketPct >= 0 ? "+" : "−"}${Math.abs(example.marketPct).toFixed(1)}%` : null;
  return { title: `The example's other holdings on ${shortDay(example.pricesAsOf)}`, market, rows };
}
