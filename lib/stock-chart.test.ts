import { describe, expect, it } from "vitest";

import {
  buildChartRanges,
  buildMultipleHistory,
  callChanges,
  callWord,
  cleanSeries,
  foldMovesIntoEarnings,
  isLargeDisclosedTrade,
  monthsBefore,
  multiplePercentile,
  packChartRanges,
  placeMarkers,
  spreadLane,
  stretchChange,
  thinSeries,
  unpackChartRanges,
  unusualMoves,
  withLiveClose,
  type ChartEvent,
  type ChartPoint,
} from "@/lib/stock-chart";

/** One point per calendar day ending on `end`, closes rising by 1 from 100. */
function daily(days: number, end = "2026-11-09"): ChartPoint[] {
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Array.from({ length: days }, (_, index) => ({
    date: new Date(endMs - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10),
    close: 100 + index,
  }));
}

describe("monthsBefore", () => {
  it("steps back whole months and clamps to the month's last day", () => {
    expect(monthsBefore("2026-11-09", 1)).toBe("2026-10-09");
    expect(monthsBefore("2026-03-31", 1)).toBe("2026-02-28");
    expect(monthsBefore("2026-01-15", 12)).toBe("2025-01-15");
  });
});

describe("cleanSeries and thinSeries", () => {
  it("drops bad rows, sorts, and keeps the last close for a repeated day", () => {
    expect(
      cleanSeries([
        { date: "2026-01-03", close: 3 },
        { date: "2026-01-02", close: 2 },
        { date: "2026-01-03", close: 4 },
        { date: "nope", close: 9 },
        { date: "2026-01-04", close: 0 },
        { date: "2026-01-05", close: Number.NaN },
      ]),
    ).toEqual([
      { date: "2026-01-02", close: 2 },
      { date: "2026-01-03", close: 4 },
    ]);
  });

  it("thins to the cap and keeps both ends", () => {
    const series = daily(1000);
    const thin = thinSeries(series, 200);
    expect(thin.length).toBeLessThanOrEqual(201);
    expect(thin[0]).toEqual(series[0]);
    expect(thin[thin.length - 1]).toEqual(series[series.length - 1]);
    expect(thinSeries(series.slice(0, 50), 200)).toHaveLength(50);
  });
});

describe("buildChartRanges", () => {
  it("offers only the windows the series covers, plus Max when it runs longer", () => {
    expect(buildChartRanges(daily(260)).map((range) => range.key)).toEqual(["1M", "6M", "MAX"]);
    expect(buildChartRanges(daily(365 * 2)).map((range) => range.key)).toEqual(["1M", "6M", "1Y", "MAX"]);
    expect(buildChartRanges(daily(365 * 6)).map((range) => range.key)).toEqual(["1M", "6M", "1Y", "5Y", "MAX"]);
  });

  it("does not add Max when it would nearly repeat the longest window", () => {
    expect(buildChartRanges(daily(186)).map((range) => range.key)).toEqual(["1M", "6M"]);
    expect(buildChartRanges(daily(200)).map((range) => range.key)).toEqual(["1M", "6M"]);
  });

  it("measures change from the first close in the window and reports the range", () => {
    const [month] = buildChartRanges(daily(400));
    expect(month!.fromDate).toBe("2026-10-09");
    const first = month!.points[0]!.close;
    const last = month!.points[month!.points.length - 1]!.close;
    expect(month!.changePct).toBeCloseTo(((last - first) / first) * 100, 6);
    expect(month!.high).toBe(last);
    expect(month!.low).toBe(first);
  });

  it("returns nothing for a series too short to draw", () => {
    expect(buildChartRanges(daily(3))).toEqual([]);
    expect(buildChartRanges([])).toEqual([]);
  });
});

