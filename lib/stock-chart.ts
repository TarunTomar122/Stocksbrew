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

/**
 * Keep at most `max` points, sampled evenly from the end so the latest close survives. Days in `keep` (a marked move)
 * survive too, with the close before each: a move is drawn from that close, and a mark on a thinned-away day would
 * snap to the next plotted day and show the wrong date and price (Tesla's Sep 4 drop read "Sep 8").
 */
export function thinSeries(points: ChartPoint[], max: number, keep: ReadonlySet<string> = new Set()): ChartPoint[] {
  if (points.length <= max || max < 2) return points;
  const step = Math.ceil(points.length / max);
  const picked = new Set<number>();
  for (let i = points.length - 1; i >= 0; i -= step) picked.add(i);
  picked.add(0);
  for (const date of keep) {
    // The first trading day on or after it, the day a mark on `date` snaps to.
    let lo = 0;
    let hi = points.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid]!.date < date) lo = mid + 1;
      else hi = mid;
    }
    if (lo >= points.length) continue;
    picked.add(lo);
    if (lo > 0) picked.add(lo - 1);
  }
  return [...picked].sort((a, b) => a - b).map((index) => points[index]!);
}

function rangeFrom(key: ChartRangeKey, label: string, window: ChartPoint[], maxPoints: number, keep?: ReadonlySet<string>): ChartRange | null {
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
    points: thinSeries(window, maxPoints, keep),
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
export function buildChartRanges(series: ReadonlyArray<ChartPoint>, maxPoints = 200, keepDates: ReadonlyArray<string> = []): ChartRange[] {
  const clean = cleanSeries(series);
  const keep = new Set(keepDates);
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
    const range = rangeFrom(key, key, window, maxPoints, keep);
    if (range) {
      out.push(range);
      longestCovered = months;
    }
  }
  const spanMonths = (dayMs(last.date) - dayMs(first.date)) / (30.44 * 86_400_000);
  if (spanMonths > longestCovered + 1) {
    const range = rangeFrom("MAX", "Max", clean, maxPoints, keep);
    if (range) out.push(range);
  }
  return out;
}

/**
 * The series with today's quote on the end (or in place of today's stored close). The stored series is a day or so
 * behind the live price, and the header and the chart must agree. Done on the whole series, before the ranges are
 * windowed and thinned (buildChartRanges), so each window starts one window's length before the live day and its
 * first close, high and low come from the full history (council, ship 85).
 */
