import { STOCK_PAD, fitStep, monoWidth, nameWidth, tickerWidth } from "@/lib/treemap-fit-math";

import styles from "./treemap-fit.module.css";

/**
 * The classes that let a treemap tile decide, from its own rendered size, what it shows (treemap-fit.module.css): a
 * size container, its kind (stock, sector or sector bar), and per part the width that part needs, rounded up to the
 * stylesheet's 10px steps (lib/treemap-fit-math.ts). The widths are worked out from the text itself, so a long
 * ticker, price or name gets a wider threshold than a short one. No hooks: server and client trees both use it.
 */

function cls(prefix: string, px: number): string {
  return styles[`${prefix}${fitStep(px)}`] ?? "";
}

/**
 * A stock tile: logo and ticker over price over move, each hidden in turn as the tile narrows (price first). The logo
 * goes only with the ticker, so every stock tile that shows its ticker shows its logo (owner rule 4).
 */
export function stockTileClass(text: { symbol: string; price: string; move: string }): string {
  const pad = STOCK_PAD;
  return [
    styles.tile,
    styles.kStock,
    cls("wt", tickerWidth(text.symbol)),
    text.price ? cls("wp", monoWidth(text.price, 12, pad)) : "",
    text.move ? cls("wm", monoWidth(text.move, 12, pad)) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * A sector tile: icon and name (full, then short) over the move. A name shows only on a tile 48px tall or more, padded
 * 10px a side; the move shows down to the small tile's 6px a side at 12px, and steps up to 15px and 22px only on a
 * tile wide enough for this very figure at that size (mf, mg), never past the width it was measured for.
 */
export function sectorTileClass(text: { name: string; short: string; move: string }): string {
  return [
    styles.tile,
    styles.kSector,
    cls("wf", nameWidth(text.name, 20)),
    cls("ws", nameWidth(text.short, 20)),
    text.move ? cls("wm", monoWidth(text.move, 12, 12)) : "",
    text.move ? cls("mf", Math.max(90, monoWidth(text.move, 15, 20))) : "",
    text.move ? cls("mg", Math.max(150, monoWidth(text.move, 22, 20))) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** A sector bar over a block of the screener map: icon, name (full, then short) and move on one line. */
export function sectorBarClass(text: { name: string; short: string; move: string }): string {
  const pad = 12;
  // On a bar the name and the move share the line: the full name shows with the move beside it, then the short name
  // with the move, then the short name alone, then the icon alone.
  const moveWidth = text.move ? monoWidth(text.move, 12, 6) : 0;
  // The bar's name is 12px semibold capitals with 0.04em tracking: measured at about 9.2px a character on screen, so
  // 9.6 here, plus the 12px icon, its gap and a little air.
  const barName = (name: string) => name.length * 9.6 + 12 + 5 + pad + 6;
  return [
    styles.tile,
    styles.kBar,
    cls("wf", barName(text.name) + moveWidth),
    text.move ? cls("wm", barName(text.short) + moveWidth) : "",
    cls("ws", barName(text.short)),
  ]
    .filter(Boolean)
    .join(" ");
}

/** The part classes, and the `data-need` each one carries so the labels under the map can tell what a tile hides. */
export const part = {
  body: styles.body ?? "",
  name: styles.name ?? "",
  short: styles.short ?? "",
  move: styles.move ?? "",
  price: styles.price ?? "",
  tick: styles.tick ?? "",
};
