import type { Metadata } from "next";
import { Suspense } from "react";

import { PremarketPageStream } from "@/components/premarket-page-stream";
import { MarketFeedStreamSkeleton } from "@/components/page-stream-skeletons";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Pre-Market Movers - Before the Open Gaps",
  description:
    "See which stocks are gapping up or down before the market opens. Live pre-market prices, gaps vs prior close, and sector context.",
  alternates: { canonical: "/premarket" },
  openGraph: {
    title: "Pre-Market Movers · stocksbrew",
    description: "Stocks gapping before the open — live pre-market movers with gap % and prices.",
    url: "https://www.stocksbrew.online/premarket",
  },
  twitter: {
    title: "Pre-Market Movers · stocksbrew",
    description: "Stocks gapping before the open — live pre-market movers with gap % and prices.",
  },
};

export default function PremarketPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-10 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-[#111111] md:text-[40px]">
            Pre-market movers
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-[#6b7280]">
            Stocks gapping before the open — live pre-market prices, gap % vs prior close, and sector context.
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
