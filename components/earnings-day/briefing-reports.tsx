import Link from "next/link";

import { ToneGlyph } from "@/components/oa/kit/tone";
import { StockLogo } from "@/components/stock-logo";
import { recentReportsFor } from "@/lib/earnings-day";
import { EARNINGS_DAY_FRESH_DAYS, briefingItemFor, type EarningsDayBriefingItem } from "@/lib/earnings-day-shared";
import { getViewer, isCovered } from "@/lib/entitlements-server";

/**
 * "Earnings came out": the reports from the last few days for the stocks a
 * signed-in person holds or watches, inside their briefing. The read follows
 * `briefing_personal`: covered stocks (every stock on Pro) get the headline and
 * two lines; an uncovered one on Free gets the title and the link only, so the
 * read never reaches the browser. Renders nothing when nobody reported.
 */
export async function EarningsDayBriefing() {
  const viewer = await getViewer().catch(() => null);
  if (!viewer?.signedIn || viewer.tracked.length === 0) return null;
  const reports = await recentReportsFor(viewer.tracked, EARNINGS_DAY_FRESH_DAYS).catch(() => []);
  if (reports.length === 0) return null;
  const items = reports.map((report) => briefingItemFor(report, isCovered(viewer, report.ticker)));
  return <EarningsDayBriefingList items={items} />;
}

export function EarningsDayBriefingList({ items }: { items: EarningsDayBriefingItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="earnings-out-label" className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-oa-border px-4 py-2">
        <h2 id="earnings-out-label" className="oa-label">
          Earnings came out
        </h2>
        <span className="oa-mono text-[12.5px] tabular-nums text-oa-muted-fg">{items.length}</span>
      </div>
      <ul data-track-links="briefing_item_opened" data-track-kind="earnings_report" className="divide-y divide-oa-border">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} prefetch={false} className="group grid grid-cols-[12px_minmax(0,1fr)] gap-x-3 px-4 py-3 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent sm:grid-cols-[12px_minmax(0,1fr)_auto]">
              <ToneGlyph tone={item.tone} className="mt-[7px]" />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-oa-fg">
                    <StockLogo ticker={item.ticker} size={18} />
                    <span className="tabular-nums">{item.ticker}</span>
                  </span>
                  <span className="text-pretty text-[14px] leading-5 text-oa-fg">{item.headline ?? item.title}</span>
                </span>
                {item.insights.length ? (
                  <span className="mt-1 block text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{item.insights.map((insight) => insight.text).join(" ")}</span>
                ) : null}
                {!item.covered ? (
                  <span className="mt-1 block text-[12.5px] leading-[18px] text-oa-muted-fg">Your briefing explains the stocks your agent covers. The full report is open to read.</span>
                ) : null}
              </span>
              <span className="col-start-2 mt-1.5 whitespace-nowrap text-[13px] font-medium text-oa-primary group-hover:underline sm:col-start-3 sm:row-start-1 sm:mt-0">
                Read the report →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