export function withLiveClose(series: ReadonlyArray<ChartPoint>, date: string | null | undefined, price: number | null | undefined): ChartPoint[] {
  const clean = cleanSeries(series);
  if (!isIsoDay(date) || !fin(price) || price <= 0) return clean;
  const last = clean[clean.length - 1];
  if (!last || date < last.date) return clean;
  if (last.date === date) return [...clean.slice(0, -1), { date, close: price }];
  return [...clean, { date, close: price }];
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

export type ChartEventKind = "call" | "earnings" | "move" | "congress" | "insider";

export type ChartEvent = {
  /** ISO day the thing happened. */
  date: string;
  kind: ChartEventKind;
  title: string;
  detail?: string;
  tone?: "up" | "down" | "flat";
  /** A "move": the change in percent, close to close, from the day before `date` to `endDate` (or `date`). */
  pct?: number;
  /** A "move" that ran over several days on one story: its last day. */
  endDate?: string;
};

export type ChartMarker = {
  /** Index into the range's points. */
  index: number;
  date: string;
  /** The kind that decides the marker's letter and colour (highest priority present). */
  kind: ChartEventKind;
  events: ChartEvent[];
};

const KIND_PRIORITY: Record<ChartEventKind, number> = { call: 0, earnings: 1, move: 2, insider: 3, congress: 4 };

/**
 * Snap events onto a range. Each event lands on the first plotted day on or
 * after its date. Markers closer together than `minGap` (a fraction of the
 * chart's width) are merged into one, except moves, which always keep their
 * own marker (two can share a day; spreadLane keeps their boxes apart). When a
 * range is still crowded the lowest-priority, oldest markers are dropped first.
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

  // A move always gets its own box: its number is the point, and two moves a week apart (Tesla up 5.1% on Aug 21,
  // down 5.9% on Sep 4) folded into one box would show one number for both, sometimes the wrong way. The lane spreads
  // boxes that would overlap (spreadLane); everything else still groups by the gap.
  const moves = placed.filter((item) => item.event.kind === "move");
  const rest = placed.filter((item) => item.event.kind !== "move");

  const rank = (a: { index: number; event: ChartEvent }, b: { index: number; event: ChartEvent }) =>
    KIND_PRIORITY[a.event.kind] - KIND_PRIORITY[b.event.kind] || b.index - a.index;
  const gap = Math.max(1, Math.round(minGap * (points.length - 1)));
  const clusters: Array<Array<{ index: number; event: ChartEvent }>> = [];
  for (const item of rest) {
    const cluster = clusters[clusters.length - 1];
    if (cluster && item.index - cluster[0]!.index < gap) cluster.push(item);
    else clusters.push([item]);
  }

  // A cluster is grouped from its first event but drawn on its lead, which can sit up to gap − 1 days later: merge
  // again while two leads are closer than the gap, or the next cluster's box lands right on top of this one.
  const leadOf = (cluster: Array<{ index: number; event: ChartEvent }>) => [...cluster].sort(rank)[0]!;
  const spaced: Array<Array<{ index: number; event: ChartEvent }>> = [];
  for (const cluster of clusters) {
    let current = cluster;
    while (spaced.length && Math.abs(leadOf(current).index - leadOf(spaced[spaced.length - 1]!).index) < gap) {
      current = [...spaced.pop()!, ...current];
    }
    spaced.push(current);
  }

  let markers: ChartMarker[] = [...spaced, ...moves.map((item) => [item])].map((cluster) => {
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

/**
 * Where the boxes in the marker lane go, in pixels: each as close to its own day as it can be without touching its
 * neighbours. Boxes that would overlap are pushed apart as a group centred on their days, and the lane's ends hold.
 * `items` are box centres and widths in lane order; returns the new centres in the same order.
 */
export function spreadLane(items: ReadonlyArray<{ x: number; width: number }>, laneWidth: number, pad = 3): number[] {
  type Group = { first: number; last: number; width: number; centre: number };
  const groups: Group[] = [];
  const place = (group: Group) => {
    const ideal = items.slice(group.first, group.last + 1).reduce((sum, item) => sum + item.x, 0) / (group.last - group.first + 1);
    const half = group.width / 2;
    group.centre = laneWidth >= group.width ? Math.min(laneWidth - half, Math.max(half, ideal)) : laneWidth / 2;
  };
  items.forEach((item, index) => {
    let group: Group = { first: index, last: index, width: item.width, centre: item.x };
    place(group);
    for (;;) {
      const before = groups[groups.length - 1];
      if (!before || before.centre + before.width / 2 + pad <= group.centre - group.width / 2) break;
      groups.pop();
      group = { first: before.first, last: group.last, width: before.width + pad + group.width, centre: 0 };
      place(group);
    }
    groups.push(group);
  });
  const out: number[] = [];
  for (const group of groups) {
    const count = group.last - group.first + 1;
    // A group wider than the whole lane (a phone with many marks) is squeezed to fit, overlapping evenly, rather than
    // spilling off both ends where the outer boxes would be cut off.
    const squeeze = group.width > laneWidth && count > 1;
    const gapBetween = squeeze ? pad - (group.width - laneWidth) / (count - 1) : pad;
    let left = squeeze ? 0 : group.centre - group.width / 2;
    for (let i = group.first; i <= group.last; i += 1) {
      out.push(left + items[i]!.width / 2);
      left += items[i]!.width + gapBetween;
    }
  }
  return out;
}

// ─── Days the stock moved on its own news ────────────────────────────────────

export type UnusualMove = {
  date: string;
  /** The trading day before, whose close the move is measured from. */
  prev: string;
  /** The stock's change that day, in percent. */
  pct: number;
  /** The part the market does not explain: pct − beta × the market's change. */
  excess: number;
  /**
   * "big": unusual for this stock even after the market (2.5 of its own daily spreads), marked whenever a reason is
   * found. "news": smaller (1.5 spreads) and marked only when the reason is news about the company itself.
   */
  tier: "big" | "news";
};

/**
 * The size half of the rule for marking a move on the chart: which days moved far more than this stock usually moves,
 * after taking out what the market did that day. One bar per stock, so a 4% day counts on Coca-Cola and not on Nvidia.
 * The other half (a reason in the day's news, about the company) is the model's; a day with no such reason gets no mark.
 *
 * Measured over the last `lookbackDays` trading days the two series share. A day must also move at least `floorPct`
 * in plain terms: a 2% day is never "big news" to someone holding the stock.
 */
export function unusualMoves(
  stock: ReadonlyArray<ChartPoint>,
  market: ReadonlyArray<ChartPoint>,
  options: { lookbackDays?: number; bigSpreads?: number; newsSpreads?: number; floorPct?: number } = {},
): { moves: UnusualMove[]; beta: number; spread: number } {
  const { lookbackDays = 252, bigSpreads = 2.5, newsSpreads = 1.5, floorPct = 3 } = options;
  const marketClose = new Map(cleanSeries(market).map((point) => [point.date, point.close]));
  const clean = cleanSeries(stock);
  const days: Array<{ date: string; prev: string; r: number; m: number }> = [];
  for (let i = 1; i < clean.length; i += 1) {
    const today = clean[i]!;
    const before = clean[i - 1]!;
    const m1 = marketClose.get(today.date);
    const m0 = marketClose.get(before.date);
    if (m1 === undefined || m0 === undefined) continue;
    days.push({ date: today.date, prev: before.date, r: (today.close / before.close - 1) * 100, m: (m1 / m0 - 1) * 100 });
  }
  const window = days.slice(-lookbackDays);
  if (window.length < 40) return { moves: [], beta: 1, spread: 0 };
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const rMean = mean(window.map((day) => day.r));
  const mMean = mean(window.map((day) => day.m));
  let cov = 0;
  let varM = 0;
  for (const day of window) {
    cov += (day.r - rMean) * (day.m - mMean);
    varM += (day.m - mMean) ** 2;
  }
  const beta = varM > 0 ? cov / varM : 1;
  const excess = window.map((day) => day.r - beta * day.m);
  const exMean = mean(excess);
  const spread = Math.sqrt(mean(excess.map((value) => (value - exMean) ** 2)));
  const moves: UnusualMove[] = [];
  window.forEach((day, index) => {
    const ex = excess[index]!;
    if (Math.abs(day.r) < floorPct || !(spread > 0)) return;
    // The move and its market-adjusted part must point the same way: a stock that fell 3% on a day the market fell 5%
    // did well that day, and a "▼3%" box would say the opposite of the news.
    if (Math.sign(ex) !== Math.sign(day.r)) return;
    const size = Math.abs(ex) / spread;
    if (size >= bigSpreads) moves.push({ date: day.date, prev: day.prev, pct: day.r, excess: ex, tier: "big" });
    else if (size >= newsSpreads) moves.push({ date: day.date, prev: day.prev, pct: day.r, excess: ex, tier: "news" });
  });
  return { moves, beta, spread };
}

/**
 * The change over a stretch, close to close: from the close before `start` to the close on `end`. Null when the
 * series does not cover it.
 */
export function stretchChange(points: ReadonlyArray<ChartPoint>, start: string, end: string = start): number | null {
  const clean = cleanSeries(points);
  const startIndex = clean.findIndex((point) => point.date >= start);
  if (startIndex < 1) return null;
  let endIndex = -1;
  for (let i = clean.length - 1; i >= startIndex; i -= 1) {
    if (clean[i]!.date <= end) {
      endIndex = i;
      break;
    }
  }
  if (endIndex < startIndex) return null;
  return (clean[endIndex]!.close / clean[startIndex - 1]!.close - 1) * 100;
}

/**
 * A move on the trading day of an earnings report or the two after it is the report's reaction, not news of its own:
 * it goes into the "E" marker's tooltip ("Fell 14.5% the next day") instead of a second marker beside it.
 */
export function foldMovesIntoEarnings(events: ReadonlyArray<ChartEvent>, points: ReadonlyArray<ChartPoint>): ChartEvent[] {
  const days = cleanSeries(points).map((point) => point.date);
  // Null before the series starts: a report from before the first close would otherwise count as day 0 and take in
  // the moves of the series' first days.
  const tradingIndex = (date: string) => {
    if (!days.length || date < days[0]!) return null;
    const at = days.findIndex((day) => day >= date);
    return at < 0 ? days.length : at;
  };
  const earnings = events.filter((event) => event.kind === "earnings");
  const folded = new Map<ChartEvent, ChartEvent[]>();
  const out: ChartEvent[] = [];
  for (const event of events) {
    if (event.kind !== "move") continue;
    const at = tradingIndex(event.date);
    if (at === null) continue;
    const report = earnings.find((item) => {
      const reportAt = tradingIndex(item.date);
      return reportAt !== null && at >= reportAt && at - reportAt <= 2;
    });
    if (report) folded.set(report, [...(folded.get(report) ?? []), event]);
  }
  const foldedMoves = new Set([...folded.values()].flat());
  for (const event of events) {
    if (foldedMoves.has(event)) continue;
    const moves = folded.get(event);
    if (!moves) {
      out.push(event);
      continue;
    }
    // In date order for the text; the box shows the biggest of them.
    moves.sort((a, b) => a.date.localeCompare(b.date));
    const biggest = moves.reduce((best, move) => (Math.abs(move.pct ?? 0) > Math.abs(best.pct ?? 0) ? move : best));
    const reaction = moves
      .map((move) => {
        const pct = move.pct ?? 0;
        const verb = pct >= 0 ? "Rose" : "Fell";
        return `${verb} ${Math.abs(pct).toFixed(1)}%: ${move.title}`;
      })
      .join(". ");
    out.push({ ...event, detail: event.detail ? `${event.detail}. ${reaction}` : reaction, pct: biggest.pct, tone: (biggest.pct ?? 0) >= 0 ? "up" : "down" });
  }
  return out;
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
