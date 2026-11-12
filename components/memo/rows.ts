/**
 * How the memo's cards sit under the chart: small cards side by side, all the same height (owner rule 3) and, within
 * a row, the same width. Short sections share a row (`packRows`); a section of more than four cards takes rows of
 * its own, as many as fit in one row up to five, else rows of four or three.
 */

/** Columns on wide screens for a section of `count` cards on its own rows. */
export function wideColumns(count: number): number {
  if (count <= 5) return Math.max(3, count);
  return [4, 3, 5].find((cols) => count % cols === 0) ?? 4;
}

// Written out whole so Tailwind finds every class.
const LG_COLS = ["", "lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3", "lg:grid-cols-4", "lg:grid-cols-5"];

/* ── packing the sections into rows ─────────────────────────────────────── */

/**
 * Below the chart the memo's sections share rows on a 12-column grid instead of each taking a row of its own and
 * leaving the right side empty (owner, Nov 12: "could be side by side cz all empty space on right"). A row holds up
 * to four cards; every card in a row is the same width, and the row's sections end level. Sections keep their order.
 * A section of more than four cards takes whole rows itself (`wideColumns`).
 */

/** Cards a shared row holds on wide screens. */
export const ROW_SLOTS = 4;

export type PackBlock<K extends string = string> = { key: K; count: number };

export type PackedBlock<K extends string = string> = PackBlock<K> & {
  /** Columns of the 12 the section spans on wide screens. */
  span: number;
  /** Its cards' columns on wide screens. */
  cols: number;
  /** Each card's width in grid columns: 12 for a lone card on its row, which then lays out across. */
  unit: number;
};

export type PackedRow<K extends string = string> = PackedBlock<K>[];

/**
 * What a row of `slots` cards costs: three or four fill it at a good width; two make each card half the row; one
 * leaves a lone card the whole width. Every row costs a little, so two halves that fit together share a row.
 */
function rowCost(slots: number): number {
  return (slots >= 3 ? 0 : slots === 2 ? 2 : 6) + 0.5;
}

/**
 * The sections in rows, in order: empty ones dropped (owner rule 4, no card without data), a section of more than
 * four cards on rows of its own, and the rest grouped so the fewest rows have only one or two cards.
 */
export function packRows<K extends string>(blocks: ReadonlyArray<PackBlock<K>>): PackedRow<K>[] {
  const out: PackedRow<K>[] = [];
  let run: PackBlock<K>[] = [];
  const flush = () => {
    for (const row of splitRun(run)) {
      const slots = row.reduce((sum, block) => sum + block.count, 0);
      const unit = 12 / slots;
      out.push(row.map((block) => ({ ...block, span: block.count * unit, cols: block.count, unit })));
    }
    run = [];
  };
  for (const block of blocks) {
    if (block.count <= 0) continue;
    if (block.count > ROW_SLOTS) {
      flush();
      out.push([{ ...block, span: 12, cols: wideColumns(block.count), unit: 12 / wideColumns(block.count) }]);
    } else run.push(block);
  }
  flush();
  return out;
}

/** The cheapest split of a run of small sections into rows of at most four cards, keeping their order. */
function splitRun<K extends string>(run: PackBlock<K>[]): PackBlock<K>[][] {
  const n = run.length;
  const best: Array<{ cost: number; from: number }> = [{ cost: 0, from: -1 }];
  for (let end = 1; end <= n; end++) {
    best[end] = { cost: Infinity, from: -1 };
    let slots = 0;
    for (let start = end - 1; start >= 0; start--) {
      slots += run[start]!.count;
      if (slots > ROW_SLOTS) break;
      const cost = best[start]!.cost + rowCost(slots);
      if (cost < best[end]!.cost) best[end] = { cost, from: start };
    }
  }
  const rows: PackBlock<K>[][] = [];
  for (let end = n; end > 0; end = best[end]!.from) rows.unshift(run.slice(best[end]!.from, end));
  return rows;
}

// Written out whole so Tailwind finds every class.
const SPAN: Record<number, string> = {
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  6: "lg:col-span-6",
  8: "lg:col-span-8",
  9: "lg:col-span-9",
  12: "lg:col-span-12",
};

/** A shared row: 12 columns on wide screens, with a header row and a card row its sections line up on. */
export const PACKED_ROW = "grid grid-cols-1 gap-3 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-y-0";

/**
 * A section in a shared row: its span, and its heading and cards on the row's two rows, so every heading in the row
 * is as tall as the tallest and every card ends level.
 */
export function packedSection(block: Pick<PackedBlock, "span">): string {
  return `flex min-w-0 flex-col lg:row-span-2 lg:grid lg:[grid-template-rows:subgrid] ${SPAN[block.span] ?? "lg:col-span-12"}`;
}

/**
 * A section's card list. Stock cards sit two to a phone row; cards with a sentence one to a phone row, two from
 * `sm`. On wide screens the section's own columns.
 */
export function packedGrid(block: Pick<PackedBlock, "cols">, phone: "stock" | "text"): string {
  const small = phone === "stock" ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2";
  return `grid ${small} gap-3 ${LG_COLS[block.cols] ?? "lg:grid-cols-4"}`;
}

/** The card itself: the whole card is the link, with a hover. */
export const MEMO_CARD =
  "oa-surface flex h-full min-w-0 flex-col border border-oa-border bg-oa-card p-3 transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent sm:p-3.5";
