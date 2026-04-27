import { notFound } from "next/navigation";

import { AiSynthesis } from "@/components/ai-synthesis";
import { AnalystConsensus } from "@/components/analyst-consensus";
import { CatalystsDriversRisks } from "@/components/catalysts-drivers-risks";
import { ComparativeContextRow } from "@/components/comparative-context";
import { DataQualityStrip } from "@/components/data-quality-strip";
import { NewsTimeline } from "@/components/news-timeline";
import { PeersRow } from "@/components/peers-row";
import { SentimentLanes } from "@/components/sentiment-lanes";
import { SectorContextCard } from "@/components/sector-context-card";
import { SectorStocksTreemap, type SectorStock } from "@/components/sector-stocks-treemap";
import { StockHeader } from "@/components/stock-header";
import { StockScorecard } from "@/components/stock-scorecard";
import { StockTabs } from "@/components/stock-tabs";
import { StrategicDirective } from "@/components/strategic-directive";
import { TechnicalPulse } from "@/components/technical-pulse";
import { TierCTA } from "@/components/tier-cta";
import { TrendBuzz } from "@/components/trend-buzz";
import { resolveStockTier } from "@/lib/ai-launch-tier";
import { getSessionUser } from "@/lib/auth-server";
import {
  getInstrumentViewDoc,
  getStockIntelPro,
  getStockIntelligenceDoc,
  getStockSummary,
} from "@/lib/stock";
import { getMarketSnapshot } from "@/lib/firestore";
import { getCurrentMarket } from "@/lib/market";
import { getSectorContextDoc, sectorSlug } from "@/lib/sector";
import { getLatestTechnicals } from "@/lib/technicals";
import { currencySymbolFor } from "@/lib/utils";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const revalidate = 60;

type Props = {
  params: Promise<{ symbol: string }>;
};

