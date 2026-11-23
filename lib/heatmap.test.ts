import { describe, expect, it } from "vitest";

import {
  GAP,
  HEAD,
  biggestCompanies,
  dayOf,
  driverOf,
  heatColor,
  heatMix,
  heatSectors,
  heatSummary,
  layoutMap,
  layoutStack,
  mapGroups,
  sectorMovers,
  signedPct,
  withLiveQuotes,
  type HeatStock,
} from "@/lib/heatmap";
import { quoteDay } from "@/lib/benchmark-day";
import type { ScreenerRow } from "@/lib/screener-shared";
import type { SnapshotRow } from "@/lib/types";

const DAY = "2026-11-20";

function row(symbol: string, sector: string, cap: number, day: number | null, extra: Partial<ScreenerRow> = {}): ScreenerRow {
  return {
    symbol,
    name: `${symbol} Inc`,
    sector,
    market_cap: cap,
    price: 100,
    price_at: `${DAY}T21:00:00Z`,
    ...(day === null ? {} : { day_pct: day }),
    ...extra,
  } as ScreenerRow;
}

const ROWS: ScreenerRow[] = [
  row("NVDA", "Technology", 4000e9, -3),
  row("AAPL", "Technology", 3500e9, 1),
  row("MSFT", "Technology", 3000e9, 0.5),
  row("SMALLT", "Technology", 2e9, 12),
  row("JPM", "Financials", 700e9, 1.5),
  row("BAC", "Financials", 300e9, -0.5),
  row("XOM", "Energy", 500e9, 2),
  row("CVX", "Energy", 300e9, 1),
  row("NOCAP", "Energy", 0, 5),
  row("NOSECTOR", "", 100e9, 1),
];

function area(box: { w: number; h: number }): number {
  return box.w * box.h;
}

function quote(symbol: string, current: number, changePct: number, lastUpdated: string): SnapshotRow {
  return { instrumentId: `US_${symbol}`, market: "US", symbol, name: symbol, lastUpdated, price: { current, changePct } };
}

describe("withLiveQuotes", () => {
  it("lays the day's newer quotes over the nightly rows and leaves the rest as they were", () => {
    const monday = "2026-11-23T16:00:00+00:00";
    const rows = withLiveQuotes(ROWS, [
      quote("NVDA", 110, 10, monday),
      // Older than the row: kept out.
      quote("AAPL", 90, -10, "2026-11-19T21:00:00Z"),
      // Broken prices and moves are ignored.
      quote("MSFT", 0, 2, monday),
      quote("JPM", 120, Number.NaN, monday),
      { ...quote("XOM", 120, 3, monday), market: "IN" },
    ]);
    const nvda = rows.find((r) => r.symbol === "NVDA")!;
    expect(nvda.price).toBe(110);
    expect(nvda.day_pct).toBe(10);
    expect(nvda.price_at).toBe(monday);
    expect(nvda.market_cap).toBeCloseTo(4400e9);
    for (const symbol of ["AAPL", "MSFT", "JPM", "XOM"]) expect(rows.find((r) => r.symbol === symbol)).toBe(ROWS.find((r) => r.symbol === symbol));
    // The map's day follows most quotes; with one live quote it stays on the nightly day.
    expect(quoteDay(rows)).toBe(DAY);
    expect(withLiveQuotes(ROWS, [])).toEqual(ROWS);
  });

  it("takes the newest quote when a symbol appears twice", () => {
    const monday = "2026-11-23T16:00:00+00:00";
    const old = { ...quote("NVDA", 50, -50, "2026-08-31T20:00:00Z"), instrumentId: "US_OLD" };
    for (const quotes of [[quote("NVDA", 110, 10, monday), old], [old, quote("NVDA", 110, 10, monday)]]) {
      expect(withLiveQuotes(ROWS, quotes).find((r) => r.symbol === "NVDA")!.day_pct).toBe(10);
    }
  });

  it("moves the map to today once most stocks have today's quote, and greys the ones without", () => {
    const monday = "2026-11-23T16:00:00+00:00";
    const rows = withLiveQuotes(ROWS, ROWS.filter((r) => r.symbol !== "BAC").map((r) => quote(r.symbol!, 101, 1, monday)));
    const day = quoteDay(rows);
    expect(day).toBe("2026-11-23");
    const bac = heatSectors(rows, day).flatMap((s) => s.stocks).find((s) => s.symbol === "BAC")!;
    expect(bac.pct).toBeNull();
  });
});

