/**
 * The stock market heat map (/heatmap): the biggest US stocks we cover, grouped by sector, each tile's AREA by its
 * company value and its COLOUR by the day's move. Pure, so the page lays the map out on the server and draws boxes
 * placed by percent: the HTML holds every tile and link, and nothing is measured in the browser.
 *
 * Two layouts of the same stocks: a wide treemap of sector blocks (tablets and up), and on a phone the sectors
 * stacked one under another, each block as wide as the screen and as tall as its company value asks.
 */

import { etDayOf } from "@/lib/benchmark-day";
import { isFiniteNumber, sectorSlug, squarify, type ScreenerRow } from "@/lib/screener-shared";

export type HeatStock = {
  symbol: string;
  name: string;
  /** Company value in dollars. */
  cap: number;
  /** The day's move in percent; null when the stock has no move for the day the map is priced on. */
  pct: number | null;
  price: number | null;
};

export type HeatSector = {
  name: string;
  slug: string;
  /** Every covered stock in the sector with a company value, biggest first. */
  stocks: HeatStock[];
  /** The sector's company value. */
  cap: number;
  /** The day's move of the whole sector, each stock counted by its company value; null when no stock moved. */
  pct: number | null;
  /** Stocks that rose, and stocks with a move at all. */
  rising: number;
  moved: number;
};

/** A price this many days older than the map's day leaves the stock off the map (a long weekend is 4). */
export const STALE_DAYS = 5;

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/**
 * The covered stocks by sector, biggest sector first, each ticker once. A stock priced on any other day than the map
 * (a halted or stale quote, or one already refreshed for the next session) keeps its tile but loses its move, so a
 * move from another day is never coloured as this one's. One whose price is more than STALE_DAYS older than the map's
 * day (a delisted or long-halted stock) is left out altogether: it would take up room on a map of one day.
 */
export function heatSectors(rows: readonly ScreenerRow[], priceDay: string | null): HeatSector[] {
  const groups = new Map<string, { name: string; stocks: HeatStock[] }>();
  const seen = new Set<string>();
  for (const row of rows) {
    const slug = sectorSlug(row.sector);
    if (!slug || !row.symbol || !isFiniteNumber(row.market_cap) || row.market_cap <= 0) continue;
    if (seen.has(row.symbol.toUpperCase())) continue;
    seen.add(row.symbol.toUpperCase());
    const quoted = etDayOf(row.price_at);
    if (priceDay && quoted && daysBetween(quoted, priceDay) > STALE_DAYS) continue;
    const fresh = !priceDay || !quoted || quoted === priceDay;
    const stock: HeatStock = {
      symbol: row.symbol.toUpperCase(),
      name: row.name?.trim() || row.symbol.toUpperCase(),
      cap: row.market_cap,
      pct: fresh && isFiniteNumber(row.day_pct) ? row.day_pct : null,
      price: isFiniteNumber(row.price) && row.price > 0 ? row.price : null,
    };
    const group = groups.get(slug) ?? { name: row.sector!.trim(), stocks: [] };
    group.stocks.push(stock);
    groups.set(slug, group);
  }
  const sectors: HeatSector[] = [];
  for (const [slug, group] of groups) {
    const stocks = group.stocks.sort((a, b) => b.cap - a.cap || a.symbol.localeCompare(b.symbol));
    sectors.push({ name: group.name, slug, stocks, cap: sum(stocks, (s) => s.cap), ...dayOf(stocks) });
  }
  return sectors.sort((a, b) => b.cap - a.cap || a.slug.localeCompare(b.slug));
}

function sum<T>(items: readonly T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}

/** A group's move (by company value), and how many rose of those that moved. */
export function dayOf(stocks: readonly HeatStock[]): { pct: number | null; rising: number; moved: number } {
  const moved = stocks.filter((stock): stock is HeatStock & { pct: number } => stock.pct !== null);
  const weight = sum(moved, (stock) => stock.cap);
  return {
    pct: weight > 0 ? sum(moved, (stock) => stock.pct * stock.cap) / weight : null,
    rising: moved.filter((stock) => stock.pct > 0).length,
    moved: moved.length,
  };
}

