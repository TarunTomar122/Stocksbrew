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
import type { SnapshotRow } from "@/lib/types";
import type { NewsArticle } from "@/lib/news";
import { getHomeView } from "@/lib/home-view";
import { getNewsFeed } from "@/lib/news";
import { getCurrentMarket } from "@/lib/market";
import { getMarketSnapshot } from "@/lib/firestore";
import { buildMoversFromSnapshot } from "@/lib/market-movers";
import { buildMarketTiles } from "@/lib/market-tiles";
import type { MarketTile } from "@/lib/market-tiles";
import { MOCKED_GAINERS, MOCKED_LOSERS } from "@/lib/mocks";
import { getThematicScreens } from "@/lib/screens";
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

export default async function HomePage() {
  const market = getCurrentMarket();
  let view = null;
  let snapshotRows: SnapshotRow[] = [];
  let screens = null;
  let macroTicks: Array<{
    instrument_id: string;
    ticker: string;
    name: string;
    price: number | null;
    day_change_pct: number | null;
    from_52w_high_pct: number | null;
  }> = [];
  let news: NewsArticle[] = [];
  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);
  try {
    const [homeView, liveSnapshotRows, thematicScreens, feed] = await Promise.all([
      getHomeView(market).catch(() => null),
      getMarketSnapshot(market).catch(() => []),
      getThematicScreens(market).catch(() => null),
      getNewsFeed(market, 30).catch(() => []),
    ]);
    if (homeView) {
      view = homeView.dashboard ?? null;
    }
    snapshotRows = liveSnapshotRows.length > 0
      ? liveSnapshotRows
      : homeView?.market_snapshot_rows ?? [];
    screens = thematicScreens ?? homeView?.thematic_screens ?? null;
    news = feed.length > 0 ? feed : homeView?.news ?? [];
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
          isSubscribed={isSubscribed}
        />

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
