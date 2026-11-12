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

/** Closer to firing sorts first: met alerts, then the smallest move left, then alerts with nothing to measure. */
export function closeness(distance: AlertDistance | null): number {
  if (!distance) return Number.POSITIVE_INFINITY;
  return distance.met ? -1 : Math.abs(distance.pct);
}

type AlertLike = { ticker: string; kind: string; condition: AlertCondition | null; target_price: number | null };

export type AlertGroup<T extends AlertLike> = { ticker: string; alerts: Array<{ alert: T; distance: AlertDistance | null }> };

/**
 * One group per ticker, its alerts closest to firing first; groups ordered by their closest alert. Ties keep the
 * order the alerts came in (newest first from the server).
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
    // Array.prototype.sort is stable, so equal closeness keeps the incoming order.
    entry.group.alerts.sort((a, b) => closeness(a.distance) - closeness(b.distance) || 0);
    return { ...entry, best: closeness(entry.group.alerts[0]?.distance ?? null) };
  });
  ranked.sort((a, b) => (a.best === b.best ? a.first - b.first : a.best < b.best ? -1 : 1));
  return ranked.map((entry) => entry.group);
}
