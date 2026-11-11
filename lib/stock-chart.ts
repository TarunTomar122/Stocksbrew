/**
 * Pure helpers behind the stock page's price chart: range windows, event
 * markers, the history of our own calls, and the stored P/E series.
 *
 * No I/O and no clock, so everything here is unit tested. The loaders that
 * feed these live in `lib/stock-events.ts`.
 */

export type ChartPoint = { date: string; close: number };

export type ChartRangeKey = "1M" | "6M" | "1Y" | "5Y" | "MAX";

export type ChartRange = {
  key: ChartRangeKey;
  label: string;
  /** Oldest first. Thinned for drawing, always ends on the latest close. */
  points: ChartPoint[];
  /** Change from the first to the last close in the window, in percent. */
  changePct: number;
  fromDate: string;
  high: number;
  low: number;
};

const RANGE_WINDOWS: Array<{ key: Exclude<ChartRangeKey, "MAX">; months: number }> = [
  { key: "1M", months: 1 },
  { key: "6M", months: 6 },
  { key: "1Y", months: 12 },
  { key: "5Y", months: 60 },
];

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIsoDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dayMs(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

/** "2026-11-09" minus `months` calendar months, clamped to a real day. */
export function monthsBefore(iso: string, months: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  const target = new Date(Date.UTC(y, m - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Drop bad rows, sort oldest first, keep one close per day (the last one wins). */
export function cleanSeries(series: ReadonlyArray<{ date?: unknown; close?: unknown }>): ChartPoint[] {
  const byDate = new Map<string, number>();
  for (const row of series) {
    if (isIsoDay(row.date) && fin(row.close) && row.close > 0) byDate.set(row.date, row.close);
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, close]) => ({ date, close }));
}

/** Keep at most `max` points, sampled evenly from the end so the latest close survives. */
export function thinSeries(points: ChartPoint[], max: number): ChartPoint[] {
  if (points.length <= max || max < 2) return points;
  const step = Math.ceil(points.length / max);
  const out: ChartPoint[] = [];
  for (let i = points.length - 1; i >= 0; i -= step) out.push(points[i]!);
  if (out[out.length - 1] !== points[0]) out.push(points[0]!);
  return out.reverse();
}

function rangeFrom(key: ChartRangeKey, label: string, window: ChartPoint[], maxPoints: number): ChartRange | null {
  if (window.length < 5) return null;
  const first = window[0]!;
  const last = window[window.length - 1]!;
  let high = first.close;
  let low = first.close;
  for (const point of window) {
    if (point.close > high) high = point.close;
    if (point.close < low) low = point.close;
  }
  return {
    key,
    label,
    points: thinSeries(window, maxPoints),
    changePct: ((last.close - first.close) / first.close) * 100,
    fromDate: first.date,
    high,
    low,
  };
}

/**
 * Cut one series into the range tabs. A window is only offered when the
 * series really covers it (a 5Y tab over two years of data would mislead),
 * and "Max" appears when the series runs longer than the longest window shown.
 */
export function buildChartRanges(series: ReadonlyArray<ChartPoint>, maxPoints = 200): ChartRange[] {
  const clean = cleanSeries(series);
  if (clean.length < 5) return [];
  const first = clean[0]!;
  const last = clean[clean.length - 1]!;
  const out: ChartRange[] = [];
  let longestCovered = 0;
  for (const { key, months } of RANGE_WINDOWS) {
    const cutoff = monthsBefore(last.date, months);
    // Allow a week of slack: listings and holidays rarely line up with the calendar.
    if (dayMs(first.date) - dayMs(cutoff) > 7 * 86_400_000) continue;
    const window = clean.filter((point) => point.date >= cutoff);
    const range = rangeFrom(key, key, window, maxPoints);
    if (range) {
      out.push(range);
      longestCovered = months;
    }
  }
  const spanMonths = (dayMs(last.date) - dayMs(first.date)) / (30.44 * 86_400_000);
  if (spanMonths > longestCovered + 1) {
    const range = rangeFrom("MAX", "Max", clean, maxPoints);
    if (range) out.push(range);
  }
  return out;
}

/**
 * Put today's quote on the end of every range. The stored series is a day or
 * so behind the live price, and the header and the chart must agree.
 */
export function withLivePoint(ranges: ChartRange[], date: string | null | undefined, price: number | null | undefined): ChartRange[] {
  if (!isIsoDay(date) || !fin(price) || price <= 0) return ranges;
  return ranges.map((range) => {
    const points = [...range.points];
    const last = points[points.length - 1];
    if (!last || date < last.date) return range;
    if (last.date === date) points[points.length - 1] = { date, close: price };
    else points.push({ date, close: price });
    const first = points[0]!;
    return {
      ...range,
      points,
      changePct: ((price - first.close) / first.close) * 100,
      high: Math.max(range.high, price),
      low: Math.min(range.low, price),
    };
  });
}

// ─── Sending the ranges to the browser ───────────────────────────────────────

/**
 * The chart's ranges as one series. The ranges overlap (the last month is in
 * every one of them), so each day is sent once: every day any range draws,
 * oldest first, as day gaps and closes, and each range as the positions of
 * its points in that series. About a quarter of the size of the ranges
 * themselves; unpackChartRanges gives back exactly the same ranges.
 */
export type PackedChartRanges = {
  /** The first day of the series. */
  start: string;
  /** Days from each point to the next, one fewer than `closes`. */
  gaps: number[];
  closes: number[];
  ranges: Array<Omit<ChartRange, "points"> & { at: number[] }>;
};

function isoFromDayMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Positions as their first value, then the step from each to the next. */
function deltas(values: number[]): number[] {
  return values.map((value, index) => (index === 0 ? value : value - values[index - 1]!));
}

function undelta(values: number[]): number[] {
  const out: number[] = [];
  let running = 0;
  for (const value of values) {
    running += value;
    out.push(running);
  }
  return out;
}

export function packChartRanges(ranges: ReadonlyArray<ChartRange>): PackedChartRanges | null {
  const closeByDay = new Map<string, number>();
  for (const range of ranges) {
    for (const point of range.points) {
      if (!isIsoDay(point.date)) return null;
      const known = closeByDay.get(point.date);
      // Two ranges disagreeing on a day's close cannot share one series.
      if (known !== undefined && known !== point.close) return null;
      closeByDay.set(point.date, point.close);
    }
  }
  const days = [...closeByDay.keys()].sort();
  if (!days.length) return null;
  const position = new Map(days.map((day, index) => [day, index]));
  const dayNumbers = days.map((day) => dayMs(day) / 86_400_000);
  return {
    start: days[0]!,
    gaps: dayNumbers.slice(1).map((value, index) => value - dayNumbers[index]!),
    closes: days.map((day) => closeByDay.get(day)!),
    ranges: ranges.map(({ points, ...rest }) => ({ ...rest, at: deltas(points.map((point) => position.get(point.date)!)) })),
  };
}

export function unpackChartRanges(packed: PackedChartRanges): ChartRange[] {
  let ms = dayMs(packed.start);
  const days = [packed.start];
  for (const gap of packed.gaps) {
    ms += gap * 86_400_000;
    days.push(isoFromDayMs(ms));
  }
  return packed.ranges.map(({ at, ...rest }) => ({
    ...rest,
    points: undelta(at).map((index) => ({ date: days[index]!, close: packed.closes[index]! })),
  }));
}

// ─── Events on the chart ─────────────────────────────────────────────────────

export type ChartEventKind = "call" | "earnings" | "congress" | "insider";

export type ChartEvent = {
  /** ISO day the thing happened. */
  date: string;
  kind: ChartEventKind;
  title: string;
  detail?: string;
  tone?: "up" | "down" | "flat";
};

export type ChartMarker = {
  /** Index into the range's points. */
  index: number;
  date: string;
  /** The kind that decides the marker's letter and colour (highest priority present). */
  kind: ChartEventKind;
  events: ChartEvent[];
};

const KIND_PRIORITY: Record<ChartEventKind, number> = { call: 0, earnings: 1, insider: 2, congress: 3 };

/**
 * Snap events onto a range. Each event lands on the first plotted day on or
 * after its date. Markers closer together than `minGap` (a fraction of the
 * chart's width) are merged into one, so the lane under the chart never
 * overlaps. When a range is still crowded the lowest-priority, oldest markers
 * are dropped first.
 */
export function placeMarkers(
  points: ReadonlyArray<ChartPoint>,
  events: ReadonlyArray<ChartEvent>,
  options: { maxMarkers?: number; minGap?: number } = {},
): ChartMarker[] {
  const { maxMarkers = 16, minGap = 0.035 } = options;
  if (points.length < 2) return [];
  const first = points[0]!.date;
  const last = points[points.length - 1]!.date;
  const placed: Array<{ index: number; event: ChartEvent }> = [];
  for (const event of events) {
    if (!isIsoDay(event.date) || event.date < first || event.date > last) continue;
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid]!.date < event.date) lo = mid + 1;
      else hi = mid;
    }
    placed.push({ index: lo, event });
  }
  placed.sort((a, b) => a.index - b.index);

  const rank = (a: { index: number; event: ChartEvent }, b: { index: number; event: ChartEvent }) =>
    KIND_PRIORITY[a.event.kind] - KIND_PRIORITY[b.event.kind] || b.index - a.index;
  const gap = Math.max(1, Math.round(minGap * (points.length - 1)));
  const clusters: Array<Array<{ index: number; event: ChartEvent }>> = [];
  for (const item of placed) {
    const cluster = clusters[clusters.length - 1];
    if (cluster && item.index - cluster[0]!.index < gap) cluster.push(item);
    else clusters.push([item]);
  }

  let markers: ChartMarker[] = clusters.map((cluster) => {
    const sorted = [...cluster].sort(rank);
    // The marker sits on its most important event (the latest one on a tie).
    const lead = sorted[0]!;
    return { index: lead.index, date: points[lead.index]!.date, kind: lead.event.kind, events: sorted.map((item) => item.event) };
  });
  if (markers.length > maxMarkers) {
    markers = markers
      .sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || b.index - a.index)
      .slice(0, maxMarkers);
  }
  return markers.sort((a, b) => a.index - b.index);
}

