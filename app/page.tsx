import { Suspense, cache } from "react";
import { DailyAnomalies } from "@/components/daily-anomalies";
import { HomeHeroStream } from "@/components/home-hero-stream";
import { TerminalLanding } from "@/components/terminal-landing";
import { MarketCues } from "@/components/market-cues";
import { SectorSpotlights } from "@/components/sector-spotlights";
import { WatchlistShowcase } from "@/components/watchlist-showcase";
import { LearnTeaser } from "@/components/learn-teaser";
import { FeedbackWidget } from "@/components/feedback-widget";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { NewsletterModal } from "@/components/newsletter-modal";
import { Testimonials } from "@/components/testimonials";
import { WatchlistTeaser } from "@/components/watchlist-teaser";
import {
  IN_AI_LAUNCH_INSTRUMENTS,
  US_AI_LAUNCH_INSTRUMENTS,
} from "@/lib/ai-launch-tier";
import { getSessionUser } from "@/lib/auth-server";
import type { MarketMoversDoc, SnapshotRow } from "@/lib/types";
import { getHomeView } from "@/lib/home-view";
import { getCurrentMarket } from "@/lib/market";
import { getMarketMovers, getMarketSnapshot } from "@/lib/firestore";
import { buildMoversFromSnapshot } from "@/lib/market-movers";
import { buildMarketTiles } from "@/lib/market-tiles";
import type { MarketTile } from "@/lib/market-tiles";
import { MOCKED_GAINERS, MOCKED_LOSERS } from "@/lib/mocks";
import { getThematicScreens } from "@/lib/screens";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getPremarketMovers, isPremarketLive } from "@/lib/premarket";
import { getRedditCues } from "@/lib/reddit-cues";
import { resolveStockTier } from "@/lib/ai-launch-tier";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { LandingProPreview } from "@/components/landing-pro-preview";
import { HeroSection } from "@/components/hero-section";
import { LandingFaq } from "@/components/landing-faq";
import { LandingFinalCta } from "@/components/landing-final-cta";
import {
  HOME_LIVE_FEED_EYEBROW,
  HOME_LIVE_FEED_HEADLINE,
  HOME_LIVE_FEED_SUBHEAD,
} from "@/lib/brand-copy";

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
  const liveMoversPromise = getMarketMovers(market).catch(() => null);

  const session = await sessionPromise;
  const userDocPromise = session ? getUserDoc(session.uid).catch(() => null) : Promise.resolve(null);
  const [homeView, liveMovers, userDoc] = await Promise.all([
    homeViewPromise,
    liveMoversPromise,
    userDocPromise,
  ]);
  const isSubscribed = resolveIsSubscribed(userDoc);
  try {
    if (homeView) {
      view = homeView.dashboard ?? null;
    }
    snapshotRows = homeView?.market_snapshot_rows ?? [];
    if (snapshotRows.length === 0) {
      snapshotRows = await getMarketSnapshot(market).catch(() => []);
    }
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

async function TerminalLandingStream() {
  const market = getCurrentMarket();
  const [anomaliesData, session, redditData, snapshotRows] = await Promise.all([
    getDailyAnomalies(market).catch(() => null),
    getSessionUser().catch(() => null),
    getRedditCues(market).catch(() => null),
    getMarketSnapshot(market).catch(() => []),
  ]);
  const anomalies = anomaliesData?.anomalies ?? [];
  if (anomalies.length === 0) {
    return <HeroSection indices={[]} isSubscribed={false} showIndexSkeleton />;
  }
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const tracked = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
    : [];
  const featured = anomalies[0];
  const featuredTier = featured ? resolveStockTier(featured.instrument_id, tracked) : "free";
  const featuredTracked = featured ? tracked.includes(featured.instrument_id) : false;
  const reddit = (redditData?.tickers ?? []).map((t) => ({
    ticker: t.ticker,
    sentiment: t.sentiment,
    summary: t.summary,
    mention_count: t.mention_count,
  }));
  return (
    <TerminalLanding
      anomalies={anomalies}
      reddit={reddit}
      snapshotRows={snapshotRows}
      isSubscribed={resolveIsSubscribed(userDoc)}
      featuredTracked={featuredTracked}
      featuredTier={featuredTier}
      trackedIds={tracked}
    />
  );
}

export default function HomePage() {
  return (
    <main className="flex-grow">
      <Suspense fallback={<HeroSection indices={[]} isSubscribed={false} showIndexSkeleton />}>
        <TerminalLandingStream />
      </Suspense>
      <FeedbackWidget />
      <NewsletterModal />
    </main>
  );
}
