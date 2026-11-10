import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { interTight } from "@/components/oa/font";
import { TheRead } from "@/components/oa/insight";
import { PageHead, PageNote } from "@/components/oa/kit";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { StockLogo } from "@/components/stock-logo";
import { getSessionUser } from "@/lib/auth-server";
import { getFilings, getFilingsMeta, getFilingsStream } from "@/lib/filings";
import { buildFilingsRead } from "@/lib/filings-insights";
import { getInsiderBuys, getInsiderTrades } from "@/lib/follow";
import {
  FILING_GROUPS,
  FILING_GROUP_HINTS,
  type Filing,
  type FilingGroup,
  filingTime,
  groupFilingsByDay,
  parseFilingGroup,
} from "@/lib/filings-shared";
import { getTrackedStocks } from "@/lib/watchlist";
import { ogImage } from "@/lib/og/url";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const shareImage = ogImage(["page", "filings"], "New SEC filings, in plain words", { daily: true });
  return {
    title: "SEC Filings Today: New 8-K, 10-Q and 10-K Filings in Plain Words",
    description:
      "New 8-K, 10-Q, 10-K, S-1 and 13D/G filings for US stocks as the SEC accepts them, with every 8-K item code translated into plain words.",
    alternates: { canonical: "/filings" },
    openGraph: { title: "SEC Filings Today: New 8-K, 10-Q and 10-K Filings in Plain Words · stocksbrew", url: "https://www.stocksbrew.online/filings", images: [shareImage] },
    twitter: { card: "summary_large_image", images: [shareImage] },
  };
}

const PAGE_SIZE = 150;
const MAX_ROWS = 900;

type Search = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function hrefFor(group: FilingGroup | null, mine: boolean, rows?: number): string {
  const params = new URLSearchParams();
  if (group) params.set("form", group === "13D/G" ? "13DG" : group);
  if (mine) params.set("mine", "1");
  if (rows && rows > PAGE_SIZE) params.set("rows", String(rows));
  const query = params.toString();
  return query ? `/filings?${query}` : "/filings";
}

const CHIP =
  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[14px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] lg:h-8";
const CHIP_ON = "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-card font-medium text-oa-fg";
const CHIP_OFF = "border-oa-border text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg";

/** The form type as plain mono text: it is on every row, so it is a column, not a badge. */
function FormBadge({ filing }: { filing: Filing }) {
  return (
    <span title={FILING_GROUP_HINTS[filing.group]} className="oa-mono shrink-0 text-[12.5px] font-medium text-oa-fg">
      {filing.group}
      {filing.amendment ? "/A" : ""}
    </span>
  );
}

/** Time, who, which form, what it says. The whole stream opens sec.gov, so no row carries an arrow. */
function FilingRow({ filing }: { filing: Filing }) {
  const lead = filing.headline.replace(/, amended$/, "");
  const extra = filing.items.filter((item) => item.label !== lead && item.code !== "9.01");
  return (
    <li className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-3 px-4 py-2 transition-colors hover:bg-oa-accent sm:grid-cols-[2.75rem_5.5rem_4.75rem_minmax(0,1fr)] sm:items-baseline lg:grid-cols-[2.75rem_5.5rem_4.75rem_minmax(0,1fr)_15rem]">
      <time dateTime={filing.filedAt} className="oa-mono pt-0.5 text-[12.5px] tabular-nums text-oa-muted-fg sm:pt-0">
        {filingTime(filing.filedAt)}
      </time>
      <div className="flex min-w-0 items-center gap-2 sm:contents">
        <Link
          href={`/stock/${filing.ticker}`}
          className="flex shrink-0 items-center gap-2 self-center rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] sm:min-w-0 sm:shrink"
          title={filing.company}
        >
          <StockLogo ticker={filing.ticker} market="US" size={18} circle className="shrink-0" />
          <span className="oa-mono text-[14px] font-medium text-oa-fg sm:truncate">{filing.ticker}</span>
        </Link>
        <span className="self-center">
          <FormBadge filing={filing} />
        </span>
        <span className="min-w-0 truncate text-[12.5px] text-oa-muted-fg sm:hidden">{filing.company}</span>
      </div>
      <a
        href={filing.url}
        target="_blank"
        rel="noopener noreferrer"
        className="col-start-2 mt-0.5 block min-w-0 rounded py-1 text-[14px] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] sm:col-start-auto sm:mt-0 sm:py-0"
      >
        <span className="font-medium text-oa-fg hover:underline">{filing.headline || filing.form}</span>
        {extra.length > 0 ? (
          <span className="text-[12.5px] text-oa-muted-fg">
            {extra.map((item) => (
              <span key={item.code} className="ml-2 max-sm:ml-0 max-sm:block">
                <span className="oa-mono">{item.code}</span> {item.label}
              </span>
            ))}
          </span>
        ) : null}
      </a>
      <span className="hidden truncate text-right text-[12.5px] text-oa-muted-fg lg:block">{filing.company}</span>
    </li>
  );
}

