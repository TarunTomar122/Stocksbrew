import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";

/**
 * What changed at each strategy rebalance, written by
 * `backend/agentdata/backtest_strategies.py` into
 * `tm_strategy_rebalances/{slug}__{signal_date}` on the run that first
 * publishes a new month's basket. Every sentence comes from the strategy's own
 * rule and the numbers it read, never from a model.
 */

export type RebalanceAdded = { symbol: string; name: string | null; weight: number; rank: number | null; reason: string };
export type RebalanceRemoved = {
  symbol: string;
  name: string | null;
  previous_weight: number;
  cause: "rank" | "filter" | "size" | "market" | "data" | "pool";
  reason: string;
};
export type RebalanceKept = { symbol: string; name: string | null; weight: number; previous_weight: number };

export type StrategyRebalance = {
  slug: string;
  name: string;
  kind: "stocks" | "funds";
  /** The session the trades fill (or, for rules on financials, the close the picks were made on). */
  date: string;
  signal_date: string;
  trade_date: string | null;
  previous_as_of: string | null;
  headline: string;
  why: string;
  rule: string;
  added: RebalanceAdded[];
  removed: RebalanceRemoved[];
  kept: RebalanceKept[];
  reweighted: number;
  held: number;
  previously_held: number;
  cash_weight: number;
  previous_cash_weight: number;
  market_ok: boolean;
  source: string;
  generated_at: string;
};

/** How many days a rebalance stays news on My stocks. */
export const REBALANCE_FRESH_DAYS = 5;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isRebalance(value: unknown): value is StrategyRebalance {
  const item = value as Partial<StrategyRebalance> | null;
  return Boolean(
    item &&
      typeof item.slug === "string" &&
      typeof item.name === "string" &&
      typeof item.date === "string" &&
      ISO_DAY.test(item.date) &&
      typeof item.signal_date === "string" &&
      (item.kind === "stocks" || item.kind === "funds") &&
      typeof item.headline === "string" &&
      typeof item.why === "string" &&
      typeof item.rule === "string" &&
      Array.isArray(item.added) &&
      Array.isArray(item.removed) &&
      Array.isArray(item.kept),
  );
}

/** Newest first; one record per date (a re-run rewrites the same document, so this only guards odd data). */
export function newestFirst(items: StrategyRebalance[]): StrategyRebalance[] {
  const seen = new Set<string>();
  return [...items]
    .sort((a, b) => (a.date === b.date ? b.signal_date.localeCompare(a.signal_date) : b.date.localeCompare(a.date)))
    .filter((item) => {
      const key = `${item.slug}:${item.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** The day `days` calendar days before `today` (both YYYY-MM-DD). */
export function dayBefore(today: string, days: number): string {
  const at = new Date(`${today}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() - days);
  return at.toISOString().slice(0, 10);
}

/** The followed strategies' rebalances on or after `since`, newest first, one per strategy. */
export function recentForFollowed(items: StrategyRebalance[], slugs: string[], since: string): StrategyRebalance[] {
  const wanted = new Set(slugs);
  const out: StrategyRebalance[] = [];
  const taken = new Set<string>();
  for (const item of newestFirst(items)) {
    if (!wanted.has(item.slug) || item.date < since || taken.has(item.slug)) continue;
    taken.add(item.slug);
    out.push(item);
  }
  return out;
}

async function latestRebalanceUncached(slug: string): Promise<StrategyRebalance | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  // One record a month per strategy: a short list, sorted here rather than asking the store for an index.
  const snapshot = await adminFirestore.collection("tm_strategy_rebalances").where("slug", "==", slug).get();
  const items: StrategyRebalance[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (isRebalance(data)) items.push(data);
  }
  return newestFirst(items)[0] ?? null;
}

async function rebalancesSinceUncached(since: string): Promise<StrategyRebalance[]> {
  if (!ISO_DAY.test(since)) return [];
  const snapshot = await adminFirestore.collection("tm_strategy_rebalances").where("date", ">=", since).get();
  const items: StrategyRebalance[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (isRebalance(data)) items.push(data);
  }
  return newestFirst(items);
}

// The job writes these once a day after the close, so ten minutes is fresh enough.
export const getLatestRebalance = unstable_cache(latestRebalanceUncached, ["strategy-rebalance-latest-v1"], { revalidate: 600 });
export const getRebalancesSince = unstable_cache(rebalancesSinceUncached, ["strategy-rebalances-since-v1"], { revalidate: 600 });
