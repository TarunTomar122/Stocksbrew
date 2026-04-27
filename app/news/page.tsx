import { getCurrentMarket } from "@/lib/market";
import { getNewsFeed } from "@/lib/news";
import { NewsExplorer } from "@/components/news-explorer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "News · Tikrr",
  description:
    "Daily market news from across the web — filter by sector, source, sentiment, and timeframe.",
};

export default async function NewsPage() {
  const market = getCurrentMarket();
  const articles = await getNewsFeed(market);

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-8 py-10 flex flex-col gap-6">
        <header className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">News</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              {articles.length} {articles.length === 1 ? "article" : "articles"}{" "}
              pulled for {market === "IN" ? "India" : "US"} today · filter
              below to narrow in on what matters.
            </p>
          </div>
        </header>

        <NewsExplorer articles={articles} market={market} />
      </div>
    </main>
  );
}
