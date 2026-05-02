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
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-12 md:py-16 flex flex-col gap-10">
        <header className="flex flex-col gap-3 max-w-[720px]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            News
          </span>
          <h1 className="text-[36px] md:text-[44px] font-semibold tracking-[-0.03em] text-[#111111] leading-[1.1]">
            Today&apos;s news, on the stocks you care about.
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.55]">
            {articles.length} {articles.length === 1 ? "article" : "articles"} pulled for{" "}
            {market === "IN" ? "India" : "US"} today. Filter by sector, source, sentiment, or timeframe to narrow in.
          </p>
        </header>

        <NewsExplorer articles={articles} market={market} />
      </div>
    </main>
  );
}
