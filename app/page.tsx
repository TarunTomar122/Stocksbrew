import { HeroSection } from "@/components/hero-section";
import { EssentialCards } from "@/components/essential-cards";
import { SectorHeatmapCard } from "@/components/sector-heatmap-card";
import { FreePicksRow } from "@/components/free-picks-row";
import { MarketAndSectors } from "@/components/market-and-sectors";
import { MarketSnapshot } from "@/components/market-snapshot";
import { MoversTable } from "@/components/movers-table";
import { ThematicScreens } from "@/components/thematic-screens";
import {
  IN_AI_LAUNCH_INSTRUMENTS,
  US_AI_LAUNCH_INSTRUMENTS,
} from "@/lib/ai-launch-tier";
import { getDashboardView, getMarketSnapshot } from "@/lib/firestore";
import { getMacroStrip } from "@/lib/macro";
import { getCurrentMarket } from "@/lib/market";
import {
  getInstitutionalFlows,
  getMarketBreadth,
} from "@/lib/market-signals";
import { buildMoversFromSnapshot } from "@/lib/market-movers";
import { buildMarketTiles } from "@/lib/market-tiles";
import { MOCKED_GAINERS, MOCKED_LOSERS } from "@/lib/mocks";
import { buildSectorSlugMap } from "@/lib/sector";
import { getThematicScreens } from "@/lib/screens";

export default async function HomePage() {
  const market = getCurrentMarket();
  let view = null;
  let snapshotRows: Awaited<ReturnType<typeof getMarketSnapshot>> = [];
  let flows = null;
  let breadth = null;
  let screens: Awaited<ReturnType<typeof getThematicScreens>> = null;
  let macroTicks: Awaited<ReturnType<typeof getMacroStrip>> = [];
  let sectorSlugMap: Awaited<ReturnType<typeof buildSectorSlugMap>> = {};
  try {
    [view, snapshotRows, flows, breadth, screens, macroTicks, sectorSlugMap] =
      await Promise.all([
        getDashboardView(market),
        getMarketSnapshot(market),
        market === "IN" ? getInstitutionalFlows(market) : Promise.resolve(null),
        getMarketBreadth(market),
        getThematicScreens(market),
        getMacroStrip(market),
        buildSectorSlugMap(market),
      ]);
  } catch (err) {
    console.error("[home] failed to load Firestore data:", err);
  }

  const tiles = buildMarketTiles(view);
  const sentiment = view?.market_sentiment ?? { label: "Mixed", score: 49 };

  const snapshotMovers = buildMoversFromSnapshot(snapshotRows, 5);

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

  const moversMocked =
    !snapshotMovers.gainers.length &&
    !snapshotMovers.losers.length &&
    !view?.gainers?.length &&
    !view?.losers?.length;

  const isIN = market === "IN";
  const sectorTilesHero = tiles
    .filter((t) => t.kind === "sector")
    .filter((t) => !isIN || !t.label.toLowerCase().includes("metal"));

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-12 py-12 flex flex-col gap-10">
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

        {/* Row 1: sector heatmap · index tape + breadth */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <SectorHeatmapCard
            sectorTiles={sectorTilesHero}
            sectorSlugMap={sectorSlugMap}
          />
          <MarketSnapshot ticks={macroTicks} breadth={breadth} />
        </section>

        {/* Top movers — full width so gainers/losers have room to breathe */}
        <MoversTable gainers={gainers} losers={losers} mocked={moversMocked} />

        {/* Pre-built screens — tabbed list */}
        <ThematicScreens doc={screens} market={market} />

        {/* Free AI-brief picks + watchlist CTA — the launch-tier universe as
            a two-pane card, with a "build your own" rail on the right that
            replaces the old blurred-sample WatchlistTeaser. */}
        <FreePicksRow
          instrumentIds={market === "IN" ? IN_AI_LAUNCH_INSTRUMENTS : US_AI_LAUNCH_INSTRUMENTS}
          snapshotRows={snapshotRows}
        />

        <MarketAndSectors
          tiles={tiles}
          market={market}
          sectorSlugMap={sectorSlugMap}
          sectorsInHero
        />

        <EssentialCards cards={view?.essential_cards} />
      </div>
    </main>
  );
}
