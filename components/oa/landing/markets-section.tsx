import { MarketReadings, MarketTickerStrip, PredictionCard } from "@/components/markets/widgets";
import { Reveal } from "@/components/reveal";
import { getMarketsOverview } from "@/lib/markets";

/**
 * Beyond single stocks: the cross-asset strip, what moved in plain words and
 * one traded-odds market. Everything is live data from /markets; if the
 * loader fails the section is left out rather than shown empty.
 */
export async function MarketsSection() {
  const overview = await getMarketsOverview().catch(() => null);
  if (!overview || overview.tiles.length === 0) return null;
  return (
    <Reveal delay={80}>
      <div className="flex flex-col gap-3">
        <MarketTickerStrip tiles={overview.tiles} />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <MarketReadings readings={overview.readings} asOf={overview.as_of} />
          <PredictionCard market={overview.prediction} />
        </div>
      </div>
    </Reveal>
  );
}
