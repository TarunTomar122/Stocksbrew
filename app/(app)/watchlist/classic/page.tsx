import Link from "next/link";
import { AnimatedIcon } from "@/components/animated-icon";
import type { ReactNode } from "react";
import { Suspense } from "react";

import { ProCtaLink } from "@/components/pro-cta";
import { US_PRO_MONTHLY_MO } from "@/lib/pricing";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { DemoRadar } from "@/components/demo-radar";
import { RadarPageSkeleton } from "@/components/radar-hub-skeleton";
import { RadarEarningsRailsStream } from "@/components/radar-page-streams";
import {
  RadarDiagnosisSectionSkeleton,
  RadarEarningsRailSkeleton,
} from "@/components/page-stream-skeletons";
import { scrubLegacyBrand } from "@/lib/brand";
import {
  getRadarUserView,
  getRadarStockStates,
  getWatchlistView,
  isActiveRadarUserView,
  overlayLatestPrices,
  buildHoldingsDiagnosis,
  getPillarLiftSuggestions,
  buildPillarLiftPayloadSync,
  mergeSuggestionCandidates,
  weakestPillarFromTilt,
  type PillarLiftPayload,
} from "@/lib/watchlist-view";
import type { WatchlistBrief, WatchlistRow, WatchlistPulse, WatchlistTodaySetup, RadarUserView } from "@/lib/watchlist-view";
import type { Directive } from "@/lib/stock";
import { StockLogo } from "@/components/stock-logo";
import { StrategicDirective } from "@/components/strategic-directive";
import { RadarLedger } from "@/components/radar-ledger";
import { TodayMarketEvents } from "@/components/radar-activity";
import { partitionActivityEvents, type RadarActivityEvent } from "@/lib/activity-events";
import { WatchlistTabs } from "@/components/watchlist-tabs";
import { TrackButton } from "@/components/track-button";
import { YourBookLayout } from "@/components/your-book-layout";
import { DiagnosisSectorChart, DiagnosisFactorRadar } from "@/components/diagnosis-charts";
import { RadarUpdatingBanner } from "@/components/radar-updating-banner";
import { RadarBatchEditModal } from "@/components/radar-batch-edit-modal";
import { RadarWorkspace, type RadarChatStarter } from "@/components/radar-workspace";
import { RadarDailyBrief } from "@/components/radar-daily-brief";
import { buildRadarRowSignals } from "@/lib/radar-row-signals";
import { buildBookCallHints } from "@/lib/radar-hub-data";
import { compareBookRowsByAttention } from "@/lib/radar-book-sort";
import { RadarBuildingState } from "@/components/radar-building-state";
import { RadarEmptyBuildingGate } from "@/components/radar-empty-building-gate";
import { normalizeDirectiveForUi } from "@/lib/directive-ui";
import { getInstruments } from "@/lib/firestore";
import { getInstrumentLabels } from "@/lib/instrument-resolver";
import {
  getPortfolioExposure,
  getPortfolioScenario,
  type PortfolioExposure,
  type PortfolioScenario,
} from "@/lib/portfolio-scenarios";
import { getSectorRegimes, slugifySector, REGIME_LABEL } from "@/lib/sector-regimes";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getRedditCues } from "@/lib/reddit-cues";
import {
  RadarSignalsOnBook,
  buildBookAnomalyList,
  buildBookBuzzList,
  type BookAnomaly,
  type BookBuzz,
  type BookPremarket,
} from "@/components/radar-signals-on-book";
import { getPremarketMovers, isPremarketLive, type PremarketMovers } from "@/lib/premarket";
import { ConnectedReadCard, SignalChips, type SignalChip } from "@/components/connected-read-card";
import type { DailyAnomaliesDoc } from "@/lib/daily-anomalies";
import type { RedditSnapshot } from "@/lib/reddit-cues";
import type { SectorRegimeDoc } from "@/lib/sector-regimes";

export type LivePick = {
  ticker: string;
  name: string;
  market: "US" | "IN";
  logoUrl: string | null;
  chips: SignalChip[];
  line: string;
};

/** Names lighting up across anomalies and buzz right now, chained with their
 * sector regime. Used to make the empty Radar feel live, not generic. */
function buildLivePicks(
  anomaliesDoc: DailyAnomaliesDoc | null,
  redditSnap: RedditSnapshot | null,
  regimes: Record<string, SectorRegimeDoc>,
  market: "US" | "IN",
  exclude: Set<string>,
  max = 6,
): LivePick[] {
  type Acc = {
    ticker: string;
    name: string;
    logoUrl: string | null;
    sector: string;
    dayChangePct: number | null;
    headline: string | null;
    mentions: number;
    sentiment: string;
    summary: string;
  };
  const byTicker = new Map<string, Acc>();

  for (const a of anomaliesDoc?.anomalies ?? []) {
    const t = String(a.ticker || "").trim().toUpperCase();
    if (!t || exclude.has(t)) continue;
    byTicker.set(t, {
      ticker: t,
      name: a.name || t,
      logoUrl: a.logo_url ?? null,
      sector: String(a.sector || ""),
      dayChangePct: typeof a.day_change_pct === "number" ? a.day_change_pct : null,
      headline: a.headline ?? a.today_brief ?? null,
      mentions: 0,
      sentiment: "",
      summary: "",
    });
  }
  for (const r of redditSnap?.tickers ?? []) {
    const t = String(r.ticker || "").trim().toUpperCase();
    if (!t || exclude.has(t)) continue;
    const prev = byTicker.get(t);
    if (prev) {
      prev.mentions = r.mention_count;
      prev.sentiment = r.sentiment;
      prev.summary = r.summary;
    } else {
      byTicker.set(t, {
        ticker: t, name: t, logoUrl: null, sector: "",
        dayChangePct: null, headline: null,
        mentions: r.mention_count, sentiment: r.sentiment, summary: r.summary,
      });
    }
  }

  const picks: Array<{ pick: LivePick; weight: number }> = [];
  for (const acc of byTicker.values()) {
    const chips: SignalChip[] = [];
    let weight = 0;
    if (acc.dayChangePct != null && Math.abs(acc.dayChangePct) >= 2) {
      const up = acc.dayChangePct >= 0;
      chips.push({ kind: up ? "anomaly_up" : "anomaly_down", label: `${up ? "Up" : "Down"} ${Math.abs(acc.dayChangePct).toFixed(1)}%` });
      weight += 2 + Math.min(4, Math.abs(acc.dayChangePct) / 3);
    }
    if (acc.mentions > 0) {
      chips.push({ kind: "buzz", label: "Reddit buzz" });
      weight += 2;
    }
    const regime = acc.sector ? regimes[slugifySector(acc.sector)] : undefined;
    if (regime) {
      chips.push({ kind: "regime", label: REGIME_LABEL[regime.regime] });
      weight += 1;
    }
    if (chips.length === 0) continue;
    const line = acc.headline || acc.summary || "Moving on fresh activity today.";
    picks.push({
      pick: { ticker: acc.ticker, name: acc.name, market, logoUrl: acc.logoUrl, chips, line },
      weight,
    });
  }

  return picks
    .sort((a, b) => b.weight - a.weight)
    .slice(0, max)
    .map((p) => p.pick);
}

export const dynamic = "force-dynamic";

type Dict = Record<string, unknown>;

// =============================================================================
// PAGE
// =============================================================================

export default async function WatchlistPage() {
  const session = await getSessionUser();
  if (!session) {
    return <DemoRadar />;
  }

  return (
    <Suspense fallback={<RadarPageSkeleton />}>
      <WatchlistRadarStream />
    </Suspense>
  );
}

