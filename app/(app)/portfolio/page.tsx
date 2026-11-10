import { PortfolioAnalyzer } from "@/components/portfolio-analyzer";
import { FreeToolRelated } from "@/components/marketing/free-tool-chrome";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { getSearchIndex } from "@/lib/search";
import { getCurrentMarket } from "@/lib/market";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Portfolio Analyzer",
  description:
    "Analyze your stock portfolio for free. Paste tickers or search by company to get sector allocation, factor tilt, risk flags, and opportunities.",
  alternates: { canonical: "/portfolio" },
  openGraph: {
    title: "Free Portfolio Analyzer | stocksbrew",
    description:
      "Get a full breakdown of your portfolio's sector allocation, factor tilt, risk flags, and opportunities for free.",
    url: "https://www.stocksbrew.online/portfolio",
  },
};

export default async function PortfolioPage() {
  const market = getCurrentMarket();
  const searchIndex = await getSearchIndex(market);

  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <PortfolioAnalyzer searchIndex={searchIndex} />
      <div className="mx-auto w-full max-w-[76rem] px-4 pb-14 sm:px-6">
        <FreeToolRelated currentHref="/portfolio" />
      </div>
    </main>
  );
}
