import { notFound } from "next/navigation";

import { canSeeLevels, coveredSlotsLeft, getViewer, isCovered } from "@/lib/entitlements-server";
import { redactLevels } from "@/lib/entitlements";
// Split into its own chunk: it only shows on a stock that has no brief yet.
import { LockedAiBriefLazy as LockedAiBrief } from "@/components/locked-ai-brief-lazy";
import { StockPageSchema } from "@/components/seo/stock-page-schema";
import { StockPageAnalytics } from "@/components/stock-page-analytics";
import { StockReport } from "@/components/stock-report/report";
import { dayInET, fmtDate } from "@/components/stock-report/format";
import { Suspense } from "react";
import type { ReportData, ReportExtras } from "@/components/stock-report/types";
import type { HiddenLevel } from "@/components/stock-report/call-line";
import { ownCallLevel } from "@/lib/call-level";
import { StockReportBelow } from "@/components/stock-report/below";
import { SignalStrip } from "@/components/stock-report/signal-ui";
import { stockSignalsInput } from "@/components/stock-report/signals-input";
import { buildStockSignals, type StockSignals } from "@/lib/stock-signals";
import { StockBelowSkeleton } from "@/components/stock-report/skeleton";
import { StockRelatedRow } from "@/components/seo/stock-family-links";
import { StockViewTracker } from "@/components/stock-view-tracker";
import { UnlistedStockShell } from "@/components/unlisted-stock-shell";
import { PriorityStockModal } from "@/components/priority-stock-modal";
import { OnDemandResearchRefresh } from "@/components/on-demand-research-refresh";
import { resolveStockTier } from "@/lib/ai-launch-tier";
import { getSessionUser } from "@/lib/auth-server";
import { getInstrument, getMarketMovers, getPriceCoreOverrides } from "@/lib/firestore";
import {
  getInstrumentViewDoc,
  getStockIntelPro,
  getStockPageDocBundle,
  getStockPageView,
  resolveStockPageViewSections,
  getSectorPeersForStock,
  enrichRelatedTickersForComparison,
  getStockIntelligenceDoc,
  getStockBusinessQuestions,
  type SectorPeerRow,
  type SectorPeerPick,
  getStockSummary,
  normalizeStockSymbolParam,
  type StockIntelligenceDoc,
  type InstrumentViewDoc,
} from "@/lib/stock";
import { getCurrentMarket } from "@/lib/market";
import { getRedditContextForTicker, getRedditCues, resolveRedditContextForSymbol } from "@/lib/reddit-cues";
import type { RedditTickerContext } from "@/lib/reddit-cues-shared";
import { getNewsForTicker, type NewsArticle } from "@/lib/news";
import { getLatestTechnicals } from "@/lib/technicals";
import { currencySymbolFor, decodeTextEntities } from "@/lib/utils";
import {
  getDailyAnomalyForTicker,
  mergeAnomalyWithLatestPrice,
} from "@/lib/daily-anomalies";
import { anomalyHeadline, anomalyDetail } from "@/components/daily-anomalies-shared";
import { todayET } from "@/lib/calendar-shared";
import { consistentFundamentals } from "@/lib/stock-header-facts";
import { getNextEarningsCalendarEventCached } from "@/lib/earnings";
import { isWithinPreEarningsWindow, shouldShowPreEarningsIntel } from "@/lib/pre-earnings-intel-shared";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { normalizeDirectiveForUi } from "@/lib/directive-ui";
import { getLivePremarketQuote, getPremarketMovers } from "@/lib/premarket";
import { stockSeoDescription } from "@/lib/seo/stock-pages";
import {
  buildChartRanges,
  callChanges,
  isLargeDisclosedTrade,
  withLivePoint,
  type ChartEvent,
} from "@/lib/stock-chart";
import {
  getStockCallHistory,
  getStockCongressTrades,
  getStockEarningsDates,
  getStockLongSeries,
  getStockSnapshotHistory,
} from "@/lib/stock-events";
import { getFollowSlugs } from "@/lib/follow";
import { getStockOwnership, type StockOwnership } from "@/lib/stock-ownership";
import { CALL_PLAIN, wholeSentences } from "@/lib/plain-copy";
import { buildStockRead, readLooksBroken } from "@/lib/stock-read";
import { buildStockTimeline } from "@/lib/stock-timeline";
import { fin } from "@/lib/insight-format";
import { getDailySeries } from "@/lib/screener-series";
import { getScreenerSymbolContext } from "@/lib/screener";
import { buildCallEvidence, type CalendarReport, type ResultsReport } from "@/lib/call-evidence";
import { callEvidenceInput, getResultsReports, lastStepOn } from "@/lib/call-evidence-data";

