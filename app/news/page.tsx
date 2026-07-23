import type { Metadata } from "next";
import { Suspense } from "react";

import { FreeToolPageFrame } from "@/components/marketing/free-tool-chrome";
import { RadarStyleNewsFeed } from "@/components/radar-style-news-feed";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { getCurrentMarket } from "@/lib/market";
import { getNewsFeed } from "@/lib/news";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "US Stock Market News Today",
  description:
    "Current US stock market news organized by ticker and sentiment. Scan bullish, bearish, and neutral headlines, then open the primary story for full context.",
  keywords: [
    "US stock market news",
    "stock news today",
    "US stocks news",
    "stock market headlines",
    "company news",
  ],
  alternates: { canonical: "/news" },
  openGraph: {
    title: "US Stock Market News Today · stocksbrew",
    description: "Current US stock headlines organized by ticker and sentiment.",
    url: "https://www.stocksbrew.online/news",
  },
  twitter: {
    card: "summary_large_image",
    title: "US Stock Market News Today · stocksbrew",
    description: "Current US stock headlines organized by ticker and sentiment.",
  },
};

function NewsFeedFallback() {
  return (
    <div className="grid animate-pulse grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
      <div className="h-72 rounded-[24px] border border-outline-variant bg-surface" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-[18px] border border-outline-variant bg-surface" />
        ))}
      </div>
    </div>
  );
}

async function NewsFeedStream() {
  const market = getCurrentMarket();
  const articles = await getNewsFeed(market);

  return <RadarStyleNewsFeed variant="market" articles={articles} market={market} hideTitle />;
}

export default function NewsPage() {
  return (
    <main className="flex-grow">
      <MarketingSchema
        path="/news"
        name="US Stock Market News Today"
        description="Current US stock market headlines organized by ticker and sentiment."
        breadcrumbLabel="US Stock Market News"
      />
      <FreeToolPageFrame toolHref="/news">
        <Suspense fallback={<NewsFeedFallback />}>
          <NewsFeedStream />
        </Suspense>
        <section className="grid gap-7 border-y border-outline-variant py-9 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-landing-brand">
              From headline to evidence
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-[-0.02em] text-on-surface">
              How to read stock news without chasing noise
            </h2>
          </div>
          <div className="text-[14px] leading-6 text-on-surface-variant">
            <p>
              A useful headline identifies what changed, when it changed, and which company metric it could
              affect. Confirm material announcements in the company&apos;s investor-relations release or SEC
              filing, compare the claim with prior guidance, and separate a lasting thesis change from a
              one-session price reaction.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-semibold text-landing-brand">
              <Link href="/blog/stock-news-catalyst-analysis" className="hover:underline">Catalyst analysis guide</Link>
              <Link href="/stocks" className="hover:underline">Research a ticker</Link>
              <Link href="/pulse" className="hover:underline">Market analysis today</Link>
            </div>
          </div>
        </section>
      </FreeToolPageFrame>
    </main>
  );
}
