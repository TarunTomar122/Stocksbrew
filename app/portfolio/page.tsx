import { PortfolioAnalyzer } from "@/components/portfolio-analyzer";
import { FreeToolBreadcrumb, FreeToolRelated } from "@/components/marketing/free-tool-chrome";
import { getSearchIndex } from "@/lib/search";
import { getCurrentMarket } from "@/lib/market";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Portfolio Analyzer | stocksbrew",
  description:
    "Analyze your stock portfolio for free. Paste tickers, search, or upload a screenshot to get sector allocation, factor tilt, risk flags, and opportunities.",
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
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 pt-8 md:px-10 lg:px-16">
        <FreeToolBreadcrumb title="Portfolio Analyzer" />
      </div>
      <PortfolioAnalyzer searchIndex={searchIndex} />
      <div className="mx-auto w-full max-w-screen-2xl px-6 pb-14 md:px-10 lg:px-16">
        <FreeToolRelated currentHref="/portfolio" />
      </div>
    </main>
  );
}
