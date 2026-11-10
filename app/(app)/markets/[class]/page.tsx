import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AssetTable } from "@/components/markets/asset-table";
import { MarketsPageFrame } from "@/components/markets/page-frame";
import { PredictionTable } from "@/components/markets/prediction-table";
import { AsOfLine, ClassTabs, SectorHeatGrid, VolCurveChart, YieldCurveChart } from "@/components/markets/widgets";
import { TheRead } from "@/components/oa/insight";
import { PageHead, PageNote } from "@/components/oa/kit";
import { getMarketsData } from "@/lib/markets";
import { buildClassRead } from "@/lib/markets-insights";
import {
  assetAsOfText,
  assetHref,
  classInfoBySlug,
  formatAsOf,
  MARKET_CLASSES,
  predictionHref,
  sectorReading,
  yieldCurveReading,
  yieldCurveShiftReading,
  type MarketAsset,
} from "@/lib/markets-shared";
import { ogImage, shareMetadata } from "@/lib/og/url";

export const revalidate = 300;

type Props = { params: Promise<{ class: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { class: slug } = await params;
  const info = classInfoBySlug(slug);
  if (!info) return { title: "Markets" };
  const title = `${info.title}: prices and changes`;
  return {
    title,
    description: info.blurb,
    alternates: { canonical: `/markets/${info.slug}` },
    ...shareMetadata({
      title: `${title} · stocksbrew`,
      description: info.blurb,
      path: `/markets/${info.slug}`,
      image: ogImage(["market", info.slug], `${info.title}: what moved most today`, { daily: true }),
    }),
  };
}

export default async function MarketClassPage({ params }: Props) {
  const { class: slug } = await params;
  const info = classInfoBySlug(slug);
  const data = await getMarketsData();

  if (!info) {
    // Older links were /markets/{asset id}; send them to the asset's own page.
    const id = slug.toLowerCase();
    const asset = data.assets.find((item) => item.id === id);
    if (asset) redirect(assetHref(asset));
    const market = data.predictions.find((item) => item.id === id);
    if (market) redirect(predictionHref(market));
    notFound();
  }

  const assets: MarketAsset[] = info.assetClass ? data.assets.filter((asset) => asset.class === info.assetClass) : [];
  const counts: Record<string, number> = { predictions: data.predictions.length };
  for (const item of MARKET_CLASSES) {
    if (item.assetClass) counts[item.slug] = data.assets.filter((asset) => asset.class === item.assetClass).length;
  }
  const latest = assets.reduce<MarketAsset | null>((best, asset) => (!best || asset.as_of > best.as_of ? asset : best), null);

  // The read's headline. The rates and options charts already carry their curve reading, so
  // rates leads with how the curve moved and options with how the gauges moved (the class line).
  const headline =
    info.slug === "rates"
      ? yieldCurveShiftReading(data.treasury) ?? yieldCurveReading(data.treasury)
      : info.slug === "etfs"
        ? sectorReading(data.assets)
        : null;
  const read = buildClassRead({ slug: info.slug, assets, data, reading: headline });

  const refreshed = data.as_of ? <p className="text-[12.5px] leading-[18px] text-oa-muted-fg">Refreshed {formatAsOf(data.as_of)}</p> : null;

  return (
    <MarketsPageFrame>
      <PageHead note={false} className="!mb-0" title={info.title} meta={refreshed} />

      <ClassTabs classes={MARKET_CLASSES} active={info.slug} counts={counts} />

      <TheRead read={read} />

      {info.slug === "rates" ? <YieldCurveChart curve={data.treasury} href={null} wide /> : null}
      {info.slug === "options" ? <VolCurveChart curve={data.volCurve} href={null} /> : null}
      {info.slug === "etfs" ? <SectorHeatGrid assets={assets} href={null} wide /> : null}

      {info.assetClass ? (
        <>
          <AssetTable assets={assets} assetClass={info.assetClass} />
          {latest ? (
            <AsOfLine when={assetAsOfText(latest)} />
          ) : null}
          {info.slug === "options" ? (
            <p className="max-w-3xl text-[12.5px] leading-5 text-oa-muted-fg">
              End-of-day volatility indices and put/call ratios. Option chains are not shown.
            </p>
          ) : null}
        </>
      ) : (
        <PredictionTable markets={data.predictions} />
      )}
      <PageNote className="!mt-4" lede={info.blurb} source={refreshed} />
    </MarketsPageFrame>
  );
}
