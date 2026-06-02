import { unstable_cache } from "next/cache";
import { adminFirestore } from "@/lib/firebase-admin";

export type AnomalyItem = {
  instrument_id: string;
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  logo_url: string | null;
  price: number;
  previous_close: number | null;
  day_change_pct: number;
  day_change_abs: number | null;
  volume: number | null;
  direction: "up" | "down";
  headline: string | null;
  thesis: string | null;
  today_brief: string | null;
  news_count: number;
  source_count: number;
  overall_score: number | null;
  overall_label: string | null;
  catalyst: string | null;
  risk: string | null;
  key_points: string[];
  visual_summary: {
    what_changed?: string;
    why_it_matters?: string;
    what_to_watch?: string;
  } | null;
  overall_verdict: string | null;
  comparative_context: {
    day_change_pct?: number;
    vs_market_day_change_pct?: number;
    vs_sector_day_change_pct?: number;
    market_percentile?: number;
  } | null;
};

export type DailyAnomaliesDoc = {
  market: string;
  generated_at: string;
  date: string;
  anomaly_count: number;
  threshold_pct: number;
  up_count: number;
  down_count: number;
  summary: string;
  anomalies: AnomalyItem[];
  enriched_at?: string;
};

type DailyAnomalyTickerDoc = {
  market: string;
  ticker: string;
  generated_at?: string;
  enriched_at?: string;
  date?: string;
  summary?: string;
  anomaly?: AnomalyItem;
};

async function getDailyAnomaliesUncached(
  market: "US" | "IN" = "US",
): Promise<DailyAnomaliesDoc | null> {
  const doc = await adminFirestore
    .collection("tm_daily_anomalies")
    .doc(`${market}__latest`)
    .get();
  if (!doc.exists) return null;
  return doc.data() as DailyAnomaliesDoc;
}

export const getDailyAnomalies = unstable_cache(
  getDailyAnomaliesUncached,
  ["daily-anomalies"],
  { revalidate: 120 },
);

async function getDailyAnomalyForTickerUncached(
  market: "US" | "IN" = "US",
  ticker: string,
): Promise<AnomalyItem | null> {
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) return null;
  const doc = await adminFirestore
    .collection("tm_daily_anomaly_tickers")
    .doc(`${market}__${normalized}`)
    .get();
  if (!doc.exists) return null;
  const data = doc.data() as DailyAnomalyTickerDoc;
  return data.anomaly ?? null;
}

export const getDailyAnomalyForTicker = unstable_cache(
  getDailyAnomalyForTickerUncached,
  ["daily-anomaly-for-ticker"],
  { revalidate: 120 },
);
