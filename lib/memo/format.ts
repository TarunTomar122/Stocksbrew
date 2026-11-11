import type { MemoCurvePoint } from "./types";

/**
 * Small pure formatters and chart maths for the memo, with no other imports,
 * so the page's client chart can use them without pulling in the memo's rules.
 */

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

/** "2.3%", "12%", "0.4%": one decimal under 10, whole above. Always unsigned. */
export function pct(value: number): string {
  const abs = Math.abs(value);
  return abs >= 10 ? `${Math.round(abs)}%` : `${abs.toFixed(1)}%`;
}

/** "1.4 points" */
export function points(value: number): string {
  const abs = Math.abs(value);
  return `${abs.toFixed(1)} ${abs.toFixed(1) === "1.0" ? "point" : "points"}`;
}

/** "+2.3%", "−0.4%", "0.0%": signed with a true minus sign, the same rounding as `pct`. */
export function signedPct(value: number): string {
  const body = pct(value);
  if (Number(body.replace("%", "")) === 0) return body;
  return `${value > 0 ? "+" : "−"}${body}`;
}

/** Points of the portfolio's move, signed: "+0.6", "−1.4", "+0.04" (two decimals below a tenth, so it never reads 0.0). */
export function signedPoints(value: number): string {
  const abs = Math.abs(value);
  const body = abs >= 0.095 ? abs.toFixed(1) : abs.toFixed(2);
  if (Number(body) === 0) return body;
  return `${value > 0 ? "+" : "−"}${body}`;
}

/** Below this gap, in points, the week reads as in step with the S&P 500 (the same band the top line uses). */
export const IN_STEP_POINTS = 0.25;

/**
 * The gap between the portfolio and the S&P 500, rounded once so the headline, the chart's end label and the
 * list of weeks always agree: `points` is the gap to two decimals, `side` which way it went.
 */
export function weekGap(portfolioPct: number, marketPct: number): { points: number; side: "ahead" | "behind" | "in step" } {
  const gap = round(portfolioPct - marketPct);
  return { points: gap, side: Math.abs(gap) < IN_STEP_POINTS ? "in step" : gap > 0 ? "ahead" : "behind" };
}

/**
 * The week's chart slots: the close before Monday (slot 0), then Monday to
 * Friday (1 to 5). Each close goes to its own weekday's slot, so a market
 * holiday leaves that slot empty and the line joins across it.
 */
export function curveSlots(curve: readonly MemoCurvePoint[]): Array<{ slot: number; point: MemoCurvePoint }> {
  return curve.map((point, index) => {
    if (index === 0) return { slot: 0, point };
    const weekday = (new Date(`${point.day}T00:00:00Z`).getUTCDay() + 6) % 7;
    return { slot: Math.min(5, weekday + 1), point };
  });
}

/**
 * Round, evenly spaced y-axis ticks covering `low` to `high`, always including 0. A quiet week is drawn on at
 * least `minSpan` points (grown away from zero), so its ticks stay round instead of reading "+0.0025%".
 */
export function niceTicks(low: number, high: number, target = 4, minSpan = 1): number[] {
  let lo = Math.min(0, low);
  let hi = Math.max(0, high);
  if (hi - lo < minSpan) {
    const pad = minSpan - (hi - lo);
    if (lo === 0) hi += pad;
    else if (hi === 0) lo -= pad;
    else {
      lo -= pad / 2;
      hi += pad / 2;
    }
  }
  const span = hi - lo;
  const raw = span / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let tick = Math.floor(lo / step) * step; tick <= hi + step * 1e-9; tick += step) ticks.push(round(tick, 6));
  if (ticks[ticks.length - 1]! < hi - 1e-9) ticks.push(round(ticks[ticks.length - 1]! + step, 6));
  return ticks;
}
