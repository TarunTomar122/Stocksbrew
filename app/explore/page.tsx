import { Suspense } from "react";
import type { Metadata } from "next";

import { ExploreStream } from "@/components/explore-stream";
import { ExplorePageSkeleton } from "@/components/explore-skeleton";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Explore Stocks",
  description:
    "Discover stocks: most traded names, stocks near their 52-week high or low, breakout setups, and what's trending on Reddit.",
  keywords: [
    "stock screener",
    "most traded stocks",
    "52 week high",
    "52 week low",
    "breakout stocks",
    "reddit stocks",
  ],
  alternates: { canonical: "/explore" },
  openGraph: {
    title: "Explore Stocks · stocksbrew",
    description: "Most traded names, 52-week range, breakouts, and Reddit stocks in one place.",
    url: "https://www.stocksbrew.online/explore",
  },
  twitter: {
    card: "summary_large_image",
    title: "Explore Stocks · stocksbrew",
    description: "Most traded names, 52-week range, breakouts, and Reddit stocks in one place.",
  },
};

export default function ExplorePage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-[72rem] px-5 py-8 md:px-8 md:py-10">
        <Suspense fallback={<ExplorePageSkeleton />}>
          <ExploreStream />
        </Suspense>
      </div>
    </main>
  );
}
