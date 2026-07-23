import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";

import { StockPageStream } from "@/components/stock-page-stream";
import { StockPageSkeleton } from "@/components/page-stream-skeletons";
import { normalizeStockSymbolParam } from "@/lib/stock";
import { getSeoStockPage, stockSeoDescription } from "@/lib/seo/stock-pages";

export const revalidate = 60;

type Props = {
  params: Promise<{ symbol: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const normalized = normalizeStockSymbolParam(symbol);
  const label =
    normalized ?? (symbol.trim().toUpperCase().slice(0, 16) || symbol.toUpperCase());
  const upper = label.toUpperCase();
  const profile = getSeoStockPage(upper);
  const title = profile
    ? `${profile.name} (${upper}) Stock Analysis`
    : `${upper} Stock Analysis & Research`;
  const description = profile
    ? stockSeoDescription(profile)
    : `${upper} stock price, fundamentals, earnings, analyst context, risks, and recent news in one research view.`;
  return {
    title,
    description,
    keywords: profile
      ? [
          `${upper} stock analysis`,
          `${profile.name} stock`,
          `${upper} earnings`,
          `${upper} stock price`,
          profile.industry,
          profile.sector,
        ].filter(Boolean)
      : undefined,
    alternates: { canonical: `/stock/${upper}` },
    robots: { index: Boolean(profile), follow: true },
    openGraph: {
      title: `${title} · stocksbrew`,
      description,
      url: `https://www.stocksbrew.online/stock/${upper}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · stocksbrew`,
      description,
    },
  };
}

export default function StockPage({ params }: Props) {
  return (
    <Suspense fallback={<StockPageSkeleton />}>
      <StockPageStream params={params} />
    </Suspense>
  );
}
