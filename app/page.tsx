import { Suspense, cache } from "react";
import { DailyAnomalies } from "@/components/daily-anomalies";
import { HeroSection } from "@/components/hero-section";
import { HomeContent } from "@/components/home-content";
import { LandingProPreview } from "@/components/landing-pro-preview";
import { MarketCues } from "@/components/market-cues";
import { SectorSpotlights } from "@/components/sector-spotlights";
import { WatchlistShowcase } from "@/components/watchlist-showcase";
import { ThematicScreens } from "@/components/thematic-screens";
import { LearnTeaser } from "@/components/learn-teaser";
import { FeedbackWidget } from "@/components/feedback-widget";
import { Testimonials } from "@/components/testimonials";
import { WatchlistTeaser } from "@/components/watchlist-teaser";
import {
  IN_AI_LAUNCH_INSTRUMENTS,
  US_AI_LAUNCH_INSTRUMENTS,
} from "@/lib/ai-launch-tier";
import { getSessionUser } from "@/lib/auth-server";
import type { MarketMoversDoc, SnapshotRow } from "@/lib/types";
import type { NewsArticle } from "@/lib/news";
import { getHomeView } from "@/lib/home-view";
import { getNewsFeed } from "@/lib/news";
import { getCurrentMarket } from "@/lib/market";
import { getMarketMovers, getMarketSnapshot } from "@/lib/firestore";
import { buildMoversFromSnapshot } from "@/lib/market-movers";
import { buildMarketTiles } from "@/lib/market-tiles";
import type { MarketTile } from "@/lib/market-tiles";
import { MOCKED_GAINERS, MOCKED_LOSERS } from "@/lib/mocks";
import { getThematicScreens } from "@/lib/screens";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

function rowToStock(s: SnapshotRow) {
  return {
    ticker: s.symbol,
    name: s.name ?? s.symbol,
    price: s.price?.current ?? 0,
    changePct: s.price?.changePct ?? 0,
  };
}

const MARKET_CUE_ORDER: Record<"US" | "IN", string[]> = {
  US: [
    "US_IDX_SPX",
    "US_IDX_NDX",
    "US_MAC_GOLD",
    "US_MAC_SILVER",
    "US_MAC_OIL",
    "US_MAC_VIX",
  ],
  IN: [
    "IN_IDX_NIFTY50",
    "IN_IDX_BANKNIFTY",
    "IN_MAC_GOLD",
    "IN_MAC_SILVER",
    "IN_MAC_OIL",
    "IN_IDX_VIX",
  ],
};

type MacroTick = {
  instrument_id: string;
  ticker: string;
  name: string;
  price: number | null;
  day_change_pct: number | null;
  from_52w_high_pct: number | null;
};

function buildMacroTicksFromSnapshot(
  rows: SnapshotRow[],
  market: "US" | "IN",
): MacroTick[] {
  const byId = new Map(rows.map((row) => [row.instrumentId, row]));
  return MARKET_CUE_ORDER[market].reduce<MacroTick[]>((acc, instrumentId) => {
    const row = byId.get(instrumentId);
    if (!row) return acc;
    acc.push({
        instrument_id: instrumentId,
        ticker: row.symbol || instrumentId,
        name: row.name || row.symbol || instrumentId,
        price: row.price?.current ?? null,
        day_change_pct: row.price?.changePct ?? null,
        from_52w_high_pct: null,
      });
    return acc;
  }, []);
}

