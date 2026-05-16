import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";

// Heat list reader.
//
// Backs the /heat page. One Firestore read (`tm_heat_list/{market}`) returns
// a fully joined, pre-ranked list - no per-stock fan-out on the server. The
// backend `build_heat_list.py` stage writes this doc after every pipeline
// run (see backend/heat_list.py for the scoring model).

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
  summary?: HeatSummary;
};

async function getHeatListUncached(
  market: "US" | "IN" = "US",
): Promise<HeatList | null> {
  const doc = await adminFirestore.collection("tm_heat_list").doc(market).get();
  if (!doc.exists) return null;
  const data = doc.data() as HeatList;
  // Defensive: Firestore maps occasionally omit empty arrays - normalise.
  return {
    ...data,
    rows: Array.isArray(data.rows) ? data.rows : [],
  };
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
