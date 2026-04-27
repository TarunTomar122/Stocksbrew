import { MarketMoodSummary } from "@/components/fear-greed-gauge";
import { MarketSectorTreemap } from "@/components/market-sector-treemap";
import type { MarketTile } from "@/lib/market-tiles";
import type {
  MarketMoodDoc,
  SentimentGaugeDoc,
} from "@/lib/market-signals";
import type { SectorSlugMap } from "@/lib/sector";

type Props = {
  gauge?: SentimentGaugeDoc | null;
  mood?: MarketMoodDoc | null;
  fallbackScore?: number;
  fallbackLabel?: string;
  sectorTiles: MarketTile[];
  sectorSlugMap: SectorSlugMap;
};

export function MoodSectorHeroCard({
  gauge,
  mood,
  fallbackScore,
  fallbackLabel,
  sectorTiles,
  sectorSlugMap,
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl bg-surface-container-lowest p-6 brutalist-border">
      <MarketMoodSummary
        gauge={gauge}
        mood={mood}
        fallbackScore={fallbackScore}
        fallbackLabel={fallbackLabel}
      />

      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-3.5 w-0.5 rounded-full bg-secondary" />
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
            Sectors today
          </h3>
        </div>
        <div className="min-h-0 flex-1">
          <MarketSectorTreemap
            tiles={sectorTiles}
            sectorSlugMap={sectorSlugMap}
            embedded
          />
        </div>
      </div>
    </div>
  );
}