const loadHomeCore = cache(async () => {
  const market = getCurrentMarket();
  let view = null;
  let snapshotRows: SnapshotRow[] = [];
  let macroTicks: Array<{
    instrument_id: string;
    ticker: string;
    name: string;
    price: number | null;
    day_change_pct: number | null;
    from_52w_high_pct: number | null;
  }> = [];
  let moversDoc: MarketMoversDoc | null = null;
  const sessionPromise = getSessionUser();
  const homeViewPromise = getHomeView(market).catch(() => null);
  const liveSnapshotPromise = getMarketSnapshot(market).catch(() => []);
  const liveMoversPromise = getMarketMovers(market).catch(() => null);

  const session = await sessionPromise;
  const userDocPromise = session ? getUserDoc(session.uid).catch(() => null) : Promise.resolve(null);
  const [homeView, liveSnapshotRows, liveMovers, userDoc] = await Promise.all([
    homeViewPromise,
    liveSnapshotPromise,
    liveMoversPromise,
    userDocPromise,
  ]);
  const isSubscribed = resolveIsSubscribed(userDoc);
  try {
    if (homeView) {
      view = homeView.dashboard ?? null;
    }
    snapshotRows = liveSnapshotRows.length > 0
      ? liveSnapshotRows
      : homeView?.market_snapshot_rows ?? [];
    moversDoc = liveMovers;
    macroTicks = buildMacroTicksFromSnapshot(snapshotRows, market);
    if (macroTicks.length === 0) {
      macroTicks = (view?.market_tiles ?? [])
        .filter((tile) => tile.type === "index" || tile.type === "macro")
        .map((tile) => ({
          instrument_id: tile.id,
          ticker: tile.label,
          name: tile.sublabel || tile.label,
          price: tile.value,
          day_change_pct: tile.change_pct,
          from_52w_high_pct: null,
        }));
    }
  } catch (err) {
    console.error("[home] failed to load:", err);
  }

  const sentiment = view?.market_sentiment ?? { label: "Mixed", score: 49 };
  const marketTiles = buildMarketTiles(view);
  const marketCueTilesFromMacro: MarketTile[] = macroTicks.map((t) => ({
    id: t.instrument_id,
    label: t.ticker,
    sublabel: t.name,
    price: t.price ?? 0,
    changePct: t.day_change_pct ?? 0,
    series: [100, 100 + (t.day_change_pct ?? 0)],
    kind: "index",
    currency:
      t.instrument_id === "US_MAC_GOLD" ||
      t.instrument_id === "US_MAC_SILVER" ||
      t.instrument_id === "US_MAC_OIL"
        ? "$"
        : "",
  }));
  const snapshotMovers = buildMoversFromSnapshot(snapshotRows, 5);
  const isIN = market === "IN";

  const gainers = moversDoc?.gainers?.length
    ? moversDoc.gainers
    : snapshotMovers.gainers.length
    ? snapshotMovers.gainers
    : view?.gainers?.length
      ? view.gainers
      : MOCKED_GAINERS;
  const losers = moversDoc?.losers?.length
    ? moversDoc.losers
    : snapshotMovers.losers.length
    ? snapshotMovers.losers
    : view?.losers?.length
      ? view.losers
      : MOCKED_LOSERS;

  const rawTickers = isIN ? IN_AI_LAUNCH_INSTRUMENTS : US_AI_LAUNCH_INSTRUMENTS;
  const prefix = isIN ? "IN_" : "US_";
  const launchTickers = rawTickers.map((t: string) =>
    t.startsWith(prefix) ? t.slice(prefix.length) : t
  );

  const allStocks = snapshotRows.length > 0
    ? snapshotRows.map(rowToStock)
    : [...gainers, ...losers].map((s) => ({
        ticker: s.ticker,
        name: s.name,
        price: s.price ?? 0,
        changePct: s.day_change_pct ?? 0,
      }));
  const heroStock =
    ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "GOOGL"].reduce<
      ReturnType<typeof rowToStock> | null
    >((match, ticker) => {
      if (match) return match;
      return allStocks.find((stock) => stock.ticker.toUpperCase() === ticker) ?? null;
    }, null) ?? allStocks[0];

  return {
    market,
    session,
    userDoc,
    isSubscribed,
    sentiment,
    macroTicks,
    marketCueTiles: marketCueTilesFromMacro.length ? marketCueTilesFromMacro : marketTiles,
    snapshotRows,
    allStocks,
    launchTickers,
    heroStock,
  };
});

const loadHomeSupplemental = cache(async () => {
  const market = getCurrentMarket();
  const homeView = await getHomeView(market).catch(() => null);
  let screens = homeView?.thematic_screens ?? null;
  let news: NewsArticle[] = homeView?.news ?? [];
  if (news.length === 0) {
    news = await getNewsFeed(market, 30).catch(() => []);
  }
  if (!screens) {
    screens = await getThematicScreens(market).catch(() => null);
  }
  return { news, screens };
});

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-[#f3f4f6] ${className}`}
    />
  );
}

