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
    <main className="min-w-0 flex-grow bg-background">
      <Suspense fallback={<div className="mx-auto w-full max-w-[1180px] px-3 py-4 sm:px-5 sm:py-7"><MarketFeedStreamSkeleton /></div>}>
        <PremarketPageStream />
      </Suspense>
    </main>
  );
}
