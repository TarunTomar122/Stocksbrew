import type { Metadata } from "next";
import { Suspense } from "react";

import { CompareStocksStream } from "@/components/compare-stocks-stream";
import { CompareStocksLandingSections } from "@/components/compare-stocks-landing-sections";
import { FreeToolRelated } from "@/components/marketing/free-tool-chrome";
import { MarketFeedStreamSkeleton } from "@/components/page-stream-skeletons";
import { OaSiteHeader } from "@/components/oa/oa-site-header";

export const metadata: Metadata = {
  title: "Compare Stocks: Valuation, Quality, Momentum & Returns",
  description:
    "Compare 2 to 5 US stocks across price, valuation, quality, momentum, and returns to see the trade-offs clearly.",
  alternates: { canonical: "/compare-stocks" },
  openGraph: {
    title: "Compare stocks side by side · stocksbrew",
    description:
      "Pick two stocks and see the trade-offs across price, fundamentals, scores and returns.",
    url: "https://www.stocksbrew.online/compare-stocks",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Stock Comparison Tool · stocksbrew",
    description:
      "Pick two stocks and see the trade-offs across price, fundamentals, scores and returns.",
  },
};

export default function CompareStocksPage() {
  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <Suspense fallback={<MarketFeedStreamSkeleton />}>
        <div className="landing-stream-in">
          <CompareStocksStream />
        </div>
      </Suspense>
      <CompareStocksLandingSections />
      <div className="mx-auto w-full max-w-[76rem] px-4 pb-14 sm:px-6">
        <FreeToolRelated currentHref="/compare-stocks" />
      </div>
    </main>
  );
}
