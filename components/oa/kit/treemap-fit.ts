import { FIT_MAX, fitStep, headWidth, nameFromWidth, priceFromWidth } from "@/lib/treemap-fit-math";

import styles from "./treemap-fit.module.css";

/**
 * The classes that let a treemap tile decide, from its own rendered size, how it prints its label
 * (treemap-fit.module.css): a size container, the width from which its full name shows instead of its short one, and
 * the width from which its price shows, each worked out from the text itself (lib/treemap-fit-math.ts) and rounded to
 * the stylesheet's 10px steps. No hooks: server and client trees both use it.
 */

/** The class for a part needing `px`; none past the stylesheet's widest step, so the part stays hidden there. */
function cls(prefix: string, px: number): string {
  if (px > FIT_MAX) return "";
  return styles[`${prefix}${fitStep(px)}`] ?? "";
}

export type TileWords = {
  /** The full name ("Consumer staples") or the ticker. */
  full: string;
  /** The name a narrow tile prints ("Staples"); the ticker again for a stock. */
  short: string;
  mono: boolean;
  price?: string;
};

/** A tile's classes: the size container, when its full name shows, and when its price shows. */
export function tileClass(words: TileWords): string {
  return [
    styles.tile,
    words.full !== words.short ? cls("nf", nameFromWidth(words.full, words.mono)) : "",
    words.price ? cls("pw", priceFromWidth(words.price)) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * A sector bar over a block of the screener map: icon and name on one line, then the move at the right end from the
 * width that holds both. The bar's name is 12px semibold.
 */
export function barClass(words: { full: string; short: string; move: string }): string {
  const both = (name: string) => headWidth(name, false) + (words.move ? words.move.length * 0.62 * 12 + 8 : 0);
  return [
    styles.bar,
    // The full name shows only with room for the move beside it; the short name keeps the move down to its own width.
    words.full !== words.short ? cls("nf", both(words.full)) : "",
    words.move ? cls("bm", both(words.short)) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The label's parts. */
export const part = {
  body: styles.body ?? "",
  head: styles.head ?? "",
  icon: styles.icon ?? "",
  full: styles.full ?? "",
  short: styles.short ?? "",
  move: styles.move ?? "",
  price: styles.price ?? "",
  barBody: styles.barBody ?? "",
  barMove: styles.barMove ?? "",
  shortOnly: styles.shortOnly ?? "",
};
