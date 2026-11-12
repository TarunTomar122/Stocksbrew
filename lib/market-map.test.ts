import { describe, expect, it } from "vitest";

import { marketMapLayout, tileFits, tileText, type MarketMap } from "@/lib/market-map";
import { fitStep, stockTileNeeds } from "@/lib/treemap-fit-math";
import type { ScreenerRow, SectorStat } from "@/lib/screener-shared";

function stat(name: string): SectorStat {
  return { name, slug: name.toLowerCase(), count: 0, marketCap: 1, change: {}, advancing: null } as unknown as SectorStat;
}

function row(symbol: string, sector: string, day: number, price = 10): ScreenerRow {
  return { symbol, sector, day_pct: day, price } as unknown as ScreenerRow;
}

const weight = (item: ScreenerRow) => Math.max(Math.abs((item as unknown as { day_pct: number }).day_pct), 0.06);

/** Every drawn tile holds its own three lines at 12px (the widths its stylesheet hides them under), inside the map. */
function expectReadable(map: MarketMap) {
  for (const block of map.blocks) {
    for (const tile of block.tiles) {
      expect(tileFits(tile)).toBe(true);
      const need = stockTileNeeds(tile.text);
      expect(tile.w).toBeGreaterThanOrEqual(need.w);
      expect(tile.h).toBeGreaterThanOrEqual(need.h);
      expect(tile.x + tile.w).toBeLessThanOrEqual(map.width + 1e-6);
      expect(tile.y + tile.h).toBeLessThanOrEqual(map.height + 1e-6);
    }
  }
}

describe("tile text", () => {
  it("needs more room for a longer ticker, price or move, in the stylesheet's 10px steps", () => {
    const short = stockTileNeeds(tileText(row("F", "X", 1.2, 9.5), "day_pct"));
    const longText = tileText(row("GOOGL", "X", -1234.5, 12345.67), "day_pct");
    expect(longText).toEqual({ symbol: "GOOGL", price: "$12,346", move: "−1234.5%" });
    const long = stockTileNeeds(longText);
    expect(long.w).toBeGreaterThan(short.w);
    expect(long.w % 10).toBe(0);
    expect(fitStep(1)).toBe(30);
    expect(fitStep(1000)).toBe(300);
  });

  it("needs less height without a price or a move", () => {
    const text = tileText({ symbol: "ABC", sector: "X" } as unknown as ScreenerRow, "day_pct");
    expect(text).toEqual({ symbol: "ABC", price: "", move: "" });
    expect(stockTileNeeds(text).h).toBeLessThan(stockTileNeeds({ symbol: "ABC", price: "$1.00", move: "+1.0%" }).h);
  });
});

describe("the market map layout", () => {
  const sectors = ["Tech", "Energy", "Utilities"].map(stat);

  it("draws only tiles that hold their own words, at each width it is laid out for", () => {
    const rows = Array.from({ length: 400 }, (_, index) => {
      const sector = index % 10 === 0 ? "Utilities" : index % 3 === 0 ? "Energy" : "Tech";
      return row(`S${index}`, sector, ((index * 37) % 100) / 10 - 5);
    });
    for (const width of [700, 940]) {
      const map = marketMapLayout(rows, sectors, "day_pct", weight, width);
      expect(map.width).toBe(width);
      expect(map.total).toBe(400);
      expect(map.drawn).toBeGreaterThan(sectors.length);
      expect(map.drawn).toBeLessThan(400);
      expectReadable(map);
      for (const block of map.blocks) {
        const members = rows.filter((item) => item.sector === block.stat.name);
        const biggest = [...members].sort((a, b) => weight(b) - weight(a))[0]!;
        expect(block.tiles.some((tile) => tile.row.symbol === biggest.symbol)).toBe(true);
        expect(block.hidden).toBe(members.length - block.tiles.length);
      }
    }
  });

  it("stays readable with long tickers and prices", () => {
    const rows = Array.from({ length: 120 }, (_, index) => row(`LONGT${index}`, sectors[index % 3]!.name, (index % 17) - 8, 98765.43));
    expectReadable(marketMapLayout(rows, sectors, "day_pct", weight, 700));
  });

  it("stays readable when one move dwarfs every other, even with only the sector leaders left", () => {
    const rows = [row("MOON", "Tech", 900, 1.23), row("TECH2", "Tech", 0.1), row("FLAT", "Utilities", 0.01, 12345), row("QUIET", "Energy", -0.02, 0.5)];
    const map = marketMapLayout(rows, sectors, "day_pct", weight, 700);
    expect(map.blocks.map((block) => block.stat.name).sort()).toEqual(["Energy", "Tech", "Utilities"]);
    expectReadable(map);
  });

  it("draws nothing without stocks", () => {
    expect(marketMapLayout([], sectors, "day_pct", weight)).toMatchObject({ blocks: [], drawn: 0, total: 0 });
  });
});