// ─── Our own calls ───────────────────────────────────────────────────────────

export type CallWord = "Add" | "Hold" | "Trim";

/** The pipeline's stance words reduced to the three the page uses. */
export function callWord(stance: string | null | undefined): CallWord | null {
  const key = String(stance ?? "").trim().toLowerCase();
  if (key === "accumulate" || key === "buy" || key === "add") return "Add";
  if (key === "hold" || key === "watch") return "Hold";
  if (key === "trim" || key === "avoid" || key === "sell" || key === "reduce") return "Trim";
  return null;
}

export type CallRecord = { date: string; stance: string; text?: string | null; priceAtCall?: number | null };

export type CallChange = {
  date: string;
  from: CallWord | null;
  to: CallWord;
  text: string | null;
  priceAtCall: number | null;
};

/**
 * Days on which the call changed. The first record is the day coverage began
 * (`from: null`); after that only real switches between add, hold and trim count.
 */
export function callChanges(records: ReadonlyArray<CallRecord>): CallChange[] {
  const sorted = records
    .filter((record) => isIsoDay(record.date) && callWord(record.stance))
    .sort((a, b) => a.date.localeCompare(b.date));
  const out: CallChange[] = [];
  let prev: CallWord | null = null;
  for (const record of sorted) {
    const word = callWord(record.stance)!;
    if (word !== prev) {
      out.push({
        date: record.date,
        from: prev,
        to: word,
        text: record.text?.trim() || null,
        priceAtCall: fin(record.priceAtCall) && record.priceAtCall > 0 ? record.priceAtCall : null,
      });
      prev = word;
    }
  }
  return out;
}