describe("withLiveClose", () => {
  const series = daily(120);

  it("appends a newer day, and the ranges cut from it recompute the change", () => {
    const month = buildChartRanges(withLiveClose(series, "2026-11-10", 50))[0]!;
    expect(month.points[month.points.length - 1]).toEqual({ date: "2026-11-10", close: 50 });
    expect(month.changePct).toBeLessThan(0);
    expect(month.low).toBe(50);
    expect(series[series.length - 1]!.date).toBe("2026-11-09");
  });

  it("starts each window one window before the live day, from the full series' own close (thinned or not)", () => {
    // Two years of daily closes: the year is thinned (more than 200 points), and its start must still be the close on
    // the day one year before the live day, not the first point the thinning happened to keep.
    const long = daily(800, "2026-11-09");
    const year = buildChartRanges(withLiveClose(long, "2026-11-10", 5000)).find((range) => range.key === "1Y")!;
    const startDay = monthsBefore("2026-11-10", 12);
    const startClose = long.find((point) => point.date === startDay)!.close;
    expect(year.fromDate).toBe(startDay);
    expect(year.points[0]).toEqual({ date: startDay, close: startClose });
    expect(year.changePct).toBeCloseTo(((5000 - startClose) / startClose) * 100, 6);
    // High and low come from the full year, not from the thinned points.
    const inYear = long.filter((point) => point.date >= startDay).map((point) => point.close);
    expect(year.low).toBe(Math.min(...inYear));
    expect(year.high).toBe(5000);
    // The same price from the same start whichever day the stored series ends on.
    const stale = buildChartRanges(withLiveClose(long.slice(0, -1), "2026-11-10", 5000)).find((range) => range.key === "1Y")!;
    expect(stale.fromDate).toBe(startDay);
    expect(stale.changePct).toBeCloseTo(year.changePct, 6);
  });

  it("replaces the close for the same day and ignores stale or bad quotes", () => {
    const same = withLiveClose(series, "2026-11-09", 500);
    expect(same).toHaveLength(series.length);
    expect(same[same.length - 1]!.close).toBe(500);
    expect(withLiveClose(series, "2026-11-01", 1)).toEqual(series);
    expect(withLiveClose(series, null, 10)).toEqual(series);
    expect(withLiveClose(series, "2026-11-10", 0)).toEqual(series);
  });
});

describe("packChartRanges", () => {
  /** Trading days only (weekends skipped) over `years`, with fractional closes like a stored adjusted series. */
  function tradingDays(years: number): ChartPoint[] {
    const out: ChartPoint[] = [];
    const end = Date.parse("2026-11-10T00:00:00Z");
    for (let ms = end - years * 365 * 86_400_000; ms <= end; ms += 86_400_000) {
      const day = new Date(ms).getUTCDay();
      if (day === 0 || day === 6) continue;
      out.push({ date: new Date(ms).toISOString().slice(0, 10), close: Math.round((50 + Math.sin(ms / 4e9) * 20 + out.length / 100) * 1e4) / 1e4 });
    }
    return out;
  }

  it("gives back exactly the same ranges, live point included", () => {
    const ranges = buildChartRanges(withLiveClose(tradingDays(12), "2026-11-11", 168.7899932861328));
    expect(ranges.map((range) => range.key)).toEqual(["1M", "6M", "1Y", "5Y", "MAX"]);
    const packed = packChartRanges(ranges);
    expect(packed).not.toBeNull();
    expect(unpackChartRanges(JSON.parse(JSON.stringify(packed)))).toEqual(ranges);
  });

  it("sends each day once, so it is much smaller than the ranges", () => {
    const ranges = buildChartRanges(tradingDays(12));
    const packed = packChartRanges(ranges)!;
    const days = new Set(ranges.flatMap((range) => range.points.map((point) => point.date)));
    expect(packed.closes).toHaveLength(days.size);
    expect(JSON.stringify(packed).length).toBeLessThan(JSON.stringify(ranges).length * 0.5);
  });

  it("crosses month and year ends without drifting a day", () => {
    const ranges = buildChartRanges(daily(800, "2026-03-02"));
    expect(unpackChartRanges(packChartRanges(ranges)!)).toEqual(ranges);
  });

  it("declines ranges it cannot share one series for", () => {
    const ranges = buildChartRanges(daily(400));
    const clash = ranges.map((range, index) =>
      index === 0 ? { ...range, points: range.points.map((point, i, all) => (i === all.length - 1 ? { ...point, close: point.close + 1 } : point)) } : range,
    );
    expect(packChartRanges(clash)).toBeNull();
    expect(packChartRanges([])).toBeNull();
  });
});