export type MapGroup = { sector: HeatSector; stocks: HeatStock[] };

/**
 * The stocks the map draws: the `max` biggest companies, plus each sector's `perSector` biggest so a small sector is
 * still on the map. Biggest sector first, each sector's stocks biggest first.
 */
export function mapGroups(sectors: readonly HeatSector[], max: number, perSector = 2): MapGroup[] {
  const all = sectors.flatMap((sector) => sector.stocks.map((stock) => ({ sector, stock })));
  all.sort((a, b) => b.stock.cap - a.stock.cap || a.stock.symbol.localeCompare(b.stock.symbol));
  const picked = new Set(all.slice(0, Math.max(0, max)).map((entry) => entry.stock));
  for (const sector of sectors) for (const stock of sector.stocks.slice(0, perSector)) picked.add(stock);
  return sectors
    .map((sector) => ({ sector, stocks: sector.stocks.filter((stock) => picked.has(stock)) }))
    .filter((group) => group.stocks.length > 0)
    .sort((a, b) => sum(b.stocks, (s) => s.cap) - sum(a.stocks, (s) => s.cap) || a.sector.slug.localeCompare(b.sector.slug));
}

/* ── Layout ───────────────────────────────────────────────────────────── */

/** A sector block's name strip, and the space around each block, in CSS pixels. */
export const HEAD = 22;
export const GAP = 2;

/** A box in percent of its parent: left, top, width and height. */
export type Box = { x: number; y: number; w: number; h: number };
export type TileBox = Box & {
  stock: HeatStock;
  /** The tile's size in CSS pixels at the width it was laid out for (it only grows on a wider screen). */
  px: { w: number; h: number };
};
/** A sector block: its box in the map, and its tiles in percent of the block's inside (under its name strip). */
export type BlockBox = Box & { sector: HeatSector; tiles: TileBox[] };
export type MapLayout = { width: number; height: number; blocks: BlockBox[] };

/** The space a block loses to its gaps and name strip. */
function overhead(w: number, h: number): number {
  return w * h - Math.max(0, w - 2 * GAP) * Math.max(0, h - 2 * GAP - HEAD);
}

/** The tiles of `stocks` in a `w` x `h` box, by company value, in percent of the box. */
function tilesIn(stocks: readonly HeatStock[], w: number, h: number): TileBox[] {
  if (w <= 0 || h <= 0) return [];
  return squarify(
    stocks.map((stock) => ({ value: stock.cap, data: stock })),
    0,
    0,
    w,
    h,
  ).map((rect) => ({
    x: (rect.x / w) * 100,
    y: (rect.y / h) * 100,
    w: (rect.w / w) * 100,
    h: (rect.h / h) * 100,
    stock: rect.data,
    px: { w: rect.w, h: rect.h },
  }));
}

/**
 * The wide map: sector blocks laid out as a squarified treemap of `width` x `height` CSS pixels, each block's INSIDE
 * (its rectangle less the name strip and gaps) in proportion to its stocks' company value, so a $1T company's tile is
 * the same size in a small sector as in a big one. A block's strip depends on its shape, so the blocks are laid out a
 * few times, each round sizing every block for the strip the last round gave it.
 */
export function layoutMap(groups: readonly MapGroup[], width: number, height: number): MapLayout {
  const entries = groups.map((group) => ({ group, cap: sum(group.stocks, (s) => s.cap) })).filter((entry) => entry.cap > 0);
  const total = sum(entries, (entry) => entry.cap);
  if (entries.length === 0 || width <= 0 || height <= 0) return { width, height, blocks: [] };
  let lost = new Map(entries.map((entry) => [entry, 0]));
  let rects: ReturnType<typeof squarify<(typeof entries)[number]>> = [];
  for (let round = 0; round < 8; round += 1) {
    const spare = width * height - sum([...lost.values()], (value) => value);
    if (spare <= 0) break;
    rects = squarify(
      entries.map((entry) => ({ value: (entry.cap / total) * spare + lost.get(entry)!, data: entry })),
      0,
      0,
      width,
      height,
    );
    lost = new Map(rects.map((rect) => [rect.data, overhead(rect.w, rect.h)]));
  }
  const blocks = rects.map((rect) => ({
    x: (rect.x / width) * 100,
    y: (rect.y / height) * 100,
    w: (rect.w / width) * 100,
    h: (rect.h / height) * 100,
    sector: rect.data.group.sector,
    tiles: tilesIn(rect.data.group.stocks, rect.w - 2 * GAP, rect.h - 2 * GAP - HEAD),
  }));
  return { width, height, blocks };
}

