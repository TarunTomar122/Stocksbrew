import { EssentialCards } from "@/components/essential-cards";
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
import { DailyAnomalies } from "@/components/daily-anomalies";
import {
  IN_AI_LAUNCH_INSTRUMENTS,
  US_AI_LAUNCH_INSTRUMENTS,
} from "@/lib/ai-launch-tier";
import { getSessionUser } from "@/lib/auth-server";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getDashboardView, getMarketSnapshot } from "@/lib/firestore";
import type { SnapshotRow } from "@/lib/types";
import { getNewsFeed, type NewsArticle } from "@/lib/news";
import { getMacroStrip } from "@/lib/macro";
import { getCurrentMarket } from "@/lib/market";
import { buildMoversFromSnapshot } from "@/lib/market-movers";
import { buildMarketTiles } from "@/lib/market-tiles";
import type { MarketTile } from "@/lib/market-tiles";
import { MOCKED_GAINERS, MOCKED_LOSERS } from "@/lib/mocks";
import { getThematicScreens } from "@/lib/screens";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { getWatchlistView } from "@/lib/watchlist-view";

function rowToStock(s: SnapshotRow) {
  return {
    ticker: s.symbol,
    name: s.name ?? s.symbol,
    price: s.price?.current ?? 0,
    changePct: s.price?.changePct ?? 0,
  };
}

export default async function HomePage() {
  const market = getCurrentMarket();
  let view = null;
  let snapshotRows: SnapshotRow[] = [];
  let screens = null;
  let macroTicks: Awaited<ReturnType<typeof getMacroStrip>> = [];
  let news: NewsArticle[] = [];
  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);
  const userWatchlistView = session
    ? await getWatchlistView(session.uid).catch(() => null)
    : null;
  let anomaliesData = null;
  try {
    [view, snapshotRows, screens, macroTicks, news, anomaliesData] = await Promise.all([
      getDashboardView(market),
      getMarketSnapshot(market),
      getThematicScreens(market),
      getMacroStrip(market),
      getNewsFeed(market, 30).catch(() => []),
      getDailyAnomalies(market).catch(() => null),
    ]);
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

  const gainers = snapshotMovers.gainers.length
    ? snapshotMovers.gainers
    : view?.gainers?.length
      ? view.gainers
      : MOCKED_GAINERS;
  const losers = snapshotMovers.losers.length
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

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-8 md:py-10 flex flex-col gap-10">
        <HeroSection
          score={sentiment.score}
          tone={sentiment.label}
          color={sentiment.score >= 55 ? "#8B5CF6" : sentiment.score >= 45 ? "#FACC15" : "#F97316"}
          indices={macroTicks.map((t) => ({
            ticker: t.ticker,
            name: t.name,
            price: t.price ?? 0,
            changePct: t.day_change_pct ?? 0,
          }))}
        />

        {anomaliesData && anomaliesData.anomalies.length > 0 && (
          <DailyAnomalies
            anomalies={anomaliesData.anomalies}
            summary={anomaliesData.summary}
            generatedAt={anomaliesData.enriched_at || anomaliesData.generated_at}
          />
        )}

        <MarketCues title="Market cues" tiles={marketCueTilesFromMacro.length ? marketCueTilesFromMacro : marketTiles} />

        <SectorSpotlights
          snapshotRows={snapshotRows}
          trackedIds={
            Array.isArray(userDoc?.tracked_stocks)
              ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
              : []
          }
          isSubscribed={isSubscribed}
        />

        <LandingProPreview
          isSignedIn={Boolean(session)}
          isSubscribed={isSubscribed}
        />

        <EssentialCards cards={view?.essential_cards} />

        <HomeContent
          stocks={allStocks}
          news={news}
          launchTickers={launchTickers}
          market={market}
        />

        <ThematicScreens doc={screens} market={market} isSubscribed={isSubscribed} />

        <LearnTeaser />

        <Testimonials />
      </div>
      <FeedbackWidget />
    </main>
  );
}
