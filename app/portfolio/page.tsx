import { PortfolioAnalyzer } from "@/components/portfolio-analyzer";
import { getSearchIndex } from "@/lib/search";
import { getCurrentMarket } from "@/lib/market";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Portfolio Analyzer | stocksbrew",
  description:
    "Analyze your stock portfolio for free. Paste tickers, search, or upload a screenshot to get sector allocation, factor tilt, risk flags, and opportunities.",
  openGraph: {
    title: "Free Portfolio Analyzer | stocksbrew",
    description:
      "Get a full breakdown of your portfolio's sector allocation, factor tilt, risk flags, and opportunities for free.",
  },
};

export default async function PortfolioPage() {
  const market = getCurrentMarket();
  const searchIndex = await getSearchIndex(market);

  return (
    <main className="flex-grow">
      <PortfolioAnalyzer searchIndex={searchIndex} />
    </main>
  );
}