export const revalidate = 60;

type Props = {
  params: Promise<{ symbol: string }>;
};

function hasBriefText(intelligence: StockIntelligenceDoc | null): boolean {
  if (!intelligence) return false;
  const visual = intelligence.visual_summary ?? {};
  return Boolean(
    String(visual.what_changed ?? "").trim() ||
      String(visual.why_it_matters ?? "").trim() ||
      String(visual.what_to_watch ?? "").trim() ||
      String(intelligence.today_brief ?? "").trim() ||
      String(intelligence.body ?? "").trim() ||
      String(intelligence.thesis ?? "").trim() ||
      String(intelligence.headline ?? "").trim(),
  );
}

function hasDirectiveBrief(intelligence: StockIntelligenceDoc | null): boolean {
  return Boolean(normalizeDirectiveForUi(intelligence?.directive_v2 ?? null)?.text?.trim());
}

function isActiveOnDemandBriefStatus(status: string | null | undefined): boolean {
  const normalized = String(status || "").toLowerCase();
  return normalized === "queued" || normalized === "running" || normalized === "retry";
}

function numericDirectiveTrigger(intelligence: StockIntelligenceDoc | null): number | null {
  const raw = normalizeDirectiveForUi(intelligence?.directive_v2 ?? null)?.trigger_value;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const match = raw.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function isSplitScaleStaleBrief(
  intelligence: StockIntelligenceDoc | null,
  currentPrice: number,
  latestPriceAt?: string,
): boolean {
  const generatedAt = intelligence?.generated_at;
  const trigger = numericDirectiveTrigger(intelligence);
  if (!generatedAt || !latestPriceAt || !trigger || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return false;
  }

  const generatedMs = new Date(generatedAt).getTime();
  const priceMs = new Date(latestPriceAt).getTime();
  if (!Number.isFinite(generatedMs) || !Number.isFinite(priceMs) || generatedMs >= priceMs) {
    return false;
  }

  const ratio = Math.max(trigger / currentPrice, currentPrice / trigger);
  return ratio >= 4;
}


/**
 * The lead line of a locked brief: the body's first sentence when it states what is happening at the company,
 * never when it carries our view (we'd, our, a multiple of earnings, a level), which is the reasoning the full
 * read keeps. Null when it does, so the brief's own title shows instead.
 */
const OUR_VIEW = /\b(?:we|we'd|we're|our)\b|\d+(?:\.\d+)?\s*(?:x|times)\b|\b(?:buy more|sell some|add|trim|valuation|upside|downside|level|zone|target)\b/i;
function lockedLead(body: string | null): string | null {
  const first = body ? wholeSentences(body, 1) : "";
  if (!first || OUR_VIEW.test(first) || first.length > 260) return null;
  const kept = redactLevels(first);
  return kept ? kept.replace(/[;,:]\s*$/, ".") : null;
}

/** The lower half of the report, once its reads are in (components/stock-report/below.tsx). */
async function ReportBelowStream({
  data,
  extras,
  signals,
  analytics,
}: {
  data: ReportData;
  extras: Promise<ReportExtras>;
  signals: Promise<StockSignals | null>;
  analytics: Omit<Parameters<typeof StockPageAnalytics>[0], "hasCrowdSignal">;
}) {
  const [loaded, judged] = await Promise.all([extras, signals]);
  return (
    <>
      {/* `stock_viewed` says whether the page had a crowd signal, so it goes out with the part that knows. */}
      <StockPageAnalytics {...analytics} hasCrowdSignal={Boolean(loaded.reddit)} />
      <StockReportBelow data={data} extras={loaded} signals={judged} />
    </>
  );
}

/** The good and watch tally beside the call, once every section it counts has loaded (lib/stock-signals.ts). */
async function SignalStripStream({ signals }: { signals: Promise<StockSignals | null> }) {
  const judged = await signals;
  return judged?.tally ? <SignalStrip tally={judged.tally} /> : null;
}

/** Whether this stock's price is refreshed less often than the priority set's (a notice explains it); never holds up the page. */
async function PriorityNotice({ market, instrumentId, ticker }: { market: "US" | "IN"; instrumentId: string; ticker: string }) {
  const [marketMovers, priceCoreOverrides] = await Promise.all([
    getMarketMovers(market).catch(() => null),
    getPriceCoreOverrides(market).catch(() => [] as string[]),
  ]);
  const priorityIds = marketMovers?.priority_instrument_ids ?? [];
  const inPriorityCohort = priorityIds.includes(instrumentId);
  const inExtendedOverrides = (priceCoreOverrides || []).includes(instrumentId);
  const open = priorityIds.length > 0 && !(inPriorityCohort || inExtendedOverrides);
  return <PriorityStockModal open={open} instrumentId={instrumentId} ticker={ticker} />;
}

export async function StockPageStream({ params }: Props) {
  const { symbol } = await params;
  const sessionPromise = getSessionUser();
  const cookieMarket = getCurrentMarket();
  // Try the active market first, then fall back to the other one so that
  // sharing an IN link from a US session (or vice-versa) still resolves.
  const otherMarket: "US" | "IN" = cookieMarket === "IN" ? "US" : "IN";
  const stockInCookieMarket = await getStockSummary(symbol, cookieMarket);
  const stockInOtherMarket = stockInCookieMarket
    ? null
    : await getStockSummary(symbol, otherMarket);
  const stock = stockInCookieMarket ?? stockInOtherMarket;
  const market: "US" | "IN" = stockInCookieMarket ? cookieMarket : otherMarket;
  if (!stock) {
    const normalizedTicker = normalizeStockSymbolParam(symbol);
    if (!normalizedTicker) notFound();

    const [snapUs, snapIn] = await Promise.all([
      getRedditCues("US").catch(() => null),
      getRedditCues("IN").catch(() => null),
    ]);
    const redditTickerContext =
      resolveRedditContextForSymbol(snapUs, normalizedTicker) ??
      resolveRedditContextForSymbol(snapIn, normalizedTicker);
    const session = await sessionPromise;
    const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
    const subscribed = resolveIsSubscribed(userDoc);

    return (
      <main className="flex min-w-0 w-full flex-grow flex-col">
        <UnlistedStockShell
          ticker={normalizedTicker}
          market={cookieMarket}
          redditTickerContext={redditTickerContext}
          isSubscribed={subscribed}
        />
      </main>
    );
  }

  // Every read below starts now and runs side by side; each later step waits only for the reads it needs,
  // never for the slowest of a whole round. Anything that fails degrades to "no data".
  const isUS = market === "US";
  const viewerPromise = getViewer();
  const userDocPromise = sessionPromise.then((session) => (session ? getUserDoc(session.uid).catch(() => null) : null));
  const viewPromise = getStockPageView(market, stock.instrument_id).catch(() => null);
  const instrumentMetaPromise = getInstrument(stock.instrument_id).catch(() => null);
  const resolvedViewPromise = viewPromise.then((view) => resolveStockPageViewSections(view, Date.now(), stock.instrument_id));

  // Sections the stored page view lacks (or holds stale) are read from their own documents.
  const intelligenceDirectPromise = resolvedViewPromise.then(({ directNeeded }) =>
    directNeeded.intelligence ? getStockIntelligenceDoc(stock.instrument_id, market).catch(() => null) : null,
  );
  const instrumentViewDirectPromise = resolvedViewPromise.then(({ directNeeded }) =>
    directNeeded.instrument_view ? getInstrumentViewDoc(stock.instrument_id, market).catch(() => null) : null,
  );
  const intelProDirectPromise = resolvedViewPromise.then(({ directNeeded }) =>
    directNeeded.intel_pro ? getStockIntelPro(stock.instrument_id, market).catch(() => null) : null,
  );
  // The pre-earnings read is fetched whatever the plan, so this batch need not wait for the viewer; it is
  // dropped below unless the viewer may see levels on this stock, so it never reaches anyone else's browser.
  const docBundlePromise = resolvedViewPromise.then(({ directNeeded }) =>
    getStockPageDocBundle(market, stock.instrument_id, stock.ticker, {
      facts: directNeeded.facts,
      technicals: directNeeded.technicals,
      onDemandJob: true,
      earningsIntel: directNeeded.earnings_intel,
      preEarnings: directNeeded.pre_earnings,
      // The steady call's state rides in the same batch: most briefs predate the steady call and carry no
      // `stability`, so this says how long their call has stood (lib/stock-read.ts `stabilityFromState`). US only.
      callStability: isUS,
    }).catch(() => null),
  );
  const intelProPromise = Promise.all([resolvedViewPromise, intelProDirectPromise]).then(
    ([resolved, direct]) => resolved.sections.intel_pro ?? direct,
  );
  const instrumentViewPromise = Promise.all([resolvedViewPromise, instrumentViewDirectPromise])
    .then(([resolved, direct]) => resolved.sections.instrument_view ?? direct)
    .catch(() => null);
  const technicalsPromise = Promise.all([resolvedViewPromise, docBundlePromise]).then(
    ([resolved, bundle]) =>
      resolved.sections.technicals ?? bundle?.technicals ?? getLatestTechnicals(stock.instrument_id).catch(() => null),
  ).catch(() => null);
  // Ranking is cached; quote and comparison fields are enriched from the
  // latest price/facts docs on each render. Never trust backfilled peer rows.
  // Starts as soon as the sector is known, alongside the reads above.
  const sectorPeersPromise = Promise.all([intelProPromise, instrumentMetaPromise]).then(async ([intelPro, instrumentMeta]) => {
    const ranked = await getSectorPeersForStock(stock.instrument_id, market, intelPro, instrumentMeta, 12).catch(
      () => [] as SectorPeerRow[],
    );
    if (ranked.length > 0) return ranked.slice(0, 8);
    const instrumentView = await instrumentViewPromise;
    return enrichRelatedTickersForComparison(stock.instrument_id, market, instrumentView?.related_tickers ?? []).catch(
      () => [] as SectorPeerRow[],
    );
  }).catch(() => [] as SectorPeerRow[]);
  // This company's own slice of the screener snapshot: the reason under the call and its as-of day (US only).
  const screenerContextPromise = isUS ? getScreenerSymbolContext(stock.ticker).catch(() => null) : Promise.resolve(null);
  // The results reports the call's sales figure is dated by (lib/call-evidence.ts). US only, like the filings.
  const resultsReportsPromise = isUS ? getResultsReports(stock.ticker).catch(() => [] as ResultsReport[]) : Promise.resolve([] as ResultsReport[]);
  // Stored closes for the stock and SPY, for the call's evidence and the chart's facts. US only: SPY is the wrong
  // yardstick for an Indian stock.
  const insightBasePromise = isUS ? Promise.all([getDailySeries([stock.ticker, "SPY"]).catch(() => null)]) : Promise.resolve(null);

  // Reads only the lower half uses (what changed, the sections, the priority notice) start now too, but the
  // top of the page (price, call, chart, the read) never waits for them: they stream in under it.
  const newsPromise = getNewsForTicker(market, stock.ticker, { days: 14, limit: 14 }).catch(() => [] as NewsArticle[]);
  const redditPromise = getRedditContextForTicker(market, stock.ticker).catch(() => null);
  const ownershipPromise = getStockOwnership(stock.ticker, market).catch((): StockOwnership => ({ funds: null, insiders: null }));

  const [
    instrumentMeta,
    snapshotHistory,
    longSeries,
    anomaly,
    calendarEarnings,
    earningsDates,
    premarketDoc,
    congressTrades,
    callHistory,
    followSlugs,
  ] = await Promise.all([
    instrumentMetaPromise,
    getStockSnapshotHistory(stock.instrument_id).catch(() => ({ closes: [], multiple: null })),
    isUS ? getStockLongSeries(stock.ticker).catch(() => null) : Promise.resolve(null),
    getDailyAnomalyForTicker(market, stock.ticker).catch(() => null),
    getNextEarningsCalendarEventCached(market, stock.ticker).catch(() => null),
    getStockEarningsDates(market, stock.ticker).catch(() => []),
    isUS ? getPremarketMovers(market).catch(() => null) : Promise.resolve(null),
    isUS ? getStockCongressTrades(stock.ticker).catch(() => []) : Promise.resolve(null),
    getStockCallHistory(stock.instrument_id).catch(() => []),
    // Only the slugs: whether a member of Congress has a Follow page to link.
    isUS ? getFollowSlugs().catch(() => [] as string[]) : Promise.resolve([] as string[]),
  ]);
  const [
    viewer,
    userDoc,
    { sections: viewSections },
    intelligenceDirect,
    intelPro,
    docBundle,
    screenerContext,
    insightBase,
    resultsReports,
  ] = await Promise.all([
    viewerPromise,
    userDocPromise,
    resolvedViewPromise,
    intelligenceDirectPromise,
    intelProPromise,
    docBundlePromise,
    screenerContextPromise,
    insightBasePromise,
    resultsReportsPromise,
  ]);
  const tracked = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
    : [];
  const subscribed = resolveIsSubscribed(userDoc);
  // One rule on every stock page, signed out included: the call, its reasons and what would change it are open.
  // What a plan changes is the full report: the price levels, the whole written brief, the scorecard, the
  // pre-earnings read and how the call has moved. Pro sees it everywhere, Free on the stocks its agent covers,
  // and everyone on the showcase stocks, which say they are an example. See lib/entitlements.ts.
  const hasFullAnalysisAccess = true;
  const hasLevels = canSeeLevels(viewer, stock.instrument_id);
  const currency = currencySymbolFor(stock.instrument_id.split("_", 1)[0]);
  const tier = resolveStockTier(stock.instrument_id, tracked);
  const isTracked = tracked.includes(stock.instrument_id);
  const shouldLoadAI = hasFullAnalysisAccess;
  const congressHref = (personId: string) =>
    followSlugs.includes(personId) ? `/follow/${personId}` : "/follow?tab=congress";

  const intelligence = viewSections.intelligence ?? intelligenceDirect;
  const stockFacts = viewSections.facts ?? docBundle?.facts ?? null;
  const onDemandJob = docBundle?.onDemandJob ?? null;
  const earningsIntel = viewSections.earnings_intel ?? docBundle?.earningsIntel ?? null;
  const preEarningsDoc = hasLevels
    ? viewSections.pre_earnings ?? docBundle?.preEarnings ?? null
    : null;
  const premarketQuote = getLivePremarketQuote(premarketDoc, stock.ticker, market);
  const activePreEarningsIntel =
    preEarningsDoc &&
    isWithinPreEarningsWindow(preEarningsDoc.event_date) &&
    shouldShowPreEarningsIntel(preEarningsDoc, earningsIntel)
      ? preEarningsDoc
      : null;
  const sectorLabel = intelPro?.sector_label || instrumentMeta?.sector || stock.sector || "";
  const industryLabel = intelPro?.industry_label || instrumentMeta?.industry || stock.industry || "";
  const displayStock = {
    ...stock,
    name: decodeTextEntities(stock.name),
    sector: decodeTextEntities(sectorLabel || stock.sector || ""),
    industry: decodeTextEntities(industryLabel || stock.industry || ""),
    description: stock.description ? decodeTextEntities(stock.description) : stock.description,
  };

  const displayAnomaly = anomaly
    ? mergeAnomalyWithLatestPrice(
        anomaly,
        {
          captured_at: stock.captured_at,
          quote: {
            current: stock.price,
            previous_close: stock.previous_close,
            day_change_abs: stock.day_change_abs,
            day_change_pct: stock.day_change_pct,
          },
        },
        market,
      )
    : null;

  const resolvedOnDemandStatus = onDemandJob?.status;
  const hasBrief = hasBriefText(intelligence) || hasDirectiveBrief(intelligence);
  const showAiPreparationState =
    hasFullAnalysisAccess && isTracked && !hasBrief && isActiveOnDemandBriefStatus(resolvedOnDemandStatus);
  const showAiStartCoverageState = hasFullAnalysisAccess && !isTracked && !hasBrief;
  const isPriceStaleBrief =
    hasFullAnalysisAccess && isSplitScaleStaleBrief(intelligence, stock.price, stock.captured_at);

  // ── the read ──────────────────────────────────────────────────────────────
  // The reason is rewritten every night from the latest numbers, so it can be newer than the call; its as-of goes with it.
  const screenerRow = screenerContext ? screenerContext.row ?? screenerContext.extra : null;
  const screenerAsOf = screenerRow?.call_reason ? screenerContext?.priceHistoryTo ?? null : null;
  const companyReason = screenerRow?.call_reason
    ? { text: screenerRow.call_reason, call: screenerRow.call ?? null, source: screenerRow.call_reason_source ?? null, asOf: screenerAsOf }
    : null;
  const fullRead =
    hasFullAnalysisAccess && !isPriceStaleBrief ? buildStockRead(intelligence, { companyReason, callChanges: callChanges(callHistory), steadyState: docBundle?.callStability ?? null }) : null;
  // Strip the levels here so they never reach the browser for an uncovered stock.
  // A brief written from a bot wall or an error page says nothing about the
  // company. Now that the read is open to everyone, hold those back.
  const isBrokenRead = fullRead ? readLooksBroken(fullRead) : false;
  const read = isBrokenRead
    ? null
    : fullRead && !hasLevels
      ? {
          // Uncovered stock: the call, its reasons, what would change it and the day it was set stay (open on every
          // stock). The levels, the rest of the written brief and how the call has moved (what it was before and why it
          // changed) come with covering it. The engine writes its add or trim price into some sentences ("The add level
          // is $182.40"), so every one goes through redactLevels.
          ...fullRead,
          // The headline can fall back to the thesis when a brief has none; locked, only a real headline shows.
          // The brief's first sentence (what is happening at the company, in plain facts) leads, as it does on a covered
          // stock; the engine's title ("growth faces a renewed memory-cycle test") is only the fallback.
          headline: lockedLead(fullRead.body) ?? redactLevels(typeof intelligence?.headline === "string" ? intelligence.headline : null),
          actionSummary: redactLevels(fullRead.actionSummary),
          body: null,
          reasons: fullRead.reasons.map((item) => redactLevels(item)).filter((item): item is string => Boolean(item)),
          changers: fullRead.changers.map((item) => redactLevels(item)).filter((item): item is string => Boolean(item)),
          whatWouldChange: redactLevels(fullRead.whatWouldChange),
          // Not even "We changed our call": the move is part of the full report. `since` keeps "Our call since Nov 9".
          changed: null,
          zones: { addBelow: null, addAbove: null, trimAbove: null },
        }
      : fullRead;
  // The call's own price on a stock this viewer does not see levels on: only which call it goes with and whether
  // today's price has reached it leave the server, so the call can say what it waits for without the number.
  const hiddenLevel = ((): HiddenLevel | null => {
    if (!fullRead || hasLevels || isBrokenRead || !(fin(stock.price) && stock.price > 0)) return null;
    // The same rule as the page's own level (components/stock-report/report.tsx): within half the price.
    const within = (value: number | null | undefined) => (value && Math.abs(value - stock.price) / stock.price <= 0.5 ? value : null);
    const addBelow = within(fullRead.zones.addBelow);
    const trimAbove = within(fullRead.zones.trimAbove);
    const own = ownCallLevel(fullRead.call, {
      addBelow,
      addAbove: within(fullRead.zones.addAbove),
      trimAbove: trimAbove && (!addBelow || trimAbove > addBelow) ? trimAbove : null,
    });
    if (!own) return null;
    const reached = own.label === "We'd buy more below" ? stock.price <= own.price : stock.price >= own.price;
    return { label: own.label, reached };
  })();
  const readState: ReportData["readState"] = !hasFullAnalysisAccess
    ? "locked"
    : isPriceStaleBrief
      ? "stale"
      : isBrokenRead
        ? "held"
        : read
        ? "ready"
        : "none";

  // ── chart ─────────────────────────────────────────────────────────────────
  const now = new Date();
  const nowIso = now.toISOString();
  // New York's day, the same boundary every "in 6 days" on the site counts from (lib/calendar-shared `daysUntilET`).
  const today = todayET(now);
  const liveDay = dayInET(stock.captured_at);
  const baseRanges = longSeries?.ranges.length ? longSeries.ranges : buildChartRanges(snapshotHistory.closes);
  const ranges = withLivePoint(baseRanges, liveDay, stock.price);
  const changes = callChanges(callHistory);
  const largeTrades = (congressTrades ?? []).filter((trade) => isLargeDisclosedTrade(trade.amount_low, trade.amount_high));
  const chartEvents: ChartEvent[] = [
    ...earningsDates
      .filter((event) => event.event_date <= today)
      .map((event) => ({
        date: event.event_date.slice(0, 10),
        kind: "earnings" as const,
        title: `${stock.ticker} reported earnings`,
        detail: event.time === "bmo" ? "Before the market opened" : event.time === "amc" ? "After the close" : undefined,
      })),
    ...largeTrades.map((trade) => ({
      date: trade.transaction_date.slice(0, 10),
      kind: "congress" as const,
      title: `${trade.person_name} ${trade.tx_type === "buy" ? "bought" : trade.tx_type === "sell" ? "sold" : "traded"} ${stock.ticker}`,
      detail: trade.disclosure_date ? `Disclosed ${fmtDate(trade.disclosure_date)}` : undefined,
      tone: trade.tx_type === "buy" ? ("up" as const) : trade.tx_type === "sell" ? ("down" as const) : ("flat" as const),
    })),
  ];
  const chart: ReportData["chart"] = ranges.length
    ? {
        ranges,
        events: chartEvents,
        source: longSeries ? `${longSeries.source} daily closes` : "stocksbrew daily price snapshots",
        note: longSeries?.adjusted
          ? "adjusted for splits and dividends; the last point is the live quote"
          : "the last point is the live quote",
        asOf: longSeries?.lastDate ?? snapshotHistory.closes[snapshotHistory.closes.length - 1]?.date ?? null,
      }
    : null;

  // ── what changed ──────────────────────────────────────────────────────────
  const moveHeadline = displayAnomaly ? anomalyHeadline(displayAnomaly) : "";
  const moveDetailRaw = displayAnomaly ? anomalyDetail(displayAnomaly) : null;
  const evidence = displayAnomaly?.move_explanation?.evidence?.[0];
  const pastEarnings = earningsDates.filter((event) => event.event_date < today);
  const nextEarnings =
    calendarEarnings ?? earningsDates.find((event) => event.event_date >= today) ?? null;
  const buildTimeline = (
    recentNews: NewsArticle[],
    instrumentView: InstrumentViewDoc | null,
    redditTickerContext: RedditTickerContext | null,
  ): ReportExtras["timeline"] => {
    const cue = redditTickerContext?.cue;
    return buildStockTimeline({
      ticker: stock.ticker,
      companyName: stock.name ? decodeTextEntities(stock.name) : null,
      now,
      move:
        displayAnomaly && moveHeadline && moveHeadline !== "--"
          ? {
              asOf: displayAnomaly.price_as_of ?? stock.captured_at ?? null,
              dayChangePct: displayAnomaly.day_change_pct,
              headline: moveHeadline,
              // The pipeline's "being prepared" filler is not a reason; leave it out.
              detail: moveDetailRaw && !/being prepared/i.test(moveDetailRaw) ? moveDetailRaw : null,
              evidenceUrl: evidence?.url ?? null,
              evidenceTitle: evidence?.title ?? null,
            }
          : null,
      news: recentNews,
      briefEvents: hasFullAnalysisAccess ? instrumentView?.timeline ?? null : null,
      earnings: earningsIntel,
      // The post-earnings write-up is free (lib/entitlements.ts); only the pre-earnings read is covered.
      earningsLocked: false,
      lastEarningsDate: pastEarnings[pastEarnings.length - 1]?.event_date ?? null,
      powerTrades: (congressTrades ?? []).filter(
        (trade) => now.getTime() - new Date(`${trade.transaction_date.slice(0, 10)}T00:00:00Z`).getTime() <= 180 * 86_400_000,
      ),
      reddit: cue
        ? {
            generatedAt: redditTickerContext?.generated_at ?? null,
            postCount: redditTickerContext?.post_count ?? cue.mention_count ?? null,
            sentiment: cue.sentiment ?? null,
          }
        : null,
      facts: stockFacts,
      callChange:
        read?.changed && read.writtenAt
          ? {
              at: read.writtenAt,
              reason: read.changed.reason,
              headline: read.actionLabel,
              from: read.changed.from ? CALL_PLAIN[read.changed.from as keyof typeof CALL_PLAIN] ?? null : null,
              to: read.call ? CALL_PLAIN[read.call as keyof typeof CALL_PLAIN] ?? null : null,
            }
          : null,
      // The first ledger entry is the day coverage began, not a change. How the call has moved on this stock is
      // part of the full read, so an uncovered viewer gets none of it.
      callHistory: hasLevels ? changes.filter((change) => change.from) : [],
      nextEarnings: nextEarnings
        ? {
            date: nextEarnings.event_date,
            time: nextEarnings.time,
            epsEstimate: nextEarnings.eps_estimate,
            source: "Earnings calendar",
          }
        : null,
      congressHref: (trade) => congressHref(trade.person_id),
    });
  };

  const dailySeries = insightBase?.[0]?.series ?? {};

  // The evidence under the call and what would change it, from stored numbers only (lib/call-evidence.ts). Both are
  // open on every stock; neither carries our price levels.
  const callEvidence =
    readState === "ready" && read && isUS
      ? buildCallEvidence(
          callEvidenceInput({
            ticker: stock.ticker,
            call: read.call,
            today,
            price: fin(stock.price) && stock.price > 0 ? stock.price : null,
            facts: stockFacts,
            reports: resultsReports,
            calendar: earningsDates as unknown as CalendarReport[],
            series: insightBase?.[0]?.series ?? null,
            priceSource: insightBase?.[0]?.source ?? null,
            row: screenerRow,
            next: nextEarnings,
            steady: read.steadySince ? { since: read.steadySince, lastStep: read.steadyStep ?? lastStepOn(changes, read.steadySince) } : null,
            // The stock page renders per request (revalidate 60), so "yesterday" is right when it is read.
            sayDays: true,
          }),
        )
      : null;

  const data: ReportData = {
    stock: displayStock,
    market,
    currency,
    nowIso,
    access: hasFullAnalysisAccess,
    gate: {
      plan: viewer.plan,
      trialEligible: viewer.trialEligible,
      levels: hasLevels,
      example: hasLevels && !isCovered(viewer, stock.instrument_id),
      hiddenLevel,
      slotsLeft: Number.isFinite(coveredSlotsLeft(viewer)) ? coveredSlotsLeft(viewer) : 0,
    },
    subscribed,
    isTracked,
    tier,
    readState,
    read,
    briefFallback:
      showAiPreparationState || showAiStartCoverageState ? (
        <LockedAiBrief
          ticker={stock.ticker}
          instrumentId={stock.instrument_id}
          currentPrice={stock.price}
          currency={currency}
          isSubscribed={subscribed}
          isTracked={isTracked}
          onDemandStatus={resolvedOnDemandStatus}
        />
      ) : null,
    chart,
    series: longSeries,
    multiple: snapshotHistory.multiple,
    facts: stockFacts,
    // The past year's range and the yield worked out from today's price, so neither can contradict the quote.
    fundamentals: consistentFundamentals(stock.fundamentals ?? null, {
      closes: dailySeries[stock.ticker] ?? null,
      price: fin(stock.price) ? stock.price : null,
      today,
      annualDividend: stockFacts?.dividends?.annual_dividend ?? stock.fundamentals?.annual_dividend ?? null,
      dayLow: fin(stock.day_low) ? stock.day_low : null,
      dayHigh: fin(stock.day_high) ? stock.day_high : null,
    }),
    // The scorecard (pillars, overall score, sector comparisons) is part of the full read, so an uncovered stock
    // sends null and none of it reaches the browser.
    intelPro: hasLevels ? intelPro : null,
    earnings: {
      next: nextEarnings,
      past: pastEarnings,
      intel: earningsIntel,
      intelLocked: false,
      pre: activePreEarningsIntel,
    },
    premarketQuote,
    callEvidence,
  };

  // ── the lower half: what changed and the sections, once their own reads are in ──
  const extrasPromise: Promise<ReportExtras> = Promise.all([
    newsPromise,
    redditPromise,
    ownershipPromise,
    technicalsPromise,
    sectorPeersPromise,
    instrumentViewPromise,
  ]).then(([recentNews, redditTickerContext, ownership, technicals, sectorPeers, instrumentViewLoaded]) => {
    const cue = redditTickerContext?.cue;
    const redditPosts = redditTickerContext?.post_count ?? cue?.mention_count ?? 0;
    return {
      timeline: buildTimeline(recentNews, shouldLoadAI ? instrumentViewLoaded : null, redditTickerContext),
      technicals,
      ownership,
      congress: congressTrades,
      followSlugs,
      news: recentNews,
      reddit:
        cue && redditPosts > 0
          ? {
              postCount: redditPosts,
              sentiment: cue.sentiment ?? null,
              summary: cue.summary?.trim() || null,
              generatedAt: redditTickerContext?.generated_at ?? null,
            }
          : null,
      peers: sectorPeers,
    };
  });
  // Good and watch signals across the tabs, worked out once from what the page loaded (lib/stock-signals.ts): the
  // tabs and the tally by the call share this one result. Pure, no new reads; a failure only leaves them out.
  const signalsPromise: Promise<StockSignals | null> = extrasPromise
    .then((extras) =>
      buildStockSignals(
        stockSignalsInput({
          data,
          extras,
          today,
          closes: isUS ? dailySeries : null,
          calendar: earningsDates as unknown as Parameters<typeof stockSignalsInput>[0]["calendar"],
        }),
      ),
    )
    .catch(() => null);
  const analytics = {
    ticker: displayStock.ticker,
    instrumentId: displayStock.instrument_id,
    isSubscribed: subscribed,
    isTracked,
    hasAiBrief: readState === "ready",
    call: data.read?.call ?? null,
    plan: data.gate.plan,
    levels: data.gate.levels,
  };

  return (
    <>
      <StockPageSchema
        ticker={displayStock.ticker}
        name={displayStock.name}
        description={stockSeoDescription({
          name: displayStock.name,
          ticker: displayStock.ticker,
          sector: displayStock.sector || "",
          industry: displayStock.industry || "",
        })}
        exchange={displayStock.exchange}
        sector={displayStock.sector}
        industry={displayStock.industry}
        updatedAt={displayStock.captured_at}
      />
      <StockViewTracker ticker={displayStock.ticker} instrumentId={displayStock.instrument_id} market={market} />
      <OnDemandResearchRefresh status={resolvedOnDemandStatus} />
      <Suspense fallback={null}>
        <PriorityNotice market={market} instrumentId={displayStock.instrument_id} ticker={displayStock.ticker} />
      </Suspense>
      <StockReport
        data={data}
        signals={
          data.readState === "ready" ? (
            <Suspense fallback={null}>
              <SignalStripStream signals={signalsPromise} />
            </Suspense>
          ) : null
        }
        related={
          market === "US" ? (
            <Suspense fallback={null}>
              <StockRelatedRow ticker={displayStock.ticker} />
            </Suspense>
          ) : null
        }
        below={
          <Suspense fallback={<StockBelowSkeleton />}>
            <ReportBelowStream data={data} extras={extrasPromise} signals={signalsPromise} analytics={analytics} />
          </Suspense>
        }
      />
    </>
  );
}
