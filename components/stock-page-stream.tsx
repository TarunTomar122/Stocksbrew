import { notFound } from "next/navigation";

import { canSeeLevels, coveredSlotsLeft, getViewer } from "@/lib/entitlements-server";
import { redactLevels } from "@/lib/entitlements";
import { LockedAiBrief } from "@/components/locked-ai-brief";
import { StockPageSchema } from "@/components/seo/stock-page-schema";
import { StockPageAnalytics } from "@/components/stock-page-analytics";
import { StockReport } from "@/components/stock-report/report";
import { dayInET, fmtDate } from "@/components/stock-report/format";
import { Suspense } from "react";
import type { ReportData } from "@/components/stock-report/types";
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
} from "@/lib/stock";
import { getCurrentMarket } from "@/lib/market";
import { getRedditContextForTicker, getRedditCues, resolveRedditContextForSymbol } from "@/lib/reddit-cues";
import { getNewsForTicker } from "@/lib/news";
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
import { isFeaturedStockTicker, stockSeoDescription } from "@/lib/seo/stock-pages";
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
import { getFollowSources } from "@/lib/follow";
import { getStockOwnership } from "@/lib/stock-ownership";
import { CALL_PLAIN, wholeSentences } from "@/lib/plain-copy";
import { buildStockRead, readLooksBroken } from "@/lib/stock-read";
import { buildStockTimeline } from "@/lib/stock-timeline";
import { buildStockRead as buildStockInsightRead } from "@/lib/stock-insights";
import { getGroupMove, getMarketDay, getStockGroup } from "@/lib/insight-data";
import { etDay, fin } from "@/lib/insight-format";
import { getDailySeries } from "@/lib/screener-series";
import { getScreenerRows, getScreenerSnapshot } from "@/lib/screener";

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

  const session = await sessionPromise;
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const tracked = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
    : [];
  const subscribed = resolveIsSubscribed(userDoc);
  const isFeaturedStock = isFeaturedStockTicker(stock.ticker);
  // Reading is free: facts, the call and the written brief are open on every
  // stock, for every reader. What a plan changes is the levels (price zones,
  // target, what would change the call, the pre-earnings read): Pro sees them
  // everywhere, Free on the stocks its agent covers, and everyone on the
  // showcase stocks. See lib/entitlements.ts.
  const hasFullAnalysisAccess = true;
  const viewer = await getViewer();
  const hasLevels = canSeeLevels(viewer, stock.instrument_id);
  const currency = currencySymbolFor(stock.instrument_id.split("_", 1)[0]);
  const tier = resolveStockTier(stock.instrument_id, tracked);
  const isTracked = tracked.includes(stock.instrument_id);
  const shouldLoadAI = hasFullAnalysisAccess;
  const isUS = market === "US";

  // The read's baselines (stored closes for the stock and SPY, SPY's live move, the stock's group), started
  // now so they load alongside everything else. US only: SPY is the wrong yardstick for an Indian stock.
  const insightBasePromise = isUS
    ? Promise.all([
        getDailySeries([stock.ticker, "SPY"]).catch(() => null),
        getMarketDay(),
        getStockGroup(stock.ticker).catch(() => null),
      ])
    : Promise.resolve(null);

  // One round of reads, all cached. Anything that fails degrades to "no data".
  const [
    view,
    instrumentMeta,
    snapshotHistory,
    longSeries,
    marketMovers,
    priceCoreOverrides,
    anomaly,
    redditTickerContext,
    calendarEarnings,
    earningsDates,
    recentNews,
    premarketDoc,
    congressTrades,
    callHistory,
    ownership,
    followSources,
  ] = await Promise.all([
    getStockPageView(market, stock.instrument_id).catch(() => null),
    getInstrument(stock.instrument_id).catch(() => null),
    getStockSnapshotHistory(stock.instrument_id).catch(() => ({ closes: [], multiple: null })),
    isUS ? getStockLongSeries(stock.ticker).catch(() => null) : Promise.resolve(null),
    getMarketMovers(market).catch(() => null),
    getPriceCoreOverrides(market).catch(() => [] as string[]),
    getDailyAnomalyForTicker(market, stock.ticker).catch(() => null),
    getRedditContextForTicker(market, stock.ticker).catch(() => null),
    getNextEarningsCalendarEventCached(market, stock.ticker).catch(() => null),
    getStockEarningsDates(market, stock.ticker).catch(() => []),
    getNewsForTicker(market, stock.ticker, { days: 14, limit: 14 }).catch(() => []),
    isUS ? getPremarketMovers(market).catch(() => null) : Promise.resolve(null),
    isUS ? getStockCongressTrades(stock.ticker).catch(() => []) : Promise.resolve(null),
    hasFullAnalysisAccess ? getStockCallHistory(stock.instrument_id).catch(() => []) : Promise.resolve([]),
    getStockOwnership(stock.ticker, market).catch(() => ({ funds: null, insiders: null })),
    isUS ? getFollowSources().catch(() => []) : Promise.resolve([]),
  ]);
  const followSlugs = followSources.map((source) => source.slug);
  const congressHref = (personId: string) =>
    followSlugs.includes(personId) ? `/follow/${personId}` : "/follow?tab=congress";

  const { sections: viewSections, directNeeded } = resolveStockPageViewSections(
    view,
    Date.now(),
    stock.instrument_id,
  );
  const [intelligenceDirect, instrumentViewDirect, intelProDirect, docBundle, screenerRow] = await Promise.all([
    directNeeded.intelligence
      ? getStockIntelligenceDoc(stock.instrument_id, market).catch(() => null)
      : Promise.resolve(null),
    shouldLoadAI && directNeeded.instrument_view
      ? getInstrumentViewDoc(stock.instrument_id, market).catch(() => null)
      : Promise.resolve(null),
    directNeeded.intel_pro
      ? getStockIntelPro(stock.instrument_id, market).catch(() => null)
      : Promise.resolve(null),
    getStockPageDocBundle(market, stock.instrument_id, stock.ticker, {
      facts: directNeeded.facts,
      technicals: directNeeded.technicals,
      onDemandJob: true,
      earningsIntel: directNeeded.earnings_intel,
      preEarnings: hasLevels && directNeeded.pre_earnings,
    }).catch(() => null),
    // The reason under the call, written from this company's own numbers (cached snapshot; US only).
    market === "US"
      ? getScreenerRows([stock.ticker]).then((rows) => rows.get(stock.ticker.toUpperCase()) ?? null).catch(() => null)
      : Promise.resolve(null),
  ]);

  const intelligence = viewSections.intelligence ?? intelligenceDirect;
  const instrumentView = shouldLoadAI
    ? viewSections.instrument_view ?? instrumentViewDirect
    : null;
  const intelPro = viewSections.intel_pro ?? intelProDirect;
  const technicals =
    viewSections.technicals ?? docBundle?.technicals ?? (await getLatestTechnicals(stock.instrument_id).catch(() => null));
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

  // Ranking is cached; quote and comparison fields are enriched from the
  // latest price/facts docs on each render. Never trust backfilled peer rows.
  const sectorPeersRaw = await getSectorPeersForStock(
    stock.instrument_id,
    market,
    intelPro,
    instrumentMeta,
    12,
  ).catch(() => [] as SectorPeerRow[]);
  const sectorPeers: SectorPeerRow[] =
    sectorPeersRaw.length > 0
      ? sectorPeersRaw.slice(0, 8)
      : await enrichRelatedTickersForComparison(
          stock.instrument_id,
          market,
          instrumentView?.related_tickers ?? [],
        ).catch(() => []);

  const priorityIds = marketMovers?.priority_instrument_ids ?? [];
  const inPriorityCohort = priorityIds.includes(stock.instrument_id);
  const inExtendedOverrides = (priceCoreOverrides || []).includes(stock.instrument_id);
  const showPriorityNotice = priorityIds.length > 0 && !(inPriorityCohort || inExtendedOverrides);
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
  const screenerAsOf = screenerRow?.call_reason ? ((await getScreenerSnapshot().catch(() => null))?.meta.price_history_to ?? null) : null;
  const companyReason = screenerRow?.call_reason
    ? { text: screenerRow.call_reason, call: screenerRow.call ?? null, source: screenerRow.call_reason_source ?? null, asOf: screenerAsOf }
    : null;
  const fullRead =
    hasFullAnalysisAccess && !isPriceStaleBrief ? buildStockRead(intelligence, { companyReason, callChanges: callChanges(callHistory) }) : null;
  // Strip the levels here so they never reach the browser for an uncovered stock.
  // A brief written from a bot wall or an error page says nothing about the
  // company. Now that the read is open to everyone, hold those back.
  const isBrokenRead = fullRead ? readLooksBroken(fullRead) : false;
  const read = isBrokenRead
    ? null
    : fullRead && !hasLevels
      ? {
          // Uncovered stock: the call, its one-line headline and the date stay. The reasoning (the longer body,
          // the reasons, what would change the call, why it last changed) and the levels come with covering it.
          ...fullRead,
          // The headline can fall back to the thesis when a brief has none; locked, only a real headline shows.
          // The brief's first sentence (what is happening at the company, in plain facts) leads, as it does on a covered
          // stock; the engine's title ("growth faces a renewed memory-cycle test") is only the fallback. The rest of the
          // body is the reasoning and stays with covering it.
          headline: lockedLead(fullRead.body) ?? redactLevels(typeof intelligence?.headline === "string" ? intelligence.headline : null),
          // The call engine writes its add or trim level into this sentence ("The add level is $182.40").
          actionSummary: redactLevels(fullRead.actionSummary),
          body: null,
          reasons: [],
          changers: [],
          // How the call has moved (the call before, and why it changed) is part of the full read (lib/entitlements.ts).
          changed: fullRead.changed ? { reason: null, from: null } : null,
          zones: { addBelow: null, addAbove: null, trimAbove: null },
        }
      : fullRead;
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
  const cue = redditTickerContext?.cue;
  const timeline = buildStockTimeline({
    ticker: stock.ticker,
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

  // ── the read at the top: plain rules over numbers already loaded ─────────
  const insightBase = await insightBasePromise;
  const quoteDay = etDay(stock.captured_at);
  const groupRef = insightBase?.[2] ?? null;
  const groupMove = groupRef ? await getGroupMove(groupRef.kind, groupRef.name, quoteDay, stock.ticker).catch(() => null) : null;
  const marketDay = insightBase?.[1] ?? null;
  const dailySeries = insightBase?.[0]?.series ?? {};
  const lastChange = hasLevels ? [...changes].reverse().find((change) => change.from) ?? null : null;
  const anomalyDay = displayAnomaly ? etDay(displayAnomaly.price_as_of ?? stock.captured_at) : null;
  const realReason =
    moveHeadline && moveHeadline !== "--" && anomalyDay === quoteDay &&
    !/^\S+ is (up|down) [\d.]+% today$/i.test(moveHeadline) && !/moved sharply today$/i.test(moveHeadline)
      ? moveHeadline
      : null;
  const insightRead = buildStockInsightRead({
    ticker: stock.ticker,
    // The call is the card right above the read; the read says what the day did.
    callInHeadline: false,
    today: etDay(nowIso) ?? today,
    quoteDay,
    price: fin(stock.price) ? stock.price : null,
    dayPct: fin(stock.day_change_pct) ? stock.day_change_pct : null,
    group: groupMove ? { label: groupMove.name, medianPct: groupMove.medianPct, count: groupMove.count } : null,
    marketPct: marketDay && marketDay.day === quoteDay ? marketDay.pct : null,
    series: dailySeries[stock.ticker] ?? null,
    benchmark: dailySeries.SPY ?? null,
    moveReason: realReason,
    nextEarnings: nextEarnings ? { date: nextEarnings.event_date, time: nextEarnings.time ?? null } : null,
    pastEarnings: pastEarnings.map((event) => ({ date: event.event_date, time: event.time ?? null })),
    call: read?.call ? { word: read.call, writtenAt: read.writtenAt } : null,
    // Levels and the call's history are part of covering a stock; nothing about them goes in for anyone else.
    levels: hasLevels && read ? { addBelow: read.zones.addBelow, trimAbove: read.zones.trimAbove } : null,
    lastChange: lastChange ? { date: lastChange.date, from: lastChange.from, to: lastChange.to, priceAtCall: lastChange.priceAtCall } : null,
    asOf: stock.captured_at ?? null,
  });

  const redditPosts = redditTickerContext?.post_count ?? cue?.mention_count ?? 0;
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
    timeline,
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
    technicals,
    earnings: {
      next: nextEarnings,
      past: pastEarnings,
      intel: earningsIntel,
      intelLocked: false,
      pre: activePreEarningsIntel,
    },
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
    premarketQuote,
    insightRead,
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
      <StockPageAnalytics
        ticker={displayStock.ticker}
        instrumentId={displayStock.instrument_id}
        isSubscribed={subscribed}
        isTracked={isTracked}
        hasAiBrief={readState === "ready"}
        hasCrowdSignal={Boolean(data.reddit)}
        call={data.read?.call ?? null}
        plan={data.gate.plan}
        levels={data.gate.levels}
      />
      <OnDemandResearchRefresh status={resolvedOnDemandStatus} />
      <PriorityStockModal
        open={showPriorityNotice}
        instrumentId={displayStock.instrument_id}
        ticker={displayStock.ticker}
      />
      <StockReport
        data={data}
        related={
          market === "US" ? (
            <Suspense fallback={null}>
              <StockRelatedRow ticker={displayStock.ticker} />
            </Suspense>
          ) : null
        }
      />
    </>
  );
}