function HomeMarketFallback() {
  return (
    <>
      <section className="flex flex-col gap-4 animate-pulse">
        <div className="flex items-center justify-between gap-4">
          <SkeletonBlock className="h-6 w-32" />
          <SkeletonBlock className="h-4 w-24" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-[18px] border border-[#e5e7eb] bg-white p-4">
              <SkeletonBlock className="h-3 w-14" />
              <SkeletonBlock className="mt-4 h-6 w-20" />
              <SkeletonBlock className="mt-3 h-4 w-16" />
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 animate-pulse lg:grid-cols-3">
        <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5 lg:col-span-2">
          <SkeletonBlock className="h-5 w-40" />
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-[#f3f4f6] p-4">
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="mt-3 h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
          <SkeletonBlock className="h-5 w-28" />
          <SkeletonBlock className="mt-5 h-40 w-full rounded-xl" />
        </div>
      </section>
    </>
  );
}

function HomeContentFallback() {
  return (
    <>
      <section className="grid grid-cols-1 gap-6 animate-pulse lg:grid-cols-3">
        <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5 lg:col-span-2">
          <SkeletonBlock className="h-5 w-36" />
          <div className="mt-4 flex gap-2">
            <SkeletonBlock className="h-8 w-24 rounded-full" />
            <SkeletonBlock className="h-8 w-24 rounded-full" />
          </div>
          <div className="mt-5 flex flex-col gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-t border-[#f3f4f6] pt-3">
                <SkeletonBlock className="h-8 w-8 rounded-full" />
                <div className="min-w-0 flex-1">
                  <SkeletonBlock className="h-4 w-44 max-w-full" />
                  <SkeletonBlock className="mt-2 h-3 w-16" />
                </div>
                <SkeletonBlock className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
          <SkeletonBlock className="h-5 w-28" />
          <div className="mt-5 flex flex-col gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="border-t border-[#f3f4f6] pt-4">
                <SkeletonBlock className="h-4 w-full" />
                <SkeletonBlock className="mt-2 h-3 w-32" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#e5e7eb] bg-white p-5 animate-pulse">
        <SkeletonBlock className="h-5 w-40" />
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-[#f3f4f6] p-4">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="mt-3 h-10 w-full" />
              <SkeletonBlock className="mt-4 h-3 w-20" />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function HomeHero() {
  return (
    <HeroSection
      score={51}
      tone="Balanced"
      color="#FACC15"
      indices={[]}
      featuredStock={{
        ticker: "NVDA",
        name: "NVIDIA",
        price: 0,
        changePct: 1.75,
      }}
    />
  );
}

async function HomeMarketStream() {
  const core = await loadHomeCore();
  return (
    <>
      <MarketCues title="Market cues" tiles={core.marketCueTiles} />

      <SectorSpotlights
        snapshotRows={core.snapshotRows}
        trackedIds={
          Array.isArray(core.userDoc?.tracked_stocks)
            ? core.userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
            : []
        }
        isSubscribed={core.isSubscribed}
      />

      <LandingProPreview
        isSignedIn={Boolean(core.session)}
        isSubscribed={core.isSubscribed}
      />
    </>
  );
}

async function HomeAnomaliesStream() {
  const market = getCurrentMarket();
  const anomaliesData = await getDailyAnomalies(market).catch(() => null);
  if (!anomaliesData || anomaliesData.anomalies.length === 0) return null;
  return (
    <DailyAnomalies
      anomalies={anomaliesData.anomalies}
      summary={anomaliesData.summary}
      generatedAt={anomaliesData.enriched_at || anomaliesData.generated_at}
    />
  );
}

async function HomeContentStream() {
  const [core, supplemental] = await Promise.all([loadHomeCore(), loadHomeSupplemental()]);
  return (
    <>
      <HomeContent
        stocks={core.allStocks}
        news={supplemental.news}
        launchTickers={core.launchTickers}
        market={core.market}
      />

      <ThematicScreens
        doc={supplemental.screens}
        market={core.market}
        isSubscribed={core.isSubscribed}
      />
    </>
  );
}

export default function HomePage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-8 md:py-10 flex flex-col gap-10">
        <HomeHero />

        <Suspense fallback={null}>
          <HomeAnomaliesStream />
        </Suspense>

        <Suspense fallback={<HomeMarketFallback />}>
          <HomeMarketStream />
        </Suspense>

        <Suspense fallback={<HomeContentFallback />}>
          <HomeContentStream />
        </Suspense>

        <LearnTeaser />

        <Testimonials />
      </div>
      <FeedbackWidget />
    </main>
  );
}
