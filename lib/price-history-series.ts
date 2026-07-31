import type { LatestPrice } from "@/lib/types";

export type PriceHistorySeriesPoint = { date: string; close: number };

function historyDayKey(iso?: string): string | null {
  if (!iso) return null;
  const day = iso.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * Build one close per trading date and let the mutable latest quote win.
 *
 * Firestore intentionally keeps the intraday quote outside the rolling daily
 * history array. This overlay gives charts live prices without rewriting the
 * unchanged history payload on every scheduled quote refresh.
 */
export function buildPriceHistorySeries(
  priceData?: Pick<LatestPrice, "history_window" | "quote" | "captured_at" | "updated_at"> | null,
): PriceHistorySeriesPoint[] {
  if (!priceData) return [];

  const pairs: PriceHistorySeriesPoint[] = [];
  for (const row of priceData.history_window ?? []) {
    const close = row.quote?.current;
    const date = historyDayKey(row.captured_at);
    if (typeof close === "number" && Number.isFinite(close) && date) {
      pairs.push({ date, close });
    }
  }

  const latestClose = priceData.quote?.current;
  // Provider time is the market-data truth. `updated_at` only says when
  // Firestore was written and must not make an older quote appear as today's.
  const latestDate = historyDayKey(priceData.captured_at || priceData.updated_at);
  const newestHistoryDate = pairs.reduce<string | null>(
    (newest, row) => (!newest || row.date > newest ? row.date : newest),
    null,
  );
  if (
    typeof latestClose === "number"
    && Number.isFinite(latestClose)
    && latestDate
    && (!newestHistoryDate || latestDate >= newestHistoryDate)
  ) {
    pairs.push({ date: latestDate, close: latestClose });
  }

  const byDate = new Map<string, number>();
  for (const row of pairs.sort((a, b) => a.date.localeCompare(b.date))) {
    byDate.set(row.date, row.close);
  }

  return [...byDate.entries()].map(([date, close]) => ({ date, close }));
}
