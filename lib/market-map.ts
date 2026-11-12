/**
 * The screener's market map layout (components/screener/sector-map.tsx): stocks grouped into sector blocks, each tile
 * sized by its stock's move (the caller's `weight`, compressed so one big mover never eats its block). Laid out in CSS
 * pixels for the narrowest width the map is drawn at (`width`), so a tile only gets bigger on a wider screen. Every
 * drawn tile is big enough for its logo, ticker and move (lib/treemap-fit-math.ts tileNeed; the price shows where
 * there is room), and every sector's bar for its short name: no tile or bar is ever left without its words, and none
 * is listed under the map instead. The map draws each sector's biggest movers that fit and grows taller before it lets
 * a tile come out too small. Pure, so it runs on the server and is unit tested.
 */

import { isFiniteNumber, squarify, type ScreenerRow, type SectorPeriod, type SectorStat } from "@/lib/screener-shared";
import { headWidth, tileNeed } from "@/lib/treemap-fit-math";

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

/** The size a tile's label needs: logo and ticker, the move, and the price (every stock tile shows its price). */
export function tileTextNeed(text: TileText): { w: number; h: number } {
  return tileNeed({ name: text.symbol, mono: true, move: text.move, price: text.price });
}

/** The tile holds its logo, ticker, move and price. */
export function tileFits(tile: { w: number; h: number; text: TileText }): boolean {
  const need = tileTextNeed(tile.text);
  return tile.w - TILE_SPARE >= need.w && tile.h - TILE_SPARE >= need.h;
}

/** A sector's bar holds its icon and its short name (the move joins it where the bar is wide enough). */
export function barFits(block: { w: number }, shortName: string): boolean {
  return block.w - MAP_GAP * 2 >= headWidth(shortName, false);
}

type Rect = { x: number; y: number; w: number; h: number };
/** A row (or a column) of sector blocks, as squarify grouped them, by index into the blocks. */
type BlockRow = { vertical: boolean; members: number[] };

function worstRatio(areas: readonly number[], side: number): number {
  const sum = areas.reduce((total, area) => total + area, 0);
  if (sum <= 0 || side <= 0) return Infinity;
  const s2 = side * side;
  return Math.max((s2 * Math.max(...areas)) / (sum * sum), (sum * sum) / (s2 * Math.min(...areas)));
}

/** How squarify groups `values` (biggest first) into rows and columns of a `width` x `height` map, without sizes. */
function groupRows(values: readonly number[], width: number, height: number): BlockRow[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  const scale = (width * height) / total;
  const rows: BlockRow[] = [];
  let w = width;
  let h = height;
  let index = 0;
  while (index < values.length) {
    const side = Math.min(w, h);
    const vertical = w >= h;
    const members: number[] = [];
    let areas: number[] = [];
    while (index < values.length) {
      const next = [...areas, values[index]! * scale];
      if (areas.length > 0 && worstRatio(next, side) > worstRatio(areas, side)) break;
      areas = next;
      members.push(index);
      index += 1;
    }
    const thickness = areas.reduce((sum, area) => sum + area, 0) / side;
    if (vertical) w -= thickness;
    else h -= thickness;
    rows.push({ vertical, members });
  }
  return rows;
}

/**
 * The blocks' rectangles for one area scale `k`: each block as big as its own gaps and name bar plus exactly `k` times
 * its stocks' weights, row by row as grouped. `slack` is what the last row leaves over (negative: `k` is too big).
 */
function blockRects(rows: readonly BlockRow[], sums: readonly number[], k: number, width: number, height: number): { rects: Rect[]; slack: number } | null {
  const over = MAP_GAP * 2;
  const rects: Rect[] = new Array(sums.length);
  let r: Rect = { x: 0, y: 0, w: width, h: height };
  let slack = 0;
  for (const [index, row] of rows.entries()) {
    const sum = row.members.reduce((total, member) => total + sums[member]!, 0);
    const n = row.members.length;
    const last = index === rows.length - 1;
    if (row.vertical) {
      // A column on the left: every block as wide as the column, each as tall as its gaps, bar and k·weight.
      const free = r.h - n * (over + MAP_HEAD);
      if (free <= 0) return null;
      let t = over + (k * sum) / free;
      if (last) {
        slack = r.w - t;
        t = r.w;
      } else if (t > r.w) return { rects, slack: -1 };
      let y = r.y;
      row.members.forEach((member, at) => {
        const h = at === n - 1 ? r.y + r.h - y : (k * sums[member]!) / (t - over) + over + MAP_HEAD;
        rects[member] = { x: r.x, y, w: t, h };
        y += h;
      });
      r = { x: r.x + t, y: r.y, w: r.w - t, h: r.h };
    } else {
      // A row on top: every block as tall as the row, each as wide as its gaps and k·weight over the row's inside.
      const free = r.w - n * over;
      if (free <= 0) return null;
      let t = over + MAP_HEAD + (k * sum) / free;
      if (last) {
        slack = r.h - t;
        t = r.h;
      } else if (t > r.h) return { rects, slack: -1 };
      let x = r.x;
      row.members.forEach((member, at) => {
        const w = at === n - 1 ? r.x + r.w - x : (k * sums[member]!) / (t - over - MAP_HEAD) + over;
        rects[member] = { x, y: r.y, w, h: t };
        x += w;
      });
      r = { x: r.x, y: r.y + t, w: r.w, h: r.h - t };
    }
  }
  return { rects, slack };
}

