import type * as React from "react";

/**
 * One heading or row of a day: `weight` is its height in short rows (0 for a heading, which is not counted as a row);
 * `height`, when given, is a heading's own height, so a fold can measure the whole column.
 */
export type DayBlock = { node: React.ReactNode; weight: number; height?: number };

type Sized = { weight: number; height?: number };

/** A block's height in short rows: a row's weight, a heading's `height` (0 when it has none). */
export function blockHeight(block: Sized): number {
  return block.height ?? Math.max(0, block.weight);
}

/**
 * The day's blocks cut after about `budget` short rows: the shown part, the rest, and how many rows the rest holds.
 * The first row always shows, a heading never ends the shown part on its own, and a cut that would hide only one row
 * hides none (a "Show 1 more" costs the row it hides). With `button`, headings count their `height` and the cut keeps
 * room for the "Show N more" line under it, so the folded column is about `budget` tall in all.
 */
export function foldDay<T extends Sized>(blocks: T[], budget: number, options: { button?: number } = {}): { shown: T[]; rest: T[]; hidden: number } {
  const button = options.button ?? 0;
  const rows = blocks.filter((block) => block.weight > 0).length;
  // Measured with headings: a day that fits whole is never folded for the sake of its own button.
  if (button > 0 && blocks.reduce((sum, block) => sum + blockHeight(block), 0) <= budget) return { shown: blocks, rest: [], hidden: 0 };
  let used = 0;
  // The height up to the last row shown: what the column is if the cut comes before this row (its headings go too).
  let lastRow = 0;
  let seen = 0;
  let cut = blocks.length;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.weight <= 0) {
      if (button > 0) used += blockHeight(block);
      continue;
    }
    if (seen > 0 && used + block.weight + button > budget) {
      // Measured, a tall row (an IPO) may end nearer the budget shown than cut: it shows when it runs over by less
      // than the cut would leave short.
      const over = used + block.weight + button - budget;
      const short = budget - (lastRow + button);
      if (!(button > 0 && over < short)) {
        cut = index;
        break;
      }
    }
    used += block.weight;
    lastRow = used;
    seen += 1;
  }
  if (rows - seen <= 1) return { shown: blocks, rest: [], hidden: 0 };
  // Headings just before the cut belong with the rows after it.
  while (cut > 0 && blocks[cut - 1].weight <= 0) cut -= 1;
  return { shown: blocks.slice(0, cut), rest: blocks.slice(cut), hidden: rows - seen };
}

/**
 * One fold budget for a week of days side by side: the full height of its quietest day that has events, kept between
 * `min` and `max`. Every busier day folds to about that height (its "Show N more" line included), so the columns end
 * level; a day under `min` keeps its own height rather than making every other day fold to a few rows.
 */
export function weekBudget<T extends Sized>(days: T[][], { min, max }: { min: number; max: number }): number {
  const heights = days.filter((blocks) => blocks.some((block) => block.weight > 0)).map((blocks) => blocks.reduce((sum, block) => sum + blockHeight(block), 0));
  const quiet = heights.filter((height) => height >= min);
  if (quiet.length === 0) return max;
  return Math.min(max, Math.max(min, Math.min(...quiet)));
}