describe("heatSectors", () => {
  it("groups stocks with a company value by sector, biggest sector and company first", () => {
    const sectors = heatSectors(ROWS, DAY);
    expect(sectors.map((s) => s.slug)).toEqual(["technology", "financials", "energy"]);
    expect(sectors[0]!.stocks.map((s) => s.symbol)).toEqual(["NVDA", "AAPL", "MSFT", "SMALLT"]);
    expect(sectors[2]!.stocks.map((s) => s.symbol)).toEqual(["XOM", "CVX"]);
  });

  it("weights a sector's move by company value and counts who rose", () => {
    const energy = heatSectors(ROWS, DAY).find((s) => s.slug === "energy")!;
    expect(energy.pct).toBeCloseTo((2 * 500 + 1 * 300) / 800, 6);
    expect(energy.rising).toBe(2);
    expect(energy.moved).toBe(2);
  });

  it("lists a ticker once", () => {
    const [energy] = heatSectors([row("XOM", "Energy", 500e9, 1), row("xom", "Energy", 500e9, 1)], DAY);
    expect(energy!.stocks.map((s) => s.symbol)).toEqual(["XOM"]);
  });

  it("leaves out a stock whose price is more than five days older than the map", () => {
    const rows = [row("OLD", "Energy", 900e9, 1, { price_at: "2026-08-31T20:00:00Z" }), row("WEEK", "Energy", 100e9, 1, { price_at: "2026-11-14T21:00:00Z" }), row("NEW", "Energy", 100e9, 1)];
    expect(heatSectors(rows, DAY)[0]!.stocks.map((s) => s.symbol)).toEqual(["NEW"]);
    const weekend = [row("FRI", "Energy", 100e9, 1, { price_at: "2026-11-16T21:00:00Z" }), row("NEW", "Energy", 100e9, 1)];
    expect(heatSectors(weekend, DAY)[0]!.stocks.map((s) => s.symbol).sort()).toEqual(["FRI", "NEW"]);
  });

  it("drops the move of a stock priced on an older day, but keeps its tile", () => {
    const rows = [row("OLD", "Energy", 100e9, 9, { price_at: "2026-11-18T21:00:00Z" }), row("NEW", "Energy", 100e9, 1)];
    const [energy] = heatSectors(rows, DAY);
    expect(energy!.stocks.find((s) => s.symbol === "OLD")!.pct).toBeNull();
    expect(energy!.pct).toBe(1);
    expect(energy!.moved).toBe(1);
  });
});

describe("mapGroups", () => {
  it("takes the biggest companies and keeps every sector on the map", () => {
    const groups = mapGroups(heatSectors(ROWS, DAY), 2, 1);
    const symbols = groups.flatMap((g) => g.stocks.map((s) => s.symbol));
    expect(symbols).toContain("NVDA");
    expect(symbols).toContain("AAPL");
    // Each sector's biggest is added even past the cap.
    expect(symbols).toContain("JPM");
    expect(symbols).toContain("XOM");
    expect(symbols).not.toContain("SMALLT");
  });
});

