import type { Metadata } from "next";
import Link from "next/link";

import { StockDirectorySchema } from "@/components/seo/stock-directory-schema";
import {
  FEATURED_STOCK_TICKERS,
  SEO_STOCK_PAGES,
  type SeoStockPage,
} from "@/lib/seo/stock-pages";

export const metadata: Metadata = {
  title: "US Stocks: Analysis & Research",
  description:
    "Browse current stock analysis for 100 widely followed US companies. Find prices, valuation, growth, earnings, analyst context, risks, and recent news by ticker.",
  keywords: [
    "US stocks",
    "US stock analysis",
    "stock research",
    "stock analysis by ticker",
    "American stocks",
  ],
  alternates: { canonical: "/stocks" },
  openGraph: {
    title: "US Stocks: Analysis & Research · stocksbrew",
    description:
      "Browse company-specific analysis for 100 widely followed US stocks, organized by sector and ticker.",
    url: "https://www.stocksbrew.online/stocks",
  },
  twitter: {
    card: "summary_large_image",
    title: "US Stocks: Analysis & Research · stocksbrew",
    description:
      "Browse company-specific analysis for 100 widely followed US stocks, organized by sector and ticker.",
  },
};

const featured = FEATURED_STOCK_TICKERS
  .map((ticker) => SEO_STOCK_PAGES.find((stock) => stock.ticker === ticker))
  .filter((stock): stock is SeoStockPage => Boolean(stock));

const bySector = [...SEO_STOCK_PAGES.reduce((map, stock) => {
  const label = stock.sector || "Other";
  const rows = map.get(label) ?? [];
  rows.push(stock);
  map.set(label, rows);
  return map;
}, new Map<string, SeoStockPage[]>())].sort(([a], [b]) => a.localeCompare(b));

export default function StocksDirectoryPage() {
  return (
    <main className="flex-grow">
      <StockDirectorySchema stocks={SEO_STOCK_PAGES} />
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-12 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <header className="max-w-4xl">
          <nav aria-label="Breadcrumb" className="text-[12px] text-on-surface-variant">
            <Link href="/" className="hover:text-on-surface">Home</Link>
            <span className="px-2">/</span>
            <span className="text-on-surface">US stocks</span>
          </nav>
          <p className="mt-8 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-landing-brand">
            Stock directory
          </p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-[-0.04em] text-on-surface md:text-6xl">
            US stocks, analyzed by ticker.
          </h1>
          <p className="mt-5 max-w-3xl text-[16px] leading-7 text-on-surface-variant">
            Open a company page for the latest available price, returns, valuation, growth,
            analyst context, earnings, risks, and recent headlines. This directory focuses on
            100 widely followed US-listed companies with enough data for a useful research page.
          </p>
        </header>

        <section aria-labelledby="popular-us-stocks">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-outline-variant pb-3">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-landing-brand">
                Popular research
              </p>
              <h2 id="popular-us-stocks" className="mt-1 text-2xl font-bold tracking-[-0.025em] text-on-surface">
                Start with the most-followed US stocks
              </h2>
            </div>
            <Link href="/compare-stocks" className="text-[13px] font-semibold text-landing-brand hover:underline">
              Compare up to five stocks →
            </Link>
          </div>
          <div className="grid divide-y divide-outline-variant sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            {featured.map((stock) => (
              <Link
                key={stock.ticker}
                href={`/stock/${stock.ticker}`}
                className="group flex min-h-28 flex-col justify-between gap-3 px-1 py-5 sm:px-5"
              >
                <span className="font-mono text-sm font-bold text-landing-brand">{stock.ticker}</span>
                <span>
                  <span className="block text-[15px] font-semibold text-on-surface group-hover:underline">{stock.name}</span>
                  <span className="mt-1 block text-[12px] text-on-surface-variant">{stock.industry || stock.sector}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="stocks-by-sector" className="flex flex-col gap-10">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-landing-brand">
              Research universe
            </p>
            <h2 id="stocks-by-sector" className="mt-1 text-2xl font-bold tracking-[-0.025em] text-on-surface">
              Browse US stocks by sector
            </h2>
            <p className="mt-2 text-[14px] text-on-surface-variant">
              Company pages are ordered alphabetically by ticker inside each sector.
            </p>
          </div>

          {bySector.map(([sector, stocks]) => (
            <section key={sector} aria-labelledby={`sector-${sector.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}>
              <div className="flex items-baseline justify-between gap-4 border-b border-outline-variant pb-2">
                <h3
                  id={`sector-${sector.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                  className="text-lg font-bold text-on-surface"
                >
                  {sector}
                </h3>
                <span className="font-mono text-[11px] text-on-surface-variant">{stocks.length} stocks</span>
              </div>
              <ul className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {stocks.map((stock) => (
                  <li key={stock.ticker} className="border-b border-outline-variant">
                    <Link
                      href={`/stock/${stock.ticker}`}
                      className="group flex items-start gap-3 py-3 pr-4"
                    >
                      <span className="w-14 shrink-0 font-mono text-[12px] font-bold text-landing-brand">
                        {stock.ticker}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-on-surface group-hover:underline">
                          {stock.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-on-surface-variant">
                          {stock.industry || stock.exchange}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </section>

        <section className="border-y border-outline-variant py-8">
          <h2 className="text-xl font-bold text-on-surface">How to use a stock analysis page</h2>
          <ol className="mt-4 grid gap-5 text-[14px] leading-6 text-on-surface-variant md:grid-cols-3">
            <li><strong className="text-on-surface">1. Check freshness.</strong> Price data changes faster than annual fundamentals. Read the timestamp before interpreting a move.</li>
            <li><strong className="text-on-surface">2. Separate fact from view.</strong> Verify filings and earnings facts, then examine valuation, analyst context, drivers, and risks.</li>
            <li><strong className="text-on-surface">3. Compare alternatives.</strong> A stock rarely makes sense in isolation. Compare growth, valuation, quality, and risk with sector peers.</li>
          </ol>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-semibold text-landing-brand">
            <Link href="/sectors" className="hover:underline">Browse sectors</Link>
            <Link href="/earnings" className="hover:underline">Earnings calendar</Link>
            <Link href="/news" className="hover:underline">US stock market news</Link>
            <Link href="/blog/fundamental-stock-analysis-framework" className="hover:underline">Read the analysis framework</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