function StreamSkeleton() {
  return (
    <div className="oa-surface animate-pulse border border-oa-border bg-oa-card">
      {Array.from({ length: 14 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 border-b border-oa-border px-4 py-2.5 last:border-b-0">
          <div className="h-3 w-10 rounded bg-oa-bg" />
          <div className="h-3 w-16 rounded bg-oa-bg" />
          <div className="h-3 flex-1 rounded bg-oa-bg" />
        </div>
      ))}
    </div>
  );
}

async function FilingsStream({ search }: { search: Search }) {
  const group = parseFilingGroup(first(search.form));
  const wantsMine = first(search.mine) === "1";
  const rows = Math.min(MAX_ROWS, Math.max(PAGE_SIZE, Number.parseInt(first(search.rows), 10) || PAGE_SIZE));

  const session = await getSessionUser();
  const tracked = session ? await getTrackedStocks(session.uid).catch(() => []) : [];
  const myTickers = new Set(
    tracked.filter((id) => id.startsWith("US_")).map((id) => id.slice(3).replace(/_/g, ".").toUpperCase()),
  );
  const mine = wantsMine && Boolean(session);

  const [page, meta, stream, trades, buys] = await Promise.all([
    getFilings({ group, tickers: mine ? myTickers : null, limit: rows }).catch(() => null),
    getFilingsMeta().catch(() => null),
    getFilingsStream().catch(() => []),
    getInsiderTrades(1500).catch(() => []),
    getInsiderBuys(400).catch(() => []),
  ]);
  const read = buildFilingsRead({ stream, trades, buys, mine: session && myTickers.size ? myTickers : null, now: Date.now(), asOf: meta?.updatedAt ?? null });

  const total = page ? FILING_GROUPS.reduce((sum, key) => sum + page.counts[key], 0) : 0;
  const days = page ? groupFilingsByDay(page.filings) : [];

  return (
    <>
      <TheRead read={read} />
      {/* One row: the form filter, then whose filings. */}
      <nav aria-label="Filter filings" className="oa-scroll-fade -mx-2 flex items-center gap-2 overflow-x-auto px-4 pr-9 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:flex-wrap [&::-webkit-scrollbar]:hidden">
        <Link href={hrefFor(null, mine)} aria-current={group === null ? "true" : undefined} className={`${CHIP} ${group === null ? CHIP_ON : CHIP_OFF}`}>
          All <span className="oa-mono text-[12.5px] tabular-nums text-oa-muted-fg">{total}</span>
        </Link>
        {FILING_GROUPS.map((key) => (
          <Link
            key={key}
            href={hrefFor(key, mine)}
            aria-current={group === key ? "true" : undefined}
            title={FILING_GROUP_HINTS[key]}
            className={`${CHIP} ${group === key ? CHIP_ON : CHIP_OFF}`}
          >
            <span className="oa-mono">{key}</span>
            <span className="oa-mono text-[12.5px] tabular-nums text-oa-muted-fg">{page?.counts[key] ?? 0}</span>
          </Link>
        ))}
        {session ? (
          <>
            <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-oa-border" />
            <Link href={hrefFor(group, false)} aria-current={!mine ? "true" : undefined} className={`${CHIP} ${!mine ? CHIP_ON : CHIP_OFF}`}>
              Every company
            </Link>
            <Link href={hrefFor(group, true)} aria-current={mine ? "true" : undefined} className={`${CHIP} ${mine ? CHIP_ON : CHIP_OFF}`}>
              My watchlist <span className="oa-mono text-[12.5px] tabular-nums text-oa-muted-fg">{myTickers.size}</span>
            </Link>
          </>
        ) : (
          <Link href="/watchlist" className="ml-auto shrink-0 whitespace-nowrap pl-2 text-[14px] text-oa-muted-fg underline decoration-oa-border underline-offset-2 hover:text-oa-fg max-lg:hidden">
            Sign in to see only your stocks
          </Link>
        )}
      </nav>

      {page === null ? (
        <div className="oa-surface border border-oa-border bg-oa-card px-4 py-10 text-center">
          <p className="text-[15px] font-medium text-oa-fg">Filings are not available right now.</p>
          <p className="mt-1 text-[14px] text-oa-muted-fg">Try again in a few minutes.</p>
        </div>
      ) : days.length === 0 ? (
        <div className="oa-surface border border-oa-border bg-oa-card px-4 py-10 text-center">
          <p className="text-[15px] font-medium text-oa-fg">
            {mine && myTickers.size === 0
              ? "Your watchlist has no US stocks yet."
              : mine
                ? `No ${group ?? ""} filings from your watchlist in the last ${meta?.windowDays ?? 90} days.`.replace("  ", " ")
                : "No filings match this filter."}
          </p>
          <p className="mt-1 text-[14px] text-oa-muted-fg">
            {mine && myTickers.size === 0 ? (
              <Link href="/watchlist" className="underline underline-offset-2">Add stocks to your portfolio</Link>
            ) : (
              <Link href={hrefFor(null, false)} className="underline underline-offset-2">Show every filing</Link>
            )}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {days.map((day) => (
            <section key={day.day} aria-label={day.label} className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
              <h2 className="oa-label sticky top-0 z-[1] flex items-center justify-between border-b border-oa-border bg-oa-bg px-4 py-2">
                <span>{day.label}</span>
                <span className="oa-mono text-[12.5px] font-normal tabular-nums text-oa-muted-fg">{day.filings.length}</span>
              </h2>
              <ul className="divide-y divide-oa-border">
                {day.filings.map((filing) => (
                  <FilingRow key={filing.id} filing={filing} />
                ))}
              </ul>
            </section>
          ))}
          {page.matched > page.filings.length ? (
            <div className="flex items-center justify-center gap-3 py-1">
              <p className="oa-mono text-[12.5px] text-oa-muted-fg">
                {page.filings.length} of {page.matched}
              </p>
              {rows < MAX_ROWS ? (
                <Link
                  href={hrefFor(group, mine, rows + PAGE_SIZE * 2)}
                  scroll={false}
                  className="inline-flex h-9 items-center rounded-full border border-oa-border bg-oa-card px-4 text-[14px] font-medium text-oa-fg hover:border-oa-fg/30"
                >
                  Show more
                </Link>
              ) : null}
            </div>
          ) : null}
          {session ? null : (
            <p className="px-2 text-[14px] leading-5 text-oa-muted-fg sm:px-0 lg:hidden">
              <Link href="/watchlist" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
                Sign in and add stocks
              </Link>{" "}
              to see only the filings from companies you track.
            </p>
          )}
        </div>
      )}
    </>
  );
}

const LEDE = "New SEC filings for US stocks, newest first.";

export default async function FilingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <OaSiteHeader />
      <div className="oa-page-frame mx-auto flex w-full max-w-[84rem] flex-col gap-3 px-2 pb-28 pt-3 sm:px-6 sm:pt-4 lg:pb-12 lg:pt-6">
        <PageHead note={false} className="!mb-0 [&_.oa-head-lede]:hidden" title="Filings" lede={LEDE} />
        <Suspense fallback={<StreamSkeleton />}>
          <FilingsStream search={search} />
        </Suspense>
        <PageNote className="!mt-4" lede={LEDE} />
      </div>
    </main>
  );
}