describe("layoutMap", () => {
  const sectors = heatSectors(ROWS, DAY);
  const groups = mapGroups(sectors, 100);
  const map = layoutMap(groups, 1000, 640);

  it("fills the map with blocks that stay inside it and do not overlap", () => {
    const total = map.blocks.reduce((sum, b) => sum + area(b), 0);
    expect(total).toBeCloseTo(100 * 100, 3);
    for (const b of map.blocks) {
      expect(b.x).toBeGreaterThanOrEqual(-1e-6);
      expect(b.y).toBeGreaterThanOrEqual(-1e-6);
      expect(b.x + b.w).toBeLessThanOrEqual(100 + 1e-6);
      expect(b.y + b.h).toBeLessThanOrEqual(100 + 1e-6);
    }
    for (const [i, a] of map.blocks.entries()) {
      for (const b of map.blocks.slice(i + 1)) {
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(overlapX <= 1e-6 || overlapY <= 1e-6).toBe(true);
      }
    }
  });

  it("gives every company a tile in proportion to its value, the same scale in every sector", () => {
    const tiles = map.blocks.flatMap((b) => b.tiles);
    expect(tiles.map((t) => t.stock.symbol).sort()).toEqual(groups.flatMap((g) => g.stocks.map((s) => s.symbol)).sort());
    const perDollar = tiles.map((t) => (t.px.w * t.px.h) / t.stock.cap);
    const mean = perDollar.reduce((a, b) => a + b, 0) / perDollar.length;
    // The name strip is sized by a few rounds of fitting, so the scale agrees to within a couple of percent.
    for (const value of perDollar) expect(Math.abs(value / mean - 1)).toBeLessThan(0.03);
  });

  it("keeps each block's tiles inside its inside", () => {
    for (const b of map.blocks) {
      const inside = area({ w: (b.w / 100) * 1000 - 2 * GAP, h: (b.h / 100) * 640 - 2 * GAP - HEAD });
      const tiles = b.tiles.reduce((sum, t) => sum + area(t.px), 0);
      expect(tiles).toBeCloseTo(inside, 3);
      for (const t of b.tiles) expect(t.x + t.w).toBeLessThanOrEqual(100 + 1e-6);
    }
  });

  it("is empty without stocks", () => {
    expect(layoutMap([], 1000, 640).blocks).toEqual([]);
  });
});

describe("layoutStack", () => {
  const groups = mapGroups(heatSectors(ROWS, DAY), 100);

  it("stacks every sector full width, each block's height in proportion to its value", () => {
    const stack = layoutStack(groups, 360, { minTile: 1600, maxHeight: 100000, minBlock: 0 });
    expect(stack.blocks.map((b) => b.sector.slug)).toEqual(groups.map((g) => g.sector.slug));
    const [tech, fin] = stack.blocks;
    const techCap = groups[0]!.stocks.reduce((s, x) => s + x.cap, 0);
    const finCap = groups[1]!.stocks.reduce((s, x) => s + x.cap, 0);
    expect(tech!.height / fin!.height).toBeCloseTo(techCap / finCap, 1);
    // The smallest company gets about the asked-for tile.
    const smallest = stack.blocks.flatMap((b) => b.tiles).sort((a, b) => a.stock.cap - b.stock.cap)[0]!;
    expect(area(smallest.px)).toBeGreaterThan(1400);
  });

  it("never grows past the height cap, and keeps a floor under a small block", () => {
    const stack = layoutStack(groups, 360, { minTile: 1e9, maxHeight: 900, minBlock: 44 });
    const total = stack.blocks.reduce((sum, b) => sum + b.height, 0);
    expect(total).toBeLessThanOrEqual(900 + stack.blocks.length * 44);
    for (const b of stack.blocks) expect(b.height).toBeGreaterThanOrEqual(44);
  });
});

describe("colour", () => {
  it("is grey for a flat move, the page colour for none, and stronger with a bigger move", () => {
    expect(heatMix(null)).toBeNull();
    expect(heatMix(0.01)).toBe(0);
    expect(heatMix(0.5)!).toBeLessThan(heatMix(1.5)!);
    expect(heatMix(3)).toBe(heatMix(12));
    expect(heatMix(-2)).toBe(heatMix(2));
    expect(heatColor(undefined)).toBe("var(--oa-bg)");
    expect(heatColor(1)).toContain("--signal-bullish");
    expect(heatColor(-1)).toContain("--signal-bearish");
    expect(heatColor(0)).toContain("--oa-muted-fg");
  });
});

