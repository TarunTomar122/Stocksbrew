import { unstable_cache } from "next/cache";

import type { ChartCurve } from "@/lib/backtest/chart";
import type { Caveat, CurveStats, RuleSpec, YearRow } from "@/lib/backtest/types";
import { adminFirestore } from "@/lib/firebase-admin";

/**
 * Rule-based strategies, written by `backend/agentdata/backtest_strategies.py`
 * into `tm_strategies/{slug}` (what the pages show) and
 * `tm_strategy_runs/{slug}` (full rebalance history and frozen decisions).
 */

export type StrategyHolding = {
  symbol: string;
  name: string | null;
  sector: string | null;
  weight: number;
  rank: number;
  reason: string;
};

export type StrategyBacktest = {
  label: string;
  period: { start: string; end: string; first_signal: string; years: number; sessions: number };
  strategy: CurveStats;
  benchmark: CurveStats;
  years: YearRow[];
  hit_rate: { beat: number; years: number; complete_years_only: boolean };
  worst_year: YearRow | null;
  best_year: YearRow | null;
  turnover: { per_rebalance: number | null; annual: number | null; rebalances: number };
  costs: { bps: number; total_drag: number };
  cash: { average: number; max: number };
  curve: ChartCurve;
  spark: { strategy: number[]; benchmark: number[] };
  recent_rebalances: {
    signal_date: string;
    trade_date: string;
    added: string[];
    dropped: string[];
    held: number;
    turnover: number;
    cash: number;
    market_ok: boolean;
  }[];
  caveats: Caveat[];
};

export type StrategyLive = {
  since: string;
  sessions: number;
  first_fill_date: string | null;
  last_date: string | null;
  strategy_return: number | null;
  benchmark_return: number | null;
  curve: { dates: string[]; strategy: number[]; benchmark: number[] } | null;
  decisions: number;
  note: string | null;
};

export type Strategy = {
  slug: string;
  order: number;
  name: string;
  style: string;
  tagline: string;
  summary: string;
  rules: string[];
  watch_out: string;
  status: "backtested" | "live_only";
  universe: { id: string; label: string; description: string; kind: "stocks" | "funds"; count: number; top_by_size: number | null };
  rebalance: string;
  cost_bps: number;
  benchmark: string;
  spec: RuleSpec;
  risk: { label: string; level: "lower" | "similar" | "higher" | "unknown"; ratio: number | null };
  basket: {
    as_of: string;
    holdings: StrategyHolding[];
    cash_weight: number;
    eligible: number;
    candidates: number;
    note: string | null;
  };
  backtest: StrategyBacktest | null;
  caveats: Caveat[];
  live: StrategyLive;
  last_rebalance: { signal_date: string; trade_date: string | null } | null;
  next_rebalance: { signal_date: string; trade_date: string; estimated: boolean };
  price_as_of: string;
  source: string;
  published_at: string;
  generated_at: string;
};

/** The directory needs a card's worth of each strategy, not the full curve and basket text. */
export type StrategySummary = Pick<
  Strategy,
  | "slug"
  | "order"
  | "name"
  | "style"
  | "tagline"
  | "status"
  | "universe"
  | "risk"
  | "live"
  | "price_as_of"
  | "published_at"
  | "next_rebalance"
> & {
  holdings: number;
  cash_weight: number;
  backtest: Pick<StrategyBacktest, "period" | "strategy" | "benchmark" | "spark" | "hit_rate"> & {
    /** The latest row of the year table (this year so far, usually). */
    latest_year: YearRow | null;
  } | null;
  /** Today's basket by sector, largest first. Sector names only: what it holds is part of Pro. */
  sectors: { sector: string; weight: number }[];
  /** Today's holdings, largest first. Callers show these only to plans that see holdings. */
  top_holdings: { symbol: string; weight: number }[];
};

function sectorWeights(holdings: StrategyHolding[]): { sector: string; weight: number }[] {
  const out = new Map<string, number>();
  for (const holding of holdings) if (holding.sector) out.set(holding.sector, (out.get(holding.sector) ?? 0) + holding.weight);
  return [...out.entries()].map(([sector, weight]) => ({ sector, weight })).sort((a, b) => b.weight - a.weight);
}

function isStrategy(value: unknown): value is Strategy {
  const item = value as Partial<Strategy> | null;
  return Boolean(item && typeof item.slug === "string" && typeof item.name === "string" && item.basket && item.live);
}

function summarize(item: Strategy): StrategySummary {
  return {
    slug: item.slug,
    order: item.order ?? 0,
    name: item.name,
    style: item.style,
    tagline: item.tagline,
    status: item.status,
    universe: item.universe,
    risk: item.risk,
    live: { ...item.live, curve: null },
    price_as_of: item.price_as_of,
    published_at: item.published_at,
    next_rebalance: item.next_rebalance,
    holdings: item.basket.holdings.length,
    cash_weight: item.basket.cash_weight,
    backtest: item.backtest
      ? {
          period: item.backtest.period,
          strategy: item.backtest.strategy,
          benchmark: item.backtest.benchmark,
          spark: item.backtest.spark,
          hit_rate: item.backtest.hit_rate,
          latest_year: item.backtest.years.length > 0 ? item.backtest.years[item.backtest.years.length - 1] : null,
        }
      : null,
    sectors: sectorWeights(item.basket.holdings),
    top_holdings: [...item.basket.holdings]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8)
      .map((holding) => ({ symbol: holding.symbol, weight: holding.weight })),
  };
}

async function listStrategiesUncached(): Promise<StrategySummary[]> {
  const snapshot = await adminFirestore.collection("tm_strategies").get();
  const items: Strategy[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (isStrategy(data)) items.push(data);
  }
  return items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(summarize);
}

async function getStrategyUncached(slug: string): Promise<Strategy | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const doc = await adminFirestore.collection("tm_strategies").doc(slug).get();
  if (!doc.exists) return null;
  const data = doc.data();
  return isStrategy(data) ? data : null;
}

// The job runs once a day after the close, so ten minutes is plenty fresh.
export const listStrategies = unstable_cache(listStrategiesUncached, ["strategies-list-v4"], { revalidate: 600 });
export const getStrategy = unstable_cache(getStrategyUncached, ["strategy-v2"], { revalidate: 600 });

/** Slugs the signed-in user tracks. Stored on their own user doc by /api/strategies/track. */
export type TrackedStrategy = { slug: string; tracked_at: string };

export function readTrackedStrategies(userDoc: unknown): TrackedStrategy[] {
  const raw = (userDoc as { tracked_strategies?: unknown } | null)?.tracked_strategies;
  if (!Array.isArray(raw)) return [];
  const out: TrackedStrategy[] = [];
  for (const item of raw) {
    const entry = item as Partial<TrackedStrategy> | null;
    if (entry && typeof entry.slug === "string" && !out.some((seen) => seen.slug === entry.slug)) {
      out.push({ slug: entry.slug, tracked_at: typeof entry.tracked_at === "string" ? entry.tracked_at : "" });
    }
  }
  return out;
}
