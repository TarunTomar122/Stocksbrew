import { describe, expect, it } from "vitest";

import {
  buildChartRanges,
  buildMultipleHistory,
  callChanges,
  callWord,
  cleanSeries,
  isLargeDisclosedTrade,
  monthsBefore,
  multiplePercentile,
  packChartRanges,
  placeMarkers,
  thinSeries,
  unpackChartRanges,
  withLivePoint,
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

describe("withLivePoint", () => {
  const ranges = buildChartRanges(daily(120));

  it("appends a newer day and recomputes the change", () => {
    const next = withLivePoint(ranges, "2026-11-10", 50);
    const month = next[0]!;
    expect(month.points[month.points.length - 1]).toEqual({ date: "2026-11-10", close: 50 });
    expect(month.changePct).toBeLessThan(0);
    expect(month.low).toBe(50);
    expect(ranges[0]!.points[ranges[0]!.points.length - 1]!.date).toBe("2026-11-09");
  });

  it("replaces the close for the same day and ignores stale or bad quotes", () => {
    const same = withLivePoint(ranges, "2026-11-09", 500)[0]!;
    expect(same.points).toHaveLength(ranges[0]!.points.length);
    expect(same.points[same.points.length - 1]!.close).toBe(500);
    expect(same.high).toBe(500);
    expect(withLivePoint(ranges, "2026-11-01", 1)).toEqual(ranges);
    expect(withLivePoint(ranges, null, 10)).toBe(ranges);
    expect(withLivePoint(ranges, "2026-11-10", 0)).toBe(ranges);
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
    const ranges = withLivePoint(buildChartRanges(tradingDays(12)), "2026-11-11", 168.7899932861328);
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