/** Congressional filings report a bracket. "Large" means the bracket tops out at $100,000 or more. */
export function isLargeDisclosedTrade(amountLow: number | null | undefined, amountHigh: number | null | undefined): boolean {
  if (fin(amountHigh)) return amountHigh >= 100_000;
  return fin(amountLow) && amountLow >= 50_000;
}

// ─── Stored valuation history ────────────────────────────────────────────────

export type MultiplePoint = { date: string; value: number };

export type MultipleHistory = {
  points: MultiplePoint[];
  firstDate: string;
  lastDate: string;
  low: number;
  high: number;
  median: number;
  /** Share of stored days with a multiple below the latest one, 0 to 100. */
  percentile: number;
  latest: number;
};

/**
 * Trailing P/E as we stored it day by day in the price snapshots. Returns null
 * under 20 days: a range drawn from a handful of points says nothing.
 */
export function buildMultipleHistory(
  rows: ReadonlyArray<{ captured_at?: string; fundamentals?: { pe_ttm?: number | null } | null }> | null | undefined,
): MultipleHistory | null {
  const byDate = new Map<string, number>();
  for (const row of rows ?? []) {
    const date = String(row.captured_at ?? "").slice(0, 10);
    const value = row.fundamentals?.pe_ttm;
    if (isIsoDay(date) && fin(value) && value > 0 && value < 2000) byDate.set(date, value);
  }
  const points = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value }));
  if (points.length < 20) return null;
  const values = points.map((point) => point.value).sort((a, b) => a - b);
  const latest = points[points.length - 1]!.value;
  const mid = values.length >> 1;
  const median = values.length % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
  const below = values.filter((value) => value < latest).length;
  return {
    points,
    firstDate: points[0]!.date,
    lastDate: points[points.length - 1]!.date,
    low: values[0]!,
    high: values[values.length - 1]!,
    median,
    percentile: (below / values.length) * 100,
    latest,
  };
}

/** Share of the stored days whose multiple was below `value`, 0 to 100. */
export function multiplePercentile(history: Pick<MultipleHistory, "points">, value: number): number {
  if (!history.points.length) return 0;
  const below = history.points.filter((point) => point.value < value).length;
  return (below / history.points.length) * 100;
}
