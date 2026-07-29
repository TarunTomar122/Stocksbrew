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
  /** Canonical quote timestamp used when this mover was selected. */
  price_as_of?: string | null;
  direction: "up" | "down";
  narrative_status?: "verified" | "unverified";
  narrative_as_of?: string | null;
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
    drivers?: Array<{
      label?: string;
      detail?: string;
      direction?: string;
      strength?: number;
    }>;
    catalyst_cards?: Array<{
      event?: string;
      detail?: string;
      window?: string;
      priced_in?: string;
    }>;
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

type LatestQuoteSnapshot = Pick<LatestPrice, "quote"> &
  Partial<Pick<LatestPrice, "captured_at" | "updated_at" | "session_phase">>;

function marketDate(value: string | null | undefined, market: "US" | "IN"): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: market === "IN" ? "Asia/Kolkata" : "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isSameTradingSession(
  anomaly: AnomalyItem,
  latest: LatestQuoteSnapshot,
  market: "US" | "IN",
): boolean {
  const anomalyDate = marketDate(anomaly.price_as_of, market);
  const quoteDate = marketDate(latest.captured_at ?? latest.updated_at, market);
  return Boolean(anomalyDate && quoteDate && anomalyDate === quoteDate);
}

/**
 * Source volatile quote fields from the same canonical collection used by
 * stock pages. If that quote differs from the materialized mover snapshot,
 * clear its explanation as well: research must not be presented as a reason
 * for a price it did not describe.
 */
export function mergeAnomaliesWithLatestPrices(
  feed: DailyAnomaliesDoc,
  latestPrices: ReadonlyMap<string, LatestQuoteSnapshot>,
): DailyAnomaliesDoc {
  let changed = false;
  const anomalies = feed.anomalies.map((anomaly) => {
    const latest = latestPrices.get(anomaly.instrument_id);
    const quote = latest?.quote;
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
    // Anomaly research is tied to a trading session, not an exact tick. A
    // quote can move between the 20-minute open scan and the next intraday
    // refresh while the same news catalyst remains the reason it is moving.
    // Keep that session's verified research visible, but still clear it at a
    // new market date so yesterday's reason can never describe today.
    if (
      anomaly.narrative_status === "verified" &&
      latest &&
      isSameTradingSession(anomaly, latest, feed.market as "US" | "IN")
    ) {
      return {
        ...anomaly,
        price,
        previous_close: previousClose,
        day_change_abs: dayChangeAbs,
        day_change_pct: dayChangePct,
        volume,
        direction,
      };
    }
    return {
      ...anomaly,
      price,
      previous_close: previousClose,
      day_change_abs: dayChangeAbs,
      day_change_pct: dayChangePct,
      volume,
      direction,
      narrative_status: "unverified" as const,
      headline: null,
      thesis: null,
      today_brief: null,
      news_count: 0,
      source_count: 0,
      overall_score: null,
      overall_label: null,
      catalyst: null,
      risk: null,
      key_points: [],
      visual_summary: null,
      move_explanation: null,
      overall_verdict: null,
      comparative_context: null,
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