/**
 * Places the sector blocks and their tiles. Every block's inside (below its name bar, within its gaps) is exactly the
 * same scale `k` times its stocks' weights, the one `k` that fills the map, so a stock's tile area is `k` times its
 * own weight wherever it sits: a bigger move is never a smaller tile anywhere on the map (council, Nov 12: XRX −39.1%
 * was drawn smaller than APPS −35.8%). Null when the bars and gaps leave no room.
 */
function place(
  chosen: ReadonlyMap<string, ScreenerRow[]>,
  stats: readonly SectorStat[],
  groups: ReadonlyMap<string, ScreenerRow[]>,
  weight: (row: ScreenerRow) => number,
  period: SectorPeriod,
  width: number,
  height: number,
): MapBlock[] | null {
  const shown = stats
    .filter((stat) => (chosen.get(stat.name)?.length ?? 0) > 0)
    .map((stat) => ({ stat, sum: chosen.get(stat.name)!.reduce((total, row) => total + weight(row), 0) }))
    .filter((entry) => entry.sum > 0)
    .sort((a, b) => b.sum - a.sum);
  if (shown.length === 0) return [];
  const sums = shown.map((entry) => entry.sum);
  const rows = groupRows(sums, width, height);
  // The scale that fills the map exactly: the last row's thickness is what the others leave.
  let lo = 0;
  let hi = (width * height) / sums.reduce((total, sum) => total + sum, 0);
  for (let step = 0; step < 60 && hi - lo > hi * 1e-10; step += 1) {
    const mid = (lo + hi) / 2;
    const laid = blockRects(rows, sums, mid, width, height);
    if (!laid || laid.slack < 0) hi = mid;
    else lo = mid;
  }
  const laid = blockRects(rows, sums, lo, width, height);
  if (!laid || lo <= 0) return null;
  return tilesIn(shown, laid.rects, chosen, groups, weight, period);
}

