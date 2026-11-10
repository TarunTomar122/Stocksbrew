/**
 * Basket and overlay math for the idea baskets and the compare desk. Pure:
 * no I/O and no clock, so the numbers a page shows are the numbers the tests
 * check.
 *
 * A basket here is always the same simple thing: equal dollars in every line
 * on the start date, then left alone (no rebalancing, no costs, no
 * dividends beyond what adjusted closes already carry). It is a hypothetical
 * yardstick for an idea, never a track record, and every page that shows it
 * says so.
 */

import { monthsBefore, type ChartPoint } from "@/lib/stock-chart";

export type IndexPoint = { date: string; value: number };

export type BasketRangeKey = "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "5Y" | "MAX";

export const BASKET_RANGES: Array<{ key: BasketRangeKey; label: string; months?: number }> = [
  { key: "1M", label: "1M", months: 1 },
  { key: "3M", label: "3M", months: 3 },
  { key: "6M", label: "6M", months: 6 },
  { key: "YTD", label: "YTD" },
  { key: "1Y", label: "1Y", months: 12 },
  { key: "3Y", label: "3Y", months: 36 },
  { key: "5Y", label: "5Y", months: 60 },
  { key: "MAX", label: "Max" },
];

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function dayMs(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

/** The calendar day a range starts on, measured back from `lastDate`. "MAX" has no fixed start. */
export function rangeStart(key: BasketRangeKey, lastDate: string): string | null {
  if (key === "MAX") return null;
  if (key === "YTD") return `${Number(lastDate.slice(0, 4)) - 1}-12-31`;
  const months = BASKET_RANGES.find((range) => range.key === key)?.months;
  return months ? monthsBefore(lastDate, months) : null;
}

/**
 * The simple average of each line's return over one window. With equal
 * dollars in every line and no rebalancing, that average is exactly the
 * basket's return. Lines without a number are left out and counted.
 */
export function basketWindowReturn(returns: ReadonlyArray<number | null | undefined>): { pct: number; priced: number; total: number } | null {
  const known = returns.filter(fin);
  if (known.length === 0) return null;
  return { pct: known.reduce((sum, value) => sum + value, 0) / known.length, priced: known.length, total: returns.length };
}

/** Index of the last point dated on or before `date`, or -1. Points are oldest first. */
function indexOnOrBefore(points: ReadonlyArray<ChartPoint>, date: string): number {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.date <= date) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** How many days after the requested start a series may begin and still count as covering the window. */
const START_SLACK_DAYS = 7;

export type OverlayResult = {
  /** The first date every included series has a close for. */
  startDate: string;
  endDate: string;
  /** Each included series rebased to 100 on the start date, on one shared calendar. */
  series: Record<string, IndexPoint[]>;
  /** Symbols that have no data at the start of the window (listed later, or no history). */
  excluded: string[];
};

/**
 * Rebase several price series to 100 on a common start date and put them on
 * one calendar (the union of their trading days; a missing day carries the
 * previous close forward).
 *
 * `from` is the calendar day the window starts; pass null for "as far back as
 * every series goes". A series that starts more than a week after `from` is
 * excluded rather than silently shortening everyone's window. With
 * `from: null` nothing is excluded for starting late: the window shrinks to
 * the youngest series instead.
 */
export function overlaySeries(seriesBySymbol: Readonly<Record<string, ReadonlyArray<ChartPoint>>>, from: string | null): OverlayResult | null {
  const included: Array<{ symbol: string; points: ReadonlyArray<ChartPoint> }> = [];
  const excluded: string[] = [];
  for (const [symbol, points] of Object.entries(seriesBySymbol)) {
    if (points.length < 2) {
      excluded.push(symbol);
      continue;
    }
    if (from !== null && dayMs(points[0]!.date) - dayMs(from) > START_SLACK_DAYS * 86_400_000) {
      excluded.push(symbol);
      continue;
    }
    included.push({ symbol, points });
  }
  if (included.length === 0) return null;

  // Everyone must have a close on or before the start date.
  let startDate = from ?? included[0]!.points[0]!.date;
  for (const { points } of included) {
    const first = points[0]!.date;
    if (first > startDate) startDate = first;
  }
  const endDate = included.reduce((latest, { points }) => {
    const last = points[points.length - 1]!.date;
    return last > latest ? last : latest;
  }, "");
  if (!(endDate > startDate)) return null;

  const days = new Set<string>([startDate]);
  for (const { points } of included) {
    for (const point of points) {
      if (point.date > startDate && point.date <= endDate) days.add(point.date);
    }
  }
  const calendar = [...days].sort();

  const series: Record<string, IndexPoint[]> = {};
  for (const { symbol, points } of included) {
    const baseIndex = indexOnOrBefore(points, startDate);
    const base = baseIndex >= 0 ? points[baseIndex]!.close : NaN;
    if (!(base > 0)) {
      excluded.push(symbol);
      continue;
    }
    let cursor = baseIndex;
    series[symbol] = calendar.map((date) => {
      while (cursor + 1 < points.length && points[cursor + 1]!.date <= date) cursor += 1;
      return { date, value: (points[cursor]!.close / base) * 100 };
    });
  }
  if (Object.keys(series).length === 0) return null;
  return { startDate, endDate, series, excluded };
}

/** The average of several rebased series, day by day: the equal-weight, buy-and-hold basket. */
export function averageSeries(series: ReadonlyArray<ReadonlyArray<IndexPoint>>): IndexPoint[] {
  if (series.length === 0) return [];
  const length = Math.min(...series.map((points) => points.length));
  const out: IndexPoint[] = [];
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const points of series) sum += points[i]!.value;
    out.push({ date: series[0]![i]!.date, value: sum / series.length });
  }
  return out;
}

