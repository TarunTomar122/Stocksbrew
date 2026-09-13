import { Suspense } from "react";

import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { FREE_RADAR_TRACK_LIMIT } from "@/lib/pro-features";
import {
  getWatchlistView,
  overlayLatestPrices,
  getRadarStockStates,
  getIdeaMarketData,
  buildHoldingsDiagnosis,
  type WatchlistRow,
} from "@/lib/watchlist-view";
import { getDailyAnomalyTickers, type AnomalyItem } from "@/lib/daily-anomalies";
import { getPremarketMovers } from "@/lib/premarket";
import { getLatestEarningsIntelForInstruments } from "@/lib/earnings-intel";
import { getPreEarningsIntelForInstruments } from "@/lib/pre-earnings-intel";
import {
  buildHealthProps,
  buildIdeas,
  enrichIdeas,
  collectIdeaInstrumentIds,
} from "@/lib/radar-next-data";
import { getInstrumentLabels } from "@/lib/instrument-resolver";
import { buildEarningsCards, buildHubRows } from "@/lib/watchlist-hub-data";
import { WatchlistHub } from "@/components/watchlist-hub";
import { WatchlistHubSkeleton } from "@/components/watchlist-hub-skeleton";
import { WatchlistShowcase } from "@/components/watchlist-showcase";
import { RadarPageAnalytics } from "@/components/radar-page-analytics";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { interTight } from "@/components/oa/font";

export const dynamic = "force-dynamic";

export default function WatchlistPage() {
  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <OaSiteHeader />
      <div className="mx-auto w-full max-w-[76rem] px-4 sm:px-6">
        <Suspense fallback={<WatchlistHubSkeleton />}>
          <WatchlistStream />
        </Suspense>
      </div>
    </main>
  );
}

async function WatchlistStream() {
  const session = await getSessionUser();
  if (!session) {
    return (
      <>
        <RadarPageAnalytics state="signed_out" trackedCount={0} isSubscribed={false} />
        <WatchlistShowcase mode="signed_out" />
      </>
    );
  }

  const [userDoc, watchlistView] = await Promise.all([
    getUserDoc(session.uid),
    getWatchlistView(session.uid).catch(() => null),
  ]);
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const isSubscribed = resolveIsSubscribed(userDoc);

  if (tracked.length === 0) {
    return (
      <>
        <RadarPageAnalytics state="empty" trackedCount={0} isSubscribed={isSubscribed} />
        <WatchlistShowcase mode="empty" />
      </>
    );
  }

  const now = new Date();

  const trackedSet = new Set(tracked);
  const positions =
    userDoc?.watchlist_positions && typeof userDoc.watchlist_positions === "object"
      ? (userDoc.watchlist_positions as Record<string, "holding" | "watchlist">)
      : {};

  const materializedRows = (watchlistView?.rows ?? []) as WatchlistRow[];
  const rowsBase = materializedRows
    .filter((row) => trackedSet.has(row.instrument_id))
    .map((row) => ({
      ...row,
      position_type: positions[row.instrument_id] === "holding" ? "holding" : "watchlist",
    })) as WatchlistRow[];

  const instrumentIds = rowsBase.map((row) => row.instrument_id);
  const anomalyTickers = rowsBase.map((row) => row.ticker).filter(Boolean);
  const holdings = rowsBase.filter((row) => row.position_type === "holding");
  const diagnosis = buildHoldingsDiagnosis(holdings);

  const ideasBase = buildIdeas(watchlistView?.suggestions);
  const ideaIds = collectIdeaInstrumentIds(ideasBase);
  // Everything below only needs the tracked ids (known now), so one parallel
  // wave replaces the old serial overlay -> states -> ideas chain.
  const [rowsPriced, labelsById, radarStockStates, earningsDocs, preEarnings, anomaliesByTicker, ideaMarket, premarketDoc] =
    await Promise.all([
      overlayLatestPrices(rowsBase).catch(() => rowsBase),
      getInstrumentLabels(instrumentIds).catch(() => new Map()),
      getRadarStockStates(instrumentIds).catch(() => ({})),
      getLatestEarningsIntelForInstruments("US", instrumentIds).catch(() => []),
      getPreEarningsIntelForInstruments("US", instrumentIds).catch(() => []),
      // Compact per-ticker anomaly docs: one batched read for the tracked
      // list instead of the full market anomaly feed plus its price overlay.
      getDailyAnomalyTickers("US", anomalyTickers).catch(() => new Map()),
      getIdeaMarketData(ideaIds).catch(() => new Map()),
      getPremarketMovers("US").catch(() => null),
    ]);
  const rows = rowsPriced.map((row) => {
    const label = labelsById.get(row.instrument_id);
    return label ? { ...row, ticker: label.ticker || row.ticker, instrument_name: label.name } : row;
  });

  // Compact anomaly docs are keyed by ticker.
  const anomaliesByInstrumentId = new Map<string, AnomalyItem>();
  for (const [ticker, anomaly] of anomaliesByTicker) {
    if (trackedSet.has(anomaly.instrument_id)) {
      anomaliesByInstrumentId.set(anomaly.instrument_id, anomaly);
    }
  }
  const gappersByInstrumentId = new Map<string, number>();
  for (const gapper of [...(premarketDoc?.gappers_up ?? []), ...(premarketDoc?.gappers_down ?? [])]) {
    gappersByInstrumentId.set(gapper.instrument_id, gapper.pre_market_change_pct);
  }
  const earningsById = new Map(earningsDocs.map((doc) => [doc.instrument_id, doc]));

  const hubRows = buildHubRows({
    rows,
    states: radarStockStates,
    anomaliesByInstrumentId,
    earningsById,
    gappersByInstrumentId,
    now,
  });
  const earningsCards = buildEarningsCards(hubRows, preEarnings, now);
  const health = buildHealthProps(diagnosis, holdings.length);
  const ideas = enrichIdeas(ideasBase, ideaMarket);

  return (
    <>
      <RadarPageAnalytics state="active" trackedCount={hubRows.length} isSubscribed={isSubscribed} />
      <WatchlistHub
        nowIso={new Date().toISOString()}
        rows={hubRows}
        earningsCards={earningsCards}
        health={health}
        ideas={ideas}
        isSubscribed={isSubscribed}
        freeLimit={FREE_RADAR_TRACK_LIMIT}
      />
    </>
  );
}
