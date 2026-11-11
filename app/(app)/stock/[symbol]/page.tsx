import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";

import { EarningsDayStockEntry } from "@/components/earnings-day/stock-entry";
import { ResearchStockEntry } from "@/components/research/stock-entry";
import { StockReason } from "@/components/thesis/stock-reason";
import { StockPageStream } from "@/components/stock-page-stream";
import { StockReportSkeleton } from "@/components/stock-report/skeleton";
import { StockFamilyLinks } from "@/components/seo/stock-family-links";
import { interTight } from "@/components/oa/font";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { todayET } from "@/lib/calendar-shared";
import { getCurrentMarket } from "@/lib/market";
import { getStockSummary, normalizeStockSymbolParam } from "@/lib/stock";
import { stockShareLine } from "@/lib/og/data";
import { ogImage } from "@/lib/og/url";
import { getStockFamily } from "@/lib/seo/family-data";
import {
  getSeoStockPage,
  stockHasCurrentRead,
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

/**
 * Whether we hold a stock at this address: "yes", "no", or "unknown" when the
 * store could not be read (then the page renders and the report handles it).
 * Same lookup as the report (the reader's market first, then the other one),
 * deduped per request.
 *
 * This runs in the page itself, before anything streams, and this segment has
 * no loading.tsx. In Next 13.5 a loading boundary flushes a 200 shell first,
 * which turned every unknown ticker into a soft 404; checked here, an unknown
 * ticker gets a real 404 status and the segment's not-found.tsx, which keeps
 * the "ask us to add it" request one click away.
 */
const stockExists = cache(async (symbol: string): Promise<"yes" | "no" | "unknown"> => {
  const normalized = normalizeStockSymbolParam(symbol);
  if (!normalized) return "no";
  try {
    const cookieMarket = getCurrentMarket();
    const otherMarket: "US" | "IN" = cookieMarket === "IN" ? "US" : "IN";
    const found = (await getStockSummary(normalized, cookieMarket)) ?? (await getStockSummary(normalized, otherMarket));
    return found ? "yes" : "no";
  } catch {
    return "unknown";
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const normalized = normalizeStockSymbolParam(symbol);
  const label =
    normalized ?? (symbol.trim().toUpperCase().slice(0, 16) || symbol.toUpperCase());
  const upper = label.toUpperCase();
  const profile = getSeoStockPage(upper);
  // The metadata holds the first byte of the page, so for the stocks in our
  // catalogue its reads all start at once instead of one after another. Each
  // is cached and shared with the page's own reads. Any other symbol waits
  // for the exists check first, so a made-up ticker never adds cache entries.
  const existsRead = stockExists(symbol);
  const exists = profile ? null : await existsRead;
  // Fulfilled/search-catalog stocks can exist in Firestore before the checked-
  // in 500-company catalogue is refreshed. Resolve those real pages here so a
  // valid long-tail stock such as NOK is not left noindex until the next code
  // deployment.
  const liveRead = profile || !normalized ? Promise.resolve(null) : getStockSummary(upper, "US").catch(() => null);
  const known = normalized && exists !== "no";
  const shareLineRead = known ? stockShareLine(upper).catch(() => null) : Promise.resolve(null);
  // If the coverage read fails, keep the page indexable rather than noindex it during an outage.
  const indexRead = known
    ? getStockFamily(upper).then((family) => stockHasCurrentRead(family.row, todayET()), () => true)
    : Promise.resolve(true);
  // A catalogued stock is known to exist, so its metadata (which holds the first byte) does not wait on the check.
  if (!profile && exists === "no") return { title: "Stock not found", robots: { index: false, follow: true } };
  const live = await liveRead;
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
  const shareLine = identity ? await shareLineRead : null;
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
    // The index rule lives in lib/seo/stock-pages.ts (stockHasCurrentRead); the stocks sitemap applies the same rule to the same row.
    robots: {
      index: Boolean(identity) && (await indexRead),
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

export default async function StockPage({ params }: Props) {
  const { symbol } = await params;
  const ticker = normalizeStockSymbolParam(symbol) ?? symbol.toUpperCase();
  // Only symbols outside the catalogue wait for the store before anything streams (a real 404, see stockExists).
  // The 500 catalogued stocks always exist, so their shell goes out at once. If one were ever missing from the
  // store, the report would show its "not covered yet" view (with a 200) instead of the 404 page.
  if (!getSeoStockPage(ticker) && (await stockExists(symbol)) === "no") notFound();
  return (
    <main className={`oa-landing stock-report-page ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <style>{STICKY_FIX}</style>
      <OaSiteHeader />
      {/* The latest earnings report, when there is one (components/earnings-day). */}
      <Suspense fallback={null}>
        <EarningsDayStockEntry ticker={ticker} />
      </Suspense>
      {/* The owner's own reason and what the reason watcher found; fetched in the browser, so the page stays cached. */}
      <StockReason ticker={ticker} />
      <Suspense fallback={<StockReportSkeleton />}>
        <StockPageStream params={params} />
      </Suspense>
      {/* The full research report on this stock (components/research). */}
      <Suspense fallback={null}>
        <ResearchStockEntry ticker={ticker} />
      </Suspense>
      <Suspense fallback={null}>
        <StockFamilyLinks ticker={ticker} />
      </Suspense>
    </main>
  );
}