export default async function StockPage({ params }: Props) {
  const { symbol } = await params;
  const market = getCurrentMarket();
  const stock = await getStockSummary(symbol, market);
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

  const [intelligence, instrumentView, technicals, intelPro, marketSnapshot] = await Promise.all([
    hasAI
      ? getStockIntelligenceDoc(stock.instrument_id, market).catch(() => null)
      : Promise.resolve(null),
    hasAI
      ? getInstrumentViewDoc(stock.instrument_id, market).catch(() => null)
      : Promise.resolve(null),
    getLatestTechnicals(stock.instrument_id).catch(() => null),
    getStockIntelPro(stock.instrument_id, market).catch(() => null),
    getMarketSnapshot(market).catch(() => []),
  ]);

  // Find this stock's sectorId from the market snapshot — this is the
  // universe's broad sector id (e.g. "energy", "banking") which is what
  // the sector context docs are keyed on. Fall back to deriving a slug
  // from the stock's universe-level sector, and only use intel_pro's
  // fine-grained `sector_label` (e.g. "Power Transmission & Distribution")
  // as a last resort — intel_pro labels come from screener.in and do NOT
  // match sector context keys.
  const thisRow = marketSnapshot.find((r) => r.instrumentId === stock.instrument_id);
  const thisSectorId = thisRow?.sectorId || "";
  const sectorLookupId =
    thisSectorId ||
    sectorSlug(stock.sector ?? "") ||
    sectorSlug(intelPro?.sector_label ?? "");
  const sectorCtx = sectorLookupId
    ? await getSectorContextDoc(sectorLookupId, market).catch(() => null)
    : null;
  // Display label: prefer the sector doc's own label, then intel_pro's
  // fine-grained one, then the universe sector.
  const stockSectorLabel =
    sectorCtx?.sector_label || intelPro?.sector_label || stock.sector || "";

  // Build the per-sector treemap data. Cap at 20 peers — beyond that the
  // cells get too small to read. Sort by |changePct| so the biggest movers
  // get the most tile area, and always keep the current stock in the set
  // even if it's a small mover so it's always visible and highlighted.
  const TREEMAP_LIMIT = 20;
  const sectorStocks: SectorStock[] = thisSectorId
    ? (() => {
        const all = marketSnapshot
          .filter((r) => r.sectorId === thisSectorId && typeof r.price?.changePct === "number")
          .map((r) => ({
            instrument_id: r.instrumentId,
            ticker: r.symbol,
            name: r.name || r.symbol,
            changePct: r.price!.changePct!,
          }))
          .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
        const top = all.slice(0, TREEMAP_LIMIT);
        // Ensure the current stock is always visible
        const alreadyIn = top.some((s) => s.instrument_id === stock.instrument_id);
        if (!alreadyIn) {
          const current = all.find((s) => s.instrument_id === stock.instrument_id);
          if (current) top.push(current);
        }
        return top;
      })()
    : [];

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

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-8 py-6 flex flex-col gap-6">
        <StockHeader stock={stock} />

        <TierCTA
          tier={tier}
          ticker={stock.ticker}
          instrumentId={stock.instrument_id}
          isSubscribed={subscribed}
          isTracked={tracked.includes(stock.instrument_id)}
        />

        <StockTabs hasAI={hasAI} />

        {/* ─────────────── TODAY ───────────────
            What's happening with this stock right now — price action,
            technical pulse, trend convergence, and the news feed. */}
        <section id="today" className="scroll-mt-28 flex flex-col gap-6">
          <SectionHeader
            eyebrow="Today"
            title={`How ${stock.ticker} is doing right now`}
          />

          <TechnicalPulse
            weekHigh={fundamentals?.week_52_high ?? instrumentView?.fundamentals?.week_52_high}
            weekLow={fundamentals?.week_52_low ?? instrumentView?.fundamentals?.week_52_low}
            currentPrice={stock.price}
            rsi={typeof rsi === "number" ? rsi : undefined}
            rsiMocked={typeof rsi !== "number"}
            sma50={typeof sma50 === "number" ? sma50 : undefined}
            sma200={typeof sma200 === "number" ? sma200 : undefined}
            beta={typeof beta === "number" ? beta : undefined}
            currency={currencySymbolFor(stock.instrument_id.split("_", 1)[0])}
          />

          {hasAI && (
            <>
              <TrendBuzz trend={instrumentView?.trend_convergence} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <NewsTimeline timeline={instrumentView?.timeline} />
                <AnalystConsensus
                  consensus={instrumentView?.analyst_consensus}
                  currentPrice={stock.price}
                />
              </div>
            </>
          )}
        </section>

        {/* ─────────────── THE READ ───────────────
            The four-pillar scorecard, peers, and analyst consensus — the
            "is this actually a good stock" layer. */}
        <section id="scorecard" className="scroll-mt-28 flex flex-col gap-6">
          <SectionHeader
            eyebrow="Fundamentals"
            title={`Tikrr's scorecard on ${stock.ticker}`}
          />

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

        {/* ─────────────── SECTOR ───────────────
            A treemap of every stock in this stock's sector (sized by today's
            move, colored by direction) alongside the AI sector brief. */}
        <section id="sector" className="scroll-mt-28 flex flex-col gap-6">
          <SectionHeader
            eyebrow="Sector"
            title={stockSectorLabel ? `${stock.ticker} in ${stockSectorLabel}` : `${stock.ticker}'s sector`}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            <SectorStocksTreemap
              stocks={sectorStocks}
              currentInstrumentId={stock.instrument_id}
              sectorLabel={stockSectorLabel}
            />
            {sectorCtx ? (
              <SectorContextCard sector={sectorCtx} sectorStocks={sectorStocks} />
            ) : (
              <section className="bg-surface-container-lowest brutalist-border p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-primary">
                    Sector brief
                  </span>
                  <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-on-surface-variant border border-outline-variant/40 px-2 py-0.5 rounded">
                    Pending
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-on-surface">
                    {stockSectorLabel
                      ? `No brief yet for ${stockSectorLabel}`
                      : "No sector brief yet"}
                  </h3>
                  <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">
                    We generate a news-backed sector read once there&apos;s enough coverage —
                    at least 3 articles across 2+ tickers from 2+ sources. Until then, the
                    treemap on the left shows how every stock in the sector is trading today.
                  </p>
                </div>

                <div className="mt-auto pt-4 border-t border-outline-variant/20">
                  <p className="text-[11px] text-on-surface-variant">
                    Check back after the next pipeline run.
                  </p>
                </div>
              </section>
            )}
          </div>
        </section>

        {/* ─────────────── AI BRIEFING ───────────────
            LLM-synthesized directive, news-backed narrative, sentiment
            breakdown, catalysts/drivers/risks. */}
        {hasAI ? (
          <section id="briefing" className="scroll-mt-28 flex flex-col gap-6">
            <SectionHeader
              eyebrow="AI Brief"
              title={`What the AI is reading on ${stock.ticker}`}
            />

            <StrategicDirective
              ticker={stock.ticker}
              directive={intelligence?.directive}
            />

            <AiSynthesis
              intelligence={intelligence}
              mocked={!intelligence?.visual_summary}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SentimentLanes sentiment={instrumentView?.sentiment_breakdown} />
              <CatalystsDriversRisks cards={intelligence?.visual_cards} />
            </div>

            <DataQualityStrip quality={intelligence?.data_quality} />
          </section>
        ) : (
          <FreeTierWhyBlock ticker={stock.ticker} />
        )}
      </div>
    </main>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-primary">
        {eyebrow}
      </span>
      <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
    </div>
  );
}

function FreeTierWhyBlock({ ticker }: { ticker: string }) {
  return (
    <section className="bg-surface-container-lowest brutalist-border p-6">
      <h3 className="text-sm font-semibold text-on-surface">
        Why {ticker} shows less here
      </h3>
      <div className="mt-3 grid grid-cols-1 gap-4 text-xs text-on-surface-variant md:grid-cols-3">
        <div>
          <p className="font-semibold text-on-surface">No news-backed brief</p>
          <p className="mt-1">
            News fetch, enrichment, and LLM synthesis run only for launch-tier stocks and
            subscriber-tracked stocks. Each adds real cost per refresh.
          </p>
        </div>
        <div>
          <p className="font-semibold text-on-surface">No cross-stock signal</p>
          <p className="mt-1">
            Watchlist synthesis (cross-stock themes, blind spots, risk rollups) requires a
            per-stock brief to reason over.
          </p>
        </div>
        <div>
          <p className="font-semibold text-on-surface">Still full data below</p>
          <p className="mt-1">
            Price, technicals, fundamentals, and the four-pillar scorecard above are always
            free — no sign-in needed.
          </p>
        </div>
      </div>
    </section>
  );
}
