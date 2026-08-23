import { notFound } from "next/navigation";

import { AnomalyBanner } from "@/components/anomaly-banner";
import { AiSynthesis } from "@/components/ai-synthesis";
import { AiBriefStatus } from "@/components/ai-brief-status";
import { AnalystConsensus } from "@/components/analyst-consensus";
import { CatalystsDriversRisks } from "@/components/catalysts-drivers-risks";
import { ComparativeContextRow } from "@/components/comparative-context";
import { DataQualityStrip } from "@/components/data-quality-strip";
import { PeersRow } from "@/components/peers-row";
import { SentimentLanes } from "@/components/sentiment-lanes";
import { StockFactsPanel } from "@/components/stock-facts-panel";
import { PreEarningsSetupCard } from "@/components/pre-earnings-setup-card";
import { StockEarningsTab } from "@/components/stock-earnings-tab";
import { TrackButton } from "@/components/track-button";
import { LockedAiBrief } from "@/components/locked-ai-brief";
import { ProLockCard } from "@/components/pro-lock-overlay";
import { RangeBar, RsiStrength } from "@/components/range-bar";
import { SignalDeck } from "@/components/signal-deck";
import { StockScorecard } from "@/components/stock-scorecard";
import { StockLogo } from "@/components/stock-logo";
import { StockDetail } from "@/components/stock-detail";
import { StrategicDirective } from "@/components/strategic-directive";
import { TierCTA } from "@/components/tier-cta";
import { StockViewTracker } from "@/components/stock-view-tracker";
import { UnlistedStockShell } from "@/components/unlisted-stock-shell";
import { PriorityStockModal } from "@/components/priority-stock-modal";
import { OnDemandResearchRefresh } from "@/components/on-demand-research-refresh";
import { resolveStockTier } from "@/lib/ai-launch-tier";
import { getSessionUser } from "@/lib/auth-server";
import { getInstrument, getMarketMovers, getPriceCoreOverrides } from "@/lib/firestore";
import {
  getInstrumentViewDoc,
  getOnDemandNewsJob,
  getStockFacts,
  getStockIntelPro,
  getBetterSectorPeers,
  getSectorPeersForStock,
  enrichRelatedTickersForComparison,
  type SectorPeerRow,
  getStockIntelligenceDoc,
  getStockBusinessQuestions,
  getStockPriceHistory,
  getStockSummary,
  normalizeStockSymbolParam,
  type SentimentBreakdown,
  type StockIntelligenceDoc,
} from "@/lib/stock";
import { sectorSlugForIntel } from "@/lib/sector-slugs";
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
import { getLatestEarningsIntelByTicker } from "@/lib/earnings-intel";
import { getNextEarningsCalendarEvent } from "@/lib/earnings";
import { getPreEarningsIntelDoc } from "@/lib/pre-earnings-intel";
import { isWithinPreEarningsWindow, shouldShowPreEarningsIntel } from "@/lib/pre-earnings-intel-shared";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { normalizeDirectiveForUi } from "@/lib/directive-ui";
import { getLivePremarketQuote, getPremarketMovers } from "@/lib/premarket";
import { isFeaturedStockTicker } from "@/lib/seo/stock-pages";
import { getPowerTrades, type PowerTrade } from "@/lib/power-trades";

export const revalidate = 60;

type Props = {
  params: Promise<{ symbol: string }>;
};

