import Link from "next/link";

import { getStockSummary } from "@/lib/stock";

/**
 * One slim line on the stock page pointing at the full research. No session
 * read, so the stock page stays cached; the research page decides what this
 * person can run. US stocks only (the report reads SEC filings).
 */
export async function ResearchStockEntry({ ticker }: { ticker: string }) {
  const us = await getStockSummary(ticker, "US").catch(() => null);
  if (!us) return null;
  return (
    <div className="mx-auto w-full max-w-[84rem] px-2 pb-3 pt-3 sm:px-6 sm:pt-4">
      <Link
        href={`/stock/${encodeURIComponent(ticker)}/research`}
        prefetch={false}
        data-track="research_entry_clicked"
        data-track-ticker={ticker}
        className="oa-surface group flex items-center gap-3 border border-oa-border bg-oa-card px-3 py-2.5 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-4"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 shrink-0 text-oa-primary" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 2.5h7l3 3v8H3z" />
          <path d="M10 2.5v3h3M5.5 8.5h5M5.5 11h3.5" />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="oa-caption mr-2">Long research report</span>
          <span className="text-pretty text-[14px] font-medium leading-5 text-oa-fg">
            <span className="sm:hidden">A long, sourced report on {ticker}</span>
            <span className="max-sm:hidden">A long, sourced report: the business, the bull and bear case, valuation against peers, and what to watch.</span>
          </span>
        </span>
        <span className="shrink-0 whitespace-nowrap text-[13px] font-medium text-oa-primary group-hover:underline">
          <span className="max-sm:hidden">Get the long report </span>→
        </span>
      </Link>
    </div>
  );
}
