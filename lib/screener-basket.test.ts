import { describe, expect, it } from "vitest";

import type { ChartPoint } from "./stock-chart";
import {
  averageSeries,
  basketSeries,
  basketWindowReturn,
  indexMaxDrawdown,
  indexReturn,
  overlaySeries,
  rangeStart,
  thinAligned,
  thinIndexes,
} from "./screener-basket";

function series(start: string, closes: number[], skip: number[] = []): ChartPoint[] {
  const out: ChartPoint[] = [];
  const day = new Date(`${start}T00:00:00Z`);
  closes.forEach((close, index) => {
    if (!skip.includes(index)) out.push({ date: day.toISOString().slice(0, 10), close });
    day.setUTCDate(day.getUTCDate() + 1);
  });
  return out;
}

describe("basketWindowReturn", () => {
  it("is the simple average of the lines that have a number", () => {
    expect(basketWindowReturn([10, -4, 6])).toEqual({ pct: 4, priced: 3, total: 3 });
    expect(basketWindowReturn([10, null, undefined, 20])).toEqual({ pct: 15, priced: 2, total: 4 });
  });

  it("is null, not zero, when no line has a number", () => {
    expect(basketWindowReturn([null, undefined, Number.NaN])).toBeNull();
    expect(basketWindowReturn([])).toBeNull();
  });

  it("agrees with a basket built day by day from the same prices", () => {
    // Equal dollars in each line on day one, held: the basket's return is the mean of the lines' returns.
    const a = series("2026-01-01", [100, 110, 121]);
    const b = series("2026-01-01", [50, 45, 40]);
    const built = basketSeries({ A: a, B: b }, null, "2026-01-01")!;
    const fromReturns = basketWindowReturn([21, -20])!;
    expect(indexReturn(built.basket)).toBeCloseTo(fromReturns.pct, 10);
  });
});

describe("rangeStart", () => {
  it("measures back from the last close", () => {
    expect(rangeStart("1M", "2026-11-09")).toBe("2026-10-09");
    expect(rangeStart("3M", "2026-11-30")).toBe("2026-08-30");
    expect(rangeStart("1Y", "2024-02-29")).toBe("2023-02-28");
    expect(rangeStart("YTD", "2026-11-09")).toBe("2025-12-31");
    expect(rangeStart("MAX", "2026-11-09")).toBeNull();
  });
});

describe("overlaySeries", () => {
  it("rebases every series to 100 on the shared start date", () => {
    const result = overlaySeries(
      { A: series("2026-01-01", [10, 11, 12]), B: series("2026-01-01", [200, 100, 300]) },
      "2026-01-01",
    )!;
    expect(result.startDate).toBe("2026-01-01");
    expect(result.endDate).toBe("2026-01-03");
    expect(result.series.A!.map((point) => Math.round(point.value * 1e6) / 1e6)).toEqual([100, 110, 120]);
    expect(result.series.B!.map((point) => Math.round(point.value * 1e6) / 1e6)).toEqual([100, 50, 150]);
    expect(result.excluded).toEqual([]);
  });

  it("uses the last close on or before the start when the start is not a trading day", () => {
    // Window starts on Jan 3; A last traded Jan 2.
    const result = overlaySeries({ A: series("2026-01-01", [10, 20, 0, 30], [2]) }, "2026-01-03")!;
    expect(result.startDate).toBe("2026-01-03");
    expect(result.series.A![0]).toEqual({ date: "2026-01-03", value: 100 });
    expect(result.series.A![1]).toEqual({ date: "2026-01-04", value: 150 });
  });

  it("carries the previous close forward over a missing day", () => {
    const result = overlaySeries(
      { A: series("2026-01-01", [10, 11, 12, 13]), B: series("2026-01-01", [10, 0, 0, 20], [1, 2]) },
      "2026-01-01",
    )!;
    expect(result.series.B!.map((point) => point.value)).toEqual([100, 100, 100, 200]);
    expect(result.series.A!).toHaveLength(4);
  });

  it("leaves out a series that starts after the window instead of shortening the window", () => {
    const result = overlaySeries(
      { OLD: series("2026-01-01", [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]), NEW: series("2026-01-12", [5, 6, 7, 8]) },
      "2026-01-01",
    )!;
    expect(result.excluded).toEqual(["NEW"]);
    expect(Object.keys(result.series)).toEqual(["OLD"]);
    expect(result.startDate).toBe("2026-01-01");
  });

  it("allows a week of slack for listings and holidays", () => {
    const result = overlaySeries(
      { OLD: series("2026-01-01", [10, 11, 12, 13, 14, 15, 16, 17]), LATE: series("2026-01-05", [5, 6, 7, 8]) },
      "2026-01-01",
    )!;
    expect(result.excluded).toEqual([]);
    // Everyone starts on the day the latest starter first has a price.
    expect(result.startDate).toBe("2026-01-05");
    expect(result.series.OLD![0]!.value).toBe(100);
    expect(result.series.LATE![0]!.value).toBe(100);
  });

  it("with no start date, shrinks to the history every series shares", () => {
    const result = overlaySeries(
      { OLD: series("2020-01-01", [1, 2, 3, 4, 5, 6]), YOUNG: series("2020-01-04", [10, 20, 30]) },
      null,
    )!;
    expect(result.startDate).toBe("2020-01-04");
    expect(result.excluded).toEqual([]);
    expect(result.series.OLD!.map((point) => point.value)).toEqual([100, 125, 150]);
  });

  it("returns null when nothing usable is left", () => {
    expect(overlaySeries({}, "2026-01-01")).toBeNull();
    expect(overlaySeries({ A: [{ date: "2026-01-01", close: 5 }] }, "2026-01-01")).toBeNull();
    expect(overlaySeries({ A: series("2026-01-01", [1, 2]) }, "2026-06-01")).toBeNull();
  });
});

