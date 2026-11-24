import type { Metadata } from "next";
import { canSeeLevels, getViewer } from "@/lib/entitlements-server";
import { notFound } from "next/navigation";

import { EarningsStats, LastQuarterPanel, PostEarningsRead, PreEarningsRead, ReportHistory, TickerHeadlines } from "@/components/calendar/earnings-detail";
import { AppPage, FOCUS, PageHead, Ticker, fmtDay } from "@/components/oa/kit";
import { loadEarningsDetail, type EarningsDetail } from "@/lib/calendar";
import { calendarHref, fmtEps, parseCalendarFilters, summarizeReports, todayET } from "@/lib/calendar-shared";
import { earningsPageFacts, earningsPageIsIndexable } from "@/lib/seo/earnings-pages";
import { loadWire } from "@/lib/wire";
import { normalizeTicker } from "@/lib/wire-shared";
import { ogImage } from "@/lib/og/url";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Props = { params: { ticker: string } };

function readTicker(raw: string): string | null {
  try {
    return normalizeTicker(decodeURIComponent(raw || ""));
  } catch {
    return null;
  }
}

function pageFacts(detail: EarningsDetail, today: string) {
  const last = detail.lastQuarter;
  return earningsPageFacts(detail.ticker, detail.events, today, (date) => (last && last.item.date === date ? last.revenue : null));
}

/** The search snippet: the next date said as announced or expected, then the last quarter's figures we hold. */
function describe(name: string, detail: EarningsDetail | null, today: string): string {
  const fallback = `${name} earnings: the next report date, past results against estimates, and how the stock moved on each report.`;
  if (!detail) return fallback;
  const next = summarizeReports(detail.events, today).next;
  const parts: string[] = [];
  if (next) {
    const time = next.session === "amc" ? ", after the close" : next.session === "bmo" ? ", before the open" : "";
    parts.push(
      next.estimated
        ? `${name} is expected to report next around ${fmtDay(next.date, true)} (our estimate; not announced yet).`
        : `${name} reports next on ${fmtDay(next.date, true)}${time}.`,
    );
  }
  const last = detail.lastQuarter?.item;
  if (last && last.epsActual !== null && last.epsEstimate !== null) {
    parts.push(`Last quarter: EPS ${fmtEps(last.epsActual)} against ${fmtEps(last.epsEstimate)} expected${last.reaction ? `, stock ${last.reaction.pct >= 0 ? "up" : "down"} ${Math.abs(last.reaction.pct).toFixed(1)}% after` : ""}.`);
  } else if (last?.reaction) {
    parts.push(`The stock moved ${last.reaction.pct >= 0 ? "up" : "down"} ${Math.abs(last.reaction.pct).toFixed(1)}% after its last report.`);
  }
  return parts.length ? parts.join(" ") : fallback;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ticker = readTicker(params.ticker);
  if (!ticker) return { title: "Earnings", robots: { index: false, follow: true } };
  const today = todayET();
  const detail = await loadEarningsDetail(ticker, today).catch(() => null);
  const name = detail?.name && detail.name !== ticker ? `${detail.name} (${ticker})` : ticker;
  // The same rule as the earnings sitemap (lib/seo/earnings-pages.ts): a next date still ahead, announced or
  // estimated, and real figures from the last quarter.
  const facts = detail ? pageFacts(detail, today) : null;
  const indexable = earningsPageIsIndexable(facts, today);
  const description = describe(name, detail, today);
  const title = `${name} Earnings Date, Results and Stock Reaction`;
  return {
    title,
    description,
    alternates: { canonical: `/calendar/earnings/${ticker}` },
    robots: { index: indexable, follow: true },
    // The stock's own card: price, move, our call and the read, which includes the next report when it is close.
    openGraph: { title: `${title} · stocksbrew`, description, url: `https://www.stocksbrew.online/calendar/earnings/${ticker}`, images: [ogImage(["stock", ticker], `${name}: price, today's move and our call`, { daily: true })] },
    twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description, images: [ogImage(["stock", ticker], `${name}: price, today's move and our call`, { daily: true })] },
  };
}

export default async function EarningsDetailPage({ params }: Props) {
  const ticker = readTicker(params.ticker);
  if (!ticker) notFound();
  const today = todayET();

  const [detail, wire] = await Promise.all([loadEarningsDetail(ticker, today), loadWire({ ticker }).catch(() => null)]);
  if (!detail) notFound();

  // The pre-earnings read comes with covering a stock (lib/entitlements.ts: `pre_earnings_read`).
  const entitled = canSeeLevels(await getViewer(), ticker);
  const summary = summarizeReports(detail.events, today);
  const upcomingRead = detail.preRead && detail.preRead.event_date.slice(0, 10) >= today ? detail.preRead : null;
  // The calendar's weeks hold announced dates only, so an estimated one links to the week of the last report instead.
  const anchor = (summary.next && !summary.next.estimated ? summary.next.date : null) ?? summary.last?.date ?? today;
  const headlines = (wire?.items ?? []).filter((item) => item.tickers.includes(ticker)).slice(0, 6);

  return (
    <AppPage>
      <nav aria-label="Breadcrumb" className="oa-mono mb-3 flex flex-wrap items-center gap-x-2 px-2 text-[12px] text-oa-muted-fg sm:px-0">
        <Link prefetch={false} href="/calendar" className={`rounded hover:text-oa-fg hover:underline ${FOCUS}`}>
          Calendar
        </Link>
        <span aria-hidden="true">/</span>
        <Link prefetch={false} href={calendarHref(parseCalendarFilters(undefined, today), today, { center: anchor })} className={`rounded hover:text-oa-fg hover:underline ${FOCUS}`}>
          Week of the report
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-oa-fg">{ticker}</span>
      </nav>
      <PageHead
        label="Earnings"
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Ticker symbol={ticker} size={28} href={null} className="[&>span]:!text-[26px] sm:[&>span]:!text-[30px]" />
            <span className="text-oa-muted-fg">{detail.name !== ticker ? detail.name : "earnings"}</span>
          </span>
        }
        actions={
          <Link prefetch={false}
            href={`/stock/${encodeURIComponent(ticker)}`}
            className={`inline-flex h-9 items-center rounded-md border border-oa-border bg-oa-card px-3 text-[13.5px] font-medium text-oa-fg hover:bg-oa-accent ${FOCUS}`}
          >
            Open the {ticker} report
          </Link>
        }
      />

      <EarningsStats detail={detail} today={today} />

      <LastQuarterPanel detail={detail} today={today} />

      <div className="mb-5">
        <ReportHistory detail={detail} today={today} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* A read written for a report that has already happened is not shown as a pre-read: the result is in the table. */}
          {/* Months ahead of an estimated date there is no read to promise; it appears once one is written. */}
          {summary.next && (!summary.next.estimated || upcomingRead) ? (
            <PreEarningsRead read={entitled ? upcomingRead : null} exists={upcomingRead !== null} forDate={upcomingRead?.event_date?.slice(0, 10) ?? null} />
          ) : null}
          {detail.postRead ? <PostEarningsRead read={detail.postRead} latestReportDate={summary.last?.date ?? null} /> : null}
          {!summary.next && !detail.postRead ? (
            <p className="oa-surface border border-oa-border bg-oa-card px-4 py-3 text-[14px] leading-5 text-oa-muted-fg">
              No earnings write-up for {ticker} yet.
            </p>
          ) : null}
        </div>
        <aside className="flex min-w-0 flex-col gap-5">
          <TickerHeadlines ticker={ticker} items={headlines} />
        </aside>
      </div>
    </AppPage>
  );
}