export type StackBlock = { sector: HeatSector; /** The inside's height in CSS pixels at the layout's width. */ height: number; tiles: TileBox[] };
export type StackLayout = { width: number; blocks: StackBlock[] };

/**
 * The phone map: each sector a full-width block, one under another, biggest first, every inside in proportion to its
 * stocks' company value. The scale gives the smallest company a tile of about `minTile` square pixels (room for its
 * ticker and move), unless that makes the map taller than `maxHeight`; a block is never shorter than `minBlock`.
 */
export function layoutStack(
  groups: readonly MapGroup[],
  width: number,
  { minTile = 1600, maxHeight = 2400, minBlock = 44 }: { minTile?: number; maxHeight?: number; minBlock?: number } = {},
): StackLayout {
  const entries = groups.map((group) => ({ group, cap: sum(group.stocks, (s) => s.cap) })).filter((entry) => entry.cap > 0);
  if (entries.length === 0 || width <= 0) return { width, blocks: [] };
  const smallest = Math.min(...entries.flatMap((entry) => entry.group.stocks.filter((s) => s.cap > 0).map((s) => s.cap)));
  const total = sum(entries, (entry) => entry.cap);
  let scale = minTile / smallest;
  if ((total * scale) / width > maxHeight) scale = (maxHeight * width) / total;
  return {
    width,
    blocks: entries.map(({ group, cap }) => {
      const height = Math.max(minBlock, Math.round((cap * scale) / width));
      return { sector: group.sector, height, tiles: tilesIn(group.stocks, width, height) };
    }),
  };
}

/* ── Colour ───────────────────────────────────────────────────────────── */

/** The move that gets the full colour. */
export const FULL_MOVE = 3;
/** Below this the tile is flat grey. */
export const FLAT_MOVE = 0.05;

/**
 * How much of the up or down colour a move gets, in percent (the rest is the card colour): a square-root curve from
 * 14% to 58% at FULL_MOVE, so half a percent already reads green or red. 0 for a flat move, null for none.
 */
export function heatMix(pct: number | null | undefined): number | null {
  if (!isFiniteNumber(pct)) return null;
  if (Math.abs(pct) < FLAT_MOVE) return 0;
  return Math.round(14 + 44 * Math.sqrt(Math.min(1, Math.abs(pct) / FULL_MOVE)));
}

/** A tile's fill from the page's own tokens, so it follows light and dark mode. */
export function heatColor(pct: number | null | undefined): string {
  const mix = heatMix(pct);
  if (mix === null) return "var(--oa-bg)";
  if (mix === 0) return "color-mix(in srgb, var(--oa-muted-fg) 14%, var(--oa-card))";
  return `color-mix(in srgb, var(${(pct as number) > 0 ? "--signal-bullish" : "--signal-bearish"}) ${mix}%, var(--oa-card))`;
}

/* ── Words ────────────────────────────────────────────────────────────── */

/** "+1.2%", "−0.4%", "0.0%": a real minus, and never "−0.0%". */
export function signedPct(value: number, digits = 1): string {
  const shown = Number(value.toFixed(digits));
  return `${shown > 0 ? "+" : shown < 0 ? "−" : ""}${Math.abs(shown).toFixed(digits)}%`;
}

/** "1.2%": the size of a move, for a sentence that says up or down in words. */
function size(value: number): string {
  return `${Math.abs(value).toFixed(1)}%`;
}

/** A price on a tile: "$1,234" from a thousand up, "$56.78" below. */
export function tilePrice(price: number): string {
  return price >= 1000 ? `$${Math.round(price).toLocaleString("en-US")}` : `$${price.toFixed(2)}`;
}

