/**
 * The cross-market sections of the Markets overview, one component per
 * section, each built from the same `MarketsData` read. /markets shows all of
 * them; Market today (/explore) shows most of them under its own read, so the
 * two pages share these instead of each working out the same cards.
 * No hooks and no fetching: server or client trees can render them.
 */
import { SectionLabel } from "@/components/markets/page-frame";
import { AssetClassCard, MarketReadings, PredictionCard, SectorHeatGrid, VolCurveChart, YieldCurveChart } from "@/components/markets/widgets";
import { listTakeaway, moversTakeaway, sectorTakeaway } from "@/lib/markets-insights";
import {
  assetReading,
  biggestMoves,
  buildMarketsOverview,
  classHref,
  structureReading,
  yieldCurveShiftReading,
  type MarketAsset,
  type MarketsData,
  type MarketsOverview,
} from "@/lib/markets-shared";
import { vixWord } from "@/lib/tone";
import { AppLink } from "@/components/oa/app-link";

function ofClass(data: MarketsData, assetClass: MarketAsset["class"]): MarketAsset[] {
  return data.assets.filter((asset) => asset.class === assetClass);
}

/** Market data has loaded: some prices or some traded odds. */
export function hasMarketsData(data: MarketsData): boolean {
  return data.assets.length > 0 || data.predictions.length > 0;
}

/** What moved across markets, in sentences, beside the day's biggest moves in any asset. */
export function MarketsMovedSection({ data, overview = buildMarketsOverview(data) }: { data: MarketsData; overview?: MarketsOverview }) {
  const movers = biggestMoves(data.assets, 7);
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <MarketReadings readings={overview.readings} asOf={data.as_of} />
      <AssetClassCard title="Biggest moves" assets={movers} limit={7} note={moversTakeaway(movers)} emptyText="No moves to rank yet." />
    </div>
  );
}

/**
 * Indices (with the VIX reading), the sector grid and the theme funds that moved most.
 * `sectors={false}` drops the grid for a page that already draws the sectors its own way.
 */
export function StocksAndFundsSection({ data, sectors = true }: { data: MarketsData; sectors?: boolean }) {
  const etfs = ofClass(data, "etf");
  const vix = data.assets.find((asset) => asset.id === "vix");
  const themes = etfs.filter((asset) => asset.group === "thematic").sort((a, b) => Math.abs(b.change.d1 ?? 0) - Math.abs(a.change.d1 ?? 0));
  return (
    <>
      <SectionLabel aside="US indices and funds">Stocks and funds</SectionLabel>
      <div className={`grid gap-3 md:grid-cols-2 ${sectors ? "xl:grid-cols-3" : ""}`}>
        <AssetClassCard title="Indices" href={classHref("indices")} assets={ofClass(data, "index")} limit={5} note={vix ? assetReading(vix) : null} noteVerdict={vix ? vixWord(vix.price) : null} />
        {sectors ? <SectorHeatGrid assets={etfs} takeaway={sectorTakeaway(etfs)} /> : null}
        <AssetClassCard
          title="Themes"
          href={classHref("etfs")}
          assets={themes}
          limit={5}
          note={listTakeaway(themes, "theme funds")}
          className={sectors ? "md:col-span-2 xl:col-span-1" : ""}
        />
      </div>
    </>
  );
}

/** The Treasury curve against a month ago, the yields, and implied volatility by horizon. */
export function RatesAndVolatilitySection({ data }: { data: MarketsData }) {
  return (
    <>
      <SectionLabel aside="Treasury yields and what options price">Rates and volatility</SectionLabel>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <YieldCurveChart curve={data.treasury} />
        <AssetClassCard title="Treasury yields" href={classHref("rates")} assets={ofClass(data, "rate")} limit={7} note={yieldCurveShiftReading(data.treasury)} />
        <VolCurveChart curve={data.volCurve} className="md:col-span-2 xl:col-span-1" />
      </div>
    </>
  );
}

/** Futures, currencies and coins, each card led by its one-line reading. */
export function CommoditiesCurrenciesCryptoSection({ data }: { data: MarketsData }) {
  const commodities = ofClass(data, "commodity");
  const crypto = ofClass(data, "crypto");
  // Card notes sit above several rows, so each names the asset it is about.
  const commodityNote = commodities.map((asset) => structureReading(asset, asset.name)).find(Boolean) ?? null;
  const btc = data.assets.find((asset) => asset.id === "btc");
  const dxy = data.assets.find((asset) => asset.id === "dxy");
  const btcReading = btc ? assetReading(btc) : null;
  return (
    <>
      <SectionLabel aside="Futures, currencies, coins">Commodities, currencies and crypto</SectionLabel>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <AssetClassCard title="Commodities" href={classHref("commodities")} assets={commodities} limit={6} note={commodityNote} />
        <AssetClassCard title="Currencies" href={classHref("fx")} assets={ofClass(data, "fx")} limit={6} note={dxy ? assetReading(dxy, "The dollar index") : null} />
        <AssetClassCard
          title="Crypto"
          href={classHref("crypto")}
          assets={crypto}
          limit={6}
          note={listTakeaway(crypto, "coins") ?? (btcReading ? `Bitcoin: ${btcReading}` : null)}
          className="md:col-span-2 xl:col-span-1"
        />
      </div>
    </>
  );
}

/** Put/call ratios and the volatility indices. */
export function OptionsSection({ data }: { data: MarketsData }) {
  const options = ofClass(data, "option");
  const putCall = options.filter((asset) => asset.group === "put_call");
  const equityPutCall = putCall.find((asset) => asset.id === "pc-equity");
  const equityReading = equityPutCall ? assetReading(equityPutCall) : null;
  return (
    <>
      <SectionLabel aside="Put/call and volatility">Options</SectionLabel>
      <div className="grid gap-3 md:grid-cols-2">
        <AssetClassCard title="Put/call ratios" href={classHref("options")} assets={putCall} limit={4} note={equityReading ? `Single-stock options: ${equityReading}` : null} />
        <AssetClassCard title="Volatility indices" href={classHref("options")} assets={options.filter((asset) => asset.group === "volatility")} limit={6} />
      </div>
    </>
  );
}

/** Six traded-odds cards: at most two on the Fed, one per other topic. */
export function PredictionsSection({ data }: { data: MarketsData }) {
  return (
    <>
      <SectionLabel aside={data.predictions.length > 0 ? <AppLink href={classHref("predictions")} className="hover:text-oa-fg">All {data.predictions.length} →</AppLink> : null}>
        Prediction markets
      </SectionLabel>
      {data.predictions.length === 0 ? (
        <PredictionCard market={null} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pickPredictions(data.predictions).map((market) => (
            <PredictionCard key={market.id} market={market} />
          ))}
        </div>
      )}
    </>
  );
}

/** Six cards for the overview, in the stored order: up to two Fed markets and one from each other topic. */
export function pickPredictions<T extends { topic: string }>(markets: T[]): T[] {
  const perTopic = new Map<string, number>();
  const picked: T[] = [];
  for (const market of markets) {
    const used = perTopic.get(market.topic) ?? 0;
    if (used >= (market.topic === "fed" ? 2 : 1)) continue;
    perTopic.set(market.topic, used + 1);
    picked.push(market);
    if (picked.length === 6) break;
  }
  return picked;
}
