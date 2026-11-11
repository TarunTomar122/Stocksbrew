import { canSeeLevels, getViewer } from "@/lib/entitlements-server";
import { Suspense } from "react";

import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { FREE_COVERED_STOCKS, redactLevels } from "@/lib/entitlements";
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
import { buildHealthProps, buildIdeas, enrichIdeas, collectIdeaInstrumentIds } from "@/lib/radar-next-data";
import { getInstrumentLabels } from "@/lib/instrument-resolver";
import { buildHubRows } from "@/lib/watchlist-hub-data";
import { loadExamplePortfolio, loadPortfolio, newYorkToday } from "@/lib/portfolio-data";
import { pricesWords } from "@/lib/portfolio-prices";
import { getGroupMove, getMarketDay, getSnapshotFacts } from "@/lib/insight-data";
import { buildPortfolioReads, sectorsToLoad } from "@/lib/portfolio-insights";
import { getStockCallHistory } from "@/lib/stock-events";
import { callChanges } from "@/lib/stock-chart";
import type { PortfolioRowInput, PortfolioTab } from "@/lib/portfolio-shared";
import { listStockAlerts } from "@/lib/stock-alerts";
import { PortfolioHow, PortfolioIntro, PortfolioView } from "@/components/portfolio/portfolio-view";
import type { PortfolioAlert, PortfolioSignal } from "@/components/portfolio/alerts-tab";
import { PortfolioGhost } from "@/components/portfolio/portfolio-ghost";
import { RadarPageAnalytics } from "@/components/radar-page-analytics";

/**
 * The holdings editor under My stocks (/portfolio?tab=holdings, watching or alerts; it was /watchlist until Nov 11):
 * the person's holdings as an editable table (shares, average cost, remove), the stocks they watch, and their alerts.
 * Signed out or with nothing tracked, it is the example portfolio under a line on how to start. Every read and write
 * is the one /watchlist made; only the address changed.
 */

/** One slim line of what this is, then the example as the lead (under the tabs); how it works sits under it. */
function ExampleState({ signedIn, tab }: { signedIn: boolean; tab: PortfolioTab }) {
  const lead = (
    <>
      <PortfolioIntro signedIn={signedIn} freeLimit={FREE_COVERED_STOCKS} />
      <p className="mt-2 px-2 text-[14px] leading-5 text-oa-muted-fg sm:px-0">
        <span className="font-medium text-oa-fg">Here&apos;s what it looks like</span>, with example stocks and made-up share counts.
      </p>
    </>
  );
  return (
    <div className="flex flex-col gap-3">
      <Suspense fallback={<PortfolioGhost />}>
        <ExamplePortfolio tab={tab} lead={lead} />
      </Suspense>
      <PortfolioHow />
    </div>
  );
}