function formatRelative(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

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

function hasVisualCards(intelligence: StockIntelligenceDoc | null): boolean {
  const cards = intelligence?.visual_cards;
  return Boolean(
    (cards?.catalyst_cards?.length ?? 0) > 0 ||
      (cards?.drivers?.length ?? 0) > 0 ||
      (cards?.risk_cards?.length ?? 0) > 0,
  );
}

function hasSentimentBreakdown(sentiment: SentimentBreakdown | null | undefined): boolean {
  return Boolean((sentiment?.lanes?.length ?? 0) > 0 || (sentiment?.sources_breakdown?.length ?? 0) > 0);
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

export async function StockPageStream({ params }: Props) {
  const { symbol } = await params;
  const sessionPromise = getSessionUser();
  const cookieMarket = getCurrentMarket();
  // Try the active market first, then fall back to the other one so that
  // sharing an IN link from a US session (or vice-versa) still resolves.
  const otherMarket: "US" | "IN" = cookieMarket === "IN" ? "US" : "IN";
  const [stockInCookieMarket, stockInOtherMarket] = await Promise.all([
    getStockSummary(symbol, cookieMarket),
    getStockSummary(symbol, otherMarket),
  ]);
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
  const isSignedIn = Boolean(session);
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const tracked = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
    : [];
  const subscribed = resolveIsSubscribed(userDoc);
  const isFeaturedStock = isFeaturedStockTicker(stock.ticker);
  const hasFullAnalysisAccess = subscribed || isFeaturedStock;
  const currency = currencySymbolFor(stock.instrument_id.split("_", 1)[0]);
  // Non-Pro users see the real page with facts free and the call masked (the
  // trial CTA lives in the locked verdict), not a bare full-page wall.

  const tier = resolveStockTier(stock.instrument_id, tracked);
  const isLaunchBrief = tier === "ai_launch";
  const isTracked = tracked.includes(stock.instrument_id);
  // Tiering: factual sections are free to all. The AI layer (The Call, drivers,
  // sentiment) loads for Pro only. Non-Pro users see chart + returns + free shelf
  // with a compact unlock card where the call would be.
  const shouldLoadAI = hasFullAnalysisAccess;

  // fundamentals come free from getStockSummary (same tm_latest_prices doc) -
  // no extra Firestore read needed.
  const fundamentals = stock.fundamentals ?? null;

  const [
    intelligence,
    businessQuestions,
    instrumentView,
    technicals,
    intelPro,
    instrumentMeta,
    priceHistory,
    stockFacts,
    marketMovers,
    priceCoreOverrides,
    anomaly,
    redditTickerContext,
    onDemandJob,
    earningsIntel,
    preEarningsDoc,
    calendarEarnings,
    recentNews,
    premarketDoc,
    powerTradesRecent,
  ] = await Promise.all([
    getStockIntelligenceDoc(stock.instrument_id, market).catch(() => null),
    shouldLoadAI
      ? getStockBusinessQuestions(stock.instrument_id, market).catch(() => null)
      : Promise.resolve(null),
    shouldLoadAI
      ? getInstrumentViewDoc(stock.instrument_id, market).catch(() => null)
      : Promise.resolve(null),
    getLatestTechnicals(stock.instrument_id).catch(() => null),
    getStockIntelPro(stock.instrument_id, market).catch(() => null),
    getInstrument(stock.instrument_id).catch(() => null),
    getStockPriceHistory(stock.instrument_id).catch(() => []),
    getStockFacts(stock.instrument_id).catch(() => null),
    getMarketMovers(market).catch(() => null),
    getPriceCoreOverrides(market).catch(() => [] as string[]),
    getDailyAnomalyForTicker(market, stock.ticker).catch(() => null),
    getRedditContextForTicker(market, stock.ticker).catch(() => null),
    getOnDemandNewsJob(stock.instrument_id).catch(() => null),
    hasFullAnalysisAccess
      ? getLatestEarningsIntelByTicker(market, stock.ticker).catch(() => null)
      : Promise.resolve(null),
    hasFullAnalysisAccess
      ? getPreEarningsIntelDoc(market, stock.instrument_id).catch(() => null)
      : Promise.resolve(null),
    getNextEarningsCalendarEvent(market, stock.ticker).catch(() => null),
    getNewsForTicker(market, stock.ticker, { days: 7, limit: 7 }).catch(() => []),
    market === "US"
      ? getPremarketMovers(market).catch(() => null)
      : Promise.resolve(null),
    market === "US"
      ? getPowerTrades(7).catch(() => null)
      : Promise.resolve(null),
  ]);
  const premarketQuote = getLivePremarketQuote(
    premarketDoc,
    stock.ticker,
    market,
  );
  const powerTradesForTicker: PowerTrade[] | null =
    powerTradesRecent && market === "US"
      ? powerTradesRecent.trades.filter((t) => t.ticker === stock.ticker)
      : null;
  const normalizedDirective = normalizeDirectiveForUi(intelligence?.directive_v2 ?? null);
  const activePreEarningsIntel =
    preEarningsDoc &&
    isWithinPreEarningsWindow(preEarningsDoc.event_date) &&
    shouldShowPreEarningsIntel(preEarningsDoc, earningsIntel)
      ? preEarningsDoc
      : null;
  const sectorSlug = sectorSlugForIntel(intelPro, instrumentMeta);
  const sectorLabel =
    intelPro?.sector_label ||
    instrumentMeta?.sector ||
    stock.sector ||
    "";
  const industryLabel =
    intelPro?.industry_label ||
    instrumentMeta?.industry ||
    stock.industry ||
    "";
  const displayStock = {
    ...stock,
    name: decodeTextEntities(stock.name),
    sector: decodeTextEntities(sectorLabel || stock.sector || ""),
    industry: decodeTextEntities(industryLabel || stock.industry || ""),
  };
  const betterSectorPeers =
    sectorSlug && typeof intelPro?.overall?.score === "number"
      ? await getBetterSectorPeers(stock.instrument_id, market, sectorSlug, intelPro.overall.score).catch(() => [])
      : [];
  const sectorPeersRaw = await getSectorPeersForStock(
    stock.instrument_id,
    market,
    intelPro,
    instrumentMeta,
  ).catch(() => [] as SectorPeerRow[]);
  const sectorPeers =
    sectorPeersRaw.length > 0
      ? sectorPeersRaw
      : await enrichRelatedTickersForComparison(
          stock.instrument_id,
          market,
          instrumentView?.related_tickers ?? [],
        ).catch(() => []);
  const priorityIds = marketMovers?.priority_instrument_ids ?? [];
  const inPriorityCohort = priorityIds.includes(stock.instrument_id);
  const inExtendedOverrides = (priceCoreOverrides || []).includes(stock.instrument_id);
  const isHighFrequencyEligible = inPriorityCohort || inExtendedOverrides;
  const showPriorityNotice = priorityIds.length > 0 && !isHighFrequencyEligible;
  const hasAI = isLaunchBrief || (hasFullAnalysisAccess && Boolean(intelligence));
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
  const publicResearchText = String(
    intelligence?.visual_summary?.what_changed ||
      intelligence?.today_brief ||
      intelligence?.headline ||
      "",
  ).trim();
  const showAiPreparationState =
    hasFullAnalysisAccess &&
    isTracked &&
    !hasBriefText(intelligence) &&
    isActiveOnDemandBriefStatus(resolvedOnDemandStatus);
  const showAiStartCoverageState =
    hasFullAnalysisAccess && !isTracked && !hasBriefText(intelligence);

  const rsi =
    technicals?.rsi_14?.value ?? instrumentView?.momentum_signal?.rsi_14;
  const rsiValue = technicals?.rsi_14?.value;
  const sma50 = technicals?.moving_averages?.sma_50;
  const sma200 = technicals?.moving_averages?.sma_200;
  const analystConsensus = instrumentView?.analyst_consensus ?? stockFacts?.analyst;

  const aiSource = intelligence?.source ?? "";
  const aiCoverageType = intelligence?.coverage_type ?? "";
  const isPriceStaleBrief = hasAI && isSplitScaleStaleBrief(intelligence, stock.price, stock.captured_at);
  const isNoMajorNewsTagged = aiCoverageType === "on_demand_no_news";
  const hasNewsBackedBrief = hasDirectiveBrief(intelligence);
  const isFallbackBrief =
    isNoMajorNewsTagged ||
    aiSource === "rules" ||
    aiCoverageType === "on_demand_fallback" ||
    intelligence?.data_quality?.freshness_status === "pending";
  const showBriefStatus =
    hasAI && !isPriceStaleBrief && (!hasBriefText(intelligence) || (isFallbackBrief && !isNoMajorNewsTagged));
  // Prefer full AI brief when directive/synthesis exists, even if coverage is tagged no-news.
  const showNoMajorNewsPanel = hasAI && !isPriceStaleBrief && isNoMajorNewsTagged && !hasNewsBackedBrief;
  const showFullNewsBrief =
    hasAI &&
    !isPriceStaleBrief &&
    !showBriefStatus &&
    (hasNewsBackedBrief || (hasBriefText(intelligence) && !isNoMajorNewsTagged));
  void showBriefStatus;
  void showNoMajorNewsPanel;
  void showFullNewsBrief;

  return (
    <main className="flex min-w-0 w-full flex-grow flex-col">
      <StockViewTracker ticker={displayStock.ticker} instrumentId={displayStock.instrument_id} market={market} />
      <OnDemandResearchRefresh status={resolvedOnDemandStatus} />
      <PriorityStockModal
        open={showPriorityNotice}
        instrumentId={displayStock.instrument_id}
        ticker={displayStock.ticker}
      />
      <StockDetail
        stock={displayStock}
        market={market}
        currency={currency}
        directive={hasFullAnalysisAccess ? normalizedDirective : null}
        visual={hasFullAnalysisAccess ? intelligence?.visual_summary : null}
        businessQuestions={businessQuestions}
        overview={displayAnomaly ? (anomalyDetail(displayAnomaly) ?? undefined) : undefined}
        overviewHeadline={displayAnomaly ? anomalyHeadline(displayAnomaly) : undefined}
        preEarnings={activePreEarningsIntel ?? undefined}
        preEarningsDoc={preEarningsDoc ?? undefined}
        calendarEarnings={calendarEarnings ?? undefined}
        facts={stockFacts}
        intelPro={intelPro}
        analyst={analystConsensus}
        fundamentals={fundamentals}
        rsi={rsiValue ?? rsi ?? null}
        rsiState={technicals?.rsi_14?.state}
        technicalLevels={technicals?.levels}
        priceHistory={priceHistory}
        earnings={earningsIntel}
        cards={hasFullAnalysisAccess ? intelligence?.visual_cards : null}
        sentiment={instrumentView?.sentiment_breakdown}
        peers={instrumentView?.related_tickers}
        betterPeers={betterSectorPeers}
        sectorPeers={sectorPeers}
        reddit={
          redditTickerContext?.cue
            ? {
                sentiment: redditTickerContext.cue.sentiment,
                summary: redditTickerContext.cue.summary,
                mention_count: redditTickerContext.post_count ?? redditTickerContext.cue.mention_count,
                catalysts: redditTickerContext.cue.catalysts,
              }
            : null
        }
        powerTrades={powerTradesForTicker}
        recentNews={recentNews}
        subscribed={hasFullAnalysisAccess}
        isTracked={isTracked}
        tier={tier}
        premarketQuote={premarketQuote}
        updatedLabel={stock.captured_at ? `updated ${formatRelative(stock.captured_at)}` : undefined}
        lockedCall={
          hasBriefText(intelligence) ? (
            <AiSynthesis intelligence={intelligence} />
          ) : showAiPreparationState || showAiStartCoverageState ? (
            <LockedAiBrief
              ticker={stock.ticker}
              instrumentId={stock.instrument_id}
              currentPrice={stock.price}
              currency={currency}
              isSubscribed={subscribed}
              isTracked={isTracked}
              onDemandStatus={resolvedOnDemandStatus}
              onDemandError={onDemandJob?.error}
            />
          ) : null
        }
      />
    </main>
  );
}
