import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EarningsIntelReport } from "@/components/earnings-intel-report";
import { resolveStockTier } from "@/lib/ai-launch-tier";
import { getSessionUser } from "@/lib/auth-server";
import { getCurrentMarket } from "@/lib/market";
import { getLatestEarningsIntelByTicker } from "@/lib/earnings-intel";
import { getStockSummary } from "@/lib/stock";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ ticker: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw || "").toUpperCase();
  const market = getCurrentMarket();
  const doc = await getLatestEarningsIntelByTicker(market, ticker).catch(() => null);
  const headline =
    doc?.report?.headline?.trim() || `${ticker} post-earnings intel`;
  const description =
    doc?.report?.summary?.trim().slice(0, 160) ||
    `Post-earnings analysis for ${ticker}: what happened, so what, and scenarios.`;
  const url = `https://www.stocksbrew.online/earnings-intel/${ticker}`;

  return {
    title: `${ticker} Earnings Intel`,
    description,
    alternates: { canonical: `/earnings-intel/${ticker}` },
    robots: { index: false, follow: true },
    openGraph: {
      title: `${ticker}: ${headline}`,
      description,
      url,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `${ticker}: ${headline}`,
      description,
    },
  };
}

export default async function EarningsIntelTickerPage({ params }: Props) {
  const { ticker: raw } = await params;
  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);

  const cookieMarket = getCurrentMarket();
  const ticker = decodeURIComponent(raw || "").toUpperCase();
  const doc = await getLatestEarningsIntelByTicker(cookieMarket, ticker);
  if (!doc) notFound();

  const market = doc.market ?? cookieMarket;
  const stock = await getStockSummary(ticker, market);
  const trackedIds = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
    : [];
  const isTracked = trackedIds.includes(doc.instrument_id);
  const tier = session ? resolveStockTier(doc.instrument_id, trackedIds) : "free";

  return (
    <main className="oa-landing flex-grow overflow-x-hidden">
      <OaSiteHeader />
      <div className="mx-auto flex w-full max-w-6xl flex-col px-0 py-6 sm:px-10 sm:py-10 md:px-14 md:py-12 lg:px-16">
        <EarningsIntelReport
          doc={doc}
          stock={stock}
          market={market}
          isSubscribed={isSubscribed}
          isTracked={isTracked}
          tier={tier}
        />
      </div>
    </main>
  );
}
