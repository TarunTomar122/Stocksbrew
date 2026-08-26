import { Suspense } from "react";
import type { Metadata } from "next";

import { ExploreStream } from "@/components/explore-stream";
import { ExplorePageSkeleton } from "@/components/explore-skeleton";
import { OaSiteHeader } from "@/components/oa/oa-site-header";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Explore Stocks",
  description:
    "See what's moving before the crowd does: research themes and live scans for hot stocks, momentum, breakouts, news spikes, oversold dips and Trump mentions.",
  keywords: [
    "stock screener",
    "most traded stocks",
    "52 week high",
    "52 week low",
    "breakout stocks",
    "AI infrastructure stocks",
  ],
  alternates: { canonical: "/explore" },
  openGraph: {
    title: "Explore Stocks · stocksbrew",
    description:
      "Research themes and live market scans for heat, momentum, breakouts and news spikes.",
    url: "https://www.stocksbrew.online/explore",
  },
  twitter: {
    card: "summary_large_image",
    title: "Explore Stocks · stocksbrew",
    description:
      "Research themes and live market scans for heat, momentum, breakouts and news spikes.",
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
