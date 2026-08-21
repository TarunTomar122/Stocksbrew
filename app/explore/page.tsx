import { Suspense } from "react";
import type { Metadata } from "next";

import { ExploreStream } from "@/components/explore-stream";
import { ExplorePageSkeleton } from "@/components/explore-skeleton";
import { OaSiteHeader } from "@/components/oa/oa-site-header";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Explore Stocks",
  description:
    "See what's moving before the crowd does: live scans for hot stocks, momentum, 52-week breakouts, news spikes, oversold dips, Reddit buzz and Trump mentions.",
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
    description:
      "Live market scans: heat, momentum, breakouts and Reddit buzz. See what's moving before the crowd does.",
    url: "https://www.stocksbrew.online/explore",
  },
  twitter: {
    card: "summary_large_image",
    title: "Explore Stocks · stocksbrew",
    description:
      "Live market scans: heat, momentum, breakouts and Reddit buzz. See what's moving before the crowd does.",
  },
};

export default function ExplorePage() {
  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <Suspense fallback={<ExplorePageSkeleton />}>
        <ExploreStream />
      </Suspense>
    </main>
  );
}
