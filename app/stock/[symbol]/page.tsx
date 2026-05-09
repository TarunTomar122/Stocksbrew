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
import { StockPageTabs } from "@/components/stock-page-tabs";
import { LockedAiBrief } from "@/components/locked-ai-brief";
import { ProLockOverlay } from "@/components/pro-lock-overlay";
import { RangeBar, RsiStrength } from "@/components/range-bar";
import { SignalDeck } from "@/components/signal-deck";
import { StockScorecard } from "@/components/stock-scorecard";
import { StockSideRail } from "@/components/stock-side-rail";
import { StrategicDirective } from "@/components/strategic-directive";
import { TierCTA } from "@/components/tier-cta";
import { StockViewTracker } from "@/components/stock-view-tracker";
import { PriorityStockModal } from "@/components/priority-stock-modal";
import { resolveStockTier } from "@/lib/ai-launch-tier";
import { getSessionUser } from "@/lib/auth-server";
import { getMarketMovers } from "@/lib/firestore";
import {
  getInstrumentViewDoc,
  getStockFacts,
  getStockIntelPro,
  getStockIntelligenceDoc,
  getStockSummary,
  type SentimentBreakdown,
  type StockIntelligenceDoc,
} from "@/lib/stock";
import { getCurrentMarket } from "@/lib/market";
import { getLatestTechnicals } from "@/lib/technicals";
import { currencySymbolFor } from "@/lib/utils";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
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
  const upper = symbol.toUpperCase();
  return {
    title: `${upper} — Stock Analysis & AI Brief`,
    description: `Latest ${upper} stock analysis: price, fundamentals, technicals, AI-powered brief, analyst consensus, and catalysts. Track on your Tikrr Radar.`,
    alternates: { canonical: `/stock/${upper}` },
    openGraph: {
      title: `${upper} — Stock Analysis & AI Brief · Tikrr`,
      description: `Latest ${upper} stock analysis: price, fundamentals, technicals, AI-powered brief, analyst consensus, and catalysts.`,
      url: `https://www.tikrr.online/stock/${upper}`,
    },
    twitter: {
      title: `${upper} — Stock Analysis & AI Brief · Tikrr`,
      description: `Latest ${upper} stock analysis: price, fundamentals, technicals, AI-powered brief, analyst consensus, and catalysts.`,
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

export default async function StockPage({ params }: Props) {
  const { symbol } = await params;
  const cookieMarket = getCurrentMarket();
  // Try the active market first, then fall back to the other one so that
  // sharing an IN link from a US session (or vice-versa) still resolves.
  const otherMarket: "US" | "IN" = cookieMarket === "IN" ? "US" : "IN";
  let stock = await getStockSummary(symbol, cookieMarket);
  let market: "US" | "IN" = cookieMarket;
  if (!stock) {
    stock = await getStockSummary(symbol, otherMarket);
    if (stock) market = otherMarket;
  }
  if (!stock) notFound();

  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const tracked = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
    : [];
  const subscribed = resolveIsSubscribed(userDoc);
  const tier = resolveStockTier(stock.instrument_id, tracked);
  const isLaunchBrief = tier === "ai_launch";
  const isTracked = tracked.includes(stock.instrument_id);
  const shouldLoadAI = subscribed;

  // fundamentals come free from getStockSummary (same tm_latest_prices doc) —
  // no extra Firestore read needed.
  const fundamentals = stock.fundamentals ?? null;

  const [
    intelligence,
    instrumentView,
    technicals,
    intelPro,
    stockFacts,
    marketMovers,
    anomaliesDoc,
  ] = await Promise.all([
    shouldLoadAI
      ? getStockIntelligenceDoc(stock.instrument_id, market).catch(() => null)
      : Promise.resolve(null),
    shouldLoadAI
      ? getInstrumentViewDoc(stock.instrument_id, market).catch(() => null)
      : Promise.resolve(null),
    getLatestTechnicals(stock.instrument_id).catch(() => null),
    getStockIntelPro(stock.instrument_id, market).catch(() => null),
    getStockFacts(stock.instrument_id).catch(() => null),
    getMarketMovers(market).catch(() => null),
    getDailyAnomalies(market).catch(() => null),
  ]);
  const priorityIds = marketMovers?.priority_instrument_ids ?? [];
  const isPriorityStock = priorityIds.includes(stock.instrument_id);
  const showPriorityNotice = priorityIds.length > 0 && !isPriorityStock;
  const anomaly = anomaliesDoc?.anomalies.find(
    (a) => a.ticker?.toUpperCase() === stock.ticker.toUpperCase(),
  ) ?? null;
  const hasAI = isLaunchBrief || (subscribed && Boolean(intelligence));

  const rsi =
    technicals?.rsi_14?.value ?? instrumentView?.momentum_signal?.rsi_14;
  // Trend card inputs — 50D/200D MA and beta come from Yahoo's `.info`
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
  const has52W = typeof week52High === "number" && typeof week52Low === "number";
  const hasRsi = typeof rsiValue === "number";

  const overviewContent = (
    <section className="flex flex-col gap-10">
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

  const analystContent = subscribed ? (
    <section className="flex flex-col gap-6">
      <AnalystConsensus consensus={analystConsensus} currentPrice={stock.price} />
    </section>
  ) : (
    <PremiumTabLock
      title="Analyst insights are Pro-only"
      description="Unlock consensus trends, target dispersion, and analyst stance changes."
    />
  );

  const fundamentalsContent = subscribed ? (
    <section className="flex flex-col gap-6">
      <StockScorecard intel={intelPro} isSubscribed={subscribed} />
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
  ) : (
    <PremiumTabLock
      title="Fundamentals are Pro-only"
      description="Unlock full scorecard depth, valuation context, and peer comparisons."
    />
  );

  const aiSource = intelligence?.source ?? "";
  const aiCoverageType = intelligence?.coverage_type ?? "";
  const isOnDemandFirstPass = aiCoverageType === "on_demand_no_news";
  const isNoMajorNewsFallback = isOnDemandFirstPass;
  const isFallbackBrief =
    isOnDemandFirstPass ||
    aiSource === "rules" ||
    aiCoverageType === "on_demand_fallback" ||
    intelligence?.data_quality?.freshness_status === "pending";
  const showBriefStatus = hasAI && (!hasBriefText(intelligence) || (isFallbackBrief && !isNoMajorNewsFallback));
  const showSynthesis = hasAI && hasBriefText(intelligence) && (!isFallbackBrief || isNoMajorNewsFallback);
  const showCards = hasAI && hasVisualCards(intelligence);
  const showSentiment = hasAI && hasSentimentBreakdown(instrumentView?.sentiment_breakdown);

  const aiContent = subscribed ? (
    hasAI ? (
      <section className="flex flex-col gap-6">
        {showBriefStatus && (
          <AiBriefStatus
            ticker={stock.ticker}
            generatedAt={intelligence?.generated_at}
          />
        )}
        {isNoMajorNewsFallback && (
          <AiBriefStatus
            ticker={stock.ticker}
            generatedAt={intelligence?.generated_at}
            mode="no_major_news"
            brief={intelligence?.today_brief ?? intelligence?.body}
          />
        )}
        {!showBriefStatus && (
          <>
            <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
              Updated {formatRelative(intelligence?.generated_at) || "—"}
            </p>
            <StrategicDirective ticker={stock.ticker} directive={intelligence?.directive} instrumentId={stock.instrument_id} />
          </>
        )}
        {showSynthesis && <AiSynthesis intelligence={intelligence} />}
        {showCards && <CatalystsDriversRisks cards={intelligence?.visual_cards} />}
        {showSentiment && <SentimentLanes sentiment={instrumentView?.sentiment_breakdown} />}
        {!showBriefStatus && intelligence?.data_quality && (
          <DataQualityStrip quality={intelligence.data_quality} />
        )}
      </section>
    ) : (
      <LockedAiBrief
        ticker={stock.ticker}
        instrumentId={stock.instrument_id}
        isSubscribed={subscribed}
        isTracked={isTracked}
      />
    )
  ) : (
    <PremiumTabLock
      title="AI brief is Pro-only"
      description="Unlock AI stance, catalysts, risks, and sentiment for stocks in your Radar."
    />
  );

  return (
    <main className="flex-grow">
      <StockViewTracker ticker={stock.ticker} instrumentId={stock.instrument_id} market={market} />
      <PriorityStockModal
        open={showPriorityNotice}
        instrumentId={stock.instrument_id}
        ticker={stock.ticker}
      />
      <div className="mx-auto w-full max-w-screen-2xl px-6 py-6 md:px-10 lg:px-16 md:py-10">
        {anomaly && <AnomalyBanner anomaly={anomaly} />}
        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-10 lg:gap-14">
          <StockSideRail
            stock={stock}
            intelPro={intelPro}
            currencySymbol={currency}
            timeline={hasAI ? instrumentView?.timeline : null}
            tier={tier}
            isSubscribed={subscribed}
            isTracked={isTracked}
            priceUpdatedAt={stock.captured_at}
          />
          <StockPageTabs
            overview={overviewContent}
            analyst={analystContent}
            fundamentals={fundamentalsContent}
            ai={aiContent}
            isSubscribed={subscribed}
          />
        </div>
      </div>
    </main>
  );
}

function PremiumTabLock({ title, description }: { title: string; description: string }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-[#e5e7eb] bg-white p-6 min-h-[260px]">
      <div
        aria-hidden
        className="pointer-events-none select-none h-full rounded-2xl bg-gradient-to-b from-[#f8fafc] via-[#f3f4f6] to-[#eef2ff]"
      />
      <ProLockOverlay title={title} description={description} />
    </section>
  );
}
