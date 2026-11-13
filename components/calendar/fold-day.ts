import type * as React from "react";

/** One heading or row of a day, with its height in short rows (0 for a heading). */
export type DayBlock = { node: React.ReactNode; weight: number };

/**
 * The day's blocks cut after about `budget` short rows: the shown part, the rest, and how many rows the rest holds.
 * The first row always shows, a heading never ends the shown part on its own, and a cut that would hide only one row
 * hides none (a "Show 1 more" costs the row it hides).
 */
export function foldDay<T extends { weight: number }>(blocks: T[], budget: number): { shown: T[]; rest: T[]; hidden: number } {
  const rows = blocks.filter((block) => block.weight > 0).length;
  let used = 0;
  let seen = 0;
  let cut = blocks.length;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.weight <= 0) continue;
    if (seen > 0 && used + block.weight > budget) {
      cut = index;
      break;
    }
    used += block.weight;
    seen += 1;
  }
  if (rows - seen <= 1) return { shown: blocks, rest: [], hidden: 0 };
  // Headings just before the cut belong with the rows after it.
  while (cut > 0 && blocks[cut - 1].weight <= 0) cut -= 1;
  return { shown: blocks.slice(0, cut), rest: blocks.slice(cut), hidden: rows - seen };
}
