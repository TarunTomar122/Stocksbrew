/**
 * The edit sheet saves the whole holdings map. A holding whose shares, cost and value did not change keeps its
 * stored `updated_at` (Ideas and Taxes read it as the buy date when there are no tax lots, so restamping it on every
 * save made every holding look bought today), and any field the sheet doesn't send (an import's note) is kept.
 */

type Holding = Record<string, unknown>;

const NUMBERS = ["quantity", "average_cost", "market_value"] as const;

function same(left: unknown, right: unknown): boolean {
  const a = typeof left === "number" && Number.isFinite(left) ? left : null;
  const b = typeof right === "number" && Number.isFinite(right) ? right : null;
  return a === b;
}

function positive(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function keepHoldingDates<T extends Holding>(next: Record<string, T>, stored: unknown): Record<string, T> {
  const before = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries(next).map(([id, holding]) => {
      const old = before[id];
      if (!old || typeof old !== "object" || Array.isArray(old)) return [id, holding];
      const prior = old as Holding;
      // With shares on both sides the value is shares × price, and the sheet sends no value then: shares and cost
      // decide. Without shares, a typed value is the holding's size, so it counts too.
      const shares = positive(prior.quantity) && positive(holding.quantity);
      const unchanged = shares
        ? same(prior.quantity, holding.quantity) && same(prior.average_cost, holding.average_cost)
        : NUMBERS.every((key) => same(prior[key], holding[key]));
      if (!unchanged) return [id, { ...prior, ...holding } as T];
      // Unchanged: keep its date, and a value typed earlier that this save left empty.
      return [
        id,
        {
          ...prior,
          ...holding,
          ...(prior.updated_at ? { updated_at: prior.updated_at } : {}),
          ...(holding.market_value == null && prior.market_value != null ? { market_value: prior.market_value } : {}),
        } as T,
      ];
    }),
  );
}