/** The stock that moved its sector most in `direction` (company value times move), or null when none moved that way. */
export function driverOf(stocks: readonly HeatStock[], direction: 1 | -1): HeatStock | null {
  let best: HeatStock | null = null;
  let most = 0;
  for (const stock of stocks) {
    if (stock.pct === null || Math.sign(stock.pct) !== direction) continue;
    const pull = Math.abs(stock.pct * stock.cap);
    if (pull > most) {
      best = stock;
      most = pull;
    }
  }
  return best;
}

/** The `count` biggest companies across every sector, biggest first; with `moved`, only those with a move. */
export function biggestCompanies(sectors: readonly HeatSector[], count: number, { moved = false }: { moved?: boolean } = {}): HeatStock[] {
  return sectors
    .flatMap((sector) => sector.stocks)
    .filter((stock) => !moved || stock.pct !== null)
    .sort((a, b) => b.cap - a.cap || a.symbol.localeCompare(b.symbol))
    .slice(0, Math.max(0, count));
}

/**
 * A sector's best and worst stocks of the day for its card: up to `each` from either end, best first, with no stock
 * twice; a sector with only a few stocks shows them all.
 */
export function sectorMovers(stocks: readonly HeatStock[], each = 2): HeatStock[] {
  const moved = stocks.filter((stock) => stock.pct !== null).sort((a, b) => (b.pct as number) - (a.pct as number) || b.cap - a.cap);
  if (moved.length <= each * 2) return moved;
  return [...moved.slice(0, each), ...moved.slice(-each)];
}

/**
 * The day in two or three sentences, answer first: how US stocks did, then the best and the worst sector with the
 * stock that moved each most. `when` is the day in a sentence ("today", "on Friday"); `live` while the market is open.
 */
export function heatSummary(sectors: readonly HeatSector[], when: string, live: boolean): string[] {
  const everything = sectors.flatMap((sector) => sector.stocks);
  const market = dayOf(everything);
  if (market.pct === null) return [];
  const lines: string[] = [];
  const flat = Math.abs(market.pct) < FLAT_MOVE;
  const move = flat ? (live ? "are flat" : "ended flat") : live ? `are ${market.pct > 0 ? "up" : "down"} ${size(market.pct)}` : `${market.pct > 0 ? "rose" : "fell"} ${size(market.pct)}`;
  const count = live ? `${market.rising} of them are higher` : `${market.rising} of them closed higher`;
  // Not the S&P 500: every stock we cover, the big ones counting for more.
  lines.push(`The ${market.moved} US stocks we cover ${move} ${when} by market value, and ${count}.`);

  const ranked = sectors.filter((sector): sector is HeatSector & { pct: number } => sector.pct !== null).sort((a, b) => b.pct - a.pct);
  const best = ranked[0];
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : undefined;
  if (best) {
    const flatBest = Math.abs(best.pct) < FLAT_MOVE;
    const lead = best.pct > 0 && !flatBest ? driverOf(best.stocks, 1) : null;
    const verb = best.pct > 0 && !flatBest ? (live ? "is doing best" : "did best") : live ? "is holding up best" : "held up best";
    lines.push(lead ? `${best.name} ${verb}, led by ${lead.symbol}.` : `${best.name} ${verb}, ${flatBest ? "flat" : `${best.pct >= 0 ? "up" : "down"} ${size(best.pct)}`}.`);
  }
  if (worst) {
    const flatWorst = Math.abs(worst.pct) < FLAT_MOVE;
    const drag = worst.pct < 0 && !flatWorst ? driverOf(worst.stocks, -1) : null;
    const verb = worst.pct < 0 && !flatWorst ? (live ? "is doing worst" : "did worst") : live ? "is lagging" : "lagged";
    lines.push(drag ? `${worst.name} ${verb}, pulled down by ${drag.symbol}.` : `${worst.name} ${verb}, ${flatWorst ? "flat" : `${worst.pct >= 0 ? "up" : "down"} ${size(worst.pct)}`}.`);
  }
  return lines;
}
