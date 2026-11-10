import type { Metadata } from "next";
import { canSeeLevels, getViewer } from "@/lib/entitlements-server";
import { notFound } from "next/navigation";

import { EarningsStats, PostEarningsRead, PreEarningsRead, ReportHistory, TickerHeadlines } from "@/components/calendar/earnings-detail";
import { TheRead } from "@/components/oa/insight";
import { AppPage, FOCUS, PageHead, Ticker } from "@/components/oa/kit";
import { loadEarningsDetail, loadReportContext } from "@/lib/calendar";
import { buildEarningsDetailRead } from "@/lib/calendar-insights";
import { summarizeReports, todayET, weekStart } from "@/lib/calendar-shared";
import { loadWire } from "@/lib/wire";
import { normalizeTicker } from "@/lib/wire-shared";
import { ogImage } from "@/lib/og/url";

export const dynamic = "force-dynamic";

type Props = { params: { ticker: string } };

function readTicker(raw: string): string | null {
  try {
    return normalizeTicker(decodeURIComponent(raw || ""));
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ticker = readTicker(params.ticker);
  if (!ticker) return { title: "Earnings", robots: { index: false, follow: true } };
  const detail = await loadEarningsDetail(ticker).catch(() => null);
  const name = detail?.name && detail.name !== ticker ? `${detail.name} (${ticker})` : ticker;
  const description = `${name} earnings: the next report date and EPS estimate, past results against estimates, and how the stock moved on each report.`;
  // The page is worth indexing when it has something of its own to say: a
  // report date still ahead, or a write-up of a past report. A bare table of
  // old numbers stays out of the index.
  const hasNextDate = detail ? summarizeReports(detail.events, todayET()).next !== null : false;
  const indexable = Boolean(detail) && (hasNextDate || Boolean(detail?.postRead));
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

  const [detail, wire, context] = await Promise.all([
    loadEarningsDetail(ticker),
    loadWire({ ticker }).catch(() => null),
    loadReportContext([ticker], today),
  ]);
  if (!detail) notFound();
  const read = buildEarningsDetailRead({ ticker, name: detail.name, events: detail.events, today, context: context[ticker] });

  // The pre-earnings read comes with covering a stock (lib/entitlements.ts: `pre_earnings_read`).
  const entitled = canSeeLevels(await getViewer(), ticker);
  const summary = summarizeReports(detail.events, today);
  const upcomingRead = detail.preRead && detail.preRead.event_date.slice(0, 10) >= today ? detail.preRead : null;
  const anchor = summary.next?.date ?? summary.last?.date ?? today;
  const headlines = (wire?.items ?? []).filter((item) => item.tickers.includes(ticker)).slice(0, 6);

  return (
    <AppPage>
      <nav aria-label="Breadcrumb" className="oa-mono mb-3 flex flex-wrap items-center gap-x-2 px-2 text-[12px] text-oa-muted-fg sm:px-0">
        <a href="/calendar" className={`rounded hover:text-oa-fg hover:underline ${FOCUS}`}>
          Calendar
        </a>
        <span aria-hidden="true">/</span>
        <a href={`/calendar?w=${weekStart(anchor)}`} className={`rounded hover:text-oa-fg hover:underline ${FOCUS}`}>
          Week of the report
        </a>
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
        lede="Next report, what is expected, past results and how the stock moved."
        actions={
          <a
            href={`/stock/${encodeURIComponent(ticker)}`}
            className={`inline-flex h-9 items-center rounded-md border border-oa-border bg-oa-card px-3 text-[13.5px] font-medium text-oa-fg hover:bg-oa-accent ${FOCUS}`}
          >
            Open the {ticker} report
          </a>
        }
      />

      <TheRead read={read} className="mb-4" />
      <EarningsStats detail={detail} today={today} />

      <div className="mb-5">
        <ReportHistory detail={detail} today={today} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* A read written for a report that has already happened is not shown as a pre-read: the result is in the table. */}
          {summary.next ? (
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