async function ExamplePortfolio({ tab, lead }: { tab: PortfolioTab; lead: React.ReactNode }) {
  const example = await loadExamplePortfolio().catch(() => null);
  if (!example) return <>{lead}</>;
  const today = newYorkToday();
  const tickers = [...example.portfolio.positions, ...example.portfolio.watching].map((position) => position.ticker);
  const facts = await getSnapshotFacts(tickers);
  // The example is priced on the stock pages' quotes; its S&P 500 move is from the same day (lib/portfolio-data).
  const reads = buildPortfolioReads({
    portfolio: example.portfolio,
    today,
    quoteDay: example.pricesAsOf,
    marketPct: example.marketPct,
    sectorOf: facts.sectorOf,
    spSectorWeights: facts.spSectorWeights,
    sectorMoves: {},
    zones: {},
    callChanges: [],
    example: true,
  });
  return (
    <PortfolioView
      // A link to another tab starts the view on that tab; a refresh after an edit keeps the one the person chose.
      key={tab}
      portfolio={example.portfolio}
      mode="example"
      today={today}
      initialTab={tab}
      lead={lead}
      pricesAsOf={example.pricesAsOf}
      pricesWords={pricesWords(example.pricesAsOf)}
      reads={reads}
    />
  );
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export async function HoldingsStream({ tab }: { tab: PortfolioTab }) {
  const session = await getSessionUser();
  const uid = session?.uid ?? null;

  if (!uid) {
    return (
      <>
        <RadarPageAnalytics state="signed_out" trackedCount={0} isSubscribed={false} />
        <ExampleState signedIn={false} tab={tab} />
      </>
    );
  }

  const [userDoc, watchlistView] = await Promise.all([getUserDoc(uid), getWatchlistView(uid).catch(() => null)]);
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const isSubscribed = resolveIsSubscribed(userDoc);

  if (tracked.length === 0) {
    return (
      <>
        <RadarPageAnalytics state="empty" trackedCount={0} isSubscribed={isSubscribed} />
        <ExampleState signedIn tab={tab} />
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
  const materializedIds = new Set(materializedRows.map((row) => row.instrument_id));
  // A stock added a moment ago is tracked before its row is materialised. Show it
  // anyway (ticker from the id, no numbers yet) instead of dropping it from the list.
  const pendingRows: WatchlistRow[] = tracked
    .filter((id) => !materializedIds.has(id))
    .map((id) => ({
      instrument_id: id,
      ticker: id.split("_").slice(1).join("."),
      position_type: "watchlist",
      market: id.startsWith("IN_") ? "IN" : "US",
      sector_label: "",
      industry_label: "",
      currency: id.startsWith("IN_") ? "INR" : "USD",
      price: null,
      day_change_pct: null,
      day_change_abs: null,
      scores: { overall: null, verdict: null, valuation: null, growth: null, quality: null, momentum: null },
      alerts: [],
      catalysts: [],
      brief_tile: { micro: "", vibe: "wild", source: "rules" },
      coverage_status: "score_pending",
      has_intel_pro: false,
    }));
  const rowsBase = [...materializedRows.filter((row) => trackedSet.has(row.instrument_id)), ...pendingRows].map((row) => ({
    ...row,
    position_type: positions[row.instrument_id] === "holding" ? "holding" : "watchlist",
  })) as WatchlistRow[];

  const instrumentIds = rowsBase.map((row) => row.instrument_id);
  const anomalyTickers = rowsBase.map((row) => row.ticker).filter(Boolean);
  const holdings = rowsBase.filter((row) => row.position_type === "holding");
  const diagnosis = buildHoldingsDiagnosis(holdings);

  const ideasBase = buildIdeas(watchlistView?.suggestions);
  const ideaIds = collectIdeaInstrumentIds(ideasBase);
  const [rowsPriced, labelsById, radarStockStates, earningsDocs, anomaliesByTicker, ideaMarket, premarketDoc, userAlerts] =
    await Promise.all([
      overlayLatestPrices(rowsBase).catch(() => rowsBase),
      getInstrumentLabels(instrumentIds).catch(() => new Map()),
      getRadarStockStates(instrumentIds).catch(() => ({})),
      getLatestEarningsIntelForInstruments("US", instrumentIds).catch(() => []),
      getDailyAnomalyTickers("US", anomalyTickers).catch(() => new Map()),
      getIdeaMarketData(ideaIds).catch(() => new Map()),
      getPremarketMovers("US").catch(() => null),
      listStockAlerts(uid, { limit: 100 }).catch(() => []),
    ]);
  // Price zones are part of covering a stock. A Free account that follows more
  // than its covered limit (accounts from before the limit, or after Pro ends)
  // keeps every row and its call, but the levels are dropped below, where the
  // table rows are built (`zones:`), so they never reach the browser.
  const viewer = await getViewer();
  const rows = rowsPriced.map((row) => {
    const label = labelsById.get(row.instrument_id);
    return label ? { ...row, ticker: label.ticker || row.ticker, instrument_name: label.name } : row;
  });

  const anomaliesByInstrumentId = new Map<string, AnomalyItem>();
  for (const anomaly of anomaliesByTicker.values()) {
    if (trackedSet.has(anomaly.instrument_id)) anomaliesByInstrumentId.set(anomaly.instrument_id, anomaly);
  }
  const gappersByInstrumentId = new Map<string, number>();
  for (const gapper of [...(premarketDoc?.gappers_up ?? []), ...(premarketDoc?.gappers_down ?? [])]) {
    gappersByInstrumentId.set(gapper.instrument_id, gapper.pre_market_change_pct);
  }
  const earningsById = new Map(earningsDocs.map((doc) => [doc.instrument_id, doc]));

  const hubRows = buildHubRows({ rows, states: radarStockStates, anomaliesByInstrumentId, earningsById, gappersByInstrumentId, now });
  const rawById = new Map(rows.map((row) => [row.instrument_id, row]));

  const inputs: PortfolioRowInput[] = hubRows.map((hub) => {
    const raw = rawById.get(hub.instrument_id);
    const directive = raw?.directive_v2 ?? raw?.ai_directive;
    const levels = canSeeLevels(viewer, hub.instrument_id);
    return {
      instrument_id: hub.instrument_id,
      ticker: hub.ticker,
      name: hub.name,
      sector: asString(raw?.sector_label) ?? asString(raw?.instrument_sector),
      kind: hub.position_type,
      price: hub.price,
      day_change_pct: hub.day_change_pct,
      stance: hub.stance,
      zones: levels ? directive?.zones ?? null : null,
      // "In its zone" is the zone itself, so it is only said for covered stocks.
      needs_attention: levels ? hub.needs_attention : false,
      attention_direction: levels ? hub.attention_direction : null,
      // The reason line can quote the call's levels ("add below $182"). Those belong to covered stocks.
      reason: levels ? hub.reason_line : redactLevels(hub.reason_line) ?? "",
      earnings_date: hub.earnings_date,
    };
  });

  const portfolio = await loadPortfolio({ rows: inputs, holdings: userDoc?.watchlist_holdings ?? null, now });

  // ── the reads: baselines for the plain rules in lib/portfolio-insights ──
  const everyTicker = [...portfolio.positions, ...portfolio.watching].map((position) => position.ticker);
  const [facts, marketDay] = await Promise.all([getSnapshotFacts(everyTicker), getMarketDay()]);
  const quoteDay = marketDay?.day ?? null;
  const sectorNames = sectorsToLoad(portfolio, facts.sectorOf);
  const today = newYorkToday(now);
  const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  // Calls and their history are part of covering a stock: only covered holdings are asked for.
  const coveredHoldings = portfolio.positions.filter((position) => canSeeLevels(viewer, position.instrument_id)).slice(0, 30);
  const [sectorMoveList, callHistories] = await Promise.all([
    Promise.all(sectorNames.map((name) => getGroupMove("sector", name, quoteDay).catch(() => null))),
    Promise.all(coveredHoldings.map((position) => getStockCallHistory(position.instrument_id).catch(() => []))),
  ]);
  const sectorMoves: Record<string, number> = {};
  for (const move of sectorMoveList) if (move) sectorMoves[move.name] = move.medianPct;
  const recentCallChanges = coveredHoldings.flatMap((position, index) =>
    callChanges(callHistories[index] ?? [])
      .filter((change) => change.from && change.date >= weekAgo)
      .slice(-1)
      .map((change) => ({ ticker: position.ticker, from: change.from, to: change.to, date: change.date })),
  );
  // Zones were already dropped from `inputs` for uncovered stocks, so only covered levels reach the read.
  const zonesById: Record<string, { addBelow: number | null; trimAbove: number | null }> = {};
  for (const input of inputs) {
    if (!input.zones) continue;
    const add = input.zones.accumulate_below;
    const trim = input.zones.trim_above;
    zonesById[input.instrument_id] = {
      addBelow: typeof add === "number" && Number.isFinite(add) ? add : null,
      trimAbove: typeof trim === "number" && Number.isFinite(trim) ? trim : null,
    };
  }

  const alerts: PortfolioAlert[] = userAlerts
    .map((alert) => {
      const id = asString(alert.id);
      const ticker = asString(alert.ticker);
      const instrumentId = asString(alert.instrument_id);
      if (!id || !ticker || !instrumentId) return null;
      const condition = alert.condition === "above" || alert.condition === "below" ? alert.condition : null;
      const target = typeof alert.target_price === "number" && Number.isFinite(alert.target_price) ? alert.target_price : null;
      return {
        id,
        ticker: ticker.toUpperCase(),
        instrument_id: instrumentId,
        kind: asString(alert.kind) ?? "price_threshold",
        condition,
        target_price: target,
        created_at: asString(alert.created_at),
        note: asString(alert.note),
      };
    })
    .filter((alert): alert is PortfolioAlert => alert !== null);

  const signals: PortfolioSignal[] = hubRows.flatMap((hub) => {
    const levels = canSeeLevels(viewer, hub.instrument_id);
    return hub.flags
      .map((flag) => ({
        ticker: hub.ticker,
        title: levels ? flag.title : redactLevels(flag.title) ?? "",
        body: levels ? flag.body : redactLevels(flag.body) ?? "",
        tone: flag.tone,
      }))
      .filter((flag) => flag.title);
  });

  const reads = buildPortfolioReads({
    portfolio,
    today,
    quoteDay,
    marketPct: marketDay?.pct ?? null,
    sectorOf: facts.sectorOf,
    spSectorWeights: facts.spSectorWeights,
    sectorMoves,
    zones: zonesById,
    callChanges: recentCallChanges,
    alerts,
  });

  const health = buildHealthProps(diagnosis, holdings.length);
  const ideas = enrichIdeas(ideasBase, ideaMarket);
  const seen = new Set<string>();
  const mergedIdeas = [...ideas.unusual, ...ideas.fits, ...ideas.top]
    .filter((idea) => {
      const key = `${idea.market}:${idea.ticker}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);

  return (
    <>
      <RadarPageAnalytics state="active" trackedCount={hubRows.length} isSubscribed={isSubscribed} />
      <PortfolioView
        key={tab}
        portfolio={portfolio}
        mode="live"
        today={newYorkToday(now)}
        initialTab={tab}
        isSubscribed={isSubscribed}
        coverage={
          viewer.plan === "free" && viewer.coverage
            ? {
                covered: viewer.coverage.covered,
                held: viewer.coverage.held,
                limit: viewer.coverage.limit,
                fillsLeft: viewer.coverage.fillsLeft,
                swapAvailable: viewer.coverage.swapAvailable,
                nextSwapAt: viewer.coverage.nextSwapAt,
              }
            : null
        }
        alerts={alerts}
        signals={signals}
        health={health}
        ideas={mergedIdeas}
        emailPrefs={{ alerts: userDoc?.email_alerts_enabled ?? true, digest: userDoc?.email_digest_enabled ?? true }}
        asOf={now.toISOString()}
        pricesAsOf={quoteDay}
        pricesWords={pricesWords(quoteDay, now)}
        reads={reads}
      />
    </>
  );
}
