/**
 * The screener's market map layout (components/screener/sector-map.tsx): stocks grouped into sector blocks, each tile
 * as big as its stock's move. Laid out in CSS pixels for the narrowest width the map is drawn at (`width`), so a tile
 * only gets bigger on a wider screen. Every drawn tile is big enough for its own ticker, price and move at 12px, by the
 * same widths its stylesheet hides them at (lib/treemap-fit-math.ts); the map draws each sector's biggest movers that
 * fit and grows taller before it lets a tile come out too small. Pure, so it runs on the server and is unit tested.
 */

import { isFiniteNumber, squarify, type ScreenerRow, type SectorPeriod, type SectorStat } from "@/lib/screener-shared";
import { stockTileNeeds } from "@/lib/treemap-fit-math";

/** The heights tried, as shares of the width, shortest first: the map grows before a tile is drawn too small. */
const MAP_RATIOS = [0.6, 0.72, 0.85, 1, 1.2];
/** A sector block's name bar (one 12px line), and the space around a block. */
export const MAP_HEAD = 20;
export const MAP_GAP = 2;
/** Never more tiles than this, however many fit. */
const MAX_TILES = 160;
/** A map showing at least this many stocks is enough; below it, a taller map is tried. */
const TARGET_TILES = 40;
/** A tile's own 1px gap, and a pixel to spare. */
const TILE_SPARE = 2;

export type TileText = { symbol: string; price: string; move: string };
export type MapTile = { x: number; y: number; w: number; h: number; row: ScreenerRow; text: TileText };
export type MapBlock = { x: number; y: number; w: number; h: number; stat: SectorStat; tiles: MapTile[]; hidden: number };
export type MarketMap = { width: number; height: number; blocks: MapBlock[]; drawn: number; total: number };

/** "−3.2%", "+12.0%": one decimal, a real minus. */
export function signedMove(value: number, digits = 1): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;
}

/** A tile's price, short: "$1,234" from a thousand up, "$56.78" below. */
export function tilePrice(price: number): string {
  return price >= 1000 ? `$${Math.round(price).toLocaleString("en-US")}` : `$${price.toFixed(2)}`;
}

export function tileText(row: ScreenerRow, period: SectorPeriod): TileText {
  const value = row[period];
  return {
    symbol: row.symbol,
    price: isFiniteNumber(row.price) && row.price > 0 ? tilePrice(row.price) : "",
    move: isFiniteNumber(value) ? signedMove(value) : "",
  };
}

/** The tile holds its ticker, price and move at 12px (the widths and heights its stylesheet hides them under). */
export function tileFits(tile: { w: number; h: number; text: TileText }): boolean {
  const need = stockTileNeeds(tile.text);
  return tile.w - TILE_SPARE >= need.w && tile.h - TILE_SPARE >= need.h;
}

function place(
  chosen: ReadonlyMap<string, ScreenerRow[]>,
  stats: readonly SectorStat[],
  groups: ReadonlyMap<string, ScreenerRow[]>,
  weight: (row: ScreenerRow) => number,
  period: SectorPeriod,
  width: number,
  height: number,
): MapBlock[] {
  const blocks = squarify(
    stats
      .filter((stat) => (chosen.get(stat.name)?.length ?? 0) > 0)
      .map((stat) => ({ value: chosen.get(stat.name)!.reduce((sum, row) => sum + weight(row), 0), data: stat })),
    0,
    0,
    width,
    height,
  );
  return blocks.map((block) => {
    const stat = block.data;
    const drawn = chosen.get(stat.name) ?? [];
    const inner = { x: block.x + MAP_GAP, y: block.y + MAP_GAP + MAP_HEAD, w: block.w - MAP_GAP * 2, h: block.h - MAP_GAP * 2 - MAP_HEAD };
    const tiles =
      inner.w > 0 && inner.h > 0
        ? squarify(
            drawn.map((row) => ({ value: weight(row), data: row })),
            inner.x,
            inner.y,
            inner.w,
            inner.h,
          ).map((rect) => ({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, row: rect.data, text: tileText(rect.data, period) }))
        : [];
    return { x: block.x, y: block.y, w: block.w, h: block.h, stat, tiles, hidden: (groups.get(stat.name)?.length ?? 0) - tiles.length };
  });
}

