import { quietFacts, reportSoonWords } from "@/lib/briefing-move-facts";
import type { ExamplePortfolio } from "@/lib/portfolio-data";

import { shortDay } from "./merge";

/**
 * The signed-out inbox's other stocks: under the read, every stock of the example portfolio the page does not already
 * talk about, one plain line each: the logo, the ticker, the day's move, and the confirmed reason for it when there is
 * one (judges, ship 42: weight and cost are My stocks', so the inbox does not reprint them). What the example holds
 * first, then what it watches, said apart as My stocks and the briefing say them. The same cached snapshot as the
 * example's My stocks, briefing and home page (lib/portfolio-data.ts). Pure; the page reads the portfolio and reasons.
 */

export type ExampleHoldingRow = {
  ticker: string;
  /** The day's move, percent. */
  dayPct: number;
  /** The confirmed reason for the day's move, from the same research as the stock's page, or null. */
  reason: string | null;
  /**
   * With no confirmed reason: one measured fact, picked as the briefing's other stocks pick theirs ("Twice its normal
   * 1.0% day", "Down 4.1% in a month", "Reports Tuesday after the close", lib/briefing-move-facts.ts quietFacts), or null.
   */
  fact: string | null;
};

export type ExampleHoldings = {
  /** "The example's other stocks on Nov 11". */
  title: string;
  /** "S&P 500 +1.3%": the baseline every move reads against, said once. Null when it is from another day. */
  market: string | null;
  /** What it holds. */
  rows: ExampleHoldingRow[];
  /** What it watches. */
  watching: ExampleHoldingRow[];
};

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * The stocks with a move on the portfolio's price day, biggest move first, less `skip` (the stocks the read and the
 * rows above already say), each with its confirmed reason from `reasons` (by ticker). Null when fewer than two are
 * left: one line is not a list.
 */
export function exampleHoldings(
  example: Pick<ExamplePortfolio, "portfolio" | "pricesAsOf" | "marketPct"> | null,
  skip: Iterable<string>,
  reasons: Readonly<Record<string, string>> = {},
  /** Price facts by ticker, most telling first (lib/briefing-move-facts-server.ts stockMoveFacts). */
  facts: Readonly<Record<string, readonly string[]>> = {},
  /** New York today, for a report coming up in the next two weeks; null leaves reports out. */
  today: string | null = null,
): ExampleHoldings | null {
  if (!example?.pricesAsOf) return null;
  const skipped = new Set([...skip].map((ticker) => ticker.toUpperCase()));
  // The watched names sit in `watching` (lib/portfolio-shared.ts buildPortfolio), not in `positions`.
  const lines = (list: ReadonlyArray<{ ticker: string; kind: string; dayPct: number | null; nextEarnings?: { date: string; time?: string | null } | null }> | undefined, kind: "holding" | "watchlist") =>
    (list ?? [])
      .filter((position) => position.kind === kind && fin(position.dayPct) && !skipped.has(position.ticker.toUpperCase()))
      .map((position) => ({
        ticker: position.ticker,
        dayPct: position.dayPct as number,
        reason: reasons[position.ticker.toUpperCase()]?.trim() || null,
        fact: null as string | null,
        report: today ? reportSoonWords(position.nextEarnings ?? null, today) : null,
      }))
      .sort((a, b) => Math.abs(b.dayPct) - Math.abs(a.dayPct) || a.ticker.localeCompare(b.ticker));
  const rows = lines(example.portfolio.positions, "holding");
  const watching = lines(example.portfolio.watching, "watchlist");
  if (rows.length + watching.length < 2) return null;
  // A card without a confirmed reason gets one measured fact, worked out in the order shown so no two say the same
  // words and neighbours say different kinds of thing (owner rule 1, judges ship 46); a card with a reason keeps just
  // that. The same picker as the briefing's other stocks (lib/briefing-move-facts.ts quietFacts).
  const all = [...rows, ...watching];
  const picked = quietFacts(
    all.map((row) => ({ ticker: row.ticker, pct: row.dayPct, facts: facts[row.ticker.toUpperCase()], report: row.report })),
    new Set(all.filter((row) => row.reason).map((row) => row.ticker)),
  );
  for (const row of all) row.fact = row.reason ? null : (picked.get(row.ticker) ?? null);
  const strip = (row: (typeof all)[number]): ExampleHoldingRow => ({ ticker: row.ticker, dayPct: row.dayPct, reason: row.reason, fact: row.fact });
  const market = fin(example.marketPct) ? `S&P 500 ${example.marketPct >= 0 ? "+" : "−"}${Math.abs(example.marketPct).toFixed(1)}%` : null;
  return { title: `The example's other stocks on ${shortDay(example.pricesAsOf)}`, market, rows: rows.map(strip), watching: watching.map(strip) };
}
