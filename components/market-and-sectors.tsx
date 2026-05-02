import { MarketSectorTreemap } from "@/components/market-sector-treemap";
import type { MarketTile } from "@/lib/market-tiles";
import type { SectorSlugMap } from "@/lib/sector";

export function MarketAndSectors({
  tiles,
  market,
  sectorSlugMap = {},
  sectorsInHero = false,
}: {
  tiles: MarketTile[];
  market?: string;
  sectorSlugMap?: SectorSlugMap;
  /** When true, sector treemap is shown in the hero card — skip duplicate here */
  sectorsInHero?: boolean;
}) {
  const isIN = market === "IN";

  const sectorTiles = tiles
    .filter((t) => t.kind === "sector")
    .filter((t) => !isIN || !t.label.toLowerCase().includes("metal"));

  const showSectors = sectorTiles.length > 0 && !sectorsInHero;

  if (!showSectors) {
    return null;
  }

  return (
    <section className="bg-surface rounded-2xl shadow-card border border-outline-variant/30 overflow-hidden">
      <div className="mx-5 md:mx-6 mt-5 mb-1">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-4 bg-secondary rounded-full" />
          <h3 className="text-[11px] font-bold tracking-[0.12em] uppercase text-on-surface-variant">
            Sectors
          </h3>
        </div>
      </div>
      <MarketSectorTreemap tiles={sectorTiles} sectorSlugMap={sectorSlugMap} />
    </section>
  );
}
