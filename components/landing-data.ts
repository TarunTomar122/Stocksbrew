import { cache } from "react";

import { getSessionUser } from "@/lib/auth-server";
import { getDailyAnomalies, type AnomalyItem } from "@/lib/daily-anomalies";
import {
  findLandingHeroAnomaly,
  mergeLandingHeroAnomaly,
  shuffledLandingHeroBrewTickers,
  stockSummaryToAnomaly,
} from "@/lib/landing-hero-featured";
import { getCurrentMarket } from "@/lib/market";
import type { PriceHistoryPoint } from "@/lib/price-history-chart";
import { getScreenerRows } from "@/lib/screener";
import { getStockPriceHistory, getStockSummary } from "@/lib/stock";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

/**
 * Server data for the app chrome and the landing page. Kept apart from the
 * old terminal landing streams on purpose: anything a layout imports, its
 * client components ship on every page, and those streams pull in the chart
 * library. Import nothing here that renders.
 */

export const getLandingUserContext = cache(async () => {
  const session = await getSessionUser().catch(() => null);
  if (!session) {
    return {
      signedIn: false,
      isSubscribed: false,
      trackedIds: [] as string[],
    };
  }
  const userDoc = await getUserDoc(session.uid).catch(() => null);
  const isSubscribed = resolveIsSubscribed(userDoc);
  const trackedIds = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
    : [];
  return {
    signedIn: true,
    isSubscribed,
    trackedIds,
  };
});

export const getLandingAnomaliesDoc = cache(async () => {
  const market = getCurrentMarket();
  return getDailyAnomalies(market).catch(() => null);
});

export const getLandingAnomalies = cache(async () => {
  const doc = await getLandingAnomaliesDoc();
  return doc?.anomalies ?? [];
});

export async function resolveLandingHeroFeatured(
  anomalies: AnomalyItem[],
): Promise<{ anomaly: AnomalyItem; priceHistory: PriceHistoryPoint[] } | null> {
  const market = getCurrentMarket();

  // The showcase stock that moved most today goes first (shuffle order breaks ties), so the card shows a real move.
  // The movers list only holds the day's big or explained moves; the screener snapshot has every showcase stock's day.
  const shuffled = shuffledLandingHeroBrewTickers();
  const rows = await getScreenerRows(shuffled).catch(() => new Map());
  const moveOf = (ticker: string) =>
    Math.abs(rows.get(ticker.toUpperCase())?.day_pct ?? findLandingHeroAnomaly(anomalies, ticker)?.day_change_pct ?? 0);
  // A move with a confirmed reason makes the better example, so those go first, then the size of the move.
  const explained = (ticker: string) => (findLandingHeroAnomaly(anomalies, ticker)?.move_explanation?.headline && moveOf(ticker) >= 1 ? 1 : 0);
  const order = [...shuffled].sort((a, b) => explained(b) - explained(a) || moveOf(b) - moveOf(a));
  for (const ticker of order) {
    const summary = await getStockSummary(ticker, market).catch(() => null);
    if (!summary) continue;

    const priceHistory = await getStockPriceHistory(summary.instrument_id).catch(() => []);

    const fromAnomalies = findLandingHeroAnomaly(anomalies, ticker);
    const anomaly = fromAnomalies
      ? mergeLandingHeroAnomaly(fromAnomalies, summary)
      : stockSummaryToAnomaly(summary);

    return { anomaly, priceHistory };
  }

  return null;
}