describe("basketSeries", () => {
  const a = series("2026-01-01", [100, 110, 120, 90]);
  const b = series("2026-01-01", [10, 10, 5, 10]);
  const spy = series("2026-01-01", [400, 404, 408, 412]);

  it("averages the rebased lines: equal weight, bought once, never rebalanced", () => {
    const result = basketSeries({ A: a, B: b }, spy, "2026-01-01")!;
    expect(result.basket.map((point) => point.value)).toEqual([100, 105, 85, 95]);
    expect(result.benchmark!.map((point) => Math.round(point.value * 100) / 100)).toEqual([100, 101, 102, 103]);
    expect(result.members).toEqual(["A", "B"]);
    expect(result.excluded).toEqual([]);
    expect(indexReturn(result.basket)).toBeCloseTo(-5, 10);
    expect(indexMaxDrawdown(result.basket)).toBeCloseTo((85 / 105 - 1) * 100, 10);
  });

  it("is not a daily-rebalanced basket", () => {
    // Daily rebalancing would compound (1.10*1.00+...)... differently; buy and hold lets the winner grow.
    const up = series("2026-01-01", [100, 200, 400]);
    const flat = series("2026-01-01", [100, 100, 100]);
    const result = basketSeries({ UP: up, FLAT: flat }, null, "2026-01-01")!;
    expect(result.basket.map((point) => point.value)).toEqual([100, 150, 250]);
  });

  it("reports the lines it had to leave out and still starts the benchmark on the same day", () => {
    const late = series("2026-01-20", [1, 2, 3]);
    const result = basketSeries({ A: a, B: b, LATE: late }, spy, "2026-01-01")!;
    expect(result.members).toEqual(["A", "B"]);
    expect(result.excluded).toEqual(["LATE"]);
    expect(result.basket[0]!.date).toBe(result.benchmark![0]!.date);
  });

  it("works without a benchmark and returns null without members", () => {
    expect(basketSeries({ A: a }, null, "2026-01-01")!.benchmark).toBeNull();
    expect(basketSeries({}, spy, "2026-01-01")).toBeNull();
  });

  it("does not let a short benchmark history drop basket lines", () => {
    const shortBench = series("2026-01-03", [50, 55]);
    const result = basketSeries({ A: a, B: b }, shortBench, "2026-01-01")!;
    expect(result.members).toEqual(["A", "B"]);
  });
});

describe("series stats", () => {
  it("computes return and drawdown, and nothing from a single point", () => {
    const points = [100, 120, 90, 130].map((value, index) => ({ date: `2026-01-0${index + 1}`, value }));
    expect(indexReturn(points)).toBeCloseTo(30, 10);
    expect(indexMaxDrawdown(points)).toBeCloseTo(-25, 10);
    expect(indexMaxDrawdown(points.slice(0, 2))).toBe(0);
    expect(indexReturn(points.slice(0, 1))).toBeNull();
    expect(indexMaxDrawdown([])).toBeNull();
  });

  it("averages aligned series", () => {
    const one = [{ date: "d1", value: 100 }, { date: "d2", value: 110 }];
    const two = [{ date: "d1", value: 100 }, { date: "d2", value: 90 }];
    expect(averageSeries([one, two])).toEqual([{ date: "d1", value: 100 }, { date: "d2", value: 100 }]);
    expect(averageSeries([])).toEqual([]);
  });
});

describe("thinning", () => {
  it("keeps the first and last index and never repeats one", () => {
    const indexes = thinIndexes(1000, 50);
    expect(indexes[0]).toBe(0);
    expect(indexes[indexes.length - 1]).toBe(999);
    expect(indexes.length).toBeLessThanOrEqual(50);
    expect(new Set(indexes).size).toBe(indexes.length);
    expect(thinIndexes(5, 50)).toEqual([0, 1, 2, 3, 4]);
  });

  it("thins aligned series with the same indexes", () => {
    const values = Array.from({ length: 100 }, (_, index) => index);
    const thinned = thinAligned(values, 10);
    expect(thinned[0]).toBe(0);
    expect(thinned[thinned.length - 1]).toBe(99);
    expect(thinned).toHaveLength(10);
  });
});