/** Each block's stocks as tiles inside it, below its name bar and within its gaps. */
function tilesIn(
  shown: ReadonlyArray<{ stat: SectorStat }>,
  rects: readonly Rect[],
  chosen: ReadonlyMap<string, ScreenerRow[]>,
  groups: ReadonlyMap<string, ScreenerRow[]>,
  weight: (row: ScreenerRow) => number,
  period: SectorPeriod,
): MapBlock[] {
  return shown.map(({ stat }, index) => {
    const block = rects[index]!;
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

/**
 * The blocks in plain proportion to their stocks' weights, name bars and gaps taken out of each: the last resort when
 * the exact layout has no room (a column of many small sectors), so the map is never blank.
 */
function placeLoose(
  chosen: ReadonlyMap<string, ScreenerRow[]>,
  stats: readonly SectorStat[],
  groups: ReadonlyMap<string, ScreenerRow[]>,
  weight: (row: ScreenerRow) => number,
  period: SectorPeriod,
  width: number,
  height: number,
): MapBlock[] {
  const shown = stats
    .filter((stat) => (chosen.get(stat.name)?.length ?? 0) > 0)
    .map((stat) => ({ stat, sum: chosen.get(stat.name)!.reduce((total, row) => total + weight(row), 0) }))
    .filter((entry) => entry.sum > 0);
  const laid = squarify(
    shown.map((entry) => ({ value: entry.sum, data: entry })),
    0,
    0,
    width,
    height,
  );
  return tilesIn(
    laid.map((rect) => rect.data),
    laid.map((rect) => ({ x: rect.x, y: rect.y, w: rect.w, h: rect.h })),
    chosen,
    groups,
    weight,
    period,
  );
}

/** Every chosen stock got a tile, every tile holds its label, and every bar its sector's short name. */
function fits(blocks: readonly MapBlock[] | null, chosenCount: number, shortName: (name: string) => string): blocks is MapBlock[] {
  if (!blocks) return false;
  const drawn = blocks.reduce((sum, block) => sum + block.tiles.length, 0);
  return drawn === chosenCount && blocks.every((block) => barFits(block, shortName(block.stat.name)) && block.tiles.every(tileFits));
}

/** The sectors whose bar is too narrow for their name. */
function narrowBars(blocks: readonly MapBlock[] | null, shortName: (name: string) => string): string[] {
  return (blocks ?? []).filter((block) => !barFits(block, shortName(block.stat.name))).map((block) => block.stat.name);
}

/** How many times a too-narrow sector may take in more of its own stocks, to widen its block honestly. */
const WIDEN_TRIES = 6;

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
  shortName: (name: string) => string = (name) => name,
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

  // `extra`: a sector's next biggest movers taken in beyond the market's, so its block is wide enough for its name.
  const choose = (count: number, extra: ReadonlyMap<string, number> = new Map()): { chosen: Map<string, ScreenerRow[]>; size: number } => {
    const picked = new Set<ScreenerRow>(leaders);
    for (const row of byMove) {
      if (picked.size >= count) break;
      picked.add(row);
    }
    for (const [sector, more] of extra) {
      let added = 0;
      for (const row of groups.get(sector) ?? []) {
        if (added >= more) break;
        if (!picked.has(row)) {
          picked.add(row);
          added += 1;
        }
      }
    }
    const chosen = new Map<string, ScreenerRow[]>();
    // Each sector's list stays biggest move first, so its block lays out the same way every time.
    for (const [sector, list] of groups) chosen.set(sector, list.filter((row) => picked.has(row)));
    return { chosen, size: picked.size };
  };
  // Lays `count` movers out; a sector whose bar is too narrow for its name takes in more of its own stocks (honest
  // weights, so its block grows and the order still holds) and the map is laid out again.
  const layWidened = (count: number, sized: (row: ScreenerRow) => number, height: number): MapBlock[] | null => {
    const extra = new Map<string, number>();
    for (let attempt = 0; attempt <= WIDEN_TRIES; attempt += 1) {
      const { chosen, size } = choose(count, extra);
      const laid = place(chosen, stats, groups, sized, period, width, height);
      if (fits(laid, size, shortName)) return laid;
      const narrow = narrowBars(laid, shortName).filter((sector) => (chosen.get(sector)?.length ?? 0) < (groups.get(sector)?.length ?? 0));
      if (narrow.length === 0) return null;
      for (const sector of narrow) extra.set(sector, (extra.get(sector) ?? 0) + 2);
    }
    return null;
  };
  const result = (blocks: MapBlock[], height: number): MarketMap => ({ width, height, blocks, drawn: blocks.reduce((sum, block) => sum + block.tiles.length, 0), total });

  // At each height, the most stocks that fit. The first height that draws a fair share of the market wins (a taller
  // map only when a shorter one would show just a few), else the height that draws the most.
  let best: MarketMap | null = null;
  for (const height of heights) {
    // The most movers that fit, found by halving (more movers only ever make tiles smaller), from the leaders alone up.
    let lo = leaders.length;
    let hi = Math.max(leaders.length, Math.min(byMove.length, MAX_TILES));
    let fitted = layWidened(hi, weight, height);
    if (!fitted) {
      fitted = layWidened(lo, weight, height);
      hi -= 1;
      while (fitted && lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const laid = layWidened(mid, weight, height);
        if (laid) {
          fitted = laid;
          lo = mid;
        } else hi = mid - 1;
      }
    }
    if (fitted) {
      const map = result(fitted, height);
      if (map.drawn >= Math.min(TARGET_TILES, total)) return map;
      if (!best || map.drawn > best.drawn) best = map;
    }
  }
  if (best) return best;

  // The leaders alone do not fit even the tallest map: lift the smallest leaders' tiles until every one holds its words.
  // The lift is the same for every stock (a floor under all weights), so the order still holds.
  const height = heights[heights.length - 1]!;
  const top = weight(leaders.reduce((best, row) => (weight(row) > weight(best) ? row : best)));
  for (let share = 0.02; ; share = Math.min(1, share * 1.5)) {
    const floor = top * share;
    const lifted = (row: ScreenerRow) => Math.max(weight(row), floor);
    const laid = layWidened(leaders.length, lifted, height);
    if (laid) return result(laid, height);
    if (share >= 1) {
      const { chosen } = choose(leaders.length);
      return result(place(chosen, stats, groups, lifted, period, width, height) ?? placeLoose(chosen, stats, groups, lifted, period, width, height), height);
    }
  }
}
