/**
 * The memo's stock cards ("Who moved it", "Calls that changed"): small cards side by side, all the same height
 * (owner rule 3). Two to a row on a phone, and on wide screens as many as fit in one row up to five, else rows of
 * four or three. The last card takes whatever its row has left, so no row ends half empty (owner rule 4).
 */

/** Columns on wide screens for `count` cards. */
export function wideColumns(count: number): number {
  if (count <= 5) return Math.max(1, count);
  return [4, 3, 5].find((cols) => count % cols === 0) ?? 4;
}

/** How many wide-screen columns the last card spans. */
export function lastSpan(count: number): number {
  const cols = wideColumns(count);
  const rest = count % cols;
  return rest === 0 ? 1 : cols - rest + 1;
}

// Written out whole so Tailwind finds every class.
const LG_COLS = ["", "lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3", "lg:grid-cols-4", "lg:grid-cols-5"];
const LG_SPAN = ["", "lg:col-span-1", "lg:col-span-2", "lg:col-span-3", "lg:col-span-4", "lg:col-span-5"];

/** The list's classes. */
export function memoGrid(count: number): string {
  return `grid ${count === 1 ? "grid-cols-1" : "grid-cols-2"} gap-3 ${LG_COLS[wideColumns(count)] ?? "lg:grid-cols-4"}`;
}

/** A card's classes for its place in the list: the last one spans what its row has left, on a phone and wide. */
export function memoCell(index: number, count: number): string {
  if (index !== count - 1) return "min-w-0";
  const phone = count > 1 && count % 2 === 1 ? "col-span-2" : "";
  return `min-w-0 ${phone} ${LG_SPAN[lastSpan(count)] ?? ""}`.trim();
}

/** The card itself: the whole card is the link, with a hover. */
export const MEMO_CARD =
  "oa-surface flex h-full min-w-0 flex-col border border-oa-border bg-oa-card p-3 transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent sm:p-3.5";
