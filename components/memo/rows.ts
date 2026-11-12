/**
 * The memo's stock cards ("Who moved it", "Calls that changed"): small cards side by side, all the same height
 * (owner rule 3) and the same width (owner rule 4: an odd last card stays one column, never stretched over the row).
 * Two to a row on a phone, and on wide screens as many as fit in one row up to five (never fewer than three columns,
 * so one or two cards do not stretch), else rows of four or three.
 */

/** Columns on wide screens for `count` cards. */
export function wideColumns(count: number): number {
  if (count <= 5) return Math.max(3, count);
  return [4, 3, 5].find((cols) => count % cols === 0) ?? 4;
}

// Written out whole so Tailwind finds every class.
const LG_COLS = ["", "lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3", "lg:grid-cols-4", "lg:grid-cols-5"];

/** The list's classes. */
export function memoGrid(count: number): string {
  return `grid grid-cols-2 gap-3 ${LG_COLS[wideColumns(count)] ?? "lg:grid-cols-4"}`;
}

/** The card itself: the whole card is the link, with a hover. */
export const MEMO_CARD =
  "oa-surface flex h-full min-w-0 flex-col border border-oa-border bg-oa-card p-3 transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent sm:p-3.5";
