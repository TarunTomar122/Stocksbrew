import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";

// Heat list reader.
//
// Backs the /heat page. Prefer the compact read-model
// `tm_heat_list_view/{market}` so the page does not read the full analytical
// `tm_heat_list/{market}` document (~500 rows) on every request.

export type HeatSetupType =
  | "overheated"
  | "breakout"
  | "dip_setup"
  | "news_spike"
  | "catalyst_watch"
  | "momentum_watch"
  | string;

export type HeatDirection = "bullish" | "caution" | "mixed" | string;
export type HeatRiskLevel = "low" | "medium" | "high" | string;

export type HeatRow = {
  instrument_id: string;
  ticker: string;
  name: string;
  sector?: string;
  industry?: string;
  logo_url?: string;
  heat_score: number;
  reasons: string[];

  // Product-ready setup framing (added in build_heat_list)
  setup_type?: HeatSetupType;
  heat_direction?: HeatDirection;
  risk_level?: HeatRiskLevel;
  primary_driver?: string;
  secondary_drivers?: string[];
  reason_sentence?: string;
  suggested_action?: string;

  // Fundamentals signals (primary - works from day 1)
  overall_score?: number | null;
  momentum_score?: number | null;

  // Mention velocity signals (bonus - builds over 7+ days)
  mention_count_7d: number;
  primary_mention_7d: number;
  baseline_per_day: number;
  recent_per_day: number;
  multiplier: number;
  first_appearance: boolean;

  // News signals
  sentiment_mean_7d: number;
  sentiment_label: "bullish" | "bearish" | "neutral" | string;

  // Technical / price context
  rsi_14?: number | null;
  /** overbought | oversold | neutral | insufficient_data */
  rsi_14_state?: string;
  price?: number | null;
  day_change_pct?: number | null;
  day_change_abs?: number | null;
  previous_close?: number | null;
};

export type HeatSummary = {
  headline?: string;
  body?: string;
  top_ticker?: string;
  bullish_count?: number;
  caution_count?: number;
  counts?: Record<string, number>;
};

export type HeatList = {
  market: "US" | "IN";
  generated_at?: string;
  universe_id?: string;
  ai_universe_id?: string;
  window_days: number;
  baseline_window_days: number;
  row_count: number;
  rows: HeatRow[];
  setup_counts?: Record<string, number>;
  summary?: HeatSummary;
};

export function compactHeatListForView(data: HeatList | null): HeatList | null {
  if (!data) return null;
  const sorted = [...data.rows].sort((a, b) => (b.heat_score ?? 0) - (a.heat_score ?? 0));
  const setupCounts: Record<string, number> = {};
  const selected = new Map<string, HeatRow>();

  for (const row of sorted) {
    const setup = row.setup_type ?? "momentum_watch";
    setupCounts[setup] = (setupCounts[setup] ?? 0) + 1;
  }

  for (const row of sorted.slice(0, 6)) {
    selected.set(row.instrument_id, row);
  }
  for (const setup of Object.keys(setupCounts)) {
    let kept = 0;
    for (const row of sorted) {
      if ((row.setup_type ?? "momentum_watch") !== setup) continue;
      selected.set(row.instrument_id, row);
      kept += 1;
      if (kept >= 10) break;
    }
  }

  return {
    ...data,
    row_count: data.row_count || data.rows.length,
    setup_counts: setupCounts,
    rows: sorted.filter((row) => selected.has(row.instrument_id)),
  };
}

async function getHeatListUncached(
  market: "US" | "IN" = "US",
): Promise<HeatList | null> {
  const compactDoc = await adminFirestore.collection("tm_heat_list_view").doc(market).get();
  if (compactDoc.exists) {
    const data = compactDoc.data() as HeatList;
    return {
      ...data,
      rows: Array.isArray(data.rows) ? data.rows : [],
    };
  }
  const doc = await adminFirestore.collection("tm_heat_list").doc(market).get();
  if (!doc.exists) return null;
  const data = doc.data() as HeatList;
  // Defensive: Firestore maps occasionally omit empty arrays - normalise.
  return compactHeatListForView({
    ...data,
    rows: Array.isArray(data.rows) ? data.rows : [],
  });
}

const getHeatListCached = unstable_cache(
  getHeatListUncached,
  ["heat-list"],
  { revalidate: 120 },
);

export async function getHeatList(
  market: "US" | "IN" = "US",
): Promise<HeatList | null> {
  return getHeatListCached(market);
}
