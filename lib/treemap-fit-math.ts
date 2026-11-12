/**
 * The widths a treemap tile's words need, in CSS pixels, shared by the stylesheet's classes
 * (components/oa/kit/treemap-fit.ts) and the market map's layout (lib/market-map.ts), so the layout only draws a tile
 * the browser will fill. Each width is rounded up to the stylesheet's 10px steps, after 2px for the tile's border.
 */

/** The stylesheet's width steps: 30px to 300px. */
export const FIT_MIN = 30;
export const FIT_MAX = 300;

/** Monospace figures (Geist Mono): 0.6em a character, rounded up. */
const MONO = 0.62;
/** The interface sans at 13px: about 6.5px a character on average; 7.2 leaves room for wide letters. */
const SANS_13 = 7.2;

/** The step a part needs: its width plus the tile's 2px of border, rounded up to 10px, held to the steps' range. */
export function fitStep(px: number): number {
  return Math.min(FIT_MAX, Math.max(FIT_MIN, Math.ceil((px + 2) / 10) * 10));
}

/** Width a monospace text needs at `size` px, plus `pad` px of tile padding. */
export function monoWidth(text: string, size: number, pad: number): number {
  return text.length * MONO * size + pad;
}

/** Width a 13px name needs beside a 14px icon and its 6px gap, plus `pad` px of tile padding. */
export function nameWidth(text: string, pad: number): number {
  return text.length * SANS_13 + 14 + 6 + pad;
}

/** A stock tile's padding (left and right together), and the heights under which it drops its price, then its move. */
export const STOCK_PAD = 8;
export const STOCK_PRICE_H = 50;
export const STOCK_MOVE_H = 34;
export const STOCK_TICK_H = 18;

/** The 13px logo and its 4px gap before a stock tile's ticker. */
export const STOCK_LOGO = 13 + 4;

/** Width a stock tile's first line needs: the logo, then the 12px ticker, plus the tile's padding. */
export function tickerWidth(symbol: string): number {
  return STOCK_LOGO + monoWidth(symbol, 12, STOCK_PAD);
}

/** The width and height a stock tile needs to show its logo and ticker, price and move, each at 12px. */
export function stockTileNeeds(text: { symbol: string; price: string; move: string }): { w: number; h: number } {
  const widths = [
    fitStep(tickerWidth(text.symbol)),
    ...[text.price, text.move].filter(Boolean).map((part) => fitStep(monoWidth(part, 12, STOCK_PAD))),
  ];
  const lines = [text.price, text.move].filter(Boolean).length;
  return { w: Math.max(...widths), h: lines === 2 ? STOCK_PRICE_H : lines === 1 ? STOCK_MOVE_H : STOCK_TICK_H };
}
