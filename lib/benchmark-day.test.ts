import { describe, expect, it } from "vitest";

import { benchmarkForDay, closeWords, etDayOf, quoteDay } from "@/lib/benchmark-day";
import type { MarketAsset } from "@/lib/markets-shared";
import type { ScreenerRow } from "@/lib/screener-shared";

const spyMonday: ScreenerRow = { symbol: "SPY", benchmark: true, price_at: "2026-11-09T21:00:00+00:00", day_pct: 2.6, ret_1m: -3.1, ret_ytd: 11.5, ret_3m: 4 };
const sp500Tuesday = { id: "sp500", as_of: "2026-11-10T21:05:00+00:00", change: { d1: -0.38, w1: 1.2, m1: -3.4, ytd: 11.1, y1: null } } as unknown as MarketAsset;

describe("etDayOf", () => {
  it("uses New York days", () => {
    expect(etDayOf("2026-11-11T00:30:00+00:00")).toBe("2026-11-10");
    expect(etDayOf("nope")).toBeNull();
    expect(etDayOf(undefined)).toBeNull();
  });
});

describe("quoteDay", () => {
  it("takes the day most rows are priced on, ignoring a few stale quotes", () => {
    const rows = [
      { price_at: "2026-11-10T20:59:00+00:00" },
      { price_at: "2026-11-10T20:59:00+00:00" },
      { price_at: "2026-08-31T20:00:00+00:00" },
      {},
    ];
    expect(quoteDay(rows)).toBe("2026-11-10");
  });
  it("falls back when no row has a time", () => {
    expect(quoteDay([{}], "2026-11-09")).toBe("2026-11-09");
  });
});

describe("benchmarkForDay", () => {
  it("swaps a day-old SPY row for the same day's S&P 500", () => {
    const row = benchmarkForDay(spyMonday, "2026-11-10", sp500Tuesday)!;
    expect(row.day_pct).toBe(-0.38);
    expect(row.ret_1m).toBe(-3.4);
    expect(row.ret_ytd).toBe(11.1);
    expect(row.ret_1y).toBeUndefined();
    expect(row.ret_3m).toBeUndefined();
  });
  it("keeps a SPY row priced on the day when the markets read is from another day", () => {
    const tuesdaySpy = { ...spyMonday, price_at: "2026-11-10T21:00:00+00:00" };
    const mondayIndex = { ...sp500Tuesday, as_of: "2026-11-09T21:00:00+00:00" } as MarketAsset;
    expect(benchmarkForDay(tuesdaySpy, "2026-11-10", mondayIndex)).toBe(tuesdaySpy);
  });
  it("drops every return rather than compare two different days", () => {
    const row = benchmarkForDay(spyMonday, "2026-11-10", null)!;
    expect(row.symbol).toBe("SPY");
    expect(row.day_pct).toBeUndefined();
    expect(row.ret_ytd).toBeUndefined();
  });
  it("leaves the row alone when the day is unknown", () => {
    expect(benchmarkForDay(spyMonday, null, sp500Tuesday)).toBe(spyMonday);
  });
});

describe("closeWords", () => {
  it("says the close once the market has closed", () => {
    expect(closeWords("2026-11-10", "Nov 10, 2026", new Date("2026-11-10T22:00:00Z"))).toBe("today's close");
  });
  it("says during trading for today's quotes before 4 PM New York time", () => {
    expect(closeWords("2026-11-11", "Nov 11, 2026", new Date("2026-11-11T15:00:00Z"))).toBe("today, during trading");
  });
  it("an earlier day is always a close, in words within the week", () => {
    expect(closeWords("2026-11-10", "Nov 10, 2026", new Date("2026-11-11T15:00:00Z"))).toBe("yesterday's close");
    // Monday morning: Friday's close.
    expect(closeWords("2026-11-13", "Nov 13, 2026", new Date("2026-11-16T14:00:00Z"))).toBe("Friday's close");
    expect(closeWords("2026-11-03", "Nov 3, 2026", new Date("2026-11-16T14:00:00Z"))).toBe("the Nov 3, 2026 close");
  });
});
