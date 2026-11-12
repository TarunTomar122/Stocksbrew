import type { MarketSessionKind } from "@/lib/market-session";
import { isNyseHoliday } from "@/lib/market-session";
import { marketDateIso } from "@/lib/premarket-shared";

import { curveSlots } from "./format";
import type { MemoCurvePoint, MemoWeight } from "./types";
import { addDays, mondayOf, weekdayOf } from "./week";

/**
 * The week chart's dotted leg before the open: from the last close to today's slot, priced from this morning's
 * premarket quotes. Pure, so the chart and its tests read the same rules:
 *
 * - only from 4:00 ET to the 9:30 open on a trading day, on the week the chart is drawing, when the chart ends at the
 *   trading day before today (the close the premarket moves are measured from);
 * - the portfolio from its own holdings at their weights at that close, and only when the holdings with a quote make
 *   up at least `PREMARKET_MIN_COVERAGE` of the line; the rest are left out and the covered ones reweighted;
 * - the S&P 500 from SPY's premarket price, else S&P 500 futures; without either the portfolio leg stands alone.
 */

/** The share of the line, by weight, that must have a premarket quote before the portfolio's dotted leg is drawn. */
export const PREMARKET_MIN_COVERAGE = 0.7;

export type PremarketQuotes = {
  /** When the stock quotes were taken (ISO). */
  at: string;
  /** Percent from the last close, by ticker. */
  stocks: Record<string, number>;
  /** The S&P 500 before the open, percent from its last close. */
  sp500: { pct: number; source: "SPY" | "futures" } | null;
};

export type PremarketLeg = {
  /** The chart slot of today (1 = Monday ... 5 = Friday). */
  slot: number;
  /** Today, New York. */
  day: string;
  /** Percent from the week's starting close, like the curve's points. */
  portfolio: number;
  market: number | null;
  /** The portfolio's own move from the last close, percent. */
  portfolioMove: number;
  marketMove: number | null;
  marketSource: "SPY" | "futures" | null;
  /** When the quotes were taken (ISO). */
  at: string;
  /** Share of the line's weight that had a quote, 0 to 1. */
  coverage: number;
};

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** The trading day before `day` (New York), skipping weekends and NYSE holidays. */
export function previousTradingDay(day: string): string {
  let at = addDays(day, -1);
  for (let i = 0; i < 10 && (weekdayOf(at) >= 5 || isNyseHoliday(at)); i++) at = addDays(at, -1);
  return at;
}

/**
 * The line's move from its last close, from the holdings that have a premarket quote, reweighted over them. Null
 * when those holdings make up less than `minCoverage` of the line by weight.
 */
export function premarketMove(
  weights: readonly MemoWeight[],
  stocks: Readonly<Record<string, number>>,
  minCoverage = PREMARKET_MIN_COVERAGE,
): { pct: number; coverage: number } | null {
  let total = 0;
  let covered = 0;
  let sum = 0;
  for (const { ticker, weight } of weights) {
    if (!(finite(weight) && weight > 0)) continue;
    total += weight;
    const move = stocks[ticker.toUpperCase()];
    if (!finite(move)) continue;
    covered += weight;
    sum += weight * move;
  }
  if (!(total > 0) || !(covered > 0)) return null;
  const coverage = covered / total;
  // A hair under the bar from rounded weights still counts: 69.99% is 70%.
  if (coverage + 1e-9 < minCoverage) return null;
  return { pct: sum / covered, coverage };
}

/** A move from the last close carried onto a week-to-date figure: compounded, not added. */
function onto(weekToDate: number, move: number): number {
  return ((1 + weekToDate / 100) * (1 + move / 100) - 1) * 100;
}

/**
 * Whether the chart could carry a leg today: premarket on a trading day, today inside the chart's week after its
 * last close, and that close the trading day before today. Checked before asking for quotes.
 */
export function premarketLegSlot(curve: readonly MemoCurvePoint[], session: MarketSessionKind, today: string): number | null {
  if (session !== "premarket") return null;
  const slots = curveSlots(curve);
  if (slots.length < 2) return null;
  const last = slots[slots.length - 1]!;
  if (last.slot === 0) return null;
  const weekday = weekdayOf(today);
  if (weekday > 4 || isNyseHoliday(today)) return null;
  if (mondayOf(today) !== mondayOf(last.point.day)) return null;
  if (last.point.day !== previousTradingDay(today)) return null;
  const slot = weekday + 1;
  return slot > last.slot ? slot : null;
}

/** The dotted leg, or null when there should be none (see the rules at the top). */
export function premarketLeg({
  curve,
  weights,
  quotes,
  session,
  today,
}: {
  curve: readonly MemoCurvePoint[];
  weights: readonly MemoWeight[] | null | undefined;
  quotes: PremarketQuotes | null;
  session: MarketSessionKind;
  /** New York day, YYYY-MM-DD. */
  today: string;
}): PremarketLeg | null {
  if (!quotes || !weights || weights.length === 0) return null;
  const slot = premarketLegSlot(curve, session, today);
  if (slot === null) return null;
  // Quotes from an earlier morning are not this morning's premarket.
  const at = Date.parse(quotes.at);
  if (!Number.isFinite(at) || marketDateIso("US", new Date(at)) !== today) return null;
  const move = premarketMove(weights, quotes.stocks);
  if (!move) return null;
  const end = curve[curve.length - 1]!;
  const sp500 = end.market !== null && quotes.sp500 && finite(quotes.sp500.pct) ? quotes.sp500 : null;
  return {
    slot,
    day: today,
    portfolio: round(onto(end.portfolio, move.pct)),
    market: sp500 && end.market !== null ? round(onto(end.market, sp500.pct)) : null,
    portfolioMove: round(move.pct),
    marketMove: sp500 ? round(sp500.pct) : null,
    marketSource: sp500 ? sp500.source : null,
    at: quotes.at,
    coverage: round(move.coverage, 4),
  };
}

const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });

/** "8:42 AM ET". */
export function premarketTime(iso: string): string {
  const at = Date.parse(iso);
  return Number.isFinite(at) ? `${ET_TIME.format(new Date(at))} ET` : "";
}

/** Reads the quotes route's answer; null for anything malformed or not live. */
export function readPremarketQuotes(raw: unknown): PremarketQuotes | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.live !== true || typeof row.at !== "string" || !row.stocks || typeof row.stocks !== "object") return null;
  const stocks: Record<string, number> = {};
  for (const [ticker, pct] of Object.entries(row.stocks as Record<string, unknown>)) if (finite(pct)) stocks[ticker.toUpperCase()] = pct;
  const sp = row.sp500 as Record<string, unknown> | null | undefined;
  const source: "SPY" | "futures" | null = sp?.source === "SPY" ? "SPY" : sp?.source === "futures" ? "futures" : null;
  const sp500 = sp && finite(sp.pct) && source ? { pct: sp.pct, source } : null;
  return { at: row.at, stocks, sp500 };
}
