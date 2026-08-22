import { OaSiteHeader } from "@/components/oa/oa-site-header";
import type { Metadata } from "next";
import { Suspense } from "react";

import { AnomaliesPageStream } from "@/components/anomalies-page-stream";
import { MarketFeedStreamSkeleton } from "@/components/page-stream-skeletons";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Today's Big Moves - Surging and Dropping Stocks",
  description:
    "Stocks with the biggest price moves today. Top gainers, top losers, and a short read on each.",
  alternates: { canonical: "/anomalies" },
  openGraph: {
    title: "Today's big moves · stocksbrew",
    description: "Top gainers, top losers, and what's behind today's biggest stock moves.",
    url: "https://www.stocksbrew.online/anomalies",
  },
  twitter: {
    card: "summary_large_image",
    title: "Today's big moves · stocksbrew",
    description: "Top gainers, top losers, and what's behind today's biggest stock moves.",
  },
};

export default function AnomaliesPage() {
  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-10 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-[32px] font-medium tracking-[-0.03em] text-[var(--oa-fg)] md:text-[40px]">
            Today&apos;s big moves
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-[var(--oa-muted-fg)]">
            Unusual price action across the market — with a short read on each name.
          </p>
        </header>

        <Suspense fallback={<MarketFeedStreamSkeleton />}>
          <AnomaliesPageStream />
        </Suspense>

        <footer className="text-[11px] text-[var(--oa-muted-fg)]">Not investment advice.</footer>
      </div>
    </main>
  );
}
