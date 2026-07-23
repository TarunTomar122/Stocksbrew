import Link from "next/link";

import { StockPageSchema } from "@/components/seo/stock-page-schema";
import type { StockFacts, StockFundamentals, StockSummary } from "@/lib/stock";
import { stockSeoDescription } from "@/lib/seo/stock-pages";

type Props = {
  stock: StockSummary;
  facts?: StockFacts | null;
  fundamentals?: StockFundamentals | null;
  sectorSlug?: string | null;
  currency: string;
};

function compactMoney(value: number, currency: string): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${currency}${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${currency}${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${currency}${(value / 1_000_000).toFixed(2)}M`;
  return `${currency}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function pct(value?: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function StockSeoSummary({
  stock,
  facts,
  fundamentals,
  sectorSlug,
  currency,
}: Props) {
  const description = stockSeoDescription({
    name: stock.name,
    ticker: stock.ticker,
    sector: stock.sector || "",
    industry: stock.industry || "",
  });
  const marketCap = facts?.quick_stats?.market_cap ?? fundamentals?.market_cap;
  const pe = facts?.quick_stats?.pe_ttm ?? fundamentals?.pe_ttm;
  const revenueGrowth = facts?.financials?.revenue_growth_yoy_pct;
  const captured = stock.captured_at
    ? new Date(stock.captured_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : null;
  const rows = [
    ["Latest available price", `${currency}${stock.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
    ["Day change", pct(stock.day_change_pct)],
    ["Market cap", typeof marketCap === "number" ? compactMoney(marketCap, currency) : null],
    ["P/E (TTM)", typeof pe === "number" && Number.isFinite(pe) ? pe.toFixed(1) : null],
    ["Revenue growth", pct(revenueGrowth)],
    ["Industry", stock.industry || stock.sector || null],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <>
      <StockPageSchema
        ticker={stock.ticker}
        name={stock.name}
        description={description}
        exchange={stock.exchange}
        sector={stock.sector}
        industry={stock.industry}
        updatedAt={stock.captured_at}
      />
      <section className="mx-auto mt-10 w-full max-w-screen-2xl px-6 md:px-10 lg:px-16" aria-labelledby="stock-research-summary">
        <div className="border-t border-outline-variant py-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-landing-brand">
                US stock research
              </p>
              <h2 id="stock-research-summary" className="mt-2 text-2xl font-bold tracking-[-0.025em] text-on-surface">
                About {stock.name} ({stock.ticker}) stock
              </h2>
              <p className="mt-3 max-w-3xl text-[15px] leading-7 text-on-surface-variant">
                {stock.name} trades{stock.exchange ? ` on ${stock.exchange}` : " in the US market"} under the ticker{" "}
                {stock.ticker}. This page brings the latest available price, returns, valuation, growth,
                analyst context, earnings dates, and relevant headlines into one research view. Use the timestamp
                to distinguish current market data from slower-moving fundamentals.
              </p>
              {captured ? (
                <p className="mt-3 text-[12px] text-on-surface-variant">Market snapshot updated {captured}.</p>
              ) : null}
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-l-0 border-outline-variant lg:border-l lg:pl-8">
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
                    {label}
                  </dt>
                  <dd className="mt-1 text-[14px] font-semibold text-on-surface">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-outline-variant pt-5 text-[13px]">
            <Link href="/stocks" className="font-semibold text-landing-brand hover:underline">
              Browse US stocks
            </Link>
            {sectorSlug ? (
              <Link href={`/sector/${sectorSlug}`} className="font-semibold text-landing-brand hover:underline">
                {stock.sector || stock.industry || "Sector"} analysis
              </Link>
            ) : null}
            <Link href="/earnings" className="font-semibold text-landing-brand hover:underline">
              Earnings calendar
            </Link>
            <Link href="/compare-stocks" className="font-semibold text-landing-brand hover:underline">
              Compare stocks
            </Link>
            <Link href="/blog/fundamental-stock-analysis-framework" className="font-semibold text-landing-brand hover:underline">
              Fundamental analysis guide
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
