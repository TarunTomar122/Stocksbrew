import type { Metadata } from "next";
import { Suspense } from "react";

import { StockPageStream } from "@/components/stock-page-stream";
import { StockReportSkeleton } from "@/components/stock-report/skeleton";
import { interTight } from "@/components/oa/font";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { getStockSummary, normalizeStockSymbolParam } from "@/lib/stock";
import { stockShareLine } from "@/lib/og/data";
import { ogImage } from "@/lib/og/url";
import {
  getSeoStockPage,
  isIndexedStockTicker,
  stockSeoDescription,
  stockSeoTitle,
} from "@/lib/seo/stock-pages";

export const revalidate = 60;

/**
 * `globals.css` sets `overflow-x: hidden` on html and body. That turns body
 * into a scroll container that never scrolls, so nothing inside it can stick
 * (the section tabs, the call column, the mobile top bar). `clip` hides the
 * same horizontal overflow without creating a scroll container. Scoped to this
 * page; the same change in globals.css would fix sticky everywhere.
 */
const STICKY_FIX =
  "html:has(.stock-report-page),html:has(.stock-report-page) body{overflow-x:clip}";


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
    ? stockSeoTitle({ name: identity.name, ticker: upper })
    : `${upper} Stock Analysis & Research`;
  const description = identity
    ? stockSeoDescription({
        name: identity.name,
        ticker: upper,
        sector: identity.sector || "",
        industry: identity.industry || "",
      })
    : `${upper} stock price, fundamentals, earnings, analyst context, risks, and recent news in one research view.`;
  // The share card: price, move, our call and the read, drawn from today's data (lib/og).
  const shareImage = ogImage(["stock", upper], identity ? `${upper} (${identity.name}): price, today's move and our call` : `${upper} stock report`, { daily: true });
  const shareLine = identity ? await stockShareLine(upper).catch(() => null) : null;
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
    robots: {
      index: Boolean(identity) && isIndexedStockTicker(upper),
      follow: true,
    },
    openGraph: {
      title: `${title} · stocksbrew`,
      description: shareLine ?? description,
      url: `https://www.stocksbrew.online/stock/${upper}`,
      images: [shareImage],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · stocksbrew`,
      description: shareLine ?? description,
      images: [shareImage],
    },
  };
}

export default function StockPage({ params }: Props) {
  return (
    <main className={`oa-landing stock-report-page ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <style>{STICKY_FIX}</style>
      <OaSiteHeader />
      <Suspense fallback={<StockReportSkeleton />}>
        <StockPageStream params={params} />
      </Suspense>
    </main>
  );
}
