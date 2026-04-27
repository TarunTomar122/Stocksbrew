import { MarketSectorTreemap } from "@/components/market-sector-treemap";
import type { MarketTile } from "@/lib/market-tiles";
import type { SectorSlugMap } from "@/lib/sector";

type Props = {
  sectorTiles: MarketTile[];
  sectorSlugMap: SectorSlugMap;
};

export function SectorHeatmapCard({
  sectorTiles,
  sectorSlugMap,
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl bg-surface-container-lowest p-6 brutalist-border">
      <h3 className="text-[14px] font-semibold text-on-surface">Sector Heatmap</h3>
      <p className="text-[11px] text-on-surface-variant leading-snug mt-1 mb-3">
        Performance of key sectors today.
      </p>
      <div className="min-h-0 flex-1">
        <MarketSectorTreemap
          tiles={sectorTiles}
          sectorSlugMap={sectorSlugMap}
          embedded
        />
      </div>
    </div>
  );
}