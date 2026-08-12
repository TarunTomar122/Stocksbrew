import type { Metadata } from "next";
import { Suspense } from "react";

import { CompareStocksStream } from "@/components/compare-stocks-stream";
import { CompareStocksLandingSections } from "@/components/compare-stocks-landing-sections";
import { FreeToolBreadcrumb, FreeToolRelated } from "@/components/marketing/free-tool-chrome";
import { MarketFeedStreamSkeleton } from "@/components/page-stream-skeletons";

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
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-[1320px] px-4 pt-6 sm:px-6 md:px-10 md:pt-8">
        <FreeToolBreadcrumb title="Compare stocks" />
      </div>
      <Suspense fallback={<MarketFeedStreamSkeleton />}>
        <div className="landing-stream-in">
          <CompareStocksStream />
        </div>
      </Suspense>
      <CompareStocksLandingSections />
      <div className="mx-auto w-full max-w-screen-2xl px-6 pb-14 md:px-10 lg:px-16">
        <FreeToolRelated currentHref="/compare-stocks" />
      </div>
    </main>
  );
}
