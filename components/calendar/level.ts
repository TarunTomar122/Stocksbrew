/**
 * Measured leveling for the week view's day columns (owner rule 4: cards side by side end level). The server folds
 * each day on estimated heights (fold-day.ts); in the browser WeekGrid measures the real heights and this picks one
 * height for every column and, per card, how many of its blocks show before "Show N more". Pure, so it is unit-tested.
 */

/** One card as measured: its header's height, each block's height (a heading or a row) and the server's cut. */
export type CardMeasure = { head: number; items: Array<{ height: number; row: boolean }>; ssrCut: number };
/** One grid column: one day's card, or quiet days stacked. */
export type ColumnMeasure = { cards: CardMeasure[] };

export type LevelOptions = {
  /** Space between stacked cards, px. */
  gap: number;
  /** The "Show N more" line, px. */
  button: number;
  /** Padding under the last row of a card that shows everything, px. */
  pad: number;
  /** A busy column never folds shorter than this share of the server's folded height (default all of it), so it keeps its rows. */
  floorRatio?: number;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function cardHeight(card: CardMeasure, cut: number, { button, pad }: LevelOptions): number {
  return card.head + sum(card.items.slice(0, cut).map((item) => item.height)) + (cut < card.items.length ? button : pad);
}

function columnHeight(column: ColumnMeasure, cuts: number[], options: LevelOptions): number {
  return sum(column.cards.map((card, index) => cardHeight(card, cuts[index]!, options))) + options.gap * Math.max(0, column.cards.length - 1);
}

/**
 * The most blocks of `card` that fit in `room` px (its header excluded), leaving room for the "Show N more" line:
 * every block when they all fit, else a cut that shows at least one row, never ends on a heading, and never hides a
 * single row ("Show 1 more" costs the row it hides).
 */
export function fitCut(card: CardMeasure, room: number, { button, pad }: LevelOptions): number {
  const { items } = card;
  const rows = items.filter((item) => item.row).length;
  if (sum(items.map((item) => item.height)) + pad <= room + 1) return items.length;
  let used = 0;
  let cut = 0;
  let seen = 0;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.row && seen > 0 && used + item.height + button > room + 1) break;
    used += item.height;
    cut = index + 1;
    if (item.row) seen += 1;
  }
  const backOff = () => {
    while (cut > 0 && !items[cut - 1]!.row) cut -= 1;
  };
  backOff();
  const shownRows = () => items.slice(0, cut).filter((item) => item.row).length;
  // One row left over: hide one more instead, unless that would leave none.
  if (rows - shownRows() === 1 && shownRows() > 1) {
    cut -= 1;
    backOff();
  }
  if (rows - shownRows() <= 0) return items.length;
  return Math.max(cut, 1);
}

/**
 * One height for every column and each card's cut. The height is the tallest column the server did not fold (so no
 * quiet day is cut), or the quietest column's full height, whichever is greater, but never under `floorRatio` of the
 * tallest folded column (so the busy days keep the rows the server showed); a quiet day the server did not fold can
 * set it higher, and the busy days then show more. Every busy
 * column then folds its last card to fit; the cards above it in a stack keep the server's cut.
 */
export function levelColumns(columns: ColumnMeasure[], options: LevelOptions): { target: number; cuts: number[][] } {
  const floorRatio = options.floorRatio ?? 1;
  const ssrCuts = columns.map((column) => column.cards.map((card) => card.ssrCut));
  const full = columns.map((column) => columnHeight(column, column.cards.map((card) => card.items.length), options));
  const folded = columns.map((column) => column.cards.some((card) => card.ssrCut < card.items.length));
  const ssr = columns.map((column, index) => columnHeight(column, ssrCuts[index]!, options));
  const foldedSsr = ssr.filter((_, index) => folded[index]);
  const unfoldedFull = full.filter((_, index) => !folded[index]);
  const ceiling = foldedSsr.length ? Math.max(...foldedSsr) : Math.max(0, ...full);
  const floor = foldedSsr.length ? ceiling * floorRatio : 0;
  const quiet = full.length ? Math.min(...full) : 0;
  const target = Math.max(unfoldedFull.length ? Math.max(...unfoldedFull) : 0, Math.min(quiet, ceiling), floor);
  const cuts = columns.map((column, index) => {
    const cards = column.cards;
    if (!cards.length) return [];
    const above = cards.slice(0, -1);
    const aboveHeight = sum(above.map((card) => cardHeight(card, card.ssrCut, options))) + options.gap * above.length;
    const last = cards[cards.length - 1]!;
    const room = target - aboveHeight - last.head;
    return [...above.map((card) => card.ssrCut), fitCut(last, room, options)];
  });
  return { target, cuts };
}
