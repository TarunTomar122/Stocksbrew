import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import { batchGetRefs } from "@/lib/firestore";

export type SentimentGaugeComponent = {
  name: string;
  value: number | null;
  score: number;
  weight: number;
};

export type SentimentGaugeDoc = {
  market: string;
  universe_id: string;
  as_of_date: string;
  generated_at: string;
  score: number;
  label: string;
  explanation?: string;
  components: SentimentGaugeComponent[];
};

export type MarketBreadthDoc = {
  market: string;
  universe_id: string;
  as_of_date: string;
  generated_at: string;
  instrument_count: number;
  advancers: number;
  decliners: number;
  unchanged: number;
  up_volume?: number;
  down_volume?: number;
  new_52w_high?: number;
  new_52w_low?: number;
  pct_above_20dma?: number | null;
  pct_above_50dma?: number | null;
  pct_above_200dma?: number | null;
  volatility_proxy?: {
    median_abs_day_change_pct?: number;
  };
  coverage?: {
    sma20_eligible?: number;
    sma50_eligible?: number;
    sma200_eligible?: number;
  };
};

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function walkBack<T>(
  collection: string,
  market: string,
  lookbackDays: number,
): Promise<T | null> {
  const now = new Date();
  const ids: string[] = [];
  for (let i = 0; i < lookbackDays; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    ids.push(`${market}_${formatDate(d)}`);
  }
  const refs = ids.map((id) => adminFirestore.collection(collection).doc(id));
  const docs = await batchGetRefs<T>(refs);
  for (const id of ids) {
    const doc = docs.get(id);
    if (doc) return doc;
  }
  return null;
}

async function getSentimentGaugeUncached(
  market: "US" | "IN" = "US",
  lookbackDays = 7,
): Promise<SentimentGaugeDoc | null> {
  return walkBack<SentimentGaugeDoc>("tm_sentiment_gauge", market, lookbackDays);
}

const getSentimentGaugeCached = unstable_cache(
  getSentimentGaugeUncached,
  ["sentiment-gauge"],
  { revalidate: 120 },
);

export async function getSentimentGauge(
  market: "US" | "IN" = "US",
  lookbackDays = 7,
): Promise<SentimentGaugeDoc | null> {
  return getSentimentGaugeCached(market, lookbackDays);
}

async function getMarketBreadthUncached(
  market: "US" | "IN" = "US",
  lookbackDays = 7,
): Promise<MarketBreadthDoc | null> {
  const latest = await adminFirestore
    .collection("tm_market_breadth")
    .doc(`latest__${market}`)
    .get();
  if (latest.exists) return latest.data() as MarketBreadthDoc;
  return walkBack<MarketBreadthDoc>("tm_market_breadth", market, lookbackDays);
}

const getMarketBreadthCached = unstable_cache(
  getMarketBreadthUncached,
  ["market-breadth"],
  { revalidate: 120 },
);

export async function getMarketBreadth(
  market: "US" | "IN" = "US",
  lookbackDays = 7,
): Promise<MarketBreadthDoc | null> {
  return getMarketBreadthCached(market, lookbackDays);
}

export type MarketMoodDoc = {
  market: string;
  score: number;
  rating: string;
  source: string;
  snapshot_date: string;
  previous_day: number | null;
  previous_week: number | null;
  previous_month: number | null;
  previous_year: number | null;
  captured_at: string;
};

async function getMarketMoodUncached(
  market: "US" | "IN" = "US",
): Promise<MarketMoodDoc | null> {
  const doc = await adminFirestore
    .collection("tm_market_mood")
    .doc(`latest__${market}`)
    .get();
  return doc.exists ? (doc.data() as MarketMoodDoc) : null;
}

const getMarketMoodCached = unstable_cache(
  getMarketMoodUncached,
  ["market-mood"],
  { revalidate: 300 },
);

export async function getMarketMood(
  market: "US" | "IN" = "US",
): Promise<MarketMoodDoc | null> {
  return getMarketMoodCached(market);
}

export type InstitutionalFlowRow = {
  category: string;
  category_label: string;
  buy_cr: number;
  sell_cr: number;
  net_cr: number;
  direction: "inflow" | "outflow" | "flat";
};

export type InstitutionalFlowsDoc = {
  market: string;
  snapshot_date: string;
  source: string;
  captured_at: string;
  flows: InstitutionalFlowRow[];
};

async function getInstitutionalFlowsUncached(
  market: "US" | "IN" = "IN",
): Promise<InstitutionalFlowsDoc | null> {
  const doc = await adminFirestore
    .collection("tm_institutional_flows")
    .doc(`latest__${market}`)
    .get();
  return doc.exists ? (doc.data() as InstitutionalFlowsDoc) : null;
}

const getInstitutionalFlowsCached = unstable_cache(
  getInstitutionalFlowsUncached,
  ["institutional-flows"],
  { revalidate: 300 },
);

export async function getInstitutionalFlows(
  market: "US" | "IN" = "IN",
): Promise<InstitutionalFlowsDoc | null> {
  return getInstitutionalFlowsCached(market);
}

export type EconomicEvent = {
  country: string;
  market: string;
  category: string;
  event: string;
  date: string;
  time: string;
  importance: number;
};

export type EarningsEvent = {
  instrument_id: string;
  ticker: string;
  name: string;
  market: "US" | "IN";
  sector_label?: string | null;
  date: string;
  raw?: string;
};

export type EconomicCalendarDoc = {
  source: string;
  captured_at: string;
  days_ahead: number;
  min_importance: number;
  markets: string[];
  events: EconomicEvent[];
  earnings: EarningsEvent[];
};

async function getEconomicCalendarUncached(): Promise<EconomicCalendarDoc | null> {
  const doc = await adminFirestore
    .collection("tm_economic_calendar")
    .doc("latest")
    .get();
  return doc.exists ? (doc.data() as EconomicCalendarDoc) : null;
}

const getEconomicCalendarCached = unstable_cache(
  getEconomicCalendarUncached,
  ["economic-calendar"],
  { revalidate: 1800 },
);

export async function getEconomicCalendar(): Promise<EconomicCalendarDoc | null> {
  return getEconomicCalendarCached();
}
