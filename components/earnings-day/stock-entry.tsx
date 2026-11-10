import Link from "next/link";

import { ToneGlyph } from "@/components/oa/kit/tone";
import { latestReportFor } from "@/lib/earnings-day";
import { EARNINGS_DAY_FRESH_DAYS, daysSince, earningsDayHref, toneOfGuidance, toneOfVerdict } from "@/lib/earnings-day-shared";

function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * One slim line on the stock page pointing at the latest earnings report,
 * for about a quarter after it (until the next one replaces it). Renders
 * nothing when there is no report, so the page is unchanged for most stocks.
 */
export async function EarningsDayStockEntry({ ticker }: { ticker: string }) {
  const today = todayET();
  const report = await latestReportFor(ticker, today).catch(() => null);
  if (!report?.read) return null;
  const fresh = daysSince(report.event_date, today) <= EARNINGS_DAY_FRESH_DAYS;
  const verdictTone = toneOfVerdict(report.eps?.verdict);
  const tone = verdictTone !== "flat" ? verdictTone : toneOfGuidance(report.guidance?.change);
  return (
    <div className="mx-auto w-full max-w-[84rem] px-2 pt-3 sm:px-6 sm:pt-4">
      <Link
        href={earningsDayHref(report.ticker, report.event_date)}
        prefetch={false}
        data-track="earnings_report_opened"
        data-track-surface="stock_page"
        className="oa-surface group flex items-center gap-3 border border-oa-border bg-oa-card px-3 py-2.5 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-4"
      >
        <ToneGlyph tone={tone} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="oa-caption mr-2">{fresh ? "Just reported" : "Latest earnings"}</span>
          <span className="text-pretty text-[14px] font-medium leading-5 text-oa-fg">{report.read.headline}</span>
        </span>
        <span className="shrink-0 whitespace-nowrap text-[13px] font-medium text-oa-primary group-hover:underline">
          <span className="max-sm:hidden">Read the report </span>→
        </span>
      </Link>
    </div>
  );
}
