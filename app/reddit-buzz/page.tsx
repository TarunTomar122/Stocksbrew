import type { Metadata } from "next";

import { RedditBuzzPageView } from "@/components/reddit-buzz-page-view";
import { getSessionUser } from "@/lib/auth-server";
import { getCurrentMarket } from "@/lib/market";
import { getRedditCues } from "@/lib/reddit-cues";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Reddit Buzz - Trending Stock Discussions",
  description:
    "Stocks buzzing on Reddit with sentiment, mention heat, and what the crowd is debating.",
  alternates: { canonical: "/reddit-buzz" },
  openGraph: {
    title: "Reddit buzz · stocksbrew",
    description: "Trending tickers on r/stocks and more, with narrative summaries.",
    url: "https://www.stocksbrew.online/reddit-buzz",
  },
};

export default async function RedditBuzzPage() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);
  const data = await getRedditCues(market).catch(() => null);

  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-10 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <RedditBuzzPageView data={data} isSubscribed={isSubscribed} />
        <footer className="max-w-3xl text-[11px] text-[#9ca3af]">
          Summaries are AI-distilled from public Reddit threads. Not investment advice.
        </footer>
      </div>
    </main>
  );
}