async function WatchlistRadarStream() {
  const SHOW_TEST_UPDATING_BANNER = false;
  const SHOW_SCENARIO_LAB = false;
  const session = await getSessionUser();
  if (!session) {
    return <DemoRadar />;
  }

  const userDoc = await getUserDoc(session.uid);
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const isSubscribed = resolveIsSubscribed(userDoc);
  const [watchlistView, radarUserView, portfolioExposure] = await Promise.all([
    getWatchlistView(session.uid).catch(() => null),
    getRadarUserView(session.uid).catch(() => null),
    getPortfolioExposure(session.uid).catch(() => null),
  ]);
  const activeRadarUserView = isActiveRadarUserView(radarUserView) ? radarUserView : null;
  const nvdaScenario = SHOW_SCENARIO_LAB
    ? await getPortfolioScenario(session.uid).catch(() => null)
    : null;
  const radar = userDoc?.radar_v1 || {};
  const materializedRows = (watchlistView?.rows || radar.rows || []) as WatchlistRow[];
  const watchlistPositions =
    userDoc?.watchlist_positions && typeof userDoc.watchlist_positions === "object"
      ? (userDoc.watchlist_positions as Record<string, "holding" | "watchlist">)
      : {};
  // watchlist_holdings is the source of truth for share quantities — always fresher than the view.
  const watchlistHoldings =
    userDoc?.watchlist_holdings && typeof userDoc.watchlist_holdings === "object"
      ? (userDoc.watchlist_holdings as Record<string, { quantity?: number | null; market_value?: number | null; average_cost?: number | null; source?: string; updated_at?: string }>)
      : {};
  const trackedSet = new Set(tracked);
  const materializedById = new Map(
    materializedRows
      .filter((row) => trackedSet.has(row.instrument_id))
      .map((row) => [row.instrument_id, row] as const),
  );
  const missingMaterializedIds = tracked.filter((instrumentId) => !materializedById.has(instrumentId));
  const fallbackInstruments = missingMaterializedIds.length
    ? await getInstruments(missingMaterializedIds).catch(() => new Map())
    : new Map();
  // Build rows from profile truth first so holdings/watching updates are instant.
  const rowsBase = tracked
    .map((instrumentId) => {
      const materialized = materializedById.get(instrumentId);
      const profileHolding = watchlistHoldings[instrumentId];
      // Merge holding from user profile — it's updated synchronously on save, so always current.
      // Preserve portfolio_weight_pct from the materialized row so computePillarAverages
      // can dollar-weight scores even when the profile override is active.
      const holdingOverride: WatchlistRow["holding"] =
        watchlistPositions[instrumentId] === "holding" && profileHolding
          ? {
              quantity: profileHolding.quantity ?? null,
              market_value: profileHolding.market_value ?? null,
              average_cost: profileHolding.average_cost ?? null,
              source: profileHolding.source,
              updated_at: profileHolding.updated_at,
              portfolio_weight_pct: (materialized?.holding?.portfolio_weight_pct as number | null | undefined) ?? null,
            }
          : undefined;
      if (materialized) {
        return {
          ...materialized,
          // Position and holding come from user profile, not stale materialized payload.
          position_type: watchlistPositions[instrumentId] === "holding" ? "holding" : "watchlist",
          holding: holdingOverride ?? materialized.holding,
        } as WatchlistRow;
      }
      const fallback = fallbackInstruments.get(instrumentId);
      const ticker = fallback?.ticker || instrumentId.split("_").slice(1).join("_");
      const market = instrumentId.startsWith("IN_") ? "IN" : "US";
      return {
        instrument_id: instrumentId,
        ticker,
        logo_url: null,
        position_type: watchlistPositions[instrumentId] === "holding" ? "holding" : "watchlist",
        market,
        sector_label: "",
        industry_label: "",
        currency: market === "IN" ? "INR" : "USD",
        price: null,
        day_change_pct: null,
        day_change_abs: null,
        scores: {
          overall: null,
          verdict: null,
          valuation: null,
          growth: null,
          quality: null,
          momentum: null,
        },
        alerts: [],
        catalysts: [],
        brief_tile: {
          micro: "Price and analysis are syncing.",
          vibe: "wild",
          source: "rules",
        },
        coverage_status: "score_pending",
        has_intel_pro: false,
      } as WatchlistRow;
    })
    .filter((row): row is WatchlistRow => Boolean(row));
  // Keep Radar prices fresh without rebuilding the whole per-user watchlist
  // view on every price tick. Price jobs update tm_latest_prices; this page
  // overlays those quote fields at read time.
  const rowsPriced = await overlayLatestPrices(rowsBase).catch(() => rowsBase);
  // Overlay authoritative ticker+name keyed by instrument_id. The materialized
  // view's stored instrument_name has drifted out of sync (wrong company names),
  // so trust tm_instruments at read time instead.
  const labelsById = await getInstrumentLabels(rowsPriced.map((r) => r.instrument_id)).catch(() => new Map());
  const rows = rowsPriced.map((r) => {
    const label = labelsById.get(r.instrument_id);
    return label ? { ...r, ticker: label.ticker || r.ticker, instrument_name: label.name } : r;
  });
  const regimeMarket = rows[0]?.market === "IN" ? "IN" : "US";
  // Buzz + anomaly lenses on the book: intersect the market-wide feeds (one doc
  // each) with the user's tracked tickers, so it costs two reads, not 2N.
  const trackedTickers = new Set(
    rows.map((r) => String(r.ticker || "").trim().toUpperCase()).filter(Boolean),
  );
  const [anomaliesDoc, redditSnap, premarketDoc] = await Promise.all([
    activeRadarUserView
      ? Promise.resolve(null)
      : getDailyAnomalies(regimeMarket).catch(() => null),
    activeRadarUserView ? Promise.resolve(null) : getRedditCues(regimeMarket).catch(() => null),
    getPremarketMovers(regimeMarket).catch(() => null),
  ]);
  const radarStockStates = activeRadarUserView
    ? await getRadarStockStates(rows.map((r) => r.instrument_id)).catch(() => ({}))
    : {};
  const radarPositionByInstrumentId = Object.fromEntries(
    rows.map((r) => [
      r.instrument_id.toUpperCase(),
      r.position_type === "holding" ? ("holding" as const) : ("watchlist" as const),
    ]),
  );
  const radarRowSignals = activeRadarUserView
    ? buildRadarRowSignals(
        rows.map((r) => r.instrument_id),
        radarStockStates,
        activeRadarUserView,
        radarPositionByInstrumentId,
      )
    : {};
  const premarketLive = isPremarketLive(premarketDoc, regimeMarket);
  const bookPremarket: BookPremarket[] = premarketLive
    ? rows
        .map((r) => {
          const t = String(r.ticker || "").trim().toUpperCase();
          const hit = premarketDoc?.by_ticker?.[t];
          if (!t || !hit) return null;
          return {
            ticker: r.ticker,
            name: r.instrument_name || r.ticker,
            logoUrl: r.logo_url ?? null,
            gapPct: hit.pre_market_change_pct,
            market: regimeMarket,
          } as BookPremarket;
        })
        .filter((x): x is BookPremarket => x !== null)
        .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct))
    : [];
  // Day-change anomalies are yesterday's close until the regular session opens.
  const bookAnomalies: BookAnomaly[] = premarketLive
    ? []
    : buildBookAnomalyList(anomaliesDoc?.anomalies ?? [], trackedTickers, regimeMarket);
  const bookBuzz = buildBookBuzzList(redditSnap?.tickers ?? [], trackedTickers, regimeMarket);

  // Live moat-driven picks for the empty Radar (names moving and buzzing today,
  // chained with their sector regime). Computed only when the book is empty.
  let livePicks: LivePick[] = [];
  if (rows.length === 0) {
    const { sectors: regimeMap } = await getSectorRegimes(regimeMarket).catch(() => ({
      sectors: {} as Record<string, SectorRegimeDoc>,
      macro: null,
    }));
    livePicks = buildLivePicks(
      premarketLive ? null : anomaliesDoc,
      redditSnap,
      regimeMap,
      regimeMarket,
      trackedTickers,
    );
  }
  const suggestions = (watchlistView?.suggestions || radar.suggestions || []) as Dict[];
  const brief = ((watchlistView?.brief || radar.brief) ?? null) as WatchlistBrief | null;
  const pulse = ((watchlistView?.pulse || radar.pulse) ?? null) as WatchlistPulse | null;
  const portfolio = ((watchlistView?.portfolio || radar.portfolio) ?? {}) as Dict;
  const eventRadar = ((watchlistView?.event_radar || radar.event_radar) ?? []) as Dict[];
  const todaySetup = ((watchlistView?.today_setup || (radar as Dict).today_setup) ?? null) as WatchlistTodaySetup | null;
  const builtAt =
    typeof watchlistView?.built_at === "string"
      ? watchlistView.built_at
      : typeof radar.built_at === "string"
      ? radar.built_at
      : undefined;
  const userSourceVersion = Number(userDoc?.watchlist_version ?? 0);
  const viewSourceVersion = Number(watchlistView?.source_version ?? 0);
  const todayVersionApplied = Number(watchlistView?.today_version_applied ?? viewSourceVersion);
  const diagnosisVersionApplied = Number(watchlistView?.diagnosis_version_applied ?? viewSourceVersion);
  const radarStillMaterializing = missingMaterializedIds.length > 0;
  const hasVersionLag =
    tracked.length > 0 &&
    (radarStillMaterializing ||
      (Number.isFinite(userSourceVersion) &&
        Number.isFinite(viewSourceVersion) &&
        userSourceVersion > viewSourceVersion));
  const pendingCount = hasVersionLag
    ? Math.max(missingMaterializedIds.length, rows.filter((row) => row.price === null).length)
    : 0;
  const shouldShowUpdatingBanner = hasVersionLag;
  const isTodayRefreshing =
    hasVersionLag &&
    Number.isFinite(todayVersionApplied) &&
    todayVersionApplied > 0 &&
    todayVersionApplied < userSourceVersion;
  const isDiagnosisRefreshing =
    hasVersionLag &&
    Number.isFinite(diagnosisVersionApplied) &&
    diagnosisVersionApplied > 0 &&
    diagnosisVersionApplied < userSourceVersion;

  if (watchlistView && radar && Array.isArray((radar as Dict).rows)) {
    const materializedRows = (watchlistView.rows || []).map((r) => String(r.ticker || r.instrument_id || ""));
    const legacyRows = ((radar as Dict).rows as Array<Record<string, unknown>>)
      .map((r) => String(r.ticker || r.instrument_id || ""));
    const a = new Set(materializedRows.filter(Boolean));
    const b = new Set(legacyRows.filter(Boolean));
    const onlyA = [...a].filter((x) => !b.has(x));
    const onlyB = [...b].filter((x) => !a.has(x));
    if (onlyA.length > 0 || onlyB.length > 0) {
      console.warn(
        JSON.stringify({
          svc: "watchlist-page",
          msg: "materialized_vs_legacy_divergence",
          uid: session.uid,
          materialized_count: a.size,
          legacy_count: b.size,
          only_materialized: onlyA.slice(0, 8),
          only_legacy: onlyB.slice(0, 8),
        }),
      );
    }
  }

  if (!isSubscribed && rows.length === 0) {
    const emptyTapeItems = buildMarketTapeItems(
      premarketLive ? null : anomaliesDoc,
      premarketLive ? premarketDoc : null,
    );
    return (
      <RadarEmptyBuildingGate trackedCount={tracked.length}>
        <UnsubscribedState
          tracked={tracked}
          livePicks={livePicks}
          anomalies={bookAnomalies}
          buzz={bookBuzz}
          premarket={bookPremarket}
          tapeItems={emptyTapeItems}
          builtAt={builtAt ?? anomaliesDoc?.generated_at}
        />
      </RadarEmptyBuildingGate>
    );
  }
  // Free users with rows get the full Radar — the only difference is the 3-stock
  // limit enforced at /api/track time, not at display time.
  if (rows.length === 0) {
    if (tracked.length > 0) {
      return <RadarBuildingState trackedCount={tracked.length} />;
    }
    return (
      <RadarEmptyBuildingGate trackedCount={0}>
        <main className="flex-grow">
          <div className="mx-auto w-full min-w-0 max-w-screen-2xl px-3 sm:px-6 md:px-10 lg:px-12 xl:px-20 2xl:px-32 py-10 md:py-12 flex flex-col gap-8">
            <BareHeader rowsCount={tracked.length} builtAt={builtAt} />
            <EmptyState
              suggestions={suggestions}
              trackedIds={new Set(tracked)}
              isSubscribed={isSubscribed}
            />
          </div>
        </main>
      </RadarEmptyBuildingGate>
    );
  }

  // Stub rows exist before the materialized view lands — show the building screen
  // instead of an empty-looking book with null scores.
  if (radarStillMaterializing && missingMaterializedIds.length === tracked.length) {
    return <RadarBuildingState trackedCount={tracked.length} />;
  }

  // ── derive directives, ordered by urgency ───────────────────────────────────
  const directiveRows = rows
    .map((row) => ({
      row,
      directive: rowDirective(row),
    }))
    .filter((d): d is { row: WatchlistRow; directive: Directive } => Boolean(d.directive));
  directiveRows.sort((a, b) => directiveUrgency(b.row, b.directive) - directiveUrgency(a.row, a.directive));

  const topDirective = directiveRows[0] ?? null;
  const secondaryDirectives = directiveRows.slice(1, 5);

  // ── live tape items ─────────────────────────────────────────────────────────
  const flatAlerts = flattenAlerts(rows);
  const tapeItems = buildTapeItems(rows, flatAlerts, premarketLive ? premarketDoc : null);

  // ── ledger groupings ────────────────────────────────────────────────────────
  const bookCallHints = activeRadarUserView ? buildBookCallHints(rows) : null;
  const sortBook = activeRadarUserView
    ? (a: WatchlistRow, b: WatchlistRow) => {
        if (!bookCallHints) return byAttention(a, b);
        return compareBookRowsByAttention(a, b, {
          callHints: bookCallHints,
          radarSignals: radarRowSignals,
          preferRadar: true,
        });
      }
    : byAttention;
  const holdings = rows.filter((r) => r.position_type === "holding").sort(sortBook);
  const watching = rows.filter((r) => r.position_type !== "holding").sort(sortBook);

  // ── portfolio score + pillar averages (holdings only) ─────────────────────
  const holdingsDiagnosis = buildHoldingsDiagnosis(holdings);
  const pillarAverages = computePillarAverages(holdings.length > 0 ? holdings : rows);
  const factorTilt = holdings.length > 0
    ? holdingsDiagnosis.factor_tilt
    : asDict(portfolio.factor_tilt);

  // ── activity events ─────────────────────────────────────────────────────────
  const activityEvents = buildActivityEvents(eventRadar, brief);
  const { marketWide: marketWideEvents } = partitionActivityEvents(activityEvents);

  const positionAware = Boolean(portfolio.position_aware);
  const holdingsWithValues = holdings.filter((r) => r.holding && (r.holding.quantity != null || r.holding.market_value != null));
  const totalEnteredValue = num(portfolio.total_entered_value);

  const chatTickers = rows.map((r) => r.ticker).filter(Boolean);
  const chatStarters: RadarChatStarter[] = [
    { label: "How's my Watchlist today?", message: "How is my Watchlist looking today?" },
    ...(topDirective
      ? [
          {
            label: `Why ${topDirective.row.ticker}?`,
            message: `Why is ${topDirective.row.ticker} ${topDirective.directive.stance ?? "in my Watchlist"}? Summarize the current call.`,
          },
        ]
      : []),
    ...(chatTickers.length > 0
      ? [
          {
            label: "Biggest risk in my book",
            message: "What's the biggest risk across my current holdings and watchlist?",
          },
        ]
      : []),
    ...(positionAware && holdingsWithValues.length > 0
      ? [
          {
            label: "Which holding matters most?",
            message: "Which of my holdings matters most today and why?",
          },
        ]
      : chatTickers[0]
        ? [
            {
              label: `News on ${chatTickers[0]}`,
              message: `Any breaking news on ${chatTickers[0]} I should know about?`,
            },
          ]
        : []),
  ].slice(0, 4);

  const portfolioScrubbed = {
    ...portfolio,
    summary: scrubLegacyBrand(text(portfolio.summary)),
  };
  const portfolioForDiagnosis = holdings.length > 0
    ? {
        ...portfolioScrubbed,
        summary: scrubLegacyBrand(holdingsDiagnosis.summary),
        clusters: holdingsDiagnosis.clusters,
        risk_flags: holdingsDiagnosis.risk_flags,
      }
    : portfolioScrubbed;

  return (
    <main className="flex flex-grow flex-col bg-background">
      <style>{tapeStyles}</style>
      <RadarWorkspace
        trackedCount={tracked.length}
        tickers={chatTickers}
        starters={chatStarters}
      >
        {/* ── UPDATING NOTICE — auto-polls via router.refresh() until rebuild lands */}
        {(shouldShowUpdatingBanner || SHOW_TEST_UPDATING_BANNER) && (
          <RadarUpdatingBanner
            pendingCount={Math.max(1, pendingCount)}
            forceVisible={SHOW_TEST_UPDATING_BANNER}
          />
        )}

        <HeaderStrip
          rows={rows}
          builtAt={builtAt}
          pulse={pulse}
          tapeItems={activeRadarUserView ? [] : tapeItems}
          radarView={activeRadarUserView}
          isSubscribed={isSubscribed}
          trackedCount={tracked.length}
          watchlistPositions={watchlistPositions}
        />

        {activeRadarUserView ? (
          <RadarDailyBrief view={activeRadarUserView} />
        ) : (
          <RadarSignalsOnBook
            anomalies={bookAnomalies}
            buzz={bookBuzz}
            premarket={bookPremarket}
            trackedIds={tracked}
            isSubscribed={isSubscribed}
          />
        )}

        <YourBookSection
          holdings={holdings}
          watching={watching}
          earningsReadySlot={
            activeRadarUserView ? undefined : (
              <Suspense fallback={<RadarEarningsRailSkeleton />}>
                <RadarEarningsRailsStream rows={rows} />
              </Suspense>
            )
          }
          preferRadarSignals={Boolean(activeRadarUserView)}
          radarSignalsByInstrumentId={radarRowSignals}
          suggestions={suggestions}
          isSubscribed={isSubscribed}
          trackedCount={tracked.length}
          refreshing={isTodayRefreshing}
          portfolio={portfolioScrubbed}
        />

        <Suspense fallback={<RadarDiagnosisSectionSkeleton />}>
          <RadarDiagnosisStream
            holdings={holdings}
            rows={rows}
            portfolioForDiagnosis={portfolioForDiagnosis}
            pillarAverages={pillarAverages}
            factorTilt={factorTilt}
            suggestions={suggestions}
            tracked={tracked}
            isSubscribed={isSubscribed}
            refreshing={isDiagnosisRefreshing}
            hasHoldings={holdings.length > 0}
            watchlistView={watchlistView}
            trackedCount={tracked.length}
          />
        </Suspense>
      </RadarWorkspace>
    </main>
  );
}

// =============================================================================
// HEADER STRIP — title + meta on left, live alert tape on right
// =============================================================================

