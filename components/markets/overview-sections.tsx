/**
 * The cross-market sections of the Markets overview, one component per
 * section, each built from the same `MarketsData` read. /markets shows all of
 * them; Market today (/explore) shows most of them under its own read, so the
 * two pages share these instead of each working out the same cards.
 * No hooks and no fetching: server or client trees can render them.
 */
import type * as React from "react";

import { SectionLabel } from "@/components/markets/section-label";
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
      <AssetClassCard title="Biggest moves" icon="movers" assets={movers} limit={7} note={moversTakeaway(movers)} emptyText="No moves to rank yet." />
    </div>
  );
}

/**
 * Indices (with the VIX reading), the sector grid and the theme funds that moved most.
 * `sectors={false}` drops the grid for a page that already draws the sectors its own way.
 */
export function StocksAndFundsSection({ data, sectors = true, label = true }: { data: MarketsData; sectors?: boolean; label?: boolean }) {
  const etfs = ofClass(data, "etf");
  const vix = data.assets.find((asset) => asset.id === "vix");
  const themes = etfs.filter((asset) => asset.group === "thematic").sort((a, b) => Math.abs(b.change.d1 ?? 0) - Math.abs(a.change.d1 ?? 0));
  return (
    <>
      {label ? <SectionLabel aside="US indices and funds">Stocks and funds</SectionLabel> : null}
      <div className={`grid gap-3 md:grid-cols-2 ${sectors ? "xl:grid-cols-3" : ""}`}>
        <AssetClassCard title="Indices" icon="markets" href={classHref("indices")} assets={ofClass(data, "index")} limit={5} note={vix ? assetReading(vix) : null} noteVerdict={vix ? vixWord(vix.price) : null} />
        {sectors ? <SectorHeatGrid assets={etfs} takeaway={sectorTakeaway(etfs)} /> : null}
        <AssetClassCard
          title="Themes"
          icon="themes"
          href={classHref("etfs")}
          assets={themes}
          limit={5}
          note={listTakeaway(themes, "theme funds")}
        />
      </div>
    </>
  );
}

/** The Treasury curve against a month ago, the yields, and implied volatility by horizon. */
export function RatesAndVolatilitySection({ data, label = true }: { data: MarketsData; label?: boolean }) {
  return (
    <>
      {label ? <SectionLabel aside="Treasury yields and what options price">Rates and volatility</SectionLabel> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <YieldCurveChart curve={data.treasury} />
        <AssetClassCard title="Treasury yields" icon="percent" href={classHref("rates")} assets={ofClass(data, "rate")} limit={7} note={yieldCurveShiftReading(data.treasury)} />
        <VolCurveChart curve={data.volCurve} />
      </div>
    </>
  );
}

/** Futures, currencies and coins, each card led by its one-line reading. */
export function CommoditiesCurrenciesCryptoSection({ data, label = true }: { data: MarketsData; label?: boolean }) {
  const commodities = ofClass(data, "commodity");
  const crypto = ofClass(data, "crypto");
  const commodityNote = commoditiesNote(commodities);
  const btc = data.assets.find((asset) => asset.id === "btc");
  const dxy = data.assets.find((asset) => asset.id === "dxy");
  const btcReading = btc ? assetReading(btc) : null;
  return (
    <>
      {label ? <SectionLabel aside="Futures, currencies, coins">Commodities, currencies and crypto</SectionLabel> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <AssetClassCard title="Commodities" icon="drop" href={classHref("commodities")} assets={commodities} limit={6} note={commodityNote} />
        <AssetClassCard title="Currencies" icon="exchange" href={classHref("fx")} assets={ofClass(data, "fx")} limit={6} note={dxy ? assetReading(dxy, "The dollar index") : null} />
        <AssetClassCard
          title="Crypto"
          icon="block"
          href={classHref("crypto")}
          assets={crypto}
          limit={6}
          note={listTakeaway(crypto, "coins") ?? (btcReading ? `Bitcoin: ${btcReading}` : null)}
        />
      </div>
    </>
  );
}

/** Card notes sit above several rows, so each names the asset it is about. */
function commoditiesNote(commodities: MarketAsset[]): string | null {
  return commodities.map((asset) => structureReading(asset, asset.name)).find(Boolean) ?? null;
}

/** Put/call ratios and the volatility indices. */
export function OptionsSection({ data, label = true }: { data: MarketsData; label?: boolean }) {
  const options = ofClass(data, "option");
  const putCall = options.filter((asset) => asset.group === "put_call");
  const equityPutCall = putCall.find((asset) => asset.id === "pc-equity");
  const equityReading = equityPutCall ? assetReading(equityPutCall) : null;
  return (
    <>
      {label ? <SectionLabel aside="Put/call and volatility">Options</SectionLabel> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <AssetClassCard title="Put/call ratios" icon="scale" href={classHref("options")} assets={putCall} limit={4} note={equityReading ? `Single-stock options: ${equityReading}` : null} />
        <AssetClassCard title="Volatility indices" icon="pulse" href={classHref("options")} assets={options.filter((asset) => asset.group === "volatility")} limit={6} />
      </div>
    </>
  );
}

/** Six traded-odds cards: at most two on the Fed, one per other topic. */
export function PredictionsSection({ data, label = true }: { data: MarketsData; label?: boolean }) {
  return (
    <>
      {label ? (
        <SectionLabel aside={data.predictions.length > 0 ? <AppLink href={classHref("predictions")} className="hover:text-oa-fg">All {data.predictions.length} →</AppLink> : null}>
          Prediction markets
        </SectionLabel>
      ) : null}
      {data.predictions.length === 0 ? (
        <PredictionCard market={null} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pickPredictions(data.predictions).map((market) => (
            <PredictionCard key={market.id} market={market} />
          ))}
        </div>
      )}
      {/* Without the section label, the way to the full list sits under the cards. */}
      {!label && data.predictions.length > 0 ? (
        <AppLink href={classHref("predictions")} className="self-start px-2 text-[13.5px] font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg sm:px-0">
          See all {data.predictions.length} prediction markets
        </AppLink>
      ) : null}
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
