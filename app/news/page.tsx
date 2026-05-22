import type { Metadata } from "next";
import { Suspense } from "react";
import { getCurrentMarket } from "@/lib/market";
import { getNewsFeed } from "@/lib/news";
import { RadarStyleNewsFeed } from "@/components/radar-style-news-feed";

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
      <div className="h-72 rounded-[24px] border border-[#e5e7eb] bg-white" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-[18px] border border-[#e5e7eb] bg-white" />
        ))}
      </div>
    </div>
  );
}

async function NewsFeedStream() {
  const market = getCurrentMarket();
  const articles = await getNewsFeed(market);

  return <RadarStyleNewsFeed variant="market" articles={articles} market={market} />;
}

export default function NewsPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-10 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <Suspense fallback={<NewsFeedFallback />}>
          <NewsFeedStream />
        </Suspense>
      </div>
    </main>
  );
}
