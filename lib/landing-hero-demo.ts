import type { CallLevel } from "@/lib/call-level";
import type { CallWord } from "@/lib/stock-chart";

/**
 * The landing hero's demo card (components/oa/landing/hero-demo.tsx): a few of today's stand-out showcase stocks, each
 * with its price and move, our call with its own level, one short reason and three months of closes. Types and pure
 * helpers only, safe on the client.
 */

export type HeroDemoStock = {
  ticker: string;
  name: string;
  price: number;
  dayPct: number | null;
  /** When the price was taken (ISO). */
  priceAt: string | null;
  call: CallWord;
  /** The call's own level (owner rule 8), only when it is near enough to today's price to mean something. */
  level: CallLevel | null;
  /** Why we make the call, fifteen words at most, or null. */
  why: string | null;
  /** Daily closes over about three months, oldest first, ending at today's price. */
  closes: number[];
};

/** The reason line's hard word budget (owner rule 8). */
export const WHY_MAX_WORDS = 15;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** A line short enough for the card, or null. Never cut mid-sentence: a long line is dropped, not trimmed. */
export function shortLine(text: string | null | undefined, max = WHY_MAX_WORDS): string | null {
  const value = String(text ?? "").trim();
  return value && wordCount(value) <= max ? value : null;
}

/**
 * A trailing comparison after the last comma (", while the S&P 500 fell 0.9%."), which can go and leave a whole,
 * still true sentence ("NVDA fell 13% in the five trading days to Nov 11.").
 */
const TRAILING_CLAUSE = /,\s+(?:while|whereas|after|before|faster than|slower than|about the same as|compared with|up from|down from|against)\b[^,]*[.!]?$/;

/**
 * The reason line for the card: the line as written when it fits the word budget, else the line without its trailing
 * comparison when that fits, else null. Never cut mid-clause.
 */
export function fitWhy(text: string | null | undefined, max = WHY_MAX_WORDS): string | null {
  const whole = shortLine(text, max);
  if (whole) return whole;
  const value = String(text ?? "").trim();
  const trimmed = TRAILING_CLAUSE.test(value) ? `${value.replace(TRAILING_CLAUSE, "").trim()}.` : "";
  return trimmed ? shortLine(trimmed, max) : null;
}

/**
 * The closes since three months before the last one (by date, not by count), with today's price added when it is
 * newer than the last close. Fewer than ten points is not a chart: empty.
 */
export function threeMonthCloses(history: ReadonlyArray<{ date: string; close: number }>, price: number | null): number[] {
  const points = history.filter((point) => /^\d{4}-\d{2}-\d{2}/.test(point.date) && Number.isFinite(point.close) && point.close > 0);
  const last = points[points.length - 1];
  if (!last) return [];
  const start = new Date(`${last.date.slice(0, 10)}T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - 3);
  const from = start.toISOString().slice(0, 10);
  const closes = points.filter((point) => point.date.slice(0, 10) >= from).map((point) => point.close);
  if (price != null && Number.isFinite(price) && price > 0 && Math.abs(price - last.close) / last.close > 0.0001) closes.push(price);
  return closes.length >= 10 ? closes : [];
}

/** Is a level close enough to the price to say something about today? Half the price away says little. */
export function levelIsNear(level: number, price: number, within = 0.5): boolean {
  return price > 0 && level > 0 && Math.abs(level - price) / price <= within;
}

/**
 * The sparkline in a 100 x 40 box: the polyline points, and the level's height when it falls within a quarter of the
 * chart's own range (further out it would squash the line into a flat stroke).
 */
export function sparkGeometry(closes: readonly number[], level: number | null): { points: string; levelY: number | null } {
  if (closes.length < 2) return { points: "", levelY: null };
  let min = Math.min(...closes);
  let max = Math.max(...closes);
  const span = max - min || max * 0.01 || 1;
  const showLevel = level != null && level >= min - span * 0.25 && level <= max + span * 0.25;
  if (showLevel) {
    min = Math.min(min, level);
    max = Math.max(max, level);
  }
  const range = max - min || 1;
  const y = (value: number) => 37 - ((value - min) / range) * 34;
  const points = closes.map((close, index) => `${((index / (closes.length - 1)) * 100).toFixed(2)},${y(close).toFixed(2)}`).join(" ");
  return { points, levelY: showLevel ? Number(y(level).toFixed(2)) : null };
}

/** The change over the chart, as a signed percentage, or null. */
export function periodChange(closes: readonly number[]): number | null {
  const first = closes[0];
  const last = closes[closes.length - 1];
  if (first == null || last == null || !(first > 0)) return null;
  return ((last - first) / first) * 100;
}

/**
 * Which stocks stood out: a move with a confirmed reason first (it makes the better example), then the size of the
 * move. Ties keep the pool's order.
 */
export function rankStandOut(
  tickers: readonly string[],
  moveOf: (ticker: string) => number | null,
  explained: (ticker: string) => boolean,
): string[] {
  const size = (ticker: string) => Math.abs(moveOf(ticker) ?? 0);
  const isExplained = (ticker: string) => (explained(ticker) && size(ticker) >= 1 ? 1 : 0);
  return [...tickers].sort((a, b) => isExplained(b) - isExplained(a) || size(b) - size(a));
}
