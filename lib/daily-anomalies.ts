import { unstable_cache } from "next/cache";
import { adminFirestore } from "@/lib/firebase-admin";
import type { LatestPrice } from "@/lib/types";

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
  move_explanation?: {
    cause_type?: string;
    headline?: string;
    why_it_matters?: string;
    confidence?: "high" | "medium" | "low" | string;
    searched_externally?: boolean;
    evidence?: Array<{ title?: string; url?: string }>;
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
  /** @deprecated No longer written or shown in the UI. */
  summary?: string;
  anomalies: AnomalyItem[];
  enriched_at?: string;
};

type DailyAnomalyTickerDoc = {
  market: string;
  ticker: string;
  generated_at?: string;
  enriched_at?: string;
  date?: string;
  anomaly?: AnomalyItem;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Keep materialized research/explanations, but source volatile quote fields
 * from the same canonical collection used by stock pages. This prevents a
 * failed or slow anomaly rebuild from showing an old close on the homepage.
 */
export function mergeAnomaliesWithLatestPrices(
  feed: DailyAnomaliesDoc,
  latestPrices: ReadonlyMap<string, Pick<LatestPrice, "quote">>,
): DailyAnomaliesDoc {
  let changed = false;
  const anomalies = feed.anomalies.map((anomaly) => {
    const quote = latestPrices.get(anomaly.instrument_id)?.quote;
    const price = finiteNumber(quote?.current);
    if (!quote || price === null) return anomaly;

    const previousClose = finiteNumber(quote.previous_close) ?? anomaly.previous_close;
    const dayChangeAbs =
      finiteNumber(quote.day_change_abs) ??
      (previousClose !== null ? price - previousClose : anomaly.day_change_abs);
    const dayChangePct =
      finiteNumber(quote.day_change_pct) ??
      (previousClose !== null && previousClose !== 0
        ? ((price - previousClose) / previousClose) * 100
        : anomaly.day_change_pct);
    const volume = finiteNumber(quote.volume) ?? anomaly.volume;
    const direction: AnomalyItem["direction"] = dayChangePct >= 0 ? "up" : "down";

    if (
      price === anomaly.price &&
      previousClose === anomaly.previous_close &&
      dayChangeAbs === anomaly.day_change_abs &&
      dayChangePct === anomaly.day_change_pct &&
      volume === anomaly.volume &&
      direction === anomaly.direction
    ) {
      return anomaly;
    }

    changed = true;
    return {
      ...anomaly,
      price,
      previous_close: previousClose,
      day_change_abs: dayChangeAbs,
      day_change_pct: dayChangePct,
      volume,
      direction,
      comparative_context: anomaly.comparative_context
        ? { ...anomaly.comparative_context, day_change_pct: dayChangePct }
        : anomaly.comparative_context,
    };
  });

  return changed ? { ...feed, anomalies } : feed;
}

async function getDailyAnomaliesUncached(
  market: "US" | "IN" = "US",
): Promise<DailyAnomaliesDoc | null> {
  const doc = await adminFirestore
    .collection("tm_daily_anomalies")
    .doc(`${market}__latest`)
    .get();
  if (!doc.exists) return null;
  const feed = doc.data() as DailyAnomaliesDoc;
  const instrumentIds = Array.from(
    new Set(feed.anomalies.map((row) => row.instrument_id).filter(Boolean)),
  );
  if (instrumentIds.length === 0) return feed;

  const latestPrices = await adminFirestore
    .getAll(
      ...instrumentIds.map((instrumentId) =>
        adminFirestore.collection("tm_latest_prices").doc(instrumentId),
      ),
    )
    .then((docs) => {
      const prices = new Map<string, LatestPrice>();
      for (const priceDoc of docs) {
        if (priceDoc.exists) prices.set(priceDoc.id, priceDoc.data() as LatestPrice);
      }
      return prices;
    })
    .catch(() => new Map<string, LatestPrice>());
  return mergeAnomaliesWithLatestPrices(feed, latestPrices);
}

export const getDailyAnomalies = unstable_cache(
  getDailyAnomaliesUncached,
  ["daily-anomalies"],
  { revalidate: 120 },
);

function normalizeAnomalyTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

/** Match a ticker against today's anomaly feed (case-insensitive). */
export function findAnomalyInFeed(
  anomalies: AnomalyItem[] | null | undefined,
  ticker: string,
): AnomalyItem | null {
  const normalized = normalizeAnomalyTicker(ticker);
  if (!normalized || !anomalies?.length) return null;
  return anomalies.find((row) => normalizeAnomalyTicker(row.ticker) === normalized) ?? null;
}

async function getDailyAnomalyForTickerUncached(
  market: "US" | "IN" = "US",
  ticker: string,
): Promise<AnomalyItem | null> {
  const normalized = normalizeAnomalyTicker(ticker);
  if (!normalized) return null;

  // Prefer the latest feed. Per-ticker docs are a read-model optimization and
  // can briefly lag after a rebuild, which is bad on stock pages where stale
  // move explanations are very visible.
  const feed = await getDailyAnomaliesUncached(market);
  const latest = findAnomalyInFeed(feed?.anomalies, normalized);
  if (latest) return latest;

  const doc = await adminFirestore
    .collection("tm_daily_anomaly_tickers")
    .doc(`${market}__${normalized}`)
    .get();
  if (doc.exists) {
    const data = doc.data() as DailyAnomalyTickerDoc;
    if (data.anomaly) return data.anomaly;
  }

  return null;
}

export const getDailyAnomalyForTicker = unstable_cache(
  getDailyAnomalyForTickerUncached,
  ["daily-anomaly-for-ticker-v2"],
  { revalidate: 120 },
);
