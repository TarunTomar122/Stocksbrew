import type { Metadata } from "next";

import { CompareStocksInteractive } from "@/components/compare-stocks-interactive";
import { CompareStocksLandingSections } from "@/components/compare-stocks-landing-sections";
import { FreeToolBreadcrumb, FreeToolRelated } from "@/components/marketing/free-tool-chrome";
import { getSearchIndex } from "@/lib/search";
import { getCurrentMarket } from "@/lib/market";

export const metadata: Metadata = {
  title: "Compare Stocks Side by Side",
  description:
    "Free stock comparison tool. Line up 2 to 5 US tickers and see price, fundamentals, scores, and returns in one table with the winner of each row highlighted. No sign-in required.",
  alternates: { canonical: "/compare-stocks" },
  openGraph: {
    title: "Free Stock Comparison Tool · stocksbrew",
    description:
      "Compare up to 5 US stocks side by side. See price, scores, fundamentals, and returns in one table with the winner of each row highlighted.",
    url: "https://www.stocksbrew.online/compare-stocks",
  },
  twitter: {
    title: "Free Stock Comparison Tool · stocksbrew",
    description:
      "Compare up to 5 US stocks side by side. See price, scores, fundamentals, and returns in one table with the winner of each row highlighted.",
  },
};

export default async function CompareStocksPage() {
  const market = getCurrentMarket();
  const searchIndex = await getSearchIndex(market).catch(() => []);

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 pt-8 md:px-10 lg:px-16">
        <FreeToolBreadcrumb title="Compare stocks" />
      </div>
      <CompareStocksInteractive searchIndex={searchIndex} />
      <CompareStocksLandingSections />
      <div className="mx-auto w-full max-w-screen-2xl px-6 pb-14 md:px-10 lg:px-16">
        <FreeToolRelated currentHref="/compare-stocks" />
      </div>
    </main>
  );
}
