import { notFound } from "next/navigation";

import { AiSynthesis } from "@/components/ai-synthesis";
import { AnalystConsensus } from "@/components/analyst-consensus";
import { CatalystsDriversRisks } from "@/components/catalysts-drivers-risks";
import { ComparativeContextRow } from "@/components/comparative-context";
import { DataQualityStrip } from "@/components/data-quality-strip";
import { PeersRow } from "@/components/peers-row";
import { SentimentLanes } from "@/components/sentiment-lanes";
import { StockFactsPanel } from "@/components/stock-facts-panel";
import { StockPageTabs } from "@/components/stock-page-tabs";
import { LockedAiBrief } from "@/components/locked-ai-brief";
import { SignalDeck } from "@/components/signal-deck";
import { StockScorecard } from "@/components/stock-scorecard";
import { StockSideRail } from "@/components/stock-side-rail";
import { StrategicDirective } from "@/components/strategic-directive";
import { TierCTA } from "@/components/tier-cta";
import { resolveStockTier } from "@/lib/ai-launch-tier";
import { getSessionUser } from "@/lib/auth-server";
import {
  getInstrumentViewDoc,
  getStockFacts,
  getStockIntelPro,
  getStockIntelligenceDoc,
  getStockSummary,
} from "@/lib/stock";
import { getCurrentMarket } from "@/lib/market";
import { getLatestTechnicals } from "@/lib/technicals";
import { currencySymbolFor } from "@/lib/utils";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const revalidate = 60;

type Props = {
  params: Promise<{ symbol: string }>;
};

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
  const hasAI = tier === "ai_launch" || tier === "ai_personal";

  // fundamentals come free from getStockSummary (same tm_latest_prices doc) —
  // no extra Firestore read needed.
  const fundamentals = stock.fundamentals ?? null;

  const [
    intelligence,
    instrumentView,
    technicals,
    intelPro,
    stockFacts,
  ] = await Promise.all([
    hasAI
      ? getStockIntelligenceDoc(stock.instrument_id, market).catch(() => null)
      : Promise.resolve(null),
    hasAI
      ? getInstrumentViewDoc(stock.instrument_id, market).catch(() => null)
      : Promise.resolve(null),
    getLatestTechnicals(stock.instrument_id).catch(() => null),
    getStockIntelPro(stock.instrument_id, market).catch(() => null),
    getStockFacts(stock.instrument_id).catch(() => null),
  ]);

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
      <StockFactsPanel
        facts={stockFacts}
        fundamentals={fundamentals}
        currentPrice={stock.price}
        currency={currency}
      />
      <TierCTA
        tier={tier}
        ticker={stock.ticker}
        instrumentId={stock.instrument_id}
        isSubscribed={subscribed}
        isTracked={tracked.includes(stock.instrument_id)}
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
      <StockScorecard intel={intelPro} />
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

  const aiContent = hasAI ? (
    <section className="flex flex-col gap-6">
      <StrategicDirective ticker={stock.ticker} directive={intelligence?.directive} />
      <AiSynthesis intelligence={intelligence} mocked={!intelligence?.visual_summary} />
      <CatalystsDriversRisks cards={intelligence?.visual_cards} />
      <SentimentLanes sentiment={instrumentView?.sentiment_breakdown} />
      <DataQualityStrip quality={intelligence?.data_quality} />
    </section>
  ) : (
    <LockedAiBrief ticker={stock.ticker} isSubscribed={subscribed} />
  );

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 py-6 md:px-10 lg:px-16 md:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-10 lg:gap-14">
          <StockSideRail
            stock={stock}
            intelPro={intelPro}
            currencySymbol={currency}
            timeline={hasAI ? instrumentView?.timeline : null}
            tier={tier}
            isSubscribed={subscribed}
            isTracked={tracked.includes(stock.instrument_id)}
          />
          <StockPageTabs
            overview={overviewContent}
            analyst={analystContent}
            fundamentals={fundamentalsContent}
            ai={aiContent}
          />
        </div>
      </div>
    </main>
  );
}

