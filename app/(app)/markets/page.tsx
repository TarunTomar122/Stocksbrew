import type { Metadata } from "next";

import { JsonLd } from "@/components/docs/json-ld";

import { MarketsPageFrame } from "@/components/markets/page-frame";
import {
  CommoditiesCurrenciesCryptoSection,
  hasMarketsData,
  MarketsMovedSection,
  OptionsSection,
  PredictionsSection,
  RatesAndVolatilitySection,
  StocksAndFundsSection,
} from "@/components/markets/overview-sections";
import { ClassTabs, MarketTickerStrip } from "@/components/markets/widgets";
import { PageHead, PageNote } from "@/components/oa/kit";
import { TheRead } from "@/components/oa/insight";
import { getMarketsData } from "@/lib/markets";
import { buildMarketsRead } from "@/lib/markets-insights";
import { buildMarketsOverview, formatAsOf, MARKET_CLASSES, type MarketAsset } from "@/lib/markets-shared";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";

export const revalidate = 300;

export function generateMetadata(): Metadata {
  return toolPageMetadata("/markets");
}

const LEDE =
  "Stocks, funds, rates, commodities, currencies, crypto, options pricing and traded odds on one page. Open any row for its chart and numbers.";

export default async function MarketsPage() {
  const data = await getMarketsData();
  const overview = buildMarketsOverview(data);
  const of = (assetClass: MarketAsset["class"]) => data.assets.filter((asset) => asset.class === assetClass);
  const counts: Record<string, number> = { predictions: data.predictions.length };
  for (const item of MARKET_CLASSES) {
    if (item.assetClass) counts[item.slug] = of(item.assetClass).length;
  }
  const read = buildMarketsRead(data);

  const refreshed = data.as_of ? <p className="text-[12.5px] leading-[18px] text-oa-muted-fg">Refreshed {formatAsOf(data.as_of)}</p> : null;

  return (
    <MarketsPageFrame>
      <JsonLd data={toolPageLd("/markets")} />
      <PageHead note={false} className="!mb-0" title="Markets" meta={refreshed} />

      <ClassTabs classes={MARKET_CLASSES} counts={counts} />

      {!hasMarketsData(data) ? (
        <div className="oa-surface border border-oa-border bg-oa-card px-4 py-10 text-center">
          <p className="text-[15px] font-medium text-oa-fg">Market data is not available right now.</p>
          <p className="mt-1 text-[14px] text-oa-muted-fg">Try again in a few minutes.</p>
        </div>
      ) : (
        <>
          <TheRead read={read} className="mb-3" />
          <MarketTickerStrip tiles={overview.tiles} />

          <MarketsMovedSection data={data} overview={overview} />
          <StocksAndFundsSection data={data} />
          <RatesAndVolatilitySection data={data} />
          <CommoditiesCurrenciesCryptoSection data={data} />
          <OptionsSection data={data} />
          <PredictionsSection data={data} />
        </>
      )}
      <PageNote className="!mt-4" lede={LEDE} source={refreshed} />
    </MarketsPageFrame>
  );
}
