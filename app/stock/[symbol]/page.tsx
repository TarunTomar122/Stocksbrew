import { notFound } from "next/navigation";
import type { Metadata } from "next";

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
import { StockPageTabs } from "@/components/stock-page-tabs";
import { StockScrollRail } from "@/components/stock-scroll-rail";
import { LockedAiBrief } from "@/components/locked-ai-brief";
import { ProLockCard } from "@/components/pro-lock-overlay";
import { RangeBar, RsiStrength } from "@/components/range-bar";
import { SignalDeck } from "@/components/signal-deck";
import { StockScorecard } from "@/components/stock-scorecard";
import { StockSideRail } from "@/components/stock-side-rail";
import { StrategicDirective } from "@/components/strategic-directive";
import { TierCTA } from "@/components/tier-cta";
import { StockViewTracker } from "@/components/stock-view-tracker";
import { UnlistedStockShell } from "@/components/unlisted-stock-shell";
import { PriorityStockModal } from "@/components/priority-stock-modal";
import { resolveStockTier } from "@/lib/ai-launch-tier";
import { stockMetaDescription } from "@/lib/brand-copy";
import { getSessionUser } from "@/lib/auth-server";
import { getMarketMovers, getPriceCoreOverrides } from "@/lib/firestore";
import {
  getInstrumentViewDoc,
  getOnDemandNewsJob,
  getStockFacts,
  getStockIntelPro,
  getStockIntelligenceDoc,
  getStockPriceHistory,
  getStockSummary,
  normalizeStockSymbolParam,
  type SentimentBreakdown,
  type StockIntelligenceDoc,
} from "@/lib/stock";
import { getCurrentMarket } from "@/lib/market";
import { getRedditContextForTicker, getRedditCues, resolveRedditContextForSymbol } from "@/lib/reddit-cues";
import { getLatestTechnicals } from "@/lib/technicals";
import { currencySymbolFor } from "@/lib/utils";
import { getDailyAnomalyForTicker } from "@/lib/daily-anomalies";
import { getLatestEarningsIntelByTicker } from "@/lib/earnings-intel";
import { getPreEarningsIntelUpcoming } from "@/lib/pre-earnings-intel";
import { shouldShowPreEarningsIntel } from "@/lib/pre-earnings-intel-shared";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const normalized = normalizeStockSymbolParam(symbol);
  const label =
    normalized ?? (symbol.trim().toUpperCase().slice(0, 16) || symbol.toUpperCase());
  const upper = label.toUpperCase();
  return {
    title: `${upper} - Stock Analysis & AI Brief`,
    description: stockMetaDescription(upper),
    alternates: { canonical: `/stock/${upper}` },
    openGraph: {
      title: `${upper} - Stock Analysis & AI Brief · stocksbrew`,
      description: stockMetaDescription(upper),
      url: `https://www.stocksbrew.online/stock/${upper}`,
    },
    twitter: {
      title: `${upper} - Stock Analysis & AI Brief · stocksbrew`,
      description: stockMetaDescription(upper),
    },
  };
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
  return Boolean(String(intelligence?.directive?.text ?? "").trim());
}

