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
  // Yahoo daily bars encode the trading date as midnight UTC. That is a date
  // label, not an instant to shift into New York (which would make July 30
  // look like July 29). Non-midnight values are real intraday instants.
  if (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  ) {
    const labelledDay = value.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(labelledDay)) return labelledDay;
  }
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

function clearAnomalyNarrative(
  anomaly: AnomalyItem,
  quoteFields: Pick<
    AnomalyItem,
    | "price"
    | "previous_close"
    | "day_change_abs"
    | "day_change_pct"
    | "volume"
    | "direction"
    | "price_as_of"
  >,
): AnomalyItem {
  return {
    ...anomaly,
    ...quoteFields,
    narrative_status: "unverified",
    narrative_as_of: null,
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
}

/**
 * Reconcile one materialized anomaly with the canonical live quote.
 *
 * A different market session means the anomaly is no longer current and must
 * disappear. Within one session, a direction reversal invalidates the old
 * narrative; smaller same-direction quote changes may keep verified research.
 */
export function mergeAnomalyWithLatestPrice(
  anomaly: AnomalyItem,
  latest: LatestQuoteSnapshot | null | undefined,
  market: "US" | "IN",
): AnomalyItem | null {
  const quote = latest?.quote;
  const price = finiteNumber(quote?.current);
  if (!quote || price === null) return anomaly;

  const latestPriceAsOf = latest?.captured_at ?? latest?.updated_at ?? null;
  const hasSessionTimestamps = Boolean(anomaly.price_as_of && latestPriceAsOf);
  const sameTradingSession = Boolean(
    latest && isSameTradingSession(anomaly, latest, market),
  );
  if (hasSessionTimestamps && !sameTradingSession) return null;

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
  const quoteFields = {
    price,
    previous_close: previousClose,
    day_change_abs: dayChangeAbs,
    day_change_pct: dayChangePct,
    volume,
    direction,
    price_as_of: latestPriceAsOf ?? anomaly.price_as_of ?? null,
  };

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

  if (
    anomaly.narrative_status === "verified" &&
    sameTradingSession &&
    direction === anomaly.direction
  ) {
    return { ...anomaly, ...quoteFields };
  }
  return clearAnomalyNarrative(anomaly, quoteFields);
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
  const anomalies: AnomalyItem[] = [];
  for (const anomaly of feed.anomalies) {
    const merged = mergeAnomalyWithLatestPrice(
      anomaly,
      latestPrices.get(anomaly.instrument_id),
      feed.market as "US" | "IN",
    );
    if (merged !== anomaly) changed = true;
    if (merged) anomalies.push(merged);
  }

  if (!changed) return feed;
  return {
    ...feed,
    anomalies,
    anomaly_count: anomalies.length,
    up_count: anomalies.filter((row) => row.direction === "up").length,
    down_count: anomalies.filter((row) => row.direction === "down").length,
  };
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

  // The writer updates these compact docs and deletes tickers that leave the
  // current feed in one batch. Stock pages should not download the full market
  // feed just to resolve one ticker.
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
  ["daily-anomaly-for-ticker-v3"],
  { revalidate: 120 },
);
