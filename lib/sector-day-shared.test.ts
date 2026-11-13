import { describe, expect, it } from "vitest";

import { sectorStats, type ScreenerRow } from "@/lib/screener-shared";
import { sectorDayStamp, sectorFund, sectorFundDays, sectorMovers, withLiveDayMoves, withSectorFundDays } from "@/lib/sector-day-shared";
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

describe("sectorMovers", () => {
  const quote = (symbol: string, sectorId: string | undefined, changePct: number, lastUpdated = "2026-11-12T20:59:00+00:00", market = "US") =>
    ({ instrumentId: `US_${symbol}`, market, symbol, name: symbol, sectorId, lastUpdated, price: { current: 100, changePct } }) as SnapshotRow;
  const snapshot = [
    quote("NVDA", "technology", -4.43),
    quote("SMCI", "information-technology", -11.3),
    quote("AAPL", "technology", 0.74),
    quote("MSFT", "technology", 0.4),
    quote("ORCL", "technology", -1),
    // Yesterday's quote: another session than the sector's.
    quote("AMD", "technology", 9, "2026-11-11T20:59:00+00:00"),
    quote("XOM", "energy", 1.2),
    quote("LLY", "healthcare", -2),
    quote("XLK", "technology", -0.7),
    quote("SPY", "macro", -0.2),
    quote("RELIANCE", "energy", 5, "2026-11-12T20:59:00+00:00", "IN"),
    // Filed under energy by the snapshot, Materials by the screener: the screener's sector wins.
    quote("NEM", "energy", -4.9),
  ];
  const fundOf: Record<string, string> = {
    NVDA: "xlk",
    SMCI: "xlk",
    AAPL: "xlk",
    MSFT: "xlk",
    ORCL: "xlk",
    AMD: "xlk",
    XOM: "xle",
    LLY: "xlv",
    XLK: "xlk",
    RELIANCE: "xle",
    NEM: "xlb",
  };

  it("gives each sector fund its biggest moves of the day, up or down, biggest first", () => {
    const movers = sectorMovers(snapshot, fundOf, "2026-11-12");
    expect(movers.get("xlk")?.map((mover) => mover.ticker)).toEqual(["SMCI", "NVDA", "ORCL"]);
    expect(movers.get("xle")?.map((mover) => mover.ticker)).toEqual(["XOM"]);
    expect(movers.get("xlv")?.[0]).toEqual({ ticker: "LLY", pct: -2, price: 100 });
    // The fund itself, unplaceable sectors and other markets are not movers.
    expect([...movers.values()].flat().map((mover) => mover.ticker)).not.toContain("XLK");
    expect([...movers.values()].flat().map((mover) => mover.ticker)).not.toContain("RELIANCE");
    expect(movers.has("macro")).toBe(false);
    expect(movers.get("xlb")?.map((mover) => mover.ticker)).toEqual(["NEM"]);
    // A stock the screener does not cover (SPY here) has no sector, so no tile.
    expect(sectorMovers(snapshot, {}, "2026-11-12").size).toBe(0);
  });

  it("never mixes sessions: no day or another day's quotes, no movers", () => {
    expect(sectorMovers(snapshot, fundOf, null).size).toBe(0);
    expect(sectorMovers(snapshot, fundOf, "2026-11-11").get("xlk")?.map((mover) => mover.ticker)).toEqual(["AMD"]);
    expect(sectorMovers([], fundOf, "2026-11-12").size).toBe(0);
    expect(sectorMovers(snapshot, fundOf, "2026-11-12", 1).get("xlk")).toHaveLength(1);
  });

  it("names each screener sector's fund", () => {
    expect(sectorFund("Information Technology")).toBe("xlk");
    expect(sectorFund("Health Care")).toBe("xlv");
    expect(sectorFund("Communication Services")).toBe("xlc");
    expect(sectorFund("Real Estate")).toBe("xlre");
    expect(sectorFund("Macro")).toBeNull();
    expect(sectorFund(undefined)).toBeNull();
  });
});
