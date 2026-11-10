import type { Metadata } from "next";

import { MarketingSchema } from "@/components/seo/marketing-schema";

import { MarketsPageFrame, SectionLabel } from "@/components/markets/page-frame";
import {
  AssetClassCard,
  ClassTabs,
  MarketReadings,
  MarketTickerStrip,
  PredictionCard,
  SectorHeatGrid,
  VolCurveChart,
  YieldCurveChart,
} from "@/components/markets/widgets";
import { PageHead, PageNote } from "@/components/oa/kit";
import { TheRead } from "@/components/oa/insight";
import { getMarketsData } from "@/lib/markets";
import { buildMarketsRead, listTakeaway, moversTakeaway, sectorTakeaway } from "@/lib/markets-insights";
import {
  assetReading,
  biggestMoves,
  buildMarketsOverview,
  classHref,
  formatAsOf,
  MARKET_CLASSES,
  structureReading,
  yieldCurveShiftReading,
  type MarketAsset,
} from "@/lib/markets-shared";
import { vixWord } from "@/lib/tone";
import { ogImage } from "@/lib/og/url";

export const revalidate = 300;

export function generateMetadata(): Metadata {
  const shareImage = ogImage(["page", "markets"], "Markets today: indices, rates, commodities, FX and crypto", { daily: true });
  return {
    title: "Markets Today: Indices, ETFs, Treasury Yields, Commodities, FX and Crypto",
    description:
      "One page for every market that moves a portfolio: US indices and ETFs, Treasury yields, commodities, currencies, crypto, options pricing and prediction markets.",
    alternates: { canonical: "/markets" },
    openGraph: { title: "Markets Today: Indices, ETFs, Treasury Yields, Commodities, FX and Crypto · stocksbrew", url: "https://www.stocksbrew.online/markets", images: [shareImage] },
    twitter: { card: "summary_large_image", images: [shareImage] },
  };
}

const LEDE =
  "Stocks, funds, rates, commodities, currencies, crypto, options pricing and traded odds on one page. Open any row for its chart and numbers.";

export default async function MarketsPage() {
  const data = await getMarketsData();
  const overview = buildMarketsOverview(data);
  const of = (assetClass: MarketAsset["class"]) => data.assets.filter((asset) => asset.class === assetClass);
  const etfs = of("etf");
  const counts: Record<string, number> = { predictions: data.predictions.length };
  for (const item of MARKET_CLASSES) {
    if (item.assetClass) counts[item.slug] = of(item.assetClass).length;
  }

  const movers = biggestMoves(data.assets, 7);
  const commodities = of("commodity");
  const commodityNote = commodities.map((asset) => structureReading(asset)).find(Boolean) ?? null;
  const vix = data.assets.find((asset) => asset.id === "vix");
  const btc = data.assets.find((asset) => asset.id === "btc");
  const dxy = data.assets.find((asset) => asset.id === "dxy");
  const putCall = of("option").filter((asset) => asset.group === "put_call");
  const equityPutCall = putCall.find((asset) => asset.id === "pc-equity");
  const hasAnything = data.assets.length > 0 || data.predictions.length > 0;
  const read = buildMarketsRead(data);
  const themes = [...etfs.filter((asset) => asset.group === "thematic")].sort((a, b) => Math.abs(b.change.d1 ?? 0) - Math.abs(a.change.d1 ?? 0));
  const crypto = of("crypto");

  const refreshed = data.as_of ? <p className="text-[12.5px] leading-[18px] text-oa-muted-fg">Refreshed {formatAsOf(data.as_of)}</p> : null;

  return (
    <MarketsPageFrame>
      <MarketingSchema path="/markets" name="Markets Today" description="US indices and ETFs, Treasury yields, commodities, currencies, crypto, options pricing and prediction markets on one page." breadcrumbLabel="Markets" />
      <PageHead note={false} className="!mb-0" title="Markets" meta={refreshed} />

      <ClassTabs classes={MARKET_CLASSES} counts={counts} />

      {!hasAnything ? (
        <div className="oa-surface border border-oa-border bg-oa-card px-4 py-10 text-center">
          <p className="text-[15px] font-medium text-oa-fg">Market data is not available right now.</p>
          <p className="mt-1 text-[14px] text-oa-muted-fg">Try again in a few minutes.</p>
        </div>
      ) : (
        <>
          <TheRead read={read} className="mb-3" />
          <MarketTickerStrip tiles={overview.tiles} />

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <MarketReadings readings={overview.readings} asOf={data.as_of} />
            <AssetClassCard
              title="Biggest moves"
              assets={movers}
              limit={7}
              note={moversTakeaway(movers)}
              emptyText="No moves to rank yet."
            />
          </div>

          <SectionLabel aside="US indices and funds">Stocks and funds</SectionLabel>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <AssetClassCard title="Indices" href={classHref("indices")} assets={of("index")} limit={5} note={vix ? assetReading(vix) : null} noteVerdict={vix ? vixWord(vix.price) : null} />
            <SectorHeatGrid assets={etfs} takeaway={sectorTakeaway(etfs)} />
            <AssetClassCard
              title="Themes"
              href={classHref("etfs")}
              assets={themes}
              limit={5}
              note={listTakeaway(themes, "theme funds")}
              className="md:col-span-2 xl:col-span-1"
            />
          </div>

          <SectionLabel aside="Treasury yields and what options price">Rates and volatility</SectionLabel>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <YieldCurveChart curve={data.treasury} />
            <AssetClassCard title="Treasury yields" href={classHref("rates")} assets={of("rate")} limit={7} note={yieldCurveShiftReading(data.treasury)} />
            <VolCurveChart curve={data.volCurve} className="md:col-span-2 xl:col-span-1" />
          </div>

          <SectionLabel aside="Futures, currencies, coins">Commodities, currencies and crypto</SectionLabel>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <AssetClassCard title="Commodities" href={classHref("commodities")} assets={commodities} limit={6} note={commodityNote} />
            <AssetClassCard title="Currencies" href={classHref("fx")} assets={of("fx")} limit={6} note={dxy ? assetReading(dxy) : null} />
            <AssetClassCard title="Crypto" href={classHref("crypto")} assets={crypto} limit={6} note={listTakeaway(crypto, "coins") ?? (btc ? `Bitcoin: ${assetReading(btc) ?? ""}`.trim() : null)} className="md:col-span-2 xl:col-span-1" />
          </div>

          <SectionLabel aside="Put/call and volatility">Options</SectionLabel>
          <div className="grid gap-3 md:grid-cols-2">
            <AssetClassCard
              title="Put/call ratios"
              href={classHref("options")}
              assets={putCall}
              limit={4}
              note={equityPutCall && assetReading(equityPutCall) ? `Single-stock options: ${assetReading(equityPutCall)}` : null}
            />
            <AssetClassCard
              title="Volatility indices"
              href={classHref("options")}
              assets={of("option").filter((asset) => asset.group === "volatility")}
              limit={6}
            />
          </div>

          <SectionLabel aside={<a href={classHref("predictions")} className="hover:text-oa-fg">All {data.predictions.length} →</a>}>Prediction markets</SectionLabel>
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
      )}
      <PageNote className="!mt-4" lede={LEDE} source={refreshed} />
    </MarketsPageFrame>
  );
}

/** Six cards for the overview: at most two per topic, in the stored topic order. */
function pickPredictions<T extends { topic: string }>(markets: T[]): T[] {
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