function HeaderStrip({
  rows,
  builtAt,
  pulse,
  tapeItems,
  radarView,
  isSubscribed,
  trackedCount,
  watchlistPositions,
}: {
  rows: WatchlistRow[];
  builtAt?: string;
  pulse: WatchlistPulse | null;
  tapeItems: TapeItem[];
  radarView?: RadarUserView | null;
  isSubscribed: boolean;
  trackedCount: number;
  watchlistPositions: Record<string, "holding" | "watchlist">;
}) {
  // Use visible rows (have price data) — ghost Firestore entries shouldn't block the user
  const atLimit = !isSubscribed && rows.length >= 3;
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
            stocksbrew · {todayMasthead()}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-[28px] font-extrabold leading-none tracking-tight text-on-surface md:text-[34px]">
              Watchlist
            </h1>
            {!isSubscribed && (
              <Link
                href="/subscribe"
                className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant tint-warn px-2.5 py-1 text-[11px] font-semibold text-[#f59e0b] hover:border-[#f59e0b] transition-colors"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                  <path d="M4.5 0L5.6 3.2H9L6.2 5.1L7.3 8.3L4.5 6.4L1.7 8.3L2.8 5.1L0 3.2H3.4L4.5 0Z" fill="#f59e0b"/>
                </svg>
                Free · {trackedCount}/3 stocks
              </Link>
            )}
          </div>
          <p className="font-mono text-[11px] text-on-surface-variant">
            {rows.length} {rows.length === 1 ? "ticker" : "tickers"} in Watchlist · refreshed{" "}
            {radarView?.generated_at
              ? formatRelative(radarView.generated_at)
              : builtAt
                ? formatRelative(builtAt)
                : "never"}
            {radarView ? (
              <>
                {" · "}
                {radarView.attention_items.length > 0
                  ? `${radarView.attention_items.length} need attention`
                  : "book quiet"}
                {radarView.upcoming_events.length > 0
                  ? ` · ${radarView.upcoming_events.length} earnings ahead`
                  : ""}
              </>
            ) : pulse?.subtitle ? (
              ` · ${pulse.subtitle}`
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start mt-2">
          <Link
            href="/watchlist/portfolio"
            className="rebalance-btn group relative inline-flex w-fit items-center gap-1.5 overflow-hidden rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <AnimatedIcon name="balance" size={14} className="relative z-10" />
            <span className="relative z-10">Rebalance</span>
          </Link>
          {atLimit ? (
            <ProCtaLink href="/subscribe" size="sm" showStar className="text-[12px]">
              Track every stock you hold →
            </ProCtaLink>
          ) : (
            <RadarBatchEditModal
              initialItems={rows.map((r) => ({
                instrument_id: r.instrument_id,
                ticker: r.ticker,
                name: r.ticker,
                position_type:
                  watchlistPositions[r.instrument_id] === "holding" ? "holding" : "watchlist",
                holding: r.holding
                  ? {
                      quantity: r.holding.quantity ?? null,
                      market_value: r.holding.market_value ?? null,
                      average_cost: r.holding.average_cost ?? null,
                    }
                  : undefined,
              }))}
              isSubscribed={isSubscribed}
              ctaLabel="Add a stock"
            />
          )}
        </div>
      </div>

      {/* live tape */}
      {tapeItems.length > 0 && <LiveTape items={tapeItems} />}
    </header>
  );
}

type TapeItem = {
  ticker: string;
  body: string;
  tone: "bull" | "bear" | "neutral";
};

function LiveTape({ items }: { items: TapeItem[] }) {
  // duplicate the list so the marquee loops seamlessly
  const doubled = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-outline-variant bg-surface-container-low py-2">
      <div className="radar-tape flex shrink-0 items-center gap-8 whitespace-nowrap">
        {doubled.map((item, i) => {
          const color =
            item.tone === "bull"
              ? "#10b981"
              : item.tone === "bear"
              ? "#ef4444"
              : "var(--on-surface-variant)";
          return (
            <Link
              key={`tape-${i}-${item.ticker}`}
              href={`/stock/${encodeURIComponent(item.ticker)}`}
              className="inline-flex items-center gap-2 text-[12px] font-medium tabular-nums hover:underline"
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              <span className="font-semibold text-on-surface">{item.ticker}</span>
              <span style={{ color }}>{item.body}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const tapeStyles = `
@keyframes rebalance-shine {
  0%, 72% { transform: translateX(-120%) skewX(-12deg); }
  100% { transform: translateX(220%) skewX(-12deg); }
}
.rebalance-btn {
  background: linear-gradient(135deg, #0a0a0a 0%, #2a2a2a 42%, #141414 72%, #111111 100%);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    inset 0 -1px 0 rgba(0, 0, 0, 0.25);
}
.rebalance-btn::before {
  content: "";
  position: absolute;
  inset: -20% -40%;
  background: linear-gradient(
    105deg,
    transparent 38%,
    rgba(255, 255, 255, 0.42) 50%,
    transparent 62%
  );
  animation: rebalance-shine 2.8s ease-in-out infinite;
  pointer-events: none;
}
@keyframes radar-tape-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
.radar-tape {
  animation: radar-tape-scroll 50s linear infinite;
  width: max-content;
}
.radar-tape:hover {
  animation-play-state: paused;
}
`;

function buildTapeItems(
  rows: WatchlistRow[],
  flatAlerts: FlatAlert[],
  premarketDoc: PremarketMovers | null = null,
): TapeItem[] {
  const items: TapeItem[] = [];

  if (premarketDoc?.by_ticker) {
    const gaps = rows
      .map((r) => {
        const ticker = String(r.ticker || "").trim().toUpperCase();
        const hit = ticker ? premarketDoc.by_ticker[ticker] : undefined;
        if (!hit) return null;
        return { ticker: r.ticker, gapPct: hit.pre_market_change_pct };
      })
      .filter((row): row is { ticker: string; gapPct: number } => row !== null)
      .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct))
      .slice(0, 6);
    for (const row of gaps) {
      if (Math.abs(row.gapPct) < 1.5) continue;
      items.push({
        ticker: row.ticker,
        body: `pre-market ${row.gapPct >= 0 ? "+" : ""}${row.gapPct.toFixed(2)}%`,
        tone: row.gapPct >= 0 ? "bull" : "bear",
      });
    }
  } else {
    const sortedRows = [...rows]
      .filter((r) => typeof r.day_change_pct === "number")
      .sort((a, b) => Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0))
      .slice(0, 6);
    for (const r of sortedRows) {
      const pct = r.day_change_pct ?? 0;
      if (Math.abs(pct) < 1.5) continue;
      items.push({
        ticker: r.ticker,
        body: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
        tone: pct >= 0 ? "bull" : "bear",
      });
    }
  }
  // then alerts not already represented
  const seen = new Set(items.map((i) => i.ticker));
  for (const f of flatAlerts.slice(0, 8)) {
    if (seen.has(f.ticker)) continue;
    if (premarketDoc && /moved .* today/i.test(f.message)) continue;
    items.push({ ticker: f.ticker, body: f.message, tone: f.tone });
    seen.add(f.ticker);
  }
  return items.slice(0, 14);
}

function buildMarketTapeItems(
  anomaliesDoc: DailyAnomaliesDoc | null,
  premarketDoc: PremarketMovers | null,
): TapeItem[] {
  const items: TapeItem[] = [];

  if (premarketDoc?.by_ticker) {
    const gaps = Object.entries(premarketDoc.by_ticker)
      .map(([ticker, hit]) => ({ ticker, gapPct: hit.pre_market_change_pct }))
      .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct))
      .slice(0, 10);
    for (const row of gaps) {
      if (Math.abs(row.gapPct) < 1.5) continue;
      items.push({
        ticker: row.ticker,
        body: `pre-market ${row.gapPct >= 0 ? "+" : ""}${row.gapPct.toFixed(2)}%`,
        tone: row.gapPct >= 0 ? "bull" : "bear",
      });
    }
  } else {
    const sorted = [...(anomaliesDoc?.anomalies ?? [])]
      .filter((a) => typeof a.day_change_pct === "number")
      .sort((a, b) => Math.abs(b.day_change_pct) - Math.abs(a.day_change_pct))
      .slice(0, 10);
    for (const a of sorted) {
      const pct = a.day_change_pct;
      if (Math.abs(pct) < 1.5) continue;
      items.push({
        ticker: a.ticker,
        body: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
        tone: pct >= 0 ? "bull" : "bear",
      });
    }
  }

  return items.slice(0, 14);
}

function todayMasthead(): string {
  const d = new Date();
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
}

// =============================================================================
// § 02 · TODAY
// =============================================================================

const FALLBACK_EXPLORE_SUGGESTIONS: Dict[] = [
  { ticker: "NVDA", sector: "Semiconductors", why: "AI infra leader · top stocksbrew score", score: 90, market: "US" },
  { ticker: "MSFT", sector: "Software", why: "Quality compounder · steady earnings", score: 82, market: "US" },
  { ticker: "META", sector: "Comm. Services", why: "Analyst runway +33% · momentum", score: 78, market: "US" },
  { ticker: "AAPL", sector: "Consumer Electronics", why: "Most-watched · durable free cash flow", score: 74, market: "US" },
];

function TodaySection({
  brief,
  todaySetup,
  topDirective,
  secondaryDirectives,
  suggestions,
  marketEvents = [],
  earningsTickers = new Set(),
  refreshing,
  trackedIds = new Set(),
}: {
  brief: WatchlistBrief | null;
  todaySetup: WatchlistTodaySetup | null;
  topDirective: { row: WatchlistRow; directive: Directive } | null;
  secondaryDirectives: Array<{ row: WatchlistRow; directive: Directive }>;
  suggestions: Dict[];
  marketEvents?: RadarActivityEvent[];
  earningsTickers?: Set<string>;
  refreshing?: boolean;
  trackedIds?: Set<string>;
}) {
  if (
    !topDirective &&
    !todaySetup?.headline &&
    (!brief?.narrative || !brief.narrative.trim()) &&
    marketEvents.length === 0
  ) {
    return null;
  }

  // Fill secondary grid up to 4 — use suggestions for empty slots
  const fillCount = Math.max(0, 4 - secondaryDirectives.length);
  const exploreSuggestions = (suggestions.length > 0 ? suggestions : FALLBACK_EXPLORE_SUGGESTIONS).slice(0, fillCount);

  return (
    <section className="flex flex-col gap-6">
      <SectionOpener number="02" title="Today" refreshing={refreshing} />

      {todaySetup && todaySetup.signals.length > 0 && <PreopenSetupCard setup={todaySetup} />}

      <TodayMarketEvents events={marketEvents} />

      {/* The read — macro narrative as a confident editorial standfirst. */}
      {brief?.narrative && (
        <p className="text-[17px] md:text-[19px] text-on-surface leading-[1.65] tracking-[-0.01em] max-w-[760px]">
          {brief.narrative}
        </p>
      )}

      {/* Primary directive — feature card with ticker header */}
      {topDirective && (
        <div className="flex flex-col gap-3">
          <PrimaryDirectiveHeader row={topDirective.row} />
          <StrategicDirective
            ticker={topDirective.row.ticker}
            directive={topDirective.directive}
            instrumentId={topDirective.row.instrument_id}
          />
        </div>
      )}

      {/* Secondary directives + explore fill cards */}
      {(secondaryDirectives.length > 0 || exploreSuggestions.length > 0) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {secondaryDirectives.map(({ row, directive }) => (
            <SecondaryDirectiveCard key={row.instrument_id} row={row} directive={directive} />
          ))}
          {exploreSuggestions.map((s) => {
            const market = String(s.market ?? "US") === "IN" ? "IN" : "US";
            const instrumentId = `${market}_${String(s.ticker)}`;
            return (
              <ExploreDirectiveCard
                key={String(s.ticker)}
                suggestion={s}
                isTracked={trackedIds.has(instrumentId)}
                earningsTickers={earningsTickers}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function PreopenSetupCard({ setup }: { setup: WatchlistTodaySetup }) {
  const signals = Array.isArray(setup.signals) ? setup.signals.slice(0, 2) : [];
  const threads = Array.isArray(setup.market_threads) ? setup.market_threads.slice(0, 3) : [];
  const compact = (value: string, limit: number) => {
    const clean = value.trim();
    if (clean.length <= limit) return clean;
    const head = clean.slice(0, limit - 1);
    const lastSpace = head.lastIndexOf(" ");
    const trimmed = (lastSpace > 24 ? head.slice(0, lastSpace) : head).trim();
    return `${trimmed || clean.slice(0, limit - 1)}…`;
  };
  const titleWithoutTicker = (ticker: string, title: string) => {
    const prefix = `${ticker.toUpperCase()} `;
    return title.toUpperCase().startsWith(prefix) ? title.slice(prefix.length).trim() : title;
  };
  if (!signals.length && !threads.length && !setup.headline.trim()) return null;
  return (
    <div className="rounded-[24px] border border-[#dbe7ff] bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] px-5 py-5 md:px-6 md:py-6 shadow-[0_1px_0_rgba(0,82,255,0.06)]">
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#5b6f99]">Before open</span>
        <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-on-surface">{setup.headline}</h3>
        {setup.body && !signals.length ? (
          <p className="max-w-[900px] text-[15px] leading-[1.65] text-on-surface">{setup.body}</p>
        ) : null}
      </div>

      {threads.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {threads.map((thread) => (
            <span
              key={thread}
              className="inline-flex items-center rounded-full border border-[#dbe7ff] bg-surface px-3 py-1 text-[11px] font-medium text-[#35538a]"
            >
              {thread}
            </span>
          ))}
        </div>
      ) : null}

      {signals.length > 0 ? (
        <div className="mt-5 flex flex-col">
          {signals.map((signal, idx) => {
            const evidence = signal.evidence?.filter(Boolean).slice(0, 2) || [];
            return (
              <div
                key={`${signal.ticker}-${signal.kind}-${idx}`}
                className={`py-4 ${idx > 0 ? "border-t border-[#eef4ff]" : ""}`}
              >
                <div className="grid gap-3 md:grid-cols-[72px_minmax(0,1fr)] md:items-start">
                  <div className="flex items-center gap-2 md:flex-col md:items-start md:gap-1">
                    <span className="text-[16px] font-semibold text-on-surface">{signal.ticker}</span>
                    <PositionPill type={signal.position_type} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold leading-snug text-[#111827]">{titleWithoutTicker(signal.ticker, signal.title)}</p>
                    <p className="mt-1.5 text-[14px] leading-[1.55] text-on-surface-variant">{signal.why_it_matters}</p>
                    {evidence.length ? (
                      <p className="mt-2 text-[12px] text-on-surface-variant">{evidence.join(" · ")}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PositionPill({ type }: { type?: string }) {
  const isHolding = type === "holding";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase ${
        isHolding
          ? "tint-bull text-[#10b981]"
          : "bg-surface-container text-on-surface-variant"
      }`}
    >
      <span
        aria-hidden
        className={`h-1 w-1 rounded-full ${isHolding ? "bg-[#10b981]" : "bg-[#9ca3af]"}`}
      />
      {isHolding ? "Holding" : "Watching"}
    </span>
  );
}

function PrimaryDirectiveHeader({ row }: { row: WatchlistRow }) {
  const market = row.market === "IN" ? "IN" : "US";
  const dayChange = row.day_change_pct ?? 0;
  const positive = dayChange >= 0;
  const symbol = row.currency === "INR" ? "₹" : "$";
  const upside = row.target_upside_pct;
  const attention = row.attention_score;
  const attentionKind = row.attention_kind;
  const attentionColor =
    attentionKind === "move"
      ? "tint-warn text-[#f59e0b]"
      : attentionKind === "risk"
      ? "tint-bear text-[#ef4444]"
      : attentionKind === "opportunity"
      ? "tint-bull text-[#10b981]"
      : attentionKind === "news"
      ? "tint-info text-[#3b82f6]"
      : "bg-surface-container text-on-surface-variant";
  const priceStr =
    typeof row.price === "number"
      ? `${symbol}${row.price.toLocaleString(undefined, {
          minimumFractionDigits: row.price >= 1000 ? 0 : 2,
          maximumFractionDigits: row.price >= 1000 ? 0 : 2,
        })}`
      : "—";
  return (
    <div className="flex items-center gap-2 self-start">
    <Link
      href={`/stock/${encodeURIComponent(row.ticker)}`}
      className="group inline-flex items-center gap-3"
    >
      <StockLogo
        ticker={row.ticker}
        logoUrl={row.logo_url}
        market={market}
        size={36}
      />
      <div className="flex flex-col gap-0">
        <div className="flex items-center gap-2">
          <span className="text-[18px] font-semibold tracking-[-0.01em] text-on-surface group-hover:text-[#22d3ee] transition-colors">
            {row.ticker}
          </span>
          {attention !== undefined && attention !== null && (
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase ${attentionColor}`}>
              <span aria-hidden className="h-1 w-1 rounded-full bg-current opacity-60" />
              {attention}
            </span>
          )}
          <span className="text-[12px] text-on-surface-variant truncate max-w-[260px]">
            {row.sector_label || ""}
          </span>
          {upside !== null && upside !== undefined ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase tint-bull text-[#10b981]">
              <span aria-hidden className="h-1 w-1 rounded-full bg-[#10b981]" />
              +{upside.toFixed(0)}% upside
            </span>
          ) : (
            <PositionPill type={row.position_type} />
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold tabular-nums text-on-surface">
            {priceStr}
          </span>
          {typeof row.day_change_pct === "number" && (
            <span
              className={`text-[12px] font-semibold tabular-nums ${
                positive ? "text-[#10b981]" : "text-[#ef4444]"
              }`}
            >
              {positive ? "+" : ""}
              {dayChange.toFixed(2)}%
            </span>
          )}
          <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-on-surface-variant">
            Today&apos;s top directive
          </span>
        </div>
      </div>
    </Link>
    </div>
  );
}

const STANCE_META: Record<
  string,
  { label: string; bg: string; fg: string; chipBg: string; chipFg: string }
> = {
  accumulate: { label: "Accumulate", bg: "color-mix(in srgb, var(--signal-bullish) 14%, var(--surface))", fg: "#10b981", chipBg: "#10b981", chipFg: "var(--surface)" },
  trim: { label: "Trim", bg: "color-mix(in srgb, var(--signal-neutral) 16%, var(--surface))", fg: "#f59e0b", chipBg: "#f59e0b", chipFg: "var(--surface)" },
  watch: { label: "Watch", bg: "color-mix(in srgb, #2563eb 13%, var(--surface))", fg: "#1e3a8a", chipBg: "#0052ff", chipFg: "var(--surface)" },
  avoid: { label: "Avoid", bg: "color-mix(in srgb, var(--signal-bearish) 14%, var(--surface))", fg: "#ef4444", chipBg: "#ef4444", chipFg: "var(--surface)" },
  hold: { label: "Hold", bg: "var(--surface-container)", fg: "var(--on-surface)", chipBg: "var(--on-surface)", chipFg: "var(--surface)" },
};

function SecondaryDirectiveCard({
  row,
  directive,
}: {
  row: WatchlistRow;
  directive: Directive;
}) {
  const meta = STANCE_META[directive.stance ?? "hold"] ?? STANCE_META.hold;
  const market = row.market === "IN" ? "IN" : "US";
  const dayChange = row.day_change_pct ?? 0;
  const positive = dayChange >= 0;
  const upside = row.target_upside_pct;
  const attention = row.attention_score;
  const attentionKind = row.attention_kind;
  const attentionColor =
    attentionKind === "move"
      ? "tint-warn text-[#f59e0b]"
      : attentionKind === "risk"
      ? "tint-bear text-[#ef4444]"
      : attentionKind === "opportunity"
      ? "tint-bull text-[#10b981]"
      : attentionKind === "news"
      ? "tint-info text-[#3b82f6]"
      : "bg-surface-container text-on-surface-variant";
  return (
    <Link
      href={`/stock/${encodeURIComponent(row.ticker)}`}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-outline-variant bg-surface p-4 transition-all hover:border-on-surface hover:shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase"
          style={{ background: meta.chipBg, color: meta.chipFg }}
        >
          {meta.label}
        </span>
        <div className="flex items-center gap-2">
          {attention !== undefined && attention !== null && (
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase ${attentionColor}`}>
              <span aria-hidden className="h-1 w-1 rounded-full bg-current opacity-60" />
              {attention}
            </span>
          )}
          {typeof row.day_change_pct === "number" && (
            <span
              className={`text-[11px] font-semibold tabular-nums ${
                positive ? "text-[#10b981]" : "text-[#ef4444]"
              }`}
            >
              {positive ? "+" : ""}
              {dayChange.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <StockLogo ticker={row.ticker} logoUrl={row.logo_url} market={market} size={32} />
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-semibold text-on-surface group-hover:text-[#22d3ee] transition-colors">
              {row.ticker}
            </span>
            {upside !== null && upside !== undefined ? (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase tint-bull text-[#10b981]">
                <span aria-hidden className="h-1 w-1 rounded-full bg-[#10b981]" />
                +{upside.toFixed(0)}% upside
              </span>
            ) : (
              <PositionPill type={row.position_type} />
            )}
          </div>
          <div className="flex items-baseline gap-1.5">
            {typeof row.price === "number" && (
              <span className="text-[12px] font-semibold tabular-nums text-on-surface">
                {row.currency === "INR" ? "₹" : "$"}{row.price.toLocaleString(undefined, {
                  minimumFractionDigits: row.price >= 1000 ? 0 : 2,
                  maximumFractionDigits: row.price >= 1000 ? 0 : 2,
                })}
              </span>
            )}
            <span className="text-[11px] text-on-surface-variant truncate max-w-[120px]">
              {row.sector_label || "—"}
            </span>
          </div>
        </div>
      </div>

      <p className="text-[13px] font-medium text-on-surface leading-snug mt-auto">
        {directive.text}
      </p>
      {directive.rationale && (
        <p className="text-[11.5px] text-on-surface-variant leading-snug">
          {directive.rationale}
        </p>
      )}
    </Link>
  );
}

// Differentiate explore/suggestion cards by *why* they surfaced, instead of a
// uniform "Explore" chip. Earnings > anomaly > reddit buzz > heat > generic.
function suggestionTag(
  suggestion: Dict,
  earningsTickers: Set<string>,
): { label: string; bg: string; fg: string; dot: string } {
  const ticker = String(suggestion.ticker ?? "").trim().toUpperCase();
  const sources = Array.isArray(suggestion.sources)
    ? (suggestion.sources as unknown[]).map((v) => String(v))
    : [];
  const anomalyMove = typeof suggestion.anomaly_move_pct === "number" ? suggestion.anomaly_move_pct : null;
  const redditMentions = typeof suggestion.reddit_mentions === "number" ? suggestion.reddit_mentions : 0;

  if (ticker && earningsTickers.has(ticker)) {
    return { label: "Just reported", bg: "color-mix(in srgb, var(--signal-neutral) 16%, var(--surface))", fg: "#f59e0b", dot: "#f59e0b" };
  }
  if (sources.includes("anomaly") || anomalyMove !== null) {
    const up = (anomalyMove ?? 0) >= 0;
    return {
      label: anomalyMove !== null ? `${up ? "+" : ""}${anomalyMove.toFixed(1)}% today` : "On the move",
      bg: up ? "color-mix(in srgb, var(--signal-bullish) 14%, var(--surface))" : "color-mix(in srgb, var(--signal-bearish) 14%, var(--surface))",
      fg: up ? "#10b981" : "#ef4444",
      dot: up ? "#10b981" : "#ef4444",
    };
  }
  if (sources.includes("reddit") || redditMentions >= 3) {
    const sentiment = String(suggestion.reddit_sentiment ?? "").toLowerCase();
    const mood = sentiment === "bullish" ? "bull" : sentiment === "bearish" ? "bear" : "";
    const count = redditMentions > 0 ? ` · ${redditMentions}` : "";
    return {
      label: `Reddit${mood ? ` ${mood}` : " buzz"}${count}`,
      bg: "#fff7ed",
      fg: "#9a3412",
      dot: "#f97316",
    };
  }
  if (sources.includes("heat")) {
    return { label: "Heat list", bg: "color-mix(in srgb, var(--signal-bearish) 14%, var(--surface))", fg: "#9f1239", dot: "#fb7185" };
  }
  return { label: "Explore", bg: "var(--surface-container)", fg: "var(--on-surface-variant)", dot: "var(--on-surface-variant)" };
}

function ExploreDirectiveCard({
  suggestion,
  isTracked = false,
  earningsTickers = new Set(),
  gapLabel = "",
}: {
  suggestion: Dict;
  isTracked?: boolean;
  earningsTickers?: Set<string>;
  gapLabel?: string;
}) {
  const ticker = String(suggestion.ticker ?? "");
  const market = String(suggestion.market ?? "US") === "IN" ? "IN" : "US";
  const instrumentId = `${market}_${ticker}`;
  const sector = String(suggestion.sector ?? suggestion.name ?? "");
  const why = String(suggestion.why ?? suggestion.reason ?? "");
  const score = typeof suggestion.score === "number" ? suggestion.score : null;
  const tag = suggestionTag(suggestion, earningsTickers);
  const price = typeof suggestion.price === "number" ? suggestion.price : null;
  const dayChange =
    typeof suggestion.day_change_pct === "number"
      ? suggestion.day_change_pct
      : typeof suggestion.anomaly_move_pct === "number"
      ? suggestion.anomaly_move_pct
      : null;
  const showQuote = price !== null || dayChange !== null;
  const positive = (dayChange ?? 0) >= 0;
  const currency = market === "IN" ? "₹" : "$";
  const priceStr =
    price !== null
      ? `${currency}${price.toLocaleString(undefined, {
          minimumFractionDigits: price >= 1000 ? 0 : 2,
          maximumFractionDigits: price >= 1000 ? 0 : 2,
        })}`
      : null;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-dashed border-outline-variant bg-surface-container-low p-4 transition-all hover:border-on-surface hover:bg-surface hover:shadow-sm flex flex-col gap-3">
      {/* Price + day move (or signal tag) + score */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          {showQuote ? (
            <div className="flex items-baseline gap-1.5">
              {priceStr && (
                <span className="text-[12px] font-semibold tabular-nums text-on-surface">
                  {priceStr}
                </span>
              )}
              {dayChange !== null && (
                <span
                  className={`text-[11px] font-semibold tabular-nums ${
                    positive ? "text-[#10b981]" : "text-[#ef4444]"
                  }`}
                >
                  {positive ? "+" : ""}
                  {dayChange.toFixed(2)}%
                </span>
              )}
            </div>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase"
              style={{ background: tag.bg, color: tag.fg }}
            >
              <span aria-hidden className="h-1 w-1 rounded-full" style={{ background: tag.dot }} />
              {tag.label}
            </span>
          )}
          {gapLabel && (
            <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase tint-warn text-[#f59e0b]">
              {gapLabel}
            </span>
          )}
        </div>
        {score !== null && (
          <span className={`text-[11px] font-semibold tabular-nums ${
            score >= 80 ? "text-[#10b981]" : score >= 60 ? "text-on-surface" : "text-on-surface-variant"
          }`}>
            {Math.round(score)}
          </span>
        )}
      </div>

      {/* Logo + name row — links to detail; TrackButton at far right */}
      <div className="flex items-center gap-2.5">
        <Link href={`/stock/${encodeURIComponent(ticker)}`} className="flex items-center gap-2.5 min-w-0 flex-1">
          <StockLogo ticker={ticker} market={market} size={32} />
          <div className="flex flex-col min-w-0">
            <span className="text-[14px] font-semibold text-on-surface group-hover:text-[#22d3ee] transition-colors">
              {ticker}
            </span>
            {sector && (
              <span className="text-[11px] text-on-surface-variant truncate max-w-[130px]">{sector}</span>
            )}
          </div>
        </Link>
        <TrackButton
          ticker={ticker}
          instrumentId={instrumentId}
          isTracked={isTracked}
          variant="icon"
        />
      </div>

      <Link href={`/stock/${encodeURIComponent(ticker)}`} className="flex flex-col gap-2 flex-1">
        {why && (
          <p className="text-[12px] text-on-surface-variant leading-snug">
            {why}
          </p>
        )}
        <span className="text-[11px] font-semibold text-on-surface-variant group-hover:text-[#22d3ee] transition-colors mt-auto">
          View analysis →
        </span>
      </Link>
    </div>
  );
}

// =============================================================================
// § 01 · YOUR BOOK — ledger + earnings / alerts rail
// =============================================================================

function YourBookSection({
  holdings,
  watching,
  earningsReadySlot,
  suggestions,
  isSubscribed,
  trackedCount,
  refreshing,
  portfolio,
  preferRadarSignals = false,
  radarSignalsByInstrumentId = {},
}: {
  holdings: WatchlistRow[];
  watching: WatchlistRow[];
  earningsReadySlot?: ReactNode;
  suggestions: Dict[];
  isSubscribed: boolean;
  trackedCount: number;
  refreshing?: boolean;
  portfolio?: Dict;
  preferRadarSignals?: boolean;
  radarSignalsByInstrumentId?: Record<string, import("@/lib/radar-row-signals").RadarRowSignal>;
}) {
  // Flatten suggestion dicts to the shape RadarLedger expects.
  const suggestionList = suggestions.slice(0, 6).map((item) => ({
    ticker: text(item.ticker),
    name: text(item.name),
    sector: text(item.sector),
    reason: text(item.reason),
    why: text(item.why),
    score: num(item.score ?? item.match_score),
    market: text(item.market) || "US",
  }));

  // Use visible row count (has price data) so the number matches what the user actually sees in the table
  const visibleCount = holdings.length + watching.length;
  const atLimit = !isSubscribed && visibleCount >= 3;
  // Show a "add more stocks" nudge when radar is sparse but not at the limit
  const showAddMoreNudge = !atLimit && visibleCount > 0 && (isSubscribed ? visibleCount < 5 : visibleCount < 3);
  const nudge = showAddMoreNudge
    ? visibleCount === 1
      ? { headline: "Add 1 more stock to unlock comparisons", body: "With 2+ stocks stocksbrew can compare scores, cluster your book, and surface which one deserves attention today." }
      : visibleCount === 2
      ? { headline: "Add one more stock for the portfolio view", body: "Portfolio concentration, sector mix and calls appear once you have 3 stocks tracked." }
      : { headline: "Pro tip: 5+ stocks makes everything smarter", body: "The more you track, the better stocksbrew clusters your book, spots risks, and prioritises what to act on today." }
    : null;

  return (
    <section className="flex flex-col gap-6">
      <SectionOpener
        number="01"
        title="Your book"
        meta={`${holdings.length} held · ${watching.length} watching`}
        refreshing={refreshing}
      />

      <PositionAwareState holdings={holdings} portfolio={portfolio} />

      <div className="min-w-0 w-full">
      <YourBookLayout
        holdings={holdings}
        watching={watching}
        suggestions={suggestionList}
        earningsReadySlot={earningsReadySlot}
        preferRadarSignals={preferRadarSignals}
        radarSignalsByInstrumentId={radarSignalsByInstrumentId}
        belowLedgerSlot={atLimit ? (
          <div className="relative overflow-hidden rounded-2xl bg-[#1e1b4b] px-5 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Subtle gradient glow */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(129,140,248,0.25)_0%,transparent_55%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(16,185,129,0.15)_0%,transparent_55%)]" />

            <div className="relative flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-surface/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-white/60">
                  Free · {visibleCount}/3 stocks
                </span>
                <span className="inline-flex items-center gap-1 rounded-full tint-warn/15 border border-outline-variant/30 px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase text-[#fcd34d]">
                  🚀 Launch pricing
                </span>
              </div>
              <p className="text-[15px] font-semibold text-white leading-snug">
                Three stocks in. Pro covers the whole book.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {[
                  { icon: "psychology", text: "A daily call on each stock" },
                  { icon: "notifications", text: "Alerts when something moves" },
                  { icon: "analytics", text: "Risk across your whole list" },
                  { icon: "trending_up", text: "Track as many as you hold" },
                ].map(({ icon, text }) => (
                  <span key={text} className="inline-flex items-center gap-1 text-[11px] text-white/55">
                    <AnimatedIcon name={icon} size={13} className="text-white/40" aria-hidden />
                    {text}
                  </span>
                ))}
              </div>
            </div>

            <ProCtaLink href="/subscribe" size="sm" showStar className="h-[40px] whitespace-nowrap">
              Get Pro · {US_PRO_MONTHLY_MO} →
            </ProCtaLink>
          </div>
        ) : undefined}
      />
      </div>
    </section>
  );
}

function PositionAwareState({ holdings, portfolio }: { holdings: WatchlistRow[]; portfolio?: Dict }) {
  if (!portfolio) return null;
  const totalHoldings = holdings.length;
  if (totalHoldings === 0) return null;

  const holdingsWithPosition = holdings.filter(
    (r) => r.holding && (r.holding.quantity != null || r.holding.market_value != null),
  );
  const enteredCount = holdingsWithPosition.length;
  const state: "none" | "partial" | "full" =
    enteredCount === 0 ? "none" : enteredCount < totalHoldings ? "partial" : "full";

  const positionRisks = asArray(portfolio.position_risks);

  if (state === "none") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-4 py-3">
        <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--outline)]" />
        <div className="flex flex-col gap-0.5">
          <p className="text-[12px] font-semibold text-[var(--on-surface)]">
            Add share counts to unlock position-weighted analysis
          </p>
          <p className="text-[11px] text-[var(--on-surface-variant)] leading-snug">
            Without position size, Watchlist ranks by signal strength. Add size to see what moves your portfolio.
          </p>
        </div>
      </div>
    );
  }

  if (state === "partial") {
    return null;
  }

  // Full / position-aware state. The old green "Position-aware · largest position
  // X%" strip carried no actionable signal, so we only surface real position risk
  // flags when present and render nothing otherwise.
  if (positionRisks.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface px-4 py-3">
      {positionRisks.slice(0, 2).map((risk, i) => (
        <div key={`pos-risk-${i}`} className="flex items-start gap-2.5">
          <span
            aria-hidden
            className={`mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full ${
              text(risk.severity) === "high"
                ? "bg-[#ef4444]"
                : text(risk.severity) === "medium"
                ? "bg-[#f59e0b]"
                : "bg-[#9ca3af]"
            }`}
          />
          <div className="min-w-0">
            <span className="text-[12px] font-semibold text-[var(--on-surface)]">
              {text(risk.headline)}
            </span>
            {text(risk.body) && (
              <p className="text-[11px] text-[var(--on-surface-variant)] leading-snug">
                {text(risk.body)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// § 02B · SCENARIO LAB — event what-if + rebalance ranges
// =============================================================================

function ScenarioLabSection({
  exposure,
  scenario,
}: {
  exposure: PortfolioExposure | null;
  scenario: PortfolioScenario | null;
}) {
  const concentration = exposure?.concentration || {};
  const topSectors = (exposure?.sector_weights || []).slice(0, 3);
  const recos = (exposure?.weight_recommendations || []).slice(0, 4);
  const cases = (scenario?.scenarios || []).slice(0, 2);

  if (!exposure && !scenario) return null;

  return (
    <section className="flex flex-col gap-5">
      <SectionOpener number="02B" title="Scenario lab" />

      <div className="rounded-2xl border border-outline-variant bg-surface p-4 md:p-6 flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-4 text-[12px]">
          <span className="rounded-full bg-surface-container px-2.5 py-1 font-semibold text-on-surface">
            Top-3 concentration {num(concentration.top3_pct)?.toFixed(1) ?? "—"}%
          </span>
          <span className="rounded-full bg-surface-container px-2.5 py-1 font-semibold text-on-surface">
            HHI {num(concentration.hhi)?.toFixed(3) ?? "—"}
          </span>
          <span className="rounded-full tint-bull px-2.5 py-1 font-semibold text-[#10b981]">
            Risk {text(concentration.risk_label || "unknown")}
          </span>
          {scenario?.generated_at ? (
            <span className="text-on-surface-variant">Scenario refreshed {formatRelative(scenario.generated_at)}</span>
          ) : null}
        </div>

        {topSectors.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {topSectors.map((item, i) => (
              <div key={`sector-${i}`} className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">Sector exposure</div>
                <div className="mt-1 text-[13px] font-semibold text-on-surface">{text(item.sector || "Unknown")}</div>
                <div className="text-[12px] text-on-surface-variant">{((num(item.weight) || 0) * 100).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        ) : null}

        {cases.length > 0 ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {cases.map((c, i) => {
              const impacts = (c.impacts || []).slice(0, 5);
              const actions = (c.actions || []).slice(0, 3);
              const isBeat = text(c.case).toLowerCase() === "beat";
              return (
                <div key={`case-${i}`} className="rounded-xl border border-outline-variant p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
                        {text(c.market_mood || "mixed")}
                      </span>
                      <span className="text-[15px] font-semibold text-on-surface">
                        {text(c.label || c.case || "Scenario")}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        isBeat ? "tint-bull text-[#10b981]" : "tint-bear text-[#ef4444]"
                      }`}
                    >
                      {text(c.case || "case")}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {impacts.map((impact, idx) => {
                      const move = num(impact.estimated_move_pct);
                      const up = (move || 0) >= 0;
                      return (
                        <div key={`impact-${idx}`} className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="font-semibold text-on-surface">{text(impact.ticker || "—")}</span>
                          <span className={up ? "text-[#10b981] font-semibold" : "text-[#ef4444] font-semibold"}>
                            {move === null ? "—" : `${up ? "+" : ""}${move.toFixed(2)}%`}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {actions.length > 0 ? (
                    <div className="rounded-lg bg-surface-container-low border border-outline-variant p-2.5 flex flex-col gap-1.5">
                      {actions.map((a, idx) => (
                        <p key={`action-${idx}`} className="text-[12px] leading-snug text-on-surface">
                          {a}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {recos.length > 0 ? (
          <div className="rounded-xl border border-outline-variant p-4">
            <h4 className="text-[11px] font-semibold tracking-[0.1em] uppercase text-on-surface-variant mb-2">Weight range guidance</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {recos.map((r, i) => {
                const minW = (num(r.weight_target_range?.min) || 0) * 100;
                const maxW = (num(r.weight_target_range?.max) || 0) * 100;
                return (
                  <div key={`reco-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-on-surface">{text(r.ticker || "—")}</div>
                      <div className="text-[11px] text-on-surface-variant truncate">{text(r.rebalance_note || "")}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-semibold text-on-surface">
                        {minW.toFixed(1)}% - {maxW.toFixed(1)}%
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">{text(r.directive || "hold")}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// =============================================================================
// § 03 · DIAGNOSIS — Scorecard pattern + clusters/risks + opportunities + checks
// =============================================================================

async function RadarDiagnosisStream({
  holdings,
  rows,
  portfolioForDiagnosis,
  pillarAverages,
  factorTilt,
  suggestions,
  tracked,
  isSubscribed,
  refreshing,
  hasHoldings,
  watchlistView,
  trackedCount,
}: {
  holdings: WatchlistRow[];
  rows: WatchlistRow[];
  portfolioForDiagnosis: Dict;
  pillarAverages: PillarAverages;
  factorTilt: Dict;
  suggestions: Dict[];
  tracked: string[];
  isSubscribed: boolean;
  refreshing?: boolean;
  hasHoldings: boolean;
  watchlistView: Awaited<ReturnType<typeof getWatchlistView>> | null;
  trackedCount: number;
}) {
  const bookForPillarLift = holdings.length > 0 ? holdings : rows;
  const tiltForWeakest = {
    valuation: num(factorTilt.valuation) ?? pillarAverages.valuation,
    growth: num(factorTilt.growth) ?? pillarAverages.growth,
    quality: num(factorTilt.quality) ?? pillarAverages.quality,
    momentum: num(factorTilt.momentum) ?? pillarAverages.momentum,
  };
  const weakestNow = weakestPillarFromTilt(tiltForWeakest);

  let pillarLift: PillarLiftPayload | null = null;
  if (bookForPillarLift.length > 0) {
    pillarLift = await getPillarLiftSuggestions(bookForPillarLift, rows).catch(() => null);

    const pooledCandidates = mergeSuggestionCandidates(
      suggestions as Array<Record<string, unknown>>,
      asArray(watchlistView?.blind_spot_suggestions),
      asArray(watchlistView?.momentum_lift_suggestions),
      asArray(watchlistView?.pillar_lift_suggestions?.items),
    );

    if (
      weakestNow &&
      (!pillarLift || pillarLift.weakest_pillar !== weakestNow.key)
    ) {
      pillarLift =
        buildPillarLiftPayloadSync(bookForPillarLift, rows, pooledCandidates) ??
        (weakestNow
          ? {
              weakest_pillar: weakestNow.key,
              weakest_score: weakestNow.score,
              weakest_label: weakestNow.label,
              portfolio_overall: num(factorTilt.overall) ?? pillarAverages.overall,
              items: [],
            }
          : null);
    } else if (!pillarLift && weakestNow) {
      pillarLift = buildPillarLiftPayloadSync(bookForPillarLift, rows, pooledCandidates) ?? {
        weakest_pillar: weakestNow.key,
        weakest_score: weakestNow.score,
        weakest_label: weakestNow.label,
        portfolio_overall: num(factorTilt.overall) ?? pillarAverages.overall,
        items: [],
      };
    }
  }

  return (
    <DiagnosisSection
      portfolio={portfolioForDiagnosis}
      pillarAverages={pillarAverages}
      factorTilt={factorTilt}
      suggestions={suggestions}
      pillarLift={pillarLift}
      tracked={tracked}
      isSubscribed={isSubscribed}
      refreshing={refreshing}
      hasHoldings={hasHoldings}
      trackedCount={trackedCount}
    />
  );
}

function DiagnosisSection({
  portfolio,
  pillarAverages,
  factorTilt,
  suggestions,
  pillarLift,
  tracked,
  isSubscribed,
  refreshing,
  hasHoldings,
  trackedCount,
}: {
  portfolio: Dict;
  pillarAverages: PillarAverages;
  factorTilt: Dict;
  suggestions: Dict[];
  pillarLift: PillarLiftPayload | null;
  tracked: string[];
  isSubscribed: boolean;
  refreshing?: boolean;
  hasHoldings: boolean;
  trackedCount: number;
}) {
  const clusters = asArray(portfolio.clusters).slice(0, 5);
  const risks = asArray(portfolio.risk_flags).slice(0, 4);
  const summary = scrubLegacyBrand(text(portfolio.summary));

  // prefer backend factor_tilt, fallback to computed averages from rows
  const overall = num(factorTilt.overall) ?? pillarAverages.overall;
  const valuation = num(factorTilt.valuation) ?? pillarAverages.valuation;
  const growth = num(factorTilt.growth) ?? pillarAverages.growth;
  const quality = num(factorTilt.quality) ?? pillarAverages.quality;
  const momentum = num(factorTilt.momentum) ?? pillarAverages.momentum;

  const fallbackSuggestions = asArray(portfolio.suggestions);
  const checkOuts = suggestions.length > 0 ? suggestions : fallbackSuggestions;

  return (
    <section className="flex flex-col gap-8">
      <SectionOpener number="03" title="Diagnosis" refreshing={refreshing} />

      {summary && (
        <p className="max-w-[820px] text-[15px] leading-[1.65] text-on-surface md:text-[16px]">
          {summary}
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-6 md:gap-8 xl:grid-cols-[minmax(240px,_300px)_1fr]">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
            {hasHoldings ? "Your holdings" : "Your Watchlist"}
          </span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant/80">
            Portfolio score
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`font-mono text-[48px] font-extrabold leading-none tabular-nums tracking-tight md:text-[56px] ${scoreToneText(overall)}`}
            >
              {overall === null ? "—" : Math.round(overall)}
            </span>
            <span className="font-mono text-[16px] text-on-surface-variant">/ 100</span>
          </div>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
            {verdictLabel(overall)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <PortfolioPillarCard name="Valuation" score={valuation} />
          <PortfolioPillarCard name="Growth" score={growth} />
          <PortfolioPillarCard name="Quality" score={quality} />
          <PortfolioPillarCard name="Momentum" score={momentum} />
        </div>
      </div>

      {/* Sector pie + factor radar — visual at a glance */}
      {clusters.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <DiagnosisSectorChart
            sectors={clusters.map((c) => ({
              sector: (c.sector as string) || "Unknown",
              weight_pct: (c.weight_pct as number) ?? 0,
              count: (c.count as number) ?? 0,
            }))}
            weightLabel={hasHoldings ? "of holdings" : "of book"}
          />
          <DiagnosisFactorRadar
            factors={{ valuation, growth, quality, momentum }}
          />
        </div>
      )}

      {pillarLift ? (
        <PillarLiftSuggestions
          payload={pillarLift}
          tracked={tracked}
          isSubscribed={isSubscribed}
          trackedCount={trackedCount}
        />
      ) : null}

      {/* Risk flags */}
      <RiskFlagsBlock risks={risks} />

      {/* Stocks to check out */}
      <StocksToCheckOut suggestions={checkOuts} tracked={tracked} isSubscribed={isSubscribed} />
    </section>
  );
}

function PortfolioPillarCard({ name, score }: { name: string; score: number | null }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-outline-variant bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
          {name}
        </span>
        <span className={`font-mono text-[22px] font-bold tabular-nums leading-none ${scoreToneText(score)}`}>
          {score === null ? "—" : Math.round(score)}
        </span>
      </div>
      <ScoreBar score={score} />
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-on-surface-variant">
        {verdictLabel(score)}
      </span>
    </div>
  );
}

function ScoreBar({ score }: { score: number | null }) {
  const clamped = score === null ? 0 : Math.max(0, Math.min(100, score));
  return (
    <div className="relative h-1.5 rounded-full bg-surface-container overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${scoreToneFill(score)}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

const CLUSTER_COLORS = ["#0052ff", "#10b981", "#f59e0b", "#7c3aed", "#ef4444"];

function ClustersBlock({ clusters }: { clusters: Dict[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg tint-brand text-[14px]">
          🧩
        </span>
        <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#7c3aed]">
          Clusters
        </span>
        <span className="text-[10px] font-semibold tabular-nums text-on-surface-variant">
          {clusters.length}
        </span>
      </div>
      {clusters.length === 0 ? (
        <p className="text-[13px] text-on-surface-variant">No sector clusters yet.</p>
      ) : (
        <>
          {/* Unified stacked bar */}
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-container">
            {clusters.map((c, i) => {
              const pct = num(c.weight_pct) ?? 0;
              return (
                <div
                  key={`stack-${i}`}
                  style={{
                    width: `${Math.max(0, Math.min(100, pct))}%`,
                    background: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
                  }}
                />
              );
            })}
          </div>
          <ul className="flex flex-col gap-2 mt-1">
            {clusters.map((cluster, i) => {
              const sector = text(cluster.sector) || "Unknown";
              const pct = num(cluster.weight_pct) ?? 0;
              const count = num(cluster.count) ?? 0;
              return (
                <li key={`cluster-${i}`} className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-sm shrink-0"
                    style={{ background: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }}
                  />
                  <span className="text-[13px] font-semibold text-on-surface flex-1 truncate">
                    {sector}
                  </span>
                  <span className="text-[11px] text-on-surface-variant tabular-nums">
                    {count} stock{count === 1 ? "" : "s"}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-on-surface w-12 text-right">
                    {pct.toFixed(1)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function RiskFlagsBlock({ risks }: { risks: Dict[] }) {
  const isClear = risks.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className={`font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${
            isClear ? "text-[var(--signal-bullish)]" : "text-[var(--signal-bearish)]"
          }`}
        >
          {isClear ? "Risk flags · clear" : `Risk flags · ${risks.length}`}
        </span>
      </div>
      {isClear ? (
        <div className="rounded-xl border border-outline-variant bg-surface px-4 py-4">
          <p className="text-[14px] font-semibold text-on-surface">All clear</p>
          <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">
            Nothing major flagged in your book right now. We&apos;ll surface concentration, stretched
            technicals, and weak spots here when they show up.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {risks.map((risk, i) => {
            const severity = text(risk.severity).toLowerCase();
            const tone = severityTone(severity);
            const headline = text(risk.headline);
            const body = text(risk.body);
            const ticker = text(risk.ticker);
            const kindLabel = text(risk.kind).replaceAll("_", " ");
            const title = ticker || kindLabel || "Risk";
            return (
              <div
                key={`risk-${i}`}
                className="flex h-full flex-col gap-3 rounded-2xl border border-outline-variant bg-surface p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold text-on-surface tracking-[-0.01em] min-w-0 truncate">
                    {ticker ? (
                      <Link
                        href={`/stock/${encodeURIComponent(ticker)}`}
                        className="hover:text-[#22d3ee] transition-colors"
                      >
                        {ticker}
                      </Link>
                    ) : (
                      title
                    )}
                    {ticker && kindLabel && (
                      <span className="ml-2 text-[11px] font-medium text-on-surface-variant tracking-[0.04em] uppercase">
                        {kindLabel}
                      </span>
                    )}
                  </span>
                  {severity && (
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase shrink-0"
                      style={{ background: tone.chipBg, color: tone.chipFg }}
                    >
                      <span
                        aria-hidden
                        className="h-1 w-1 rounded-full bg-surface/80"
                      />
                      {severity}
                    </span>
                  )}
                </div>
                {headline && (
                  <p className="text-[14px] font-semibold text-on-surface leading-snug">
                    {headline}
                  </p>
                )}
                {body && (
                  <p className="text-[12px] text-on-surface-variant leading-snug mt-auto">
                    {body}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PositionRisksBlock({
  positionRisks,
  concentration,
}: {
  positionRisks: Dict[];
  concentration: Dict;
}) {
  const top1Pct = num(concentration.top1_pct);
  const top3Pct = num(concentration.top3_pct);
  const hhi = num(concentration.hhi);
  const riskLabel = text(concentration.risk_label);
  const hasConcentration = top1Pct !== null || top3Pct !== null || hhi !== null;
  const hasRisks = positionRisks.length > 0;

  if (!hasConcentration && !hasRisks) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg tint-warn text-[14px]">
          📊
        </span>
        <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#f59e0b]">
          Position analysis
        </span>
      </div>

      {hasConcentration && (
        <div className="flex flex-wrap items-center gap-2">
          {top1Pct !== null && (
            <span className="rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-semibold text-on-surface tabular-nums">
              Top-1: {top1Pct.toFixed(1)}%
            </span>
          )}
          {top3Pct !== null && (
            <span className="rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-semibold text-on-surface tabular-nums">
              Top-3: {top3Pct.toFixed(1)}%
            </span>
          )}
          {hhi !== null && (
            <span className="rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-semibold text-on-surface tabular-nums">
              HHI: {hhi.toFixed(3)}
            </span>
          )}
          {riskLabel && (
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                riskLabel === "high"
                  ? "tint-bear text-[#ef4444]"
                  : riskLabel === "medium"
                  ? "tint-warn text-[#f59e0b]"
                  : "tint-bull text-[#10b981]"
              }`}
            >
              {riskLabel} risk
            </span>
          )}
        </div>
      )}

      {hasRisks && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {positionRisks.map((risk, i) => {
            const severity = text(risk.severity).toLowerCase();
            const tone = severityTone(severity);
            const headline = text(risk.headline);
            const body = text(risk.body);
            const ticker = text(risk.ticker);
            const kindLabel = text(risk.kind).replaceAll("_", " ");
            return (
              <div
                key={`posrisk-${i}`}
                className="flex flex-col gap-2 rounded-2xl border border-outline-variant bg-surface p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-on-surface truncate">
                    {ticker || kindLabel || "Position risk"}
                  </span>
                  {severity && (
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase shrink-0"
                      style={{ background: tone.chipBg, color: tone.chipFg }}
                    >
                      <span aria-hidden className="h-1 w-1 rounded-full bg-surface/80" />
                      {severity}
                    </span>
                  )}
                </div>
                {headline && (
                  <p className="text-[13px] font-medium text-on-surface leading-snug">{headline}</p>
                )}
                {body && (
                  <p className="text-[11.5px] text-on-surface-variant leading-snug mt-auto">{body}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OpportunitiesGrid({ items }: { items: Dict[] }) {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg tint-bull text-[14px]">
            ✨
          </span>
          <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#10b981]">
            Opportunities
          </span>
          <span className="text-[10px] font-semibold tabular-nums text-on-surface-variant">
            {items.length}
          </span>
        </div>
        {items.length > 0 && (
          <p className="text-[13px] text-on-surface-variant leading-relaxed max-w-[720px]">
            Watch list names with strong analyst runway. Consider adding at good entry points.
          </p>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] text-on-surface-variant italic">
          No watch list names with strong analyst runway right now.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {items.map((item, i) => {
            const ticker = text(item.ticker);
            const kind = text(item.kind).replaceAll("_", " ");
            const headline = text(item.headline);
            const body = text(item.body);
            const market = item.market === "IN" ? "IN" : "US";
            const runway = extractRunwayPct(item, headline);
            return (
              <Link
                key={`opp-${i}`}
                href={ticker ? `/stock/${encodeURIComponent(ticker)}` : "#"}
                className="group flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface p-4 transition-all hover:border-on-surface hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {ticker && (
                      <StockLogo
                        ticker={ticker}
                        market={market}
                        size={28}
                      />
                    )}
                    <span className="text-[14px] font-semibold text-on-surface group-hover:text-[#22d3ee] transition-colors">
                      {ticker || "Opportunity"}
                    </span>
                  </div>
                  {kind && (
                    <span className="inline-flex items-center rounded-md tint-bull px-2 py-0.5 text-[9px] font-semibold tracking-[0.08em] uppercase text-[#10b981] shrink-0">
                      {kind}
                    </span>
                  )}
                </div>
                {runway !== null ? (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[32px] md:text-[36px] font-semibold tabular-nums leading-none text-[#10b981]">
                      +{runway.toFixed(1)}%
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
                      runway
                    </span>
                  </div>
                ) : headline ? (
                  <p className="text-[14px] font-semibold text-on-surface leading-snug">{headline}</p>
                ) : null}
                {body && (
                  <p className="text-[12px] text-on-surface-variant leading-snug mt-auto">
                    {body}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Color-code the suggestion category ("Oversold Quality", "Cheap Growth",
// "Smart Money Favorites", …) so the descriptor reads as a tab beside the
// ticker instead of a stacked grey line.
function reasonChip(reason: string): { bg: string; fg: string } {
  const r = reason.toLowerCase();
  if (r.includes("smart money") || r.includes("favorite"))
    return { bg: "#f5f3ff", fg: "#6d28d9" };
  if (r.includes("momentum")) return { bg: "#fff7ed", fg: "#c2410c" };
  if (r.includes("quality")) return { bg: "color-mix(in srgb, #2563eb 13%, var(--surface))", fg: "#1d4ed8" };
  if (r.includes("growth")) return { bg: "color-mix(in srgb, var(--signal-bullish) 14%, var(--surface))", fg: "#10b981" };
  if (r.includes("value") || r.includes("cheap")) return { bg: "#f0fdfa", fg: "#0f766e" };
  return { bg: "var(--surface-container)", fg: "var(--on-surface-variant)" };
}

// The moat is anomalies, buzz, and news, not fundamental screens. Surface the
// reason a name is actually interesting right now, falling back to the screen
// only when there is no live signal.
function suggestionMoatSignal(item: Dict): { label: string; bg: string; fg: string; line: string } | null {
  const anomalyPct = num(item.anomaly_move_pct);
  const anomalyHeadline = text(item.anomaly_headline);
  const redditMentions = num(item.reddit_mentions);
  const redditSummary = text(item.reddit_summary);
  if (anomalyPct !== null && Math.abs(anomalyPct) >= 2) {
    const dir = anomalyPct >= 0 ? "up" : "down";
    return {
      label: "Unusual move",
      bg: anomalyPct >= 0 ? "color-mix(in srgb, var(--signal-bullish) 14%, var(--surface))" : "color-mix(in srgb, var(--signal-bearish) 14%, var(--surface))",
      fg: anomalyPct >= 0 ? "#10b981" : "#ef4444",
      line: anomalyHeadline || `Moved ${dir} ${Math.abs(anomalyPct).toFixed(1)}% today, outside its normal range.`,
    };
  }
  if (redditMentions !== null && redditMentions > 0) {
    return {
      label: "Reddit buzz",
      bg: "#fff1ec",
      fg: "#c2410c",
      line: redditSummary || `${redditMentions} mentions trending across r/stocks and more.`,
    };
  }
  return null;
}

function PillarLiftSuggestions({
  payload,
  tracked,
  isSubscribed,
  trackedCount,
}: {
  payload: PillarLiftPayload;
  tracked: string[];
  isSubscribed: boolean;
  trackedCount: number;
}) {
  const pillarLabel = payload.weakest_label;
  const pillarKey = payload.weakest_pillar;
  const scoreField = `${pillarKey}_score`;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
          Lift {pillarLabel.toLowerCase()}
        </span>
        <p className="max-w-[820px] text-[14px] leading-relaxed text-on-surface-variant">
          {pillarLabel} is your weakest pillar at {Math.round(payload.weakest_score)}
          {payload.portfolio_overall !== null
            ? ` · book overall ${Math.round(payload.portfolio_overall)}`
            : ""}
          . Names below score higher on {pillarLabel.toLowerCase()} — each line is specific to that stock.
        </p>
      </div>
      {payload.items.length === 0 ? (
        <p className="text-[13px] text-on-surface-variant">
          No strong matches outside your book right now — try Stocks to check out below.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant/60 overflow-hidden rounded-xl border border-outline-variant">
          {payload.items.map((item, i) => {
            const ticker = text(item.ticker);
            const market = item.market === "IN" ? "IN" : "US";
            const instrumentId = String(item.instrument_id || (ticker ? `${market}_${ticker}` : ""));
            const isTracked = instrumentId ? tracked.includes(instrumentId) : false;
            const pillarScore = num(item[scoreField]) ?? num(item.score);
            const overallScore = num(item.overall_score ?? item.score);
            const liftPts = num(item.pillar_lift_pts);
            const hook = text(item.why);
            const sector = text(item.sector);

            return (
              <li
                key={instrumentId || `pillar-lift-${i}`}
                className="px-3 py-3.5 transition-colors hover:bg-surface-container-low sm:px-4"
              >
                <div className="flex items-start gap-2.5 sm:gap-3">
                  <Link
                    href={ticker ? `/stock/${encodeURIComponent(ticker)}` : "#"}
                    className="group flex min-w-0 flex-1 flex-col gap-2"
                  >
                    <div className="flex items-start gap-2.5">
                      {ticker ? <StockLogo ticker={ticker} market={market} size={36} className="shrink-0" /> : null}
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold leading-tight text-on-surface transition-colors group-hover:text-[#22d3ee]">
                          {ticker || "Suggestion"}
                        </p>
                        {text(item.name) ? (
                          <p className="mt-0.5 text-[12px] leading-snug text-on-surface-variant">{text(item.name)}</p>
                        ) : null}
                      </div>
                    </div>

                    {pillarScore !== null || overallScore !== null || (liftPts !== null && liftPts > 0) ? (
                      <div className="flex flex-wrap gap-1.5">
                        {pillarScore !== null ? (
                          <span className="rounded-md bg-[#fff7ed] px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-[#c2410c]">
                            {pillarLabel} {Math.round(pillarScore)}
                          </span>
                        ) : null}
                        {overallScore !== null ? (
                          <span className="rounded-md bg-surface-container px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-on-surface-variant">
                            Overall {Math.round(overallScore)}
                          </span>
                        ) : null}
                        {liftPts !== null && liftPts > 0 ? (
                          <span className="rounded-md bg-[#ecfdf5] px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-[#047857]">
                            ~+{liftPts} {pillarKey}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {hook ? (
                      <p className="text-[13px] leading-relaxed text-on-surface-variant">{hook}</p>
                    ) : null}
                    {sector && !hook.toLowerCase().includes(sector.toLowerCase()) ? (
                      <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-on-surface-variant/80">
                        {sector}
                      </p>
                    ) : null}
                  </Link>
                  {ticker && instrumentId ? (
                    <TrackButton
                      ticker={ticker}
                      instrumentId={instrumentId}
                      isTracked={isTracked}
                      isSubscribed={isSubscribed}
                      trackedCount={trackedCount}
                      variant="icon"
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StocksToCheckOut({
  suggestions,
  tracked,
  isSubscribed,
}: {
  suggestions: Dict[];
  tracked: string[];
  isSubscribed: boolean;
}) {
  // Moat-first: names lighting up in anomalies or buzz lead the list.
  const list = [...suggestions]
    .sort((a, b) => Number(Boolean(suggestionMoatSignal(b))) - Number(Boolean(suggestionMoatSignal(a))))
    .slice(0, 6);
  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg tint-info text-[14px]">
          🔍
        </span>
        <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#3b82f6]">
          Stocks to check out
        </span>
        <span className="text-[10px] font-semibold tabular-nums text-on-surface-variant">
          {list.length}
        </span>
      </div>
      {list.length === 0 ? (
        <p className="text-[13px] text-on-surface-variant italic">No suggestions yet.</p>
      ) : (
        <ul className="rounded-2xl border border-outline-variant bg-surface overflow-hidden">
          {list.map((item, i) => {
            const ticker = text(item.ticker);
            const moat = suggestionMoatSignal(item);
            const reason = moat ? moat.label : text(item.reason);
            const why = moat ? moat.line : text(item.why);
            const score = moat ? null : num(item.score ?? item.match_score);
            const market = item.market === "IN" ? "IN" : "US";
            const instrumentId = ticker ? `${market}_${ticker}` : "";
            const isTracked = instrumentId ? tracked.includes(instrumentId) : false;
            return (
              <li
                key={`sug-${i}`}
                className={`flex items-center gap-3 px-4 py-3.5 ${
                  i > 0 ? "border-t border-outline-variant" : ""
                } hover:bg-surface-container-low transition-colors`}
              >
                <Link
                  href={ticker ? `/stock/${encodeURIComponent(ticker)}` : "#"}
                  className="flex items-center gap-3 flex-1 min-w-0 group"
                >
                  {ticker && <StockLogo ticker={ticker} market={market} size={32} />}
                  <div className="flex flex-col min-w-0 flex-1 gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-on-surface group-hover:text-[#22d3ee] transition-colors">
                        {ticker || "Suggestion"}
                      </span>
                      {reason &&
                        (() => {
                          const chip = moat ? { bg: moat.bg, fg: moat.fg } : reasonChip(reason);
                          return (
                            <span
                              className="inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.02em] whitespace-nowrap"
                              style={{ backgroundColor: chip.bg, color: chip.fg }}
                            >
                              {reason}
                            </span>
                          );
                        })()}
                    </div>
                    {why && (
                      <span className="text-[11.5px] text-on-surface-variant truncate">{why}</span>
                    )}
                  </div>
                </Link>
                <div className="flex items-center gap-3 shrink-0">
                  {score !== null && <ScoreStamp score={score} />}
                  {ticker && instrumentId && (
                    <TrackButton
                      ticker={ticker}
                      instrumentId={instrumentId}
                      isTracked={isTracked}
                      isSubscribed={isSubscribed}
                      variant="icon"
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ScoreStamp({ score }: { score: number }) {
  const ringColor =
    score >= 80 ? "#10b981" : score >= 60 ? "#0052ff" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center justify-center w-12 h-12 shrink-0 rounded-full border-2"
      style={{ borderColor: ringColor }}>
      <span className={`text-[14px] font-semibold tabular-nums leading-none ${scoreToneText(score)}`}>
        {Math.round(score)}
      </span>
      <span className="text-[8px] font-semibold tracking-[0.06em] uppercase text-on-surface-variant mt-0.5">
        Score
      </span>
    </div>
  );
}

// =============================================================================
// SHARED — SectionOpener
// =============================================================================

function SectionOpener({
  number,
  title,
  meta,
  refreshing,
}: {
  number: string;
  title: string;
  meta?: string;
  refreshing?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-outline-variant/60 pt-8">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant tabular-nums">
          § {number}
        </span>
        <h2 className="font-mono text-[18px] font-bold tracking-tight text-on-surface md:text-[20px]">
          {title}
        </h2>
        {refreshing && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">
            <span aria-hidden className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-on-surface-variant opacity-50" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-on-surface-variant" />
            </span>
            Updating
          </span>
        )}
      </div>
      {meta ? (
        <span className="font-mono text-[11px] text-on-surface-variant">{meta}</span>
      ) : null}
    </div>
  );
}

// =============================================================================
// EMPTY / FREE / UNSUBSCRIBED STATES
// =============================================================================

function BareHeader({ rowsCount, builtAt }: { rowsCount: number; builtAt?: string }) {
  return (
    <header className="flex items-end justify-between gap-4 flex-wrap">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] md:text-[34px] font-semibold text-on-surface tracking-[-0.02em] leading-none">
          Watchlist
        </h1>
        <span className="text-[13px] text-on-surface-variant">
          {rowsCount} {rowsCount === 1 ? "ticker" : "tickers"} in Watchlist · refreshed{" "}
          {builtAt ? formatRelative(builtAt) : "never"}
        </span>
      </div>
    </header>
  );
}

// =============================================================================
// POPULAR_FALLBACK
// =============================================================================

const POPULAR_FALLBACK: Array<{ ticker: string; sector: string; reason: string }> = [
  { ticker: "AAPL", sector: "Consumer Electronics", reason: "Most-watched name on stocksbrew." },
  { ticker: "NVDA", sector: "Semiconductors", reason: "AI infra leader · high heat." },
  { ticker: "MSFT", sector: "Software", reason: "Quality compounder · steady." },
  { ticker: "META", sector: "Communication Services", reason: "Analyst runway +33%." },
  { ticker: "GOOGL", sector: "Communication Services", reason: "Cheap relative to peers." },
  { ticker: "AMZN", sector: "Consumer Cyclical", reason: "Cloud + retail compounder." },
];

function EmptyState({
  suggestions = [],
  trackedIds = new Set(),
  isSubscribed,
}: {
  suggestions?: Dict[];
  trackedIds?: Set<string>;
  isSubscribed: boolean;
}) {
  const cards =
    suggestions.length > 0
      ? suggestions.slice(0, 6).map((s) => ({
          ticker: text(s.ticker),
          sector: text(s.sector),
          reason: text(s.reason) || text(s.why),
          score: num(s.score ?? s.match_score),
          market: (text(s.market) || "US") as "US" | "IN",
        }))
      : POPULAR_FALLBACK.map((s) => ({ ...s, score: null, market: "US" as const }));

  return (
    <section className="flex flex-col gap-8">
      <div className="rounded-3xl border border-outline-variant bg-surface p-8 md:p-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4 md:gap-5">
          <span
            aria-hidden
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl tint-info text-[26px] shrink-0"
          >
            📡
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[22px] md:text-[24px] font-semibold text-on-surface tracking-[-0.02em]">
              Build your Watchlist
            </h2>
            <p className="text-[14px] text-on-surface-variant leading-relaxed max-w-[560px]">
              Add stocks from any detail page and stocksbrew gives you personalized buy, hold, and
              sell calls on what you hold and watch, plus triggers and email alerts when setups change.
            </p>
          </div>
        </div>
        <RadarBatchEditModal
          initialItems={[]}
          isSubscribed={isSubscribed}
          ctaLabel="Add stocks"
          triggerClassName="self-start inline-flex items-center justify-center h-[40px] rounded-full bg-on-surface px-5 text-[13px] font-semibold text-white hover:-translate-y-[1px] active:translate-y-0 transition-transform shrink-0"
        />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3 border-t border-outline-variant pt-6">
          <div className="flex items-baseline gap-3">
            <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant">
              Suggested
            </span>
            <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-on-surface">
              Start with one of these
            </h3>
          </div>
          <span className="text-[12px] text-on-surface-variant">{cards.length} ideas</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map((card) => {
            const instrumentId = `${card.market === "IN" ? "IN" : "US"}_${card.ticker}`;
            return (
              <div
                key={card.ticker}
                className="group flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface p-4 transition-all hover:border-on-surface hover:shadow-sm"
              >
                <Link href={`/stock/${encodeURIComponent(card.ticker)}`} className="flex items-center gap-3 min-w-0 flex-1">
                  <StockLogo ticker={card.ticker} market={card.market} size={36} />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[14px] font-semibold text-on-surface group-hover:text-[#22d3ee] transition-colors">
                        {card.ticker}
                      </span>
                      {card.sector && (
                        <span className="text-[11px] text-on-surface-variant truncate">{card.sector}</span>
                      )}
                    </div>
                    {card.reason && (
                      <span className="text-[11.5px] text-on-surface-variant leading-snug truncate">
                        {card.reason}
                      </span>
                    )}
                  </div>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  {typeof card.score === "number" && (
                    <span className={`text-[15px] font-semibold tabular-nums ${scoreToneText(card.score)}`}>
                      {Math.round(card.score)}
                    </span>
                  )}
                  <TrackButton
                    ticker={card.ticker}
                    instrumentId={instrumentId}
                    isTracked={trackedIds.has(instrumentId)}
                    variant="icon"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FreeRadarState({ rows, builtAt }: { rows: WatchlistRow[]; builtAt?: string }) {
  // Fallback shown only when the rebuild ran but produced zero rows (e.g. all
  // newly-tracked stocks don't have price data in tm_latest_prices yet).
  const holdings = rows.filter((r) => r.position_type === "holding").sort(byAttention);
  const watching = rows.filter((r) => r.position_type !== "holding").sort(byAttention);
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full min-w-0 max-w-screen-2xl px-3 sm:px-6 md:px-10 lg:px-12 xl:px-20 2xl:px-32 py-10 md:py-12 flex flex-col gap-8">
        <header className="flex flex-col gap-1.5">
          <h1 className="text-[28px] md:text-[34px] font-semibold text-on-surface tracking-[-0.02em] leading-none">
            Watchlist
          </h1>
          <p className="text-[13px] text-on-surface-variant">
            {rows.length}/3 stocks · refreshed{" "}
            {builtAt ? formatRelative(builtAt) : "never"}
          </p>
        </header>
        <section className="rounded-3xl border border-outline-variant bg-surface p-4 md:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[18px] font-semibold text-on-surface tracking-[-0.01em]">
              Your stocks
            </h2>
            <ProCtaLink href="/subscribe" size="sm" showStar className="h-[36px] px-4 text-[12px]">
              Upgrade for unlimited stocks
            </ProCtaLink>
          </div>
          <p className="text-[12px] text-on-surface-variant">
            Prices are loading. Your research will appear after the next Watchlist update.
            Free plan supports up to 3 stocks; Pro unlocks unlimited.
          </p>
          <WatchlistTabs holdings={holdings} watching={watching} suggestions={[]} />
        </section>
      </div>
    </main>
  );
}

const STARTER_PICKS = [
  { ticker: "NVDA", market: "US", sector: "Semiconductors", reason: "AI infrastructure leader, most-tracked on stocksbrew." },
  { ticker: "AAPL", market: "US", sector: "Consumer Electronics", reason: "Durable free cash flow, highest retail ownership." },
  { ticker: "MSFT", market: "US", sector: "Software", reason: "Quality compounder with steady earnings growth." },
  { ticker: "META", market: "US", sector: "Comm. Services", reason: "Analyst runway +33%, strong momentum." },
  { ticker: "GOOGL", market: "US", sector: "Comm. Services", reason: "Cheap relative to peers on forward earnings." },
  { ticker: "AMZN", market: "US", sector: "Consumer Cyclical", reason: "Cloud + retail flywheel, underappreciated margins." },
];

function UnsubscribedState({
  tracked,
  livePicks = [],
  anomalies = [],
  buzz = [],
  premarket = [],
  tapeItems = [],
  builtAt,
}: {
  tracked: string[];
  livePicks?: LivePick[];
  anomalies?: BookAnomaly[];
  buzz?: BookBuzz[];
  premarket?: BookPremarket[];
  tapeItems?: TapeItem[];
  builtAt?: string;
}) {
  const trackedCount = tracked.length;
  const atLimit = trackedCount >= 3;
  const featured = livePicks[0] ?? null;
  const starterPicks =
    livePicks.length > 0
      ? livePicks
      : STARTER_PICKS.map((p) => ({
          ticker: p.ticker,
          name: p.sector,
          market: (p.market === "IN" ? "IN" : "US") as "US" | "IN",
          logoUrl: null,
          chips: [] as SignalChip[],
          line: p.reason,
        }));
  const chatStarters: RadarChatStarter[] = [
    { label: "What's moving today?", message: "What's moving in the market today?" },
    { label: "Help me pick a stock", message: "Help me pick my first stock to add to Watchlist." },
    ...(featured
      ? [{ label: `Why ${featured.ticker}?`, message: `Why is ${featured.ticker} moving today?` }]
      : []),
  ].slice(0, 4);

  return (
    <main className="flex flex-grow flex-col bg-background">
      <style>{tapeStyles}</style>
      <RadarWorkspace trackedCount={trackedCount} tickers={[]} starters={chatStarters}>
        <header className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between md:gap-6">
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
                stocksbrew · {todayMasthead()}
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-mono text-[28px] font-extrabold leading-none tracking-tight text-on-surface md:text-[34px]">
                  Watchlist
                </h1>
                <Link
                  href="/subscribe"
                  className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant tint-warn px-2.5 py-1 text-[11px] font-semibold text-[#f59e0b] hover:border-[#f59e0b] transition-colors"
                >
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                    <path d="M4.5 0L5.6 3.2H9L6.2 5.1L7.3 8.3L4.5 6.4L1.7 8.3L2.8 5.1L0 3.2H3.4L4.5 0Z" fill="#f59e0b"/>
                  </svg>
                  Free · {trackedCount}/3 stocks
                </Link>
              </div>
              <p className="font-mono text-[11px] text-on-surface-variant">
                0 tickers in Watchlist · refreshed {builtAt ? formatRelative(builtAt) : "today"}
              </p>
            </div>

            <div className="flex items-center gap-2 self-start mt-2">
              {atLimit ? (
                <ProCtaLink href="/subscribe" size="sm" showStar className="text-[12px]">
                  Track every stock you hold →
                </ProCtaLink>
              ) : (
                <RadarBatchEditModal
                  initialItems={[]}
                  isSubscribed={false}
                  ctaLabel="Add a stock"
                />
              )}
            </div>
          </div>

          {tapeItems.length > 0 ? <LiveTape items={tapeItems} /> : null}
        </header>

        <RadarSignalsOnBook
          anomalies={anomalies}
          buzz={buzz}
          premarket={premarket}
          trackedIds={tracked}
          isSubscribed={false}
        />

        <section className="flex flex-col gap-6">
          <SectionOpener number="01" title="Your book" meta="0 held · 0 watching" />

          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-outline-variant bg-surface overflow-hidden">
              <div className="border-b border-outline-variant/60 px-4 py-3.5 sm:px-5">
                <p className="text-[14px] font-semibold text-on-surface tracking-[-0.01em]">
                  Start your book
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">
                  Add up to 3 stocks free. We watch the buzz, the moves, and the regime — then land a morning call on each.
                </p>
              </div>

              <ul className="flex flex-col divide-y divide-outline-variant/40">
                {starterPicks.slice(0, 6).map((pick) => {
                  const instrumentId = `${pick.market}_${pick.ticker}`;
                  const isTracked = tracked.includes(instrumentId);
                  return (
                    <li
                      key={pick.ticker}
                      className="flex items-center gap-3 px-4 py-3.5 sm:px-5 hover:bg-surface-container-low transition-colors"
                    >
                      <Link
                        href={`/stock/${encodeURIComponent(pick.ticker)}`}
                        className="group flex min-w-0 flex-1 items-center gap-3"
                      >
                        <StockLogo ticker={pick.ticker} market={pick.market} size={34} logoUrl={pick.logoUrl} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[13px] font-bold text-on-surface group-hover:text-[var(--accent-terminal)]">
                              {pick.ticker}
                            </span>
                            {pick.chips.length > 0 ? <SignalChips chips={pick.chips} /> : null}
                          </div>
                          <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
                            {pick.line}
                          </p>
                        </div>
                      </Link>
                      <TrackButton
                        ticker={pick.ticker}
                        instrumentId={instrumentId}
                        isTracked={isTracked}
                        isSubscribed={false}
                        variant="icon"
                      />
                    </li>
                  );
                })}
              </ul>

              <p className="border-t border-outline-variant/60 px-4 py-3 text-center text-[11px] text-on-surface-variant sm:px-5">
                Or use <span className="font-semibold text-on-surface">+ Add a stock</span> above to search any ticker.
              </p>
            </div>

            {featured ? (
              <div className="flex min-w-0 flex-col gap-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
                  Morning read preview
                </span>
                <ConnectedReadCard
                  ticker={featured.ticker}
                  name={featured.name}
                  market={featured.market}
                  logoUrl={featured.logoUrl}
                  chips={featured.chips}
                  conclusion={`${featured.line} Track ${featured.ticker} and you get the full call on it tomorrow.`}
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <SectionOpener number="02" title="Whole book" meta="locked" />
          <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low/60 px-5 py-6">
            <p className="text-[14px] font-semibold text-on-surface">Portfolio diagnosis unlocks with your book</p>
            <p className="mt-1.5 max-w-xl text-[12px] leading-relaxed text-on-surface-variant">
              Add 2+ stocks and we cluster your list, score concentration risk, and surface what deserves attention today.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {["Overall", "Valuation", "Growth", "Momentum"].map((label) => (
                <div key={label} className="rounded-lg border border-outline-variant/50 bg-surface px-3 py-2.5">
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
                    {label}
                  </p>
                  <div
                    aria-hidden
                    className="mt-2 h-5 rounded-md"
                    style={{
                      background: "color-mix(in srgb, var(--on-surface) 10%, var(--surface-container-high))",
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-on-surface">Pro covers the whole book</p>
            <p className="text-[12px] text-on-surface-variant">
              Unlimited stocks, daily directives, alerts, and whole-book diagnosis.
            </p>
          </div>
          <ProCtaLink href="/subscribe" size="sm" showStar className="shrink-0 text-[12px]">
            See plans →
          </ProCtaLink>
        </section>
      </RadarWorkspace>
    </main>
  );
}

// =============================================================================
// DATA HELPERS
// =============================================================================

type PillarAverages = {
  overall: number | null;
  valuation: number | null;
  growth: number | null;
  quality: number | null;
  momentum: number | null;
};

function computePillarAverages(rows: WatchlistRow[]): PillarAverages {
  const keys = ["overall", "valuation", "growth", "quality", "momentum"] as const;
  const out: PillarAverages = { overall: null, valuation: null, growth: null, quality: null, momentum: null };

  // Dollar-weight when ALL holdings have portfolio_weight_pct > 0.
  // Partial coverage would skew results, so it's all-or-none.
  const holdingRows = rows.filter((r) => r.position_type === "holding");
  const positionAware =
    holdingRows.length > 0 &&
    holdingRows.every(
      (r) =>
        typeof r.holding?.portfolio_weight_pct === "number" &&
        (r.holding.portfolio_weight_pct as number) > 0,
    );

  for (const key of keys) {
    if (positionAware) {
      let weightedSum = 0;
      let totalWeight = 0;
      for (const r of holdingRows) {
        const score = r.scores?.[key];
        const w = r.holding!.portfolio_weight_pct as number;
        if (typeof score === "number" && Number.isFinite(score) && w > 0) {
          weightedSum += score * w;
          totalWeight += w;
        }
      }
      out[key] = totalWeight > 0 ? weightedSum / totalWeight : null;
    } else {
      const scope = holdingRows.length > 0 ? holdingRows : rows;
      const values: number[] = [];
      for (const r of scope) {
        const v = r.scores?.[key];
        if (typeof v === "number" && Number.isFinite(v)) values.push(v);
      }
      out[key] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
    }
  }
  return out;
}

function rowDirective(row: WatchlistRow): Directive | null {
  return normalizeDirectiveForUi(row.ai_directive);
}

const STANCE_WEIGHT: Record<string, number> = {
  accumulate: 3,
  trim: 3,
  avoid: 3,
  watch: 2,
  hold: 1,
};
const CONFIDENCE_WEIGHT: Record<string, number> = { high: 3, med: 2, low: 1 };

function directiveUrgency(row: WatchlistRow, directive: Directive): number {
  const stance = STANCE_WEIGHT[directive.stance ?? "hold"] ?? 1;
  const conf = CONFIDENCE_WEIGHT[directive.confidence ?? "low"] ?? 1;
  const move = Math.abs(row.day_change_pct ?? 0);
  const score = typeof row.scores?.overall === "number" ? Math.abs(row.scores.overall - 50) / 10 : 0;
  // holdings rank above watchlist on a tie
  const positionBoost = row.position_type === "holding" ? 0.5 : 0;
  return stance * 10 + conf * 5 + Math.min(move, 10) + score + positionBoost;
}

function radarSignalCount(row: WatchlistRow): number {
  let n = 0;
  const tech = row.technicals as Dict | undefined;
  const rsiBlock = (tech?.rsi_14 as Dict | undefined) ?? {};
  const rsi = num(rsiBlock.value);
  if ((rsi !== null && (rsi >= 70 || rsi <= 30)) || rsiBlock.state) n++;
  for (const c of (row.catalysts ?? []).slice(0, 2)) {
    const cat = c as Dict;
    if (text(cat.title ?? cat.kind)) n++;
  }
  n += row.alerts.length;
  return n;
}

function byAttention(a: WatchlistRow, b: WatchlistRow): number {
  const d = radarSignalCount(b) - radarSignalCount(a);
  if (d !== 0) return d;
  return Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0);
}

type FlatAlert = {
  ticker: string;
  kind: string;
  message: string;
  tone: "bull" | "bear" | "neutral";
};

function flattenAlerts(rows: WatchlistRow[]): FlatAlert[] {
  const flat: FlatAlert[] = [];
  for (const row of rows) {
    for (const flag of row.alerts) {
      const kind =
        typeof flag?.kind === "string"
          ? flag.kind
          : typeof flag?.type === "string"
          ? flag.type
          : "info";
      const message =
        typeof flag?.message === "string"
          ? flag.message
          : typeof flag?.label === "string"
          ? flag.label
          : kind;
      const tone: FlatAlert["tone"] =
        kind.includes("bearish") || kind.includes("overbought") || kind.includes("52w_low")
          ? "bear"
          : kind.includes("bullish") || kind.includes("oversold")
          ? "bull"
          : "neutral";
      flat.push({ ticker: row.ticker, kind, message, tone });
    }
  }
  return flat;
}

type ActivityEvent = {
  title: string;
  body: string;
  sentence: string;
  event_type: string;
  scope: string;
  direction: string;
  symbol: string;
  urgency: number;
  evidence: string[];
};

function buildActivityEvents(
  eventRadar: Dict[],
  brief: WatchlistBrief | null,
): ActivityEvent[] {
  const priorityKinds = new Set([
    "conviction_delta",
    "target_delta",
    "technical_extreme",
    "large_move",
    "portfolio_risk",
    "upcoming_event",
    "analyst_runway",
    "new_tracking",
  ]);
  const rawFeed =
    eventRadar.length > 0
      ? eventRadar
          .filter((event) => {
            const kind = text(event.kind).toLowerCase();
            const urgency = num(event.urgency) ?? 0;
            if (priorityKinds.has(kind)) return true;
            if (kind === "news_velocity") return urgency >= 78;
            return false;
          })
          .sort((a, b) => (num(b.urgency) ?? 0) - (num(a.urgency) ?? 0))
          .slice(0, 12)
      : [];

  if (rawFeed.length > 0) {
    return rawFeed.map((event) => {
      const title = text(event.title);
      const body = text(event.body);
      const sentence = [title, body].filter(Boolean).join(" · ") || "Tracked-stock update.";
      const scopeGuess = text(event.scope) || (text(event.ticker) ? "stock" : "market");
      const evidence = (Array.isArray(event.evidence) ? event.evidence : [])
        .map((e) => text(e))
        .filter(Boolean)
        .slice(0, 3);
      return {
        title: title || sentence,
        body,
        sentence,
        event_type: text(event.kind) || "event",
        direction: text(event.tone) || text(event.direction) || "neutral",
        symbol: text(event.ticker) || text(event.symbol),
        scope: scopeGuess,
        urgency: num(event.urgency) ?? 0,
        evidence,
      };
    });
  }
  return (brief?.essential_events ?? []).slice(0, 12).map((item) => ({
    title: item.sentence,
    body: "",
    sentence: item.sentence,
    event_type: item.event_type,
    direction: item.direction,
    symbol: item.symbol,
    scope: item.scope,
    urgency: 50,
    evidence: [],
  }));
}

function extractRunwayPct(item: Dict, headline: string): number | null {
  const direct = num(item.target_runway_pct ?? item.runway_pct ?? item.upside_pct);
  if (direct !== null) return direct;
  // try to parse from headline like "PLTR has +40.0% target runway"
  const match = headline.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  if (match) {
    const v = Number(match[1]);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

// -----------------------------------------------------------------------------
// formatting + tone helpers
// -----------------------------------------------------------------------------

function asDict(value: unknown): Dict {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Dict)
    : {};
}

function asArray(value: unknown): Dict[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Dict => !!item && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function scoreToneText(score: number | null): string {
  if (score === null) return "text-on-surface-variant";
  if (score >= 80) return "text-[#10b981]";
  if (score >= 60) return "text-on-surface";
  if (score >= 40) return "text-on-surface-variant";
  return "text-[#ef4444]";
}

function scoreToneFill(score: number | null): string {
  if (score === null) return "bg-surface-container-high";
  if (score >= 80) return "bg-[#10b981]";
  if (score >= 60) return "bg-[#0052ff]";
  if (score >= 40) return "bg-[#f59e0b]";
  return "bg-[#ef4444]";
}

function verdictLabel(score: number | null): string {
  if (score === null) return "Awaiting data";
  if (score >= 80) return "Strong tilt";
  if (score >= 60) return "Solid tilt";
  if (score >= 40) return "Mixed";
  return "Weak tilt";
}

function severityTone(severity: string): {
  bg: string;
  fg: string;
  bar: string;
  chipBg: string;
  chipFg: string;
} {
  if (severity === "high")
    return {
      bg: "color-mix(in srgb, var(--signal-bearish) 14%, var(--surface))",
      fg: "#7f1d1d",
      bar: "#dc2626",
      chipBg: "#dc2626",
      chipFg: "var(--surface)",
    };
  if (severity === "medium" || severity === "med")
    return {
      bg: "#fffbeb",
      fg: "#78350f",
      bar: "#d97706",
      chipBg: "#f59e0b",
      chipFg: "var(--surface)",
    };
  if (severity === "low")
    return {
      bg: "color-mix(in srgb, var(--signal-bullish) 14%, var(--surface))",
      fg: "#14532d",
      bar: "#16a34a",
      chipBg: "#15803d",
      chipFg: "var(--surface)",
    };
  return {
    bg: "var(--surface-container)",
    fg: "var(--on-surface)",
    bar: "var(--on-surface-variant)",
    chipBg: "var(--on-surface-variant)",
    chipFg: "var(--surface)",
  };
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "unknown";
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
