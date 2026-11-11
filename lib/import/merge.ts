/**
 * What happens to a stock the person already has when an import brings it
 * again. Pure, so the review table shows exactly what the save will write.
 *
 * keep:    the default. Numbers already saved stay; a blank one is filled in
 *          from the import, so nothing the person typed is ever replaced.
 * replace: the imported numbers win (a blank in the import still keeps the
 *          saved number).
 * add:     a second account or lot: the shares are added together and the
 *          average cost is weighted by shares.
 */

export type MergeMode = "keep" | "replace" | "add";

export const MERGE_MODES: readonly MergeMode[] = ["keep", "replace", "add"];

/** A stock already on the person's list, as the review table needs it. */
export type Held = { kind: "holding" | "watchlist"; shares: number | null; average_cost: number | null };

export type HoldingNumbers = { quantity: number | null; average_cost: number | null; market_value: number | null };

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);

/** The numbers saved after an import of `row` onto `before` (null when the stock is new). */
export function mergeHolding(
  before: Partial<Record<keyof HoldingNumbers, unknown>> | null,
  row: { shares: number | null; average_cost: number | null; market_value: number | null },
  mode: MergeMode,
): HoldingNumbers {
  const had = { quantity: num(before?.quantity), average_cost: num(before?.average_cost), market_value: num(before?.market_value) };
  let quantity: number | null;
  let averageCost: number | null;
  let keeping = false;
  if (mode === "replace") {
    quantity = row.shares ?? had.quantity;
    averageCost = row.average_cost ?? had.average_cost;
  } else if (mode === "add" && had.quantity !== null && row.shares !== null) {
    quantity = had.quantity + row.shares;
    // A weighted cost needs both costs; with one missing the saved cost stays, since a guess would be worse.
    averageCost =
      had.average_cost !== null && row.average_cost !== null
        ? Math.round(((had.quantity * had.average_cost + row.shares * row.average_cost) / quantity) * 10_000) / 10_000
        : had.average_cost;
  } else {
    // keep, or "add" with nothing to add to: fill only what is missing.
    keeping = true;
    quantity = had.quantity ?? row.shares;
    averageCost = had.average_cost ?? row.average_cost;
  }
  return {
    quantity,
    average_cost: averageCost,
    // A typed-in value only stands in while there are no shares to price. Keeping never clears a saved one.
    market_value: keeping
      ? had.market_value ?? (quantity !== null ? null : row.market_value)
      : quantity !== null
        ? null
        : row.market_value ?? had.market_value,
  };
}

/** Did the merge change anything the person had saved? */
export function mergeChanges(before: Partial<Record<keyof HoldingNumbers, unknown>> | null, after: HoldingNumbers): boolean {
  if (!before) return true;
  return num(before.quantity) !== after.quantity || num(before.average_cost) !== after.average_cost || num(before.market_value) !== after.market_value;
}

/** The person's tracked stocks from their user doc, keyed by instrument id. */
export function heldFromUserDoc(doc: Record<string, unknown> | null | undefined): Record<string, Held> {
  if (!doc) return {};
  const tracked = Array.isArray(doc.tracked_stocks) ? doc.tracked_stocks.filter((id): id is string => typeof id === "string") : [];
  const positions = doc.watchlist_positions && typeof doc.watchlist_positions === "object" ? (doc.watchlist_positions as Record<string, unknown>) : {};
  const holdings = doc.watchlist_holdings && typeof doc.watchlist_holdings === "object" ? (doc.watchlist_holdings as Record<string, Record<string, unknown> | undefined>) : {};
  const out: Record<string, Held> = {};
  for (const id of tracked) {
    const holding = holdings[id];
    out[id] = {
      kind: positions[id] === "holding" ? "holding" : "watchlist",
      shares: num(holding?.quantity),
      average_cost: num(holding?.average_cost),
    };
  }
  return out;
}