export type BasketSeries = {
  startDate: string;
  endDate: string;
  basket: IndexPoint[];
  benchmark: IndexPoint[] | null;
  /** Lines that count in the basket for this window. */
  members: string[];
  /** Lines left out because they have no price at the start of the window. */
  excluded: string[];
};

/**
 * The basket's path against a benchmark over one window. The benchmark never
 * decides who is in the basket, but both lines share the same start date.
 */
export function basketSeries(
  members: Readonly<Record<string, ReadonlyArray<ChartPoint>>>,
  benchmark: ReadonlyArray<ChartPoint> | null,
  from: string | null,
): BasketSeries | null {
  const BENCH = "\u0000benchmark";
  const first = overlaySeries(members, from);
  if (!first) return null;
  const kept = Object.fromEntries(Object.keys(first.series).map((symbol) => [symbol, members[symbol]!]));
  const withBench = benchmark && benchmark.length >= 2 ? overlaySeries({ ...kept, [BENCH]: benchmark }, first.startDate) : null;
  const result = withBench && withBench.series[BENCH] ? withBench : first;
  const memberSymbols = Object.keys(result.series).filter((symbol) => symbol !== BENCH);
  if (memberSymbols.length === 0) return null;
  return {
    startDate: result.startDate,
    endDate: result.endDate,
    basket: averageSeries(memberSymbols.map((symbol) => result.series[symbol]!)),
    benchmark: result.series[BENCH] ?? null,
    members: memberSymbols,
    excluded: Object.keys(members).filter((symbol) => !memberSymbols.includes(symbol)),
  };
}

/** Total return of a rebased series, in percent. */
export function indexReturn(points: ReadonlyArray<IndexPoint>): number | null {
  if (points.length < 2) return null;
  const first = points[0]!.value;
  const last = points[points.length - 1]!.value;
  return first > 0 ? (last / first - 1) * 100 : null;
}

/** Largest peak-to-trough fall, as a negative percent (0 when the series never fell). */
export function indexMaxDrawdown(points: ReadonlyArray<IndexPoint>): number | null {
  if (points.length < 2) return null;
  let peak = points[0]!.value;
  let worst = 0;
  for (const point of points) {
    if (point.value > peak) peak = point.value;
    if (peak > 0) worst = Math.min(worst, point.value / peak - 1);
  }
  return worst * 100;
}

/** Evenly spaced indexes into a series of `length`, always keeping the first and the last. */
export function thinIndexes(length: number, max: number): number[] {
  if (length <= max || max < 2) return Array.from({ length }, (_, index) => index);
  const step = (length - 1) / (max - 1);
  const out: number[] = [];
  for (let i = 0; i < max; i++) {
    const index = Math.round(i * step);
    if (out[out.length - 1] !== index) out.push(index);
  }
  return out;
}

/** Thin several aligned series with the same indexes so they stay aligned. */
export function thinAligned<T>(series: ReadonlyArray<T>, max: number): T[] {
  return thinIndexes(series.length, max).map((index) => series[index]!);
}
