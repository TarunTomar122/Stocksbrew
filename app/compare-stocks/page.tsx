import type { Metadata } from "next";
import { Suspense } from "react";

import { CompareStocksStream } from "@/components/compare-stocks-stream";
import { CompareStocksLandingSections } from "@/components/compare-stocks-landing-sections";
import { FreeToolBreadcrumb, FreeToolRelated } from "@/components/marketing/free-tool-chrome";
import { MarketFeedStreamSkeleton } from "@/components/page-stream-skeletons";

export const metadata: Metadata = {
  title: "Compare Stocks Side by Side",
  description:
    "Compare 2 to 5 US stocks side by side across price, fundamentals, scores, and returns, with the winner in each row highlighted.",
  alternates: { canonical: "/compare-stocks" },
  openGraph: {
    title: "Free Stock Comparison Tool · stocksbrew",
    description:
      "Compare up to 5 US stocks side by side. See price, scores, fundamentals, and returns in one table with the winner of each row highlighted.",
    url: "https://www.stocksbrew.online/compare-stocks",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Stock Comparison Tool · stocksbrew",
    description:
      "Compare up to 5 US stocks side by side. See price, scores, fundamentals, and returns in one table with the winner of each row highlighted.",
  },
};

export default function CompareStocksPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 pt-8 md:px-10 lg:px-16">
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
