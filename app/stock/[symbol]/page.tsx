import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";

import { StockPageStream } from "@/components/stock-page-stream";
import { StockPageSkeleton } from "@/components/page-stream-skeletons";
import { getStockSummary, normalizeStockSymbolParam } from "@/lib/stock";
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
  // Fulfilled/search-catalog stocks can exist in Firestore before the checked-
  // in 500-company catalogue is refreshed. Resolve those real pages here so a
  // valid long-tail stock such as NOK is not left noindex until the next code
  // deployment.
  const live = profile
    ? null
    : await getStockSummary(upper, "US").catch(() => null);
  const identity = profile ?? live;
  const title = identity
    ? `${identity.name} (${upper}) Stock Analysis`
    : `${upper} Stock Analysis & Research`;
  const description = identity
    ? stockSeoDescription({
        name: identity.name,
        ticker: upper,
        sector: identity.sector || "",
        industry: identity.industry || "",
      })
    : `${upper} stock price, fundamentals, earnings, analyst context, risks, and recent news in one research view.`;
  return {
    title,
    description,
    keywords: identity
      ? [
          `${upper} stock analysis`,
          `${identity.name} stock`,
          `${upper} earnings`,
          `${upper} stock price`,
          identity.industry,
          identity.sector,
        ].filter((value): value is string => Boolean(value))
      : undefined,
    alternates: { canonical: `/stock/${upper}` },
    robots: { index: Boolean(identity), follow: true },
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