/** Every chosen stock got a tile, and every tile holds its own three lines. */
function fits(blocks: readonly MapBlock[], chosenCount: number): boolean {
  const drawn = blocks.reduce((sum, block) => sum + block.tiles.length, 0);
  return drawn === chosenCount && blocks.every((block) => block.tiles.every(tileFits));
}

/**
 * Lays the map out, `width` CSS pixels wide, with as many of the biggest movers as fit. Each sector keeps at least its
 * own biggest mover, then the market's next biggest moves are added while every tile still holds its words. If even
 * the sector leaders alone do not fit, the map grows taller and tries again. Past the tallest map (one move hundreds
 * of times another's), the smallest leaders' tiles are given a floor, raised step by step until they fit: the one case
 * where a tile is drawn bigger than its move, so that it can be read at all. `weight` is a stock's tile size.
 */
export function marketMapLayout(
  rows: readonly ScreenerRow[],
  stats: readonly SectorStat[],
  period: SectorPeriod,
  weight: (row: ScreenerRow) => number,
  width = 960,
): MarketMap {
  const heights = MAP_RATIOS.map((ratio) => Math.round(width * ratio));
  const known = new Set(stats.map((stat) => stat.name));
  const groups = new Map<string, ScreenerRow[]>();
  for (const row of rows) {
    if (!row.sector || !known.has(row.sector)) continue;
    const list = groups.get(row.sector) ?? [];
    list.push(row);
    groups.set(row.sector, list);
  }
  for (const list of groups.values()) list.sort((a, b) => weight(b) - weight(a));
  const total = [...groups.values()].reduce((sum, list) => sum + list.length, 0);
  if (total === 0) return { width, height: heights[0]!, blocks: [], drawn: 0, total: 0 };
  const leaders = [...groups.values()].map((list) => list[0]!);
  const byMove = [...groups.values()].flat().sort((a, b) => weight(b) - weight(a));

  const choose = (count: number): { chosen: Map<string, ScreenerRow[]>; size: number } => {
    const picked = new Set<ScreenerRow>(leaders);
    for (const row of byMove) {
      if (picked.size >= count) break;
      picked.add(row);
    }
    const chosen = new Map<string, ScreenerRow[]>();
    // Each sector's list stays biggest move first, so its block lays out the same way every time.
    for (const [sector, list] of groups) chosen.set(sector, list.filter((row) => picked.has(row)));
    return { chosen, size: picked.size };
  };
  const result = (blocks: MapBlock[], height: number): MarketMap => ({ width, height, blocks, drawn: blocks.reduce((sum, block) => sum + block.tiles.length, 0), total });

  // At each height, the most stocks that fit. The first height that draws a fair share of the market wins (a taller
  // map only when a shorter one would show just a few), else the height that draws the most.
  let best: MarketMap | null = null;
  for (const height of heights) {
    let count = Math.max(leaders.length, Math.min(byMove.length, MAX_TILES));
    for (;;) {
      const { chosen, size } = choose(count);
      const blocks = place(chosen, stats, groups, weight, period, width, height);
      if (fits(blocks, size)) {
        const map = result(blocks, height);
        if (map.drawn >= Math.min(TARGET_TILES, total)) return map;
        if (!best || map.drawn > best.drawn) best = map;
        break;
      }
      if (count <= leaders.length) break;
      count = Math.max(leaders.length, count > 40 ? count - 6 : count - 2);
    }
  }
  if (best) return best;

  // The leaders alone do not fit even the tallest map: lift the smallest leaders' tiles until every one holds its words.
  const height = heights[heights.length - 1]!;
  const { chosen, size } = choose(leaders.length);
  const top = weight(leaders.reduce((best, row) => (weight(row) > weight(best) ? row : best)));
  for (let share = 0.02; ; share = Math.min(1, share * 1.5)) {
    const floor = top * share;
    const lifted = (row: ScreenerRow) => Math.max(weight(row), floor);
    const blocks = place(chosen, stats, groups, lifted, period, width, height);
    if (fits(blocks, size) || share >= 1) return result(blocks, height);
  }
}
