import type { Metadata } from "next";
import { Suspense } from "react";

import { FreeToolPageFrame } from "@/components/marketing/free-tool-chrome";
import { RadarStyleNewsFeed } from "@/components/radar-style-news-feed";
import { getCurrentMarket } from "@/lib/market";
import { getNewsFeed } from "@/lib/news";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Market News",
  description:
    "Daily market headlines with tone filters - scan fast and open the stories that matter. Filter by bullish, bearish, or neutral sentiment.",
  alternates: { canonical: "/news" },
  openGraph: {
    title: "Market News · stocksbrew",
    description: "Daily market headlines with tone filters - scan fast and open the stories that matter.",
    url: "https://www.stocksbrew.online/news",
  },
  twitter: {
    title: "Market News · stocksbrew",
    description: "Daily market headlines with tone filters - scan fast and open the stories that matter.",
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
      <FreeToolPageFrame toolHref="/news">
        <Suspense fallback={<NewsFeedFallback />}>
          <NewsFeedStream />
        </Suspense>
      </FreeToolPageFrame>
    </main>
  );
}
