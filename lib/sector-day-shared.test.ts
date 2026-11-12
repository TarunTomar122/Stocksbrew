import { describe, expect, it } from "vitest";

import { sectorStats, type ScreenerRow } from "@/lib/screener-shared";
import { sectorDayStamp, sectorFundDays, withLiveDayMoves, withSectorFundDays } from "@/lib/sector-day-shared";
import { dayLabelFor } from "@/lib/session-label";
import type { SnapshotRow } from "@/lib/types";

// The judges' Nov 12 case: the snapshot built yesterday at 5:51 PM ET holds Wednesday's +3.65% Tech day; the sector
// fund and the live quotes hold Thursday's.
const BUILT = "2026-11-11T22:51:32+00:00";
const rows = [
  { symbol: "NVDA", name: "NVIDIA", sector: "Technology", market_cap: 4e12, day_pct: 4.1, price: 173.73, price_at: "2026-11-11T20:59:00+00:00", ret_1m: -5 },
  { symbol: "AAPL", name: "Apple", sector: "Technology", market_cap: 4e12, day_pct: 3.2, price: 270, price_at: "2026-11-11T20:59:00+00:00", ret_1m: 2 },
  { symbol: "XOM", name: "Exxon", sector: "Energy", market_cap: 5e11, day_pct: 1, price: 120, price_at: "2026-11-11T20:59:00+00:00" },
] as ScreenerRow[];
const live = [
  { instrumentId: "US_NVDA", market: "US", symbol: "NVDA", name: "NVIDIA", lastUpdated: "2026-11-12T20:59:00+00:00", price: { current: 166.04, changePct: -4.43 } },
  { instrumentId: "US_AAPL", market: "US", symbol: "AAPL", name: "Apple", lastUpdated: "2026-11-12T20:59:00+00:00", price: { current: 272, changePct: 0.74 } },
  // An older quote than the row: left alone.
  { instrumentId: "US_XOM", market: "US", symbol: "XOM", name: "Exxon", lastUpdated: "2026-11-10T20:59:00+00:00", price: { current: 119, changePct: -2 } },
] as SnapshotRow[];
const assets = [
  { id: "xlk", as_of: "2026-11-12T21:00:00+00:00", change: { d1: -0.7 } },
  { id: "xle", as_of: "2026-11-12T21:00:00+00:00", change: { d1: 0.4 } },
  { id: "spy", as_of: "2026-11-12T21:00:00+00:00", change: { d1: -0.2 } },
] as never;

describe("sector day", () => {
  it("gives a sector the same day as Market today: its sector fund's move", () => {
    const funds = sectorFundDays(assets);
    expect(funds.get("technology")).toEqual({ fund: "XLK", pct: -0.7, asOf: "2026-11-12T21:00:00+00:00" });
    expect(funds.has("spy")).toBe(false);
    const stats = withSectorFundDays(sectorStats(withLiveDayMoves(rows, live)), funds);
    const tech = stats.find((stat) => stat.slug === "technology")!;
    expect(tech.change.day_pct).toBe(-0.7);
    // The longer periods stay the members' own.
    expect(tech.change.ret_1m).toBeCloseTo(-1.5, 5);
  });

  it("moves each stock to its live quote, so breadth and best/worst are today's too", () => {
    const moved = withLiveDayMoves(rows, live);
    expect(moved.find((row) => row.symbol === "NVDA")).toMatchObject({ day_pct: -4.43, price: 166.04, price_at: "2026-11-12T20:59:00+00:00" });
    expect(moved.find((row) => row.symbol === "XOM")?.day_pct).toBe(1);
    const tech = sectorStats(moved).find((stat) => stat.slug === "technology")!;
    expect(tech.advancing).toBe(50);
    expect(tech.best).toEqual({ symbol: "AAPL", pct: 0.74 });
    expect(withLiveDayMoves(rows, [])).toEqual(rows);
  });

  it("labels the tab by the day the figures are from", () => {
    const thursday = Date.parse("2026-11-12T20:03:00Z"); // 3:03 PM ET
    const funds = sectorFundDays(assets);
    expect(dayLabelFor(sectorDayStamp(funds, rows), "Today", thursday)).toBe("Today");
    // Without the live figures, the snapshot's own build says yesterday, never today.
    expect(dayLabelFor(BUILT, "Today", thursday)).toBe("Yesterday");
    expect(sectorDayStamp(new Map(), withLiveDayMoves(rows, live))).toBe("2026-11-12T20:59:00+00:00");
  });
});
