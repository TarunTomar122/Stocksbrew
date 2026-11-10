import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";

/**
 * Multi-year adjusted daily closes, written by `backend/agentdata/prices.py`
 * into `tm_price_history_daily/{SYMBOL}`. The stock page uses it for the
 * long-run chart and for "where is the price against its own history".
 *
 * The raw series is ~3,000 points, so stats are computed here on the full
 * series and the chart gets a thinned copy.
 */

type RawDoc = {
  symbol?: string;
  dates?: string[];
  closes?: number[];
  source?: string;
  fetched_at?: string;
  adjusted?: boolean;
};

export type LongPriceHistory = {
  symbol: string;
  source: string;
  adjusted: boolean;
  fetchedAt: string | null;
  firstDate: string;
  lastDate: string;
  /** Thinned series for drawing, oldest first. Always ends on the last close. */
  points: Array<{ date: string; close: number }>;
  high: { close: number; date: string };
  low: { close: number; date: string };
  /** Total return over each window that fits inside the series. */
  returns: Array<{ label: string; years: number; pct: number; fromDate: string }>;
};

const MAX_POINTS = 260;
const SOURCE_LABELS: Record<string, string> = { yahoo_chart: "Yahoo Finance" };

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Pure reducer, exported for tests. */
export function summarizeLongHistory(raw: RawDoc | null | undefined, symbol: string): LongPriceHistory | null {
  const dates = raw?.dates ?? [];
  const closes = raw?.closes ?? [];
  const series: Array<{ date: string; close: number }> = [];
  for (let i = 0; i < Math.min(dates.length, closes.length); i++) {
    const close = closes[i];
    const date = dates[i];
    if (typeof date === "string" && fin(close) && close > 0) series.push({ date, close });
  }
  if (series.length < 60) return null;

  let high = series[0]!;
  let low = series[0]!;
  for (const point of series) {
    if (point.close > high.close) high = point;
    if (point.close < low.close) low = point;
  }

  const last = series[series.length - 1]!;
  const lastMs = new Date(`${last.date}T00:00:00Z`).getTime();
  const returns: LongPriceHistory["returns"] = [];
  for (const years of [3, 5, 10]) {
    const target = new Date(lastMs);
    target.setUTCFullYear(target.getUTCFullYear() - years);
    const targetDay = target.toISOString().slice(0, 10);
    if (series[0]!.date > targetDay) continue;
    const from = series.find((point) => point.date >= targetDay);
    if (!from || from.close <= 0) continue;
    returns.push({
      label: `${years}Y`,
      years,
      pct: ((last.close - from.close) / from.close) * 100,
      fromDate: from.date,
    });
  }

  const step = Math.max(1, Math.ceil(series.length / MAX_POINTS));
  const points = series.filter((_, index) => index % step === 0);
  if (points[points.length - 1] !== last) points.push(last);

  return {
    symbol,
    source: SOURCE_LABELS[raw?.source ?? ""] ?? (raw?.source || "Price history"),
    adjusted: raw?.adjusted !== false,
    fetchedAt: typeof raw?.fetched_at === "string" ? raw.fetched_at : null,
    firstDate: series[0]!.date,
    lastDate: last.date,
    points,
    high: { close: high.close, date: high.date },
    low: { close: low.close, date: low.date },
    returns,
  };
}

async function getLongPriceHistoryUncached(symbol: string): Promise<LongPriceHistory | null> {
  const upper = symbol.trim().toUpperCase();
  if (!upper) return null;
  const doc = await adminFirestore.collection("tm_price_history_daily").doc(upper).get();
  if (!doc.exists) return null;
  return summarizeLongHistory(doc.data() as RawDoc, upper);
}

// The series gains one point a day, so a few hours of staleness is invisible.
export const getLongPriceHistory = unstable_cache(getLongPriceHistoryUncached, ["long-price-history-v1"], {
  revalidate: 6 * 3600,
});
