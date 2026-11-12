import { describe, expect, it } from "vitest";

import { barFits, marketMapLayout, tileFits, tileText, tileTextNeed, type MarketMap } from "@/lib/market-map";
import { PRICED_H, headWidth } from "@/lib/treemap-fit-math";
import type { ScreenerRow, SectorStat } from "@/lib/screener-shared";

function stat(name: string): SectorStat {
  return { name, slug: name.toLowerCase(), count: 0, marketCap: 1, change: {}, advancing: null } as unknown as SectorStat;
}

function row(symbol: string, sector: string, day: number, price = 10): ScreenerRow {
  return { symbol, sector, day_pct: day, price } as unknown as ScreenerRow;
}

const weight = (item: ScreenerRow) => Math.sqrt(Math.max(Math.abs((item as unknown as { day_pct: number }).day_pct), 0.06));

/** Every drawn tile holds its label and every bar its sector's name, inside the map. */
function expectReadable(map: MarketMap) {
  for (const block of map.blocks) {
    expect(barFits(block, block.stat.name)).toBe(true);
    for (const tile of block.tiles) {
      expect(tileFits(tile)).toBe(true);
      const need = tileTextNeed(tile.text);
      expect(tile.w).toBeGreaterThanOrEqual(need.w);
      expect(tile.h).toBeGreaterThanOrEqual(need.h);
      expect(tile.x + tile.w).toBeLessThanOrEqual(map.width + 1e-6);
      expect(tile.y + tile.h).toBeLessThanOrEqual(map.height + 1e-6);
    }
  }
}

describe("tile text", () => {
  it("needs more room for a longer ticker or move, and the price line too: every stock tile shows its price", () => {
    const short = tileTextNeed(tileText(row("F", "X", 1.2, 9.5), "day_pct"));
    const longText = tileText(row("GOOGL", "X", -1234.5, 12345.67), "day_pct");
    expect(longText).toEqual({ symbol: "GOOGL", price: "$12,346", move: "−1234.5%" });
    expect(tileTextNeed(longText).w).toBeGreaterThan(short.w);
    expect(tileTextNeed(longText).h).toBe(PRICED_H);
    expect(tileTextNeed({ ...longText, price: "" }).h).toBeLessThan(PRICED_H);
  });

  it("needs less height without a move", () => {
    const text = tileText({ symbol: "ABC", sector: "X" } as unknown as ScreenerRow, "day_pct");
    expect(text).toEqual({ symbol: "ABC", price: "", move: "" });
    expect(tileTextNeed(text).h).toBeLessThan(tileTextNeed({ symbol: "ABC", price: "$1.00", move: "+1.0%" }).h);
  });

  it("holds a bar's name only when the block is wide enough for it", () => {
    expect(barFits({ w: headWidth("Industrials", false) + 4 }, "Industrials")).toBe(true);
    expect(barFits({ w: headWidth("Industrials", false) - 1 }, "Industrials")).toBe(false);
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

  it("never draws a bigger move as a smaller tile, anywhere on the map, whatever its sector", () => {
    const rows = Array.from({ length: 400 }, (_, index) => {
      const sector = index % 10 === 0 ? "Utilities" : index % 3 === 0 ? "Energy" : "Tech";
      return row(`S${index}`, sector, ((index * 37) % 100) / 10 - 5 + (index % 7) * 3.1);
    });
    rows.push(row("XRX", "Utilities", -39.1), row("APPS", "Tech", -35.8));
    for (const width of [700, 940]) {
      const map = marketMapLayout(rows, sectors, "day_pct", weight, width);
      const tiles = map.blocks.flatMap((block) => block.tiles);
      expect(tiles.length).toBeGreaterThan(10);
      const size = (tile: (typeof tiles)[number]) => Math.abs((tile.row as unknown as { day_pct: number }).day_pct);
      for (const a of tiles) {
        for (const b of tiles) {
          if (size(a) > size(b)) expect(a.w * a.h).toBeGreaterThanOrEqual(b.w * b.h * (1 - 1e-6));
        }
      }
    }
  });

  it("still draws every sector, readable, on its last-resort path (eleven sectors, one move dwarfing the rest)", () => {
    const eleven = ["Tech", "Energy", "Utilities", "Health", "Staples", "Materials", "Financials", "Industrials", "Realty", "Comms", "Cyclicals"].map(stat);
    const rows = eleven.map((sector, index) => row(`L${index}`, sector.name, index === 0 ? 900 : 0.01 * (index + 1), 12.34));
    const map = marketMapLayout(rows, eleven, "day_pct", weight, 700);
    expect(map.blocks.map((block) => block.stat.name).sort()).toEqual(eleven.map((sector) => sector.name).sort());
    expect(map.drawn).toBe(11);
    expectReadable(map);
  });

  it("draws nothing without stocks", () => {
    expect(marketMapLayout([], sectors, "day_pct", weight)).toMatchObject({ blocks: [], drawn: 0, total: 0 });
  });
});
