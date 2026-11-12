/**
 * What a treemap tile's label needs, in CSS pixels, shared by the tile stylesheet's classes (components/oa/kit/
 * treemap-fit.ts) and the layouts (lib/treemap.ts, lib/market-map.ts), so a layout only draws tiles the label fits.
 *
 * Every tile shows the same centred label (owner, Nov 12: "why some are as chips below wtf"): the logo or sector icon
 * with the ticker or name on one line, the move as the big figure under it, and the price small under that where the
 * tile is tall enough. The type steps up with the tile (STEPS); the smallest step is what a layout must leave room for.
 */

/** The stylesheet's width classes run in 10px steps over this range. */
export const FIT_MIN = 30;
export const FIT_MAX = 300;

/** Average glyph widths, in em: Geist Mono is 0.6em a character; the interface sans, semibold, is held to 0.6 too. */
const MONO = 0.62;
const SANS = 0.6;

/** The tile's padding a side, and its 1px border a side. */
export const PAD_X = 6;
export const PAD_Y = 4;
const BORDER = 1;
/** The gap between the icon and the name, and between the label's lines. */
const ICON_GAP = 5;
const LINE_GAP = 2;

/**
 * The type sizes, smallest first. A step applies from its width and height up (the stylesheet's container queries use
 * these same numbers), so a big tile prints a bigger figure. Each step's floor is wide enough for a 13-character name
 * and a 7-character move at that step's sizes, and tall enough for all three lines, so stepping up never overflows.
 */
export const STEPS = [
  { w: 0, h: 0, name: 12, move: 14, price: 11, icon: 14 },
  { w: 110, h: 66, name: 12, move: 17, price: 11, icon: 14 },
  { w: 150, h: 90, name: 13, move: 20, price: 11, icon: 15 },
  { w: 200, h: 120, name: 14, move: 24, price: 12, icon: 16 },
  { w: 270, h: 160, name: 15, move: 28, price: 12, icon: 18 },
] as const;
type Step = (typeof STEPS)[number];

const lineHeight = (size: number) => size + 4;

/** The class step a width needs: the width plus nothing, rounded up to 10px, held to the classes' range. */
export function fitStep(px: number): number {
  return Math.min(FIT_MAX, Math.max(FIT_MIN, Math.ceil(px / 10) * 10));
}

/** Every width is padded this much: a scrollbar, a 320px phone, a glyph wider than the average. */
export const FIT_PAD = 1.03;

/** The tile width a first line needs: icon, gap, the name at `step`'s size, padding and border. */
export function headWidth(text: string, mono: boolean, step: Step = STEPS[0]): number {
  return (step.icon + ICON_GAP + text.length * (mono ? MONO : SANS) * step.name + 2 * (PAD_X + BORDER)) * FIT_PAD;
}

/** The tile width a monospace figure needs at `size` px. */
export function figureWidth(text: string, size: number): number {
  return (text.length * MONO * size + 2 * (PAD_X + BORDER)) * FIT_PAD;
}

/**
 * The narrowest tile from which a part fits at every width above it, whatever step the tile's height allows there
 * (`need` is the part's width at a step). Inside a step's widths the part fits only from its need up; a need past the
 * next step's floor leaves the whole step short of room, and the next step decides.
 */
function fitsFrom(need: (step: Step) => number): number {
  let from = 0;
  STEPS.forEach((step, index) => {
    const next = STEPS[index + 1];
    const width = need(step);
    if (width > step.w) from = Math.max(from, next ? Math.min(width, next.w) : width);
  });
  return Math.ceil(from);
}

/** The heights of a tile's label at the smallest step: name and move, and with the price under them. */
export const LABEL_H = lineHeight(STEPS[0].name) + LINE_GAP + lineHeight(STEPS[0].move) + 2 * (PAD_Y + BORDER);
export const PRICED_H = LABEL_H + LINE_GAP + lineHeight(STEPS[0].price);

export type TileText = {
  /** The name or ticker the tile always shows: the shortest form (a sector's short name). */
  name: string;
  /** Tickers are monospace; sector names are not. */
  mono: boolean;
  move: string;
  price?: string;
};

/**
 * The smallest tile that shows this label: the first line and the move at the smallest step, and the price under them
 * when the tile has one (a stock tile always shows its price, owner rule 4; a sector tile has none).
 */
export function tileNeed(text: TileText): { w: number; h: number } {
  // Wide enough for each line at every step the tile could step up to, so a bigger type never overflows.
  const w = Math.max(
    nameFromWidth(text.name, text.mono),
    text.move ? fitsFrom((step) => figureWidth(text.move, step.move)) : 0,
    // The stylesheet shows the price from its 10px class step, so the need is that step, not the bare width.
    text.price ? fitStep(priceFromWidth(text.price)) : 0,
  );
  // The stylesheet shows a price only from PRICED_H tall, with or without a move above it.
  const h = text.price ? PRICED_H : text.move ? LABEL_H : lineHeight(STEPS[0].name) + 2 * (PAD_Y + BORDER);
  return { w, h };
}

/**
 * The narrowest tile from which a longer form of the name fits at every width above it, whatever step the tile's
 * height allows there: the class threshold for showing the full name instead of the short one.
 */
export function nameFromWidth(text: string, mono: boolean): number {
  return fitsFrom((step) => headWidth(text, mono, step));
}

/** The narrowest tile that prints this price beside nothing else on its line, at the biggest price size. */
export function priceFromWidth(price: string): number {
  return Math.ceil(figureWidth(price, Math.max(...STEPS.map((step) => step.price))));
}
