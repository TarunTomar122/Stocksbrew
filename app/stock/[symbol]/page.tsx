import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";

import { StockPageStream } from "@/components/stock-page-stream";
import { StockPageSkeleton } from "@/components/page-stream-skeletons";
import { normalizeStockSymbolParam } from "@/lib/stock";
import { stockMetaDescription } from "@/lib/brand-copy";

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
  return {
    title: `${upper} Stock Analysis & Research`,
    description: stockMetaDescription(upper),
    alternates: { canonical: `/stock/${upper}` },
    robots: { index: false, follow: true },
    openGraph: {
      title: `${upper} Stock Analysis & Research · stocksbrew`,
      description: stockMetaDescription(upper),
      url: `https://www.stocksbrew.online/stock/${upper}`,
    },
    twitter: {
      title: `${upper} Stock Analysis & Research · stocksbrew`,
      description: stockMetaDescription(upper),
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
