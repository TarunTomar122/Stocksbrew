import type { Metadata } from "next";
import { Suspense } from "react";

import { PremarketPageStream } from "@/components/premarket-page-stream";
import { MarketFeedStreamSkeleton } from "@/components/page-stream-skeletons";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "US Market Open Sentiment: Futures, Asia & Pre-Market",
  description:
    "See the US market opening setup before the bell: index futures, Japan, Korea and India, overnight news, social buzz, five sessions of context, and live pre-market movers.",
  alternates: { canonical: "/premarket" },
  openGraph: {
    title: "US Market Opening Sentiment · stocksbrew",
    description: "Futures, global markets, social buzz, overnight catalysts, and live pre-market breadth before the bell.",
    url: "https://www.stocksbrew.online/premarket",
    images: [{ url: "/api/premarket-share", width: 1200, height: 630, alt: "stocksbrew US market opening report" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "US Market Opening Sentiment · stocksbrew",
    description: "Futures, global markets, social buzz, overnight catalysts, and live pre-market breadth before the bell.",
    images: ["/api/premarket-share"],
  },
};

export default function PremarketPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-10 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-[#111111] md:text-[40px]">
            US market opening setup
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-[#6b7280]">
            A quick read on how Wall Street may open: global markets, overnight catalysts, social conversation, five recent sessions, and live pre-market breadth.
          </p>
        </header>

        <Suspense fallback={<MarketFeedStreamSkeleton />}>
          <div className="landing-stream-in">
            <PremarketPageStream />
          </div>
        </Suspense>

        <footer className="text-[11px] text-[#9ca3af]">
          Pre-market quotes can be thin and volatile · not investment advice.
        </footer>
      </div>
    </main>
  );
}