describe("placeMarkers", () => {
  const points = daily(100);

  it("snaps an event to the first plotted day on or after it and skips events outside the range", () => {
    const sparse = points.filter((_, index) => index % 5 === 0 || index === points.length - 1);
    const target = sparse[4]!.date;
    const dayBefore = new Date(Date.parse(`${target}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const markers = placeMarkers(sparse, [
      { date: dayBefore, kind: "earnings", title: "Reported" },
      { date: "2020-01-01", kind: "earnings", title: "Too old" },
      { date: "2030-01-01", kind: "earnings", title: "Future" },
    ]);
    expect(markers).toHaveLength(1);
    expect(markers[0]!.index).toBe(4);
    expect(markers[0]!.date).toBe(target);
  });

  it("merges neighbours into one marker led by the most important event", () => {
    const markers = placeMarkers(points, [
      { date: points[50]!.date, kind: "congress", title: "Trade" },
      { date: points[51]!.date, kind: "call", title: "Call" },
      { date: points[52]!.date, kind: "earnings", title: "Earnings" },
      { date: points[90]!.date, kind: "earnings", title: "Later" },
    ]);
    expect(markers).toHaveLength(2);
    expect(markers[0]!.kind).toBe("call");
    expect(markers[0]!.index).toBe(51);
    expect(markers[0]!.events.map((event) => event.title)).toEqual(["Call", "Earnings", "Trade"]);
    expect(markers[1]!.index).toBe(90);
  });

  it("drops the least important markers first when crowded", () => {
    const events = [10, 20, 30, 40, 50, 60].map((index, order) => ({
      date: points[index]!.date,
      kind: order === 0 ? ("call" as const) : ("congress" as const),
      title: `event ${order}`,
    }));
    const markers = placeMarkers(points, events, { maxMarkers: 3 });
    expect(markers.map((marker) => marker.index)).toEqual([10, 50, 60]);
  });

  it("needs at least two points", () => {
    expect(placeMarkers(points.slice(0, 1), [{ date: points[0]!.date, kind: "call", title: "x" }])).toEqual([]);
  });
});

describe("calls", () => {
  it("reduces stance words to add, hold and trim", () => {
    expect(callWord("accumulate")).toBe("Add");
    expect(callWord(" Watch ")).toBe("Hold");
    expect(callWord("avoid")).toBe("Trim");
    expect(callWord("")).toBeNull();
    expect(callWord("unknown")).toBeNull();
  });

  it("keeps only the days the call switched", () => {
    const changes = callChanges([
      { date: "2026-03-03", stance: "hold", priceAtCall: 110 },
      { date: "2026-03-01", stance: "accumulate", text: "Add on dips", priceAtCall: 100 },
      { date: "2026-03-02", stance: "accumulate" },
      { date: "2026-03-04", stance: "watch" },
      { date: "2026-03-05", stance: "trim", priceAtCall: 0 },
      { date: "bad", stance: "trim" },
      { date: "2026-03-06", stance: "" },
    ]);
    expect(changes).toEqual([
      { date: "2026-03-01", from: null, to: "Add", text: "Add on dips", priceAtCall: 100 },
      { date: "2026-03-03", from: "Add", to: "Hold", text: null, priceAtCall: 110 },
      { date: "2026-03-05", from: "Hold", to: "Trim", text: null, priceAtCall: null },
    ]);
  });

  it("treats a bracket topping out at $100,000 or more as large", () => {
    expect(isLargeDisclosedTrade(50_001, 100_000)).toBe(true);
    expect(isLargeDisclosedTrade(15_001, 50_000)).toBe(false);
    expect(isLargeDisclosedTrade(1_000_001, null)).toBe(true);
    expect(isLargeDisclosedTrade(null, null)).toBe(false);
  });
});

describe("buildMultipleHistory", () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({
    captured_at: `2026-06-${String(index + 1).padStart(2, "0")}T20:00:00+00:00`,
    fundamentals: { pe_ttm: 20 + index },
  }));

  it("summarises the stored P/E series", () => {
    const history = buildMultipleHistory(rows)!;
    expect(history.points).toHaveLength(30);
    expect(history.firstDate).toBe("2026-06-01");
    expect(history.low).toBe(20);
    expect(history.high).toBe(49);
    expect(history.median).toBe(34.5);
    expect(history.latest).toBe(49);
    expect(multiplePercentile(history, 20)).toBe(0);
    expect(multiplePercentile(history, 35)).toBe(50);
    expect(multiplePercentile(history, 100)).toBe(100);
  });

  it("ignores missing and negative multiples and needs 20 days", () => {
    expect(buildMultipleHistory(rows.slice(0, 19))).toBeNull();
    expect(buildMultipleHistory([...rows.slice(0, 19), { captured_at: "2026-07-01T00:00:00Z", fundamentals: { pe_ttm: -4 } }])).toBeNull();
    expect(buildMultipleHistory(null)).toBeNull();
  });
});

describe("big moves on the chart", () => {
  // 120 weekdays from Jan 1 2026; the market wiggles ±1%, the stock follows it at beta 2 plus its own ±0.5% noise.
  const days: string[] = [];
  for (let ms = Date.UTC(2026, 0, 1); days.length < 120; ms += 86_400_000) {
    const d = new Date(ms);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(d.toISOString().slice(0, 10));
  }
  const marketMoves = days.map((_, i) => (i === 0 ? 0 : i % 2 ? 1 : -1));
  const ownMoves = days.map((_, i) => (i === 0 ? 0 : i % 3 === 0 ? 0.5 : -0.25));
  function build(extra: Record<number, number>, marketExtra: Record<number, number> = {}) {
    let m = 100;
    let s = 100;
    const market: ChartPoint[] = [];
    const stock: ChartPoint[] = [];
    days.forEach((date, i) => {
      const mr = marketMoves[i]! + (marketExtra[i] ?? 0);
      m *= 1 + mr / 100;
      s *= 1 + (2 * mr + ownMoves[i]! + (extra[i] ?? 0)) / 100;
      market.push({ date, close: m });
      stock.push({ date, close: s });
    });
    return { market, stock };
  }

  it("marks a day the stock moved on its own, not a day the market moved it", () => {
    const { market, stock } = build({ 60: -12, 90: 4 }, { 30: -5 });
    const { moves, beta } = unusualMoves(stock, market);
    expect(beta).toBeGreaterThan(1.5);
    const big = moves.filter((move) => move.tier === "big").map((move) => move.date);
    expect(big).toContain(days[60]);
    // Day 30: the market fell 5% and the stock fell about twice that, as it always does: not its own news.
    expect(moves.map((move) => move.date)).not.toContain(days[30]);
  });

  it("never marks a move under the plain floor, however calm the stock", () => {
    const { market, stock } = build({ 50: 2.4 });
    expect(unusualMoves(stock, market, { floorPct: 3 }).moves.map((move) => move.date)).not.toContain(days[50]);
  });

  it("returns nothing on too short a series", () => {
    const { market, stock } = build({});
    expect(unusualMoves(stock.slice(0, 20), market.slice(0, 20)).moves).toEqual([]);
  });

  it("measures a stretch from the close before it starts", () => {
    const points: ChartPoint[] = [
      { date: "2026-11-06", close: 100 },
      { date: "2026-11-09", close: 95 },
      { date: "2026-11-10", close: 90 },
      { date: "2026-11-12", close: 89 },
    ];
    expect(stretchChange(points, "2026-11-09", "2026-11-12")).toBeCloseTo(-11, 5);
    expect(stretchChange(points, "2026-11-09")).toBeCloseTo(-5, 5);
    expect(stretchChange(points, "2026-11-06")).toBeNull();
    expect(stretchChange(points, "2026-12-01")).toBeNull();
  });

  it("folds a move in the two trading days after a report into its E marker", () => {
    const points: ChartPoint[] = ["2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24", "2026-07-27", "2026-08-21"].map((date) => ({ date, close: 1 }));
    const events: ChartEvent[] = [
      { date: "2026-07-22", kind: "earnings", title: "TSLA reported earnings", detail: "After the close" },
      { date: "2026-07-23", kind: "move", title: "weak profit and cash flow", pct: -14.5 },
      { date: "2026-08-21", kind: "move", title: "Robotaxi permit", pct: 5.1 },
    ];
    const out = foldMovesIntoEarnings(events, points);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: "earnings", pct: -14.5, tone: "down", detail: "After the close. Fell 14.5%: weak profit and cash flow" });
    expect(out[1]).toMatchObject({ kind: "move", date: "2026-08-21" });
  });

  it("never folds a move into a report from before the series starts", () => {
    const points: ChartPoint[] = ["2026-03-02", "2026-03-03", "2026-03-04"].map((date) => ({ date, close: 1 }));
    const out = foldMovesIntoEarnings(
      [
        { date: "2025-10-20", kind: "earnings", title: "Old report" },
        { date: "2026-03-03", kind: "move", title: "news", pct: 6 },
      ],
      points,
    );
    expect(out.map((event) => event.kind)).toEqual(["earnings", "move"]);
    expect(out[0]!.pct).toBeUndefined();
  });

  it("lists several reactions in date order and shows the biggest on the E box", () => {
    const points: ChartPoint[] = ["2026-03-06", "2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12"].map((date) => ({ date, close: 1 }));
    const out = foldMovesIntoEarnings(
      [
        { date: "2026-03-07", kind: "earnings", title: "Reported" },
        { date: "2026-03-11", kind: "move", title: "second", pct: -9 },
        { date: "2026-03-09", kind: "move", title: "first", pct: 2 },
        { date: "2026-03-06", kind: "move", title: "before the report", pct: 4 },
      ],
      points,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: "earnings", pct: -9, tone: "down", detail: "Rose 2.0%: first. Fell 9.0%: second" });
    expect(out[1]).toMatchObject({ kind: "move", title: "before the report" });
  });

  it("never draws two markers closer than the gap, even when a cluster's lead sits late in it", () => {
    const points: ChartPoint[] = Array.from({ length: 101 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10), close: 1 }));
    const markers = placeMarkers(
      points,
      [
        { date: points[10]!.date, kind: "congress", title: "trade" },
        { date: points[14]!.date, kind: "insider", title: "insider" },
        { date: points[15]!.date, kind: "earnings", title: "report" },
      ],
      { minGap: 0.05 },
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]!.events.map((event) => event.title)).toEqual(["report", "insider", "trade"]);
  });

  it("gives every move its own marker, even a week from another one going the other way", () => {
    // Tesla: up 5.1% on Aug 21, down 5.9% on Sep 4. One box for both showed one number and both reasons.
    const points: ChartPoint[] = Array.from({ length: 101 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10), close: 1 }));
    const markers = placeMarkers(
      points,
      [
        { date: points[14]!.date, kind: "move", title: "Nevada permit", pct: 5.1 },
        { date: points[15]!.date, kind: "move", title: "Cybercab probe", pct: -5.9 },
        { date: points[15]!.date, kind: "congress", title: "trade" },
      ],
      { minGap: 0.05 },
    );
    expect(markers.map((marker) => [marker.index, marker.kind, marker.events.map((event) => event.title)])).toEqual([
      [14, "move", ["Nevada permit"]],
      [15, "congress", ["trade"]],
      [15, "move", ["Cybercab probe"]],
    ]);
  });
});

describe("thinSeries keeps move days", () => {
  const points: ChartPoint[] = Array.from({ length: 252 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10), close: 100 + i }));

  it("keeps each kept day and the close before it, on top of the even sample", () => {
    const plain = thinSeries(points, 126);
    const dropped = points.find((point) => !plain.includes(point))!;
    const kept = thinSeries(points, 126, new Set([dropped.date]));
    const at = points.indexOf(dropped);
    expect(kept).toContain(dropped);
    expect(kept).toContain(points[at - 1]);
    expect(kept.map((point) => point.date)).toEqual([...kept.map((point) => point.date)].sort());
    expect(kept.at(-1)).toBe(points.at(-1));
    expect(kept[0]).toBe(points[0]);
  });

  it("keeps the next trading day for a date the series skips, and ignores dates past its end", () => {
    const gappy = points.filter((_, index) => index % 7 !== 3);
    const missing = points[3 * 7 + 3]!.date;
    const kept = thinSeries(gappy, 60, new Set([missing, "2099-01-01"]));
    expect(kept.map((point) => point.date)).toContain(points[3 * 7 + 4]!.date);
    expect(kept.length).toBeLessThanOrEqual(62);
  });

  it("passes the kept days through every range", () => {
    const target = points[201]!.date;
    for (const range of buildChartRanges(points, 60, [target])) {
      if (range.fromDate <= target) expect(range.points.map((point) => point.date)).toContain(target);
    }
  });
});

describe("spreadLane", () => {
  it("leaves boxes that do not touch where they are", () => {
    expect(spreadLane([{ x: 50, width: 20 }, { x: 100, width: 20 }], 400)).toEqual([50, 100]);
  });

  it("pushes touching boxes apart around their days", () => {
    const [a, b] = spreadLane([{ x: 100, width: 40 }, { x: 110, width: 40 }], 400, 4);
    expect(b! - a!).toBe(44);
    expect((a! + b!) / 2).toBe(105);
  });

  it("keeps a crowded group inside the lane and never overlaps", () => {
    const items = [{ x: 2, width: 30 }, { x: 6, width: 30 }, { x: 10, width: 30 }, { x: 200, width: 30 }, { x: 205, width: 30 }];
    const out = spreadLane(items, 210, 3);
    expect(out[0]! - 15).toBeGreaterThanOrEqual(0);
    expect(out.at(-1)! + 15).toBeLessThanOrEqual(210);
    for (let i = 1; i < out.length; i += 1) expect(out[i]! - out[i - 1]!).toBeGreaterThanOrEqual(33 - 1e-9);
  });

  it("handles no boxes, and squeezes a row wider than the lane to fit instead of spilling off both ends", () => {
    expect(spreadLane([], 300)).toEqual([]);
    const out = spreadLane(Array.from({ length: 6 }, (_, i) => ({ x: 10 + i, width: 20 })), 100, 3);
    expect(out[0]).toBeCloseTo(10, 9);
    expect(out.at(-1)).toBeCloseTo(90, 9);
    for (let i = 1; i < out.length; i += 1) expect(out[i]!).toBeGreaterThan(out[i - 1]!);
    expect(spreadLane([{ x: 5, width: 50 }], 30)).toEqual([15]);
  });
});

describe("big moves: direction", () => {
  it("skips a day the stock fell less than its beta says it should have", () => {
    const market: ChartPoint[] = [];
    const stock: ChartPoint[] = [];
    let m = 100;
    let s = 100;
    for (let i = 0; i < 80; i += 1) {
      const date = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      const mr = i === 60 ? -5 : i % 2 ? 1 : -1;
      const sr = i === 60 ? -3.5 : 2 * mr + (i % 3 === 0 ? 0.3 : -0.15);
      m *= 1 + mr / 100;
      s *= 1 + sr / 100;
      market.push({ date, close: m });
      stock.push({ date, close: s });
    }
    expect(unusualMoves(stock, market).moves.map((move) => move.date)).not.toContain(market[60]!.date);
  });
});
