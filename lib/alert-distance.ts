/**
 * How far a price alert is from firing, and the alerts list grouped by stock (owner, Nov 12: "group the ones for the
 * same stock together"). Pure, so it can be tested.
 */

export type AlertCondition = "above" | "below";

/**
 * Where an alert stands against the latest price. `met`: the condition is already true ("Price below $130" with the
 * price at $62.51). Otherwise `pct` is the move the price still needs, signed: negative for a fall to a "below" level,
 * positive for a rise to an "above" one. Null when there is no level, condition or price to compare.
 */
export type AlertDistance = { met: true; condition: AlertCondition } | { met: false; pct: number };

export function alertDistance(condition: AlertCondition | null | undefined, target: number | null | undefined, price: number | null | undefined): AlertDistance | null {
  if (condition !== "above" && condition !== "below") return null;
  if (typeof target !== "number" || !Number.isFinite(target) || target <= 0) return null;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  if (condition === "below" ? price <= target : price >= target) return { met: true, condition };
  return { met: false, pct: ((target - price) / price) * 100 };
}

type AlertLike = { ticker: string; kind: string; condition: AlertCondition | null; target_price: number | null; created_at?: string | null };

export type AlertGroup<T extends AlertLike> = { ticker: string; alerts: Array<{ alert: T; distance: AlertDistance | null }> };

/** When the alert was set, as a number to sort by; an alert with no (or a bad) date sorts after every dated one. */
function setAt(alert: AlertLike): number {
  const time = alert.created_at ? Date.parse(alert.created_at) : Number.NaN;
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

/**
 * One group per ticker, newest first (owner, Nov 12: "most recent on top"): within a stock its most recently set alert
 * first, and the stocks ordered by their most recently set alert. Ties keep the order the alerts came in. Each alert
 * still carries how far it is from firing, for the row to say.
 */
export function groupAlerts<T extends AlertLike>(alerts: T[], priceOf: (alert: T) => number | null | undefined): AlertGroup<T>[] {
  const groups = new Map<string, { group: AlertGroup<T>; first: number }>();
  alerts.forEach((alert, index) => {
    const distance = alert.kind === "price_threshold" ? alertDistance(alert.condition, alert.target_price, priceOf(alert)) : null;
    const key = alert.ticker.toUpperCase();
    const entry = groups.get(key) ?? { group: { ticker: alert.ticker, alerts: [] }, first: index };
    entry.group.alerts.push({ alert, distance });
    groups.set(key, entry);
  });
  const ranked = [...groups.values()].map((entry) => {
    // Array.prototype.sort is stable, so alerts set at the same moment keep the incoming order.
    entry.group.alerts.sort((a, b) => {
      const gap = setAt(b.alert) - setAt(a.alert);
      return Number.isNaN(gap) ? 0 : gap;
    });
    return { ...entry, newest: setAt(entry.group.alerts[0]!.alert) };
  });
  ranked.sort((a, b) => (a.newest === b.newest ? a.first - b.first : a.newest > b.newest ? -1 : 1));
  return ranked.map((entry) => entry.group);
}