describe("words", () => {
  it("signs moves with a real minus and never shows −0.0%", () => {
    expect(signedPct(1.234)).toBe("+1.2%");
    expect(signedPct(-0.04)).toBe("0.0%");
    expect(signedPct(-3.25)).toBe("−3.3%");
  });

  it("names the stock that moved a sector most, by value times move", () => {
    const stocks: HeatStock[] = [
      { symbol: "BIG", name: "Big", cap: 1000, pct: 1, price: 1 },
      { symbol: "TINY", name: "Tiny", cap: 10, pct: 20, price: 1 },
      { symbol: "DOWN", name: "Down", cap: 500, pct: -2, price: 1 },
    ];
    expect(driverOf(stocks, 1)!.symbol).toBe("BIG");
    expect(driverOf(stocks, -1)!.symbol).toBe("DOWN");
    expect(driverOf(stocks.slice(0, 2), -1)).toBeNull();
  });

  it("lists a sector's best and worst stocks once each, best first", () => {
    const stocks = [5, -1, 3, -4, 0.2, null].map((pct, i): HeatStock => ({ symbol: `S${i}`, name: `S${i}`, cap: 100 - i, pct, price: 1 }));
    expect(sectorMovers(stocks).map((s) => s.pct)).toEqual([5, 3, -1, -4]);
    expect(sectorMovers(stocks.slice(0, 3)).map((s) => s.pct)).toEqual([5, 3, -1]);
  });

  it("finds the biggest companies across sectors", () => {
    expect(biggestCompanies(heatSectors(ROWS, DAY), 3).map((s) => s.symbol)).toEqual(["NVDA", "AAPL", "MSFT"]);
    const rows = [row("BIG", "Energy", 900e9, null), row("MID", "Energy", 500e9, 1), row("LOW", "Energy", 100e9, -1)];
    expect(biggestCompanies(heatSectors(rows, DAY), 2, { moved: true }).map((s) => s.symbol)).toEqual(["MID", "LOW"]);
  });

  it("says the day answer first: the market, then the best and worst sector with what drove each", () => {
    const sectors = heatSectors(ROWS, DAY);
    const market = dayOf(sectors.flatMap((s) => s.stocks));
    const lines = heatSummary(sectors, "on Friday", false);
    expect(lines[0]).toBe(`The ${market.moved} US stocks we cover ${market.pct! > 0 ? "rose" : "fell"} ${Math.abs(market.pct!).toFixed(1)}% on Friday by market value, and ${market.rising} of them closed higher.`);
    expect(lines[1]).toBe("Energy did best, led by XOM.");
    expect(lines[2]).toBe("Technology did worst, pulled down by NVDA.");
    for (const line of lines) expect(line).not.toMatch(/—/);
  });

  it("talks in the present while the market is open, and holds up a sector that only fell less", () => {
    const sectors = heatSectors([row("A", "Energy", 100e9, -0.2), row("B", "Utilities", 100e9, -1)], DAY);
    const lines = heatSummary(sectors, "today", true);
    expect(lines[0]).toBe("The 2 US stocks we cover are down 0.6% today by market value, and 0 of them are higher.");
    expect(lines[1]).toBe("Energy is holding up best, down 0.2%.");
    expect(lines[2]).toBe("Utilities is doing worst, pulled down by B.");
  });

  it("says flat rather than up 0.0%", () => {
    const sectors = heatSectors([row("A", "Energy", 100e9, 0.01), row("B", "Utilities", 100e9, -2)], DAY);
    expect(heatSummary(sectors, "today", false)[1]).toBe("Energy held up best, flat.");
  });

  it("says nothing without a move", () => {
    expect(heatSummary(heatSectors([row("A", "Energy", 1e9, null)], DAY), "today", false)).toEqual([]);
  });
});
