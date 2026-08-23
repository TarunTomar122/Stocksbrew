import type { Metadata } from "next";
import Link from "next/link";

import { StockDirectorySchema } from "@/components/seo/stock-directory-schema";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { SquircleSurface } from "@/components/oa/squircle";
import { StockLogo } from "@/components/stock-logo";
import {
  FEATURED_STOCK_TICKERS,
  SEO_STOCK_PAGES,
  type SeoStockPage,
} from "@/lib/seo/stock-pages";
import { getSearchIndexForApi } from "@/lib/search";

export const metadata: Metadata = {
  title: "US Stocks: Analysis & Research",
  description:
    "Browse current stock analysis for hundreds of US companies. Find prices, valuation, growth, earnings, analyst context, risks, and recent news by ticker.",
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
      "Browse company-specific analysis for hundreds of US stocks, organized by sector and ticker.",
    url: "https://www.stocksbrew.online/stocks",
  },
  twitter: {
    card: "summary_large_image",
    title: "US Stocks: Analysis & Research · stocksbrew",
    description:
      "Browse company-specific analysis for hundreds of US stocks, organized by sector and ticker.",
  },
};

const featured = FEATURED_STOCK_TICKERS
  .map((ticker) => SEO_STOCK_PAGES.find((stock) => stock.ticker === ticker))
  .filter((stock): stock is SeoStockPage => Boolean(stock));

const H2 = "text-[26px] font-medium tracking-tight text-oa-fg";
const EYEBROW = "text-[11px] font-medium uppercase tracking-[0.14em] text-oa-primary";

export default async function StocksDirectoryPage() {
  const staticTickers = new Set(SEO_STOCK_PAGES.map((stock) => stock.ticker));
  const liveRows = await getSearchIndexForApi("US").catch(() => []);
  const dynamicRows: SeoStockPage[] = liveRows
    .filter((row) => !staticTickers.has(row.ticker))
    .map((row) => ({
      instrumentId: row.instrument_id,
      ticker: row.ticker,
      name: row.name,
      exchange: "",
      sector: "More US stocks",
      industry: "",
      description: "",
    }));
  const directoryStocks = [...SEO_STOCK_PAGES, ...dynamicRows];
  const bySector = [...directoryStocks.reduce((map, stock) => {
    const label = stock.sector || "Other";
    const rows = map.get(label) ?? [];
    rows.push(stock);
    map.set(label, rows);
    return map;
  }, new Map<string, SeoStockPage[]>())].sort(([a], [b]) => a.localeCompare(b));

  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <StockDirectorySchema stocks={directoryStocks} />
      <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-14 px-4 py-10 sm:px-6 sm:py-16">
        <header className="max-w-3xl">
          <nav aria-label="Breadcrumb" className="text-[12px] text-oa-muted-fg">
            <Link href="/" className="hover:text-oa-fg">Home</Link>
            <span className="px-2">/</span>
            <span className="text-oa-fg">US stocks</span>
          </nav>
          <p className={`${EYEBROW} mt-6`}>Stock directory</p>
          <h1 className="mt-3 text-balance font-medium tracking-tight text-oa-fg text-[2.25rem] leading-[1.08] sm:text-5xl sm:leading-[1.05]">
            US stocks, analyzed by ticker.
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-oa-muted-fg sm:text-base">
            Open a company page for the latest available price, returns, valuation, growth,
            analyst context, earnings, risks, and recent headlines. Hundreds of supported
            US-listed companies, each with a useful research page.
          </p>
        </header>

        <section aria-labelledby="popular-us-stocks">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className={EYEBROW}>Popular research</p>
              <h2 id="popular-us-stocks" className={`mt-1 ${H2}`}>Start with the most-followed US stocks</h2>
            </div>
            <Link href="/compare-stocks" className="text-[13px] font-medium text-oa-primary hover:underline">
              Compare up to five stocks →
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map((stock) => (
              <Link key={stock.ticker} href={`/stock/${stock.ticker}`} className="group outline-none">
                <SquircleSurface className="h-full border border-oa-border bg-oa-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all group-hover:-translate-y-0.5 group-hover:border-oa-fg/25 group-hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] group-focus-visible:-translate-y-0.5">
                  <div className="flex items-center gap-2.5">
                    <StockLogo ticker={stock.ticker} size={32} circle />
                    <span className="oa-mono text-[13px] font-medium text-oa-primary">{stock.ticker}</span>
                  </div>
                  <p className="mt-3 truncate text-[14.5px] font-medium leading-5 text-oa-fg group-hover:text-oa-primary transition-colors">
                    {stock.name}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-oa-muted-fg">{stock.industry || stock.sector}</p>
                </SquircleSurface>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="stocks-by-sector" className="flex flex-col gap-8">
          <div>
            <p className={EYEBROW}>Research universe</p>
            <h2 id="stocks-by-sector" className={`mt-1 ${H2}`}>Browse US stocks by sector</h2>
            <p className="mt-2 text-[14px] text-oa-muted-fg">
              Company pages are ordered alphabetically by ticker inside each sector.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            {bySector.map(([sector, stocks]) => (
              <section
                key={sector}
                aria-labelledby={`sector-${sector.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
              >
                <SquircleSurface className="border border-oa-border bg-oa-card p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                  <div className="flex items-baseline justify-between gap-4 px-4 pb-1 pt-3 sm:px-5">
                    <h3
                      id={`sector-${sector.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                      className="text-[16px] font-medium text-oa-fg"
                    >
                      {sector}
                    </h3>
                    <span className="oa-mono text-[11px] text-oa-muted-fg">{stocks.length} stocks</span>
                  </div>
                  <div className="grid grid-cols-1 gap-x-2 px-2 pb-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {stocks.map((stock) => (
                      <Link
                        key={stock.ticker}
                        href={`/stock/${stock.ticker}`}
                        className="group flex items-center gap-2.5 rounded-[14px] px-2.5 py-2.5 transition-colors hover:bg-oa-accent"
                      >
                        <StockLogo ticker={stock.ticker} size={26} circle className="shrink-0" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="oa-mono text-[12px] font-medium text-oa-primary">{stock.ticker}</span>
                          </span>
                          <span className="block truncate text-[13px] font-medium leading-5 text-oa-fg group-hover:text-oa-primary transition-colors">
                            {stock.name}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </SquircleSurface>
              </section>
            ))}
          </div>
        </section>

        <section className="border-t border-oa-border pt-8">
          <h2 className="text-[20px] font-medium tracking-tight text-oa-fg">How to use a stock analysis page</h2>
          <ol className="mt-4 grid gap-5 text-[14px] leading-6 text-oa-muted-fg md:grid-cols-3">
            <li><strong className="text-oa-fg font-medium">1. Check freshness.</strong> Price data changes faster than annual fundamentals. Read the timestamp before interpreting a move.</li>
            <li><strong className="text-oa-fg font-medium">2. Separate fact from view.</strong> Verify filings and earnings facts, then examine valuation, analyst context, drivers, and risks.</li>
            <li><strong className="text-oa-fg font-medium">3. Compare alternatives.</strong> A stock rarely makes sense in isolation. Compare growth, valuation, quality, and risk with sector peers.</li>
          </ol>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-oa-primary">
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