export default async function StockPage({ params }: Props) {
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
      <main className="flex-grow">
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
  const tier = resolveStockTier(stock.instrument_id, tracked);
  const isLaunchBrief = tier === "ai_launch";
  const isTracked = tracked.includes(stock.instrument_id);
  const shouldLoadAI = subscribed;

  // fundamentals come free from getStockSummary (same tm_latest_prices doc) -
  // no extra Firestore read needed.
  const fundamentals = stock.fundamentals ?? null;

  const [
    intelligence,
    instrumentView,
    technicals,
    intelPro,
    priceHistory,
    stockFacts,
    marketMovers,
    priceCoreOverrides,
    anomaly,
    redditTickerContext,
    onDemandJob,
    earningsIntel,
    preEarningsIntel,
  ] = await Promise.all([
    shouldLoadAI
      ? getStockIntelligenceDoc(stock.instrument_id, market).catch(() => null)
      : Promise.resolve(null),
    shouldLoadAI
      ? getInstrumentViewDoc(stock.instrument_id, market).catch(() => null)
      : Promise.resolve(null),
    getLatestTechnicals(stock.instrument_id).catch(() => null),
    getStockIntelPro(stock.instrument_id, market).catch(() => null),
    getStockPriceHistory(stock.instrument_id).catch(() => []),
    getStockFacts(stock.instrument_id).catch(() => null),
    getMarketMovers(market).catch(() => null),
    getPriceCoreOverrides(market).catch(() => [] as string[]),
    getDailyAnomalyForTicker(market, stock.ticker).catch(() => null),
    getRedditContextForTicker(market, stock.ticker).catch(() => null),
    subscribed ? getOnDemandNewsJob(stock.instrument_id).catch(() => null) : Promise.resolve(null),
    subscribed
      ? getLatestEarningsIntelByTicker(market, stock.ticker).catch(() => null)
      : Promise.resolve(null),
    subscribed
      ? getPreEarningsIntelUpcoming(market, stock.instrument_id).catch(() => null)
      : Promise.resolve(null),
  ]);
  const activePreEarningsIntel = shouldShowPreEarningsIntel(preEarningsIntel, earningsIntel)
    ? preEarningsIntel
    : null;
  const priorityIds = marketMovers?.priority_instrument_ids ?? [];
  const inPriorityCohort = priorityIds.includes(stock.instrument_id);
  const inExtendedOverrides = (priceCoreOverrides || []).includes(stock.instrument_id);
  const isHighFrequencyEligible = inPriorityCohort || inExtendedOverrides;
  const showPriorityNotice = priorityIds.length > 0 && !isHighFrequencyEligible;
  const hasAI = isLaunchBrief || (subscribed && Boolean(intelligence));

  // If the on-demand job says "complete" but no intelligence doc was produced
  // (e.g. the stock was uncovered), treat it as "no_brief" so we don't show
  // a misleading "Brief ready — refresh" card to the user.
  const resolvedOnDemandStatus =
    !intelligence && onDemandJob?.status === "complete"
      ? "no_brief"
      : onDemandJob?.status;

  const rsi =
    technicals?.rsi_14?.value ?? instrumentView?.momentum_signal?.rsi_14;
  // Trend card inputs - 50D/200D MA and beta come from Yahoo's `.info`
  // (stashed on fundamentals by the price-sync job), so every listed stock
  // renders a real Trend card even though we only carry ~60 sessions of our
  // own price history.
  const sma50 =
    technicals?.moving_averages?.sma_50 ??
    fundamentals?.fifty_day_average ??
    undefined;
  const sma200 =
    technicals?.moving_averages?.sma_200 ??
    fundamentals?.two_hundred_day_average ??
    undefined;
  const beta = fundamentals?.beta;
  const analystConsensus = instrumentView?.analyst_consensus ?? stockFacts?.analyst;

  const currency = currencySymbolFor(stock.instrument_id.split("_", 1)[0]);

  const week52High = fundamentals?.week_52_high;
  const week52Low = fundamentals?.week_52_low;
  const rsiValue = technicals?.rsi_14?.value;
  const formatPriceForBar = (v: number): string =>
    `${currency}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const has52W =
    Number.isFinite(week52High) &&
    Number.isFinite(week52Low) &&
    week52High! > week52Low!;
  const hasRsi = Number.isFinite(rsiValue);

  const overviewContent = (
    <section className="flex flex-col gap-10">
      {anomaly && (
        <AnomalyBanner anomaly={anomaly} liveDayChangePct={stock.day_change_pct} isSubscribed={subscribed} />
      )}
      {subscribed && activePreEarningsIntel ? (
        <a href="#stock-section-earnings" className="block scroll-mt-32">
          <PreEarningsSetupCard doc={activePreEarningsIntel} ticker={stock.ticker} compact />
        </a>
      ) : null}
      <SignalDeck
        facts={stockFacts}
        intelPro={intelPro}
        technicals={technicals}
        fundamentals={fundamentals}
        currentPrice={stock.price}
        market={market}
      />

      {(has52W || hasRsi) && (
        <section className="flex flex-col gap-6 rounded-3xl border border-[#e5e7eb] bg-white p-6 md:p-7">
          <h3 className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
            Where it sits today
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
            {has52W && (
              <RangeBar
                label="52-week price range"
                low={week52Low!}
                high={week52High!}
                current={stock.price}
                format={formatPriceForBar}
              />
            )}
            {hasRsi && (
              <RsiStrength value={rsiValue!} state={technicals?.rsi_14?.state} />
            )}
          </div>
        </section>
      )}

      <StockFactsPanel
        facts={stockFacts}
        fundamentals={fundamentals}
        currentPrice={stock.price}
        currency={currency}
        ticker={stock.ticker}
        priceHistory={priceHistory}
        isSubscribed={subscribed}
        fundamentalsUpdatedAt={stockFacts?.captured_at}
      />
      <TierCTA
        tier={tier}
        ticker={stock.ticker}
        instrumentId={stock.instrument_id}
        isSubscribed={subscribed}
        isTracked={isTracked}
      />
    </section>
  );

  const analystContent = (
    <section className="flex flex-col gap-6">
      <AnalystConsensus consensus={analystConsensus} currentPrice={stock.price} />
    </section>
  );

  const fundamentalsContent = (
    <section className="flex flex-col gap-6">
      <StockScorecard intel={intelPro} ticker={stock.ticker} isSubscribed={subscribed} />
      {hasAI && (
        <>
          <ComparativeContextRow context={intelligence?.comparative_context} />
          <PeersRow
            peers={instrumentView?.related_tickers}
            related={intelligence?.related_instruments}
          />
        </>
      )}
    </section>
  );

  const aiSource = intelligence?.source ?? "";
  const aiCoverageType = intelligence?.coverage_type ?? "";
  const isNoMajorNewsTagged = aiCoverageType === "on_demand_no_news";
  const hasNewsBackedBrief = hasDirectiveBrief(intelligence);
  const isFallbackBrief =
    isNoMajorNewsTagged ||
    aiSource === "rules" ||
    aiCoverageType === "on_demand_fallback" ||
    intelligence?.data_quality?.freshness_status === "pending";
  const showBriefStatus = hasAI && (!hasBriefText(intelligence) || (isFallbackBrief && !isNoMajorNewsTagged));
  // Prefer full AI brief when directive/synthesis exists, even if coverage is tagged no-news.
  const showNoMajorNewsPanel = hasAI && isNoMajorNewsTagged && !hasNewsBackedBrief;
  const showFullNewsBrief =
    hasAI &&
    !showBriefStatus &&
    (hasNewsBackedBrief || (hasBriefText(intelligence) && !isNoMajorNewsTagged));
  const showSynthesis = showFullNewsBrief;
  const showCards = hasAI && hasVisualCards(intelligence) && !showNoMajorNewsPanel;
  const showSentiment = hasAI && hasSentimentBreakdown(instrumentView?.sentiment_breakdown) && !showNoMajorNewsPanel;

  const hasEarningsContent = Boolean(activePreEarningsIntel || earningsIntel);
  const earningsContent = !hasEarningsContent ? null : subscribed ? (
    <div className="flex flex-col gap-10">
      {activePreEarningsIntel ? (
        <PreEarningsSetupCard doc={activePreEarningsIntel} ticker={stock.ticker} />
      ) : null}
      {activePreEarningsIntel && earningsIntel ? (
        <div className="flex flex-col gap-2 pt-4 border-t-2 border-[#e5e7eb]">
          <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">
            After the print
          </p>
        </div>
      ) : null}
      {earningsIntel ? <StockEarningsTab doc={earningsIntel} ticker={stock.ticker} /> : null}
    </div>
  ) : (
    <section className="flex items-center justify-center overflow-hidden rounded-3xl border border-[#e5e7eb] bg-[#fafafa] p-6 sm:p-8">
      <ProLockCard
        surface="stock_tab"
        ticker={stock.ticker}
        title="Earnings intel is Pro-only"
        description="Unlock pre-earnings setups and post-earnings reads: expected EPS, likely stock move, and what to do."
      />
    </section>
  );

  const aiContent = subscribed ? (
    hasAI ? (
      <section className="flex flex-col gap-6">
        {showBriefStatus && (
          <AiBriefStatus
            ticker={stock.ticker}
            generatedAt={intelligence?.generated_at}
          />
        )}
        {showNoMajorNewsPanel && (
          <AiBriefStatus
            ticker={stock.ticker}
            generatedAt={intelligence?.generated_at}
            mode="no_major_news"
            brief={intelligence?.today_brief ?? intelligence?.body}
          />
        )}
        {showFullNewsBrief && (
          <>
            <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
              Updated {formatRelative(intelligence?.generated_at) || "-"}
            </p>
            <StrategicDirective ticker={stock.ticker} directive={intelligence?.directive} instrumentId={stock.instrument_id} />
          </>
        )}
        {showSynthesis && <AiSynthesis intelligence={intelligence} />}
        {showCards && <CatalystsDriversRisks cards={intelligence?.visual_cards} />}
        {showSentiment && <SentimentLanes sentiment={instrumentView?.sentiment_breakdown} />}
        {(showFullNewsBrief || showNoMajorNewsPanel) && intelligence?.data_quality && (
          <DataQualityStrip quality={intelligence.data_quality} />
        )}
      </section>
    ) : (
      <LockedAiBrief
        ticker={stock.ticker}
        instrumentId={stock.instrument_id}
        isSubscribed={subscribed}
        isTracked={isTracked}
        onDemandStatus={resolvedOnDemandStatus}
        onDemandError={onDemandJob?.error}
      />
    )
  ) : null;

  return (
    <main className="flex-grow">
      <StockViewTracker ticker={stock.ticker} instrumentId={stock.instrument_id} market={market} />
      <PriorityStockModal
        open={showPriorityNotice}
        instrumentId={stock.instrument_id}
        ticker={stock.ticker}
      />
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-4 sm:px-6 sm:py-6 md:px-10 lg:px-16 md:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start gap-4 sm:gap-6 lg:gap-14">
          <StockSideRail
            stock={stock}
            intelPro={intelPro}
            currencySymbol={currency}
            timeline={hasAI ? instrumentView?.timeline : null}
            tier={tier}
            isSubscribed={subscribed}
            isSignedIn={isSignedIn}
            isTracked={isTracked}
            priceUpdatedAt={stock.captured_at}
            market={market}
            redditTickerContext={redditTickerContext}
          />
          <StockScrollRail>
            <StockPageTabs
              overview={overviewContent}
              analyst={analystContent}
              fundamentals={fundamentalsContent}
              earnings={earningsContent}
              ai={aiContent}
              showAiTab={!subscribed || Boolean(aiContent)}
              isSubscribed={subscribed}
            />
          </StockScrollRail>
        </div>
      </div>
    </main>
  );
}
