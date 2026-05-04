import type { Metadata } from "next";
import { getCurrentMarket } from "@/lib/market";
import { getNewsFeed } from "@/lib/news";
import { RadarStyleNewsFeed } from "@/components/radar-style-news-feed";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Market News",
  description:
    "Daily market headlines with tone filters — scan fast and open the stories that matter. Filter by bullish, bearish, or neutral sentiment.",
  alternates: { canonical: "/news" },
  openGraph: {
    title: "Market News · Tikrr",
    description: "Daily market headlines with tone filters — scan fast and open the stories that matter.",
    url: "https://www.tikrr.online/news",
  },
  twitter: {
    title: "Market News · Tikrr",
    description: "Daily market headlines with tone filters — scan fast and open the stories that matter.",
  },
};

export default async function NewsPage() {
  const market = getCurrentMarket();
  const articles = await getNewsFeed(market);

  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-10 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <RadarStyleNewsFeed variant="market" articles={articles} market={market} />
      </div>
    </main>
  );
}
