import type { Metadata } from "next";
import { Suspense } from "react";

import { MarketFeedStreamSkeleton } from "@/components/page-stream-skeletons";
import { RedditBuzzPageStream } from "@/components/reddit-buzz-page-stream";

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

export default function RedditBuzzPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-10 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-[#111111] md:text-[40px]">
            Reddit buzz
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-[#6b7280]">
            What the crowd is debating — mention heat and distilled narrative per ticker.
          </p>
        </header>

        <Suspense fallback={<MarketFeedStreamSkeleton />}>
          <div className="landing-stream-in">
            <RedditBuzzPageStream />
          </div>
        </Suspense>

        <footer className="max-w-3xl text-[11px] text-[#9ca3af]">
          Summaries are AI-distilled from public Reddit threads. Not investment advice.
        </footer>
      </div>
    </main>
  );
}
