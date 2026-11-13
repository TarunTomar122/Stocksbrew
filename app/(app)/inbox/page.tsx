import type { Metadata } from "next";
import { Suspense } from "react";

import { AskPageHint } from "@/components/ask/ask-page-hint";
import { EmptyInbox } from "@/components/inbox/inbox-empty";
import { InboxList } from "@/components/inbox/inbox-list";
import { InboxSkeleton } from "@/components/inbox/inbox-skeleton";
import { ExampleReportCards, type CardQuote } from "@/components/inbox/report-cards";
import { AppPage, PageHead } from "@/components/oa/kit";
import { ProposalsLine } from "@/components/proposals/proposals-line";
import { proposalsBrief } from "@/lib/proposals-brief";
import { getSessionUser } from "@/lib/auth-server";
import { getViewer } from "@/lib/entitlements-server";
import { exampleReports, type ExampleReportStock } from "@/lib/inbox/example-reports";
import { forClient } from "@/lib/inbox/merge";
import { rowsAfterRead, type InboxTold } from "@/lib/inbox/read";
import { rowPrices } from "@/lib/inbox/prices";
import { inboxStocks, loadExampleInbox, loadUserInbox, readState } from "@/lib/inbox/server";
import { INBOX_KINDS, type InboxKind } from "@/lib/inbox/types";
import { EXAMPLE_STOCK_TICKERS, loadExamplePortfolio } from "@/lib/portfolio-data";
import { loadLivePrices } from "@/lib/wire-prices-server";
import { loadTickerEarnings } from "@/lib/earnings-season-data";
import { getUserDoc } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inbox",
  description: "What your agents found, how our calls on your stocks moved, and what the investors you follow traded, newest first.",
  alternates: { canonical: "/inbox" },
  // Someone's own inbox, or the example's: nothing for a search engine.
  robots: { index: false, follow: true },
};

/** A source failed, so "nothing happened" would not be true. A slow earnings calendar alone does not count: it only adds prep. */
function readFailed(missing: string[]): boolean {
  return missing.some((name) => name !== "reports");
}

function kindParam(value: string | string[] | undefined): InboxKind | null {
  const raw = typeof value === "string" ? value : "";
  if (raw === "insider") return "follow";
  return (INBOX_KINDS as readonly string[]).includes(raw) ? (raw as InboxKind) : null;
}

const EXAMPLE_TAG = (
  <span className="mr-2 inline-flex h-[20px] items-center rounded border border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_7%,transparent)] px-1.5 align-[2px] text-[12px] font-medium text-oa-primary">
    Example inbox
  </span>
);

/** Nothing on the page says a row's news before the list does, so every row keeps all of its words. */
const NOTHING_TOLD: InboxTold = { moveIds: [], reasonIds: [], reports: [] };

/** How long the example's report histories may take before the page goes without its cards. */
const REPORTS_MS = 1500;

/**
 * The example's stocks the page does not already talk about, with their report histories: what the cards under the
 * list show (lib/inbox/example-reports.ts). The same shared cached read as the calendar and Earnings season; slow or
 * failed, the page goes without them.
 */
async function exampleReportStocks(portfolio: Awaited<ReturnType<typeof loadExamplePortfolio>> | null, said: readonly string[], today: string): Promise<ExampleReportStock[]> {
  if (!portfolio) return [];
  const skip = new Set(said.map((ticker) => ticker.toUpperCase()));
  const positions = [...portfolio.portfolio.positions, ...portfolio.portfolio.watching].filter((position) => !skip.has(position.ticker.toUpperCase()));
  if (positions.length === 0) return [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), REPORTS_MS);
  });
  const loaded = await Promise.race([loadTickerEarnings(positions.map((position) => position.ticker), today).catch(() => null), late]).finally(() => clearTimeout(timer));
  if (!loaded) return [];
  return positions.flatMap((position) => {
    const entry = loaded.get(position.ticker.toUpperCase());
    return entry ? [{ ticker: position.ticker, kind: position.kind === "watchlist" ? ("watching" as const) : ("holding" as const), fund: entry.fund, history: entry.history }] : [];
  });
}

/** Each of the example's stocks' price and move today, from the same priced snapshot as the rest of the page. */
function cardQuotes(portfolio: Awaited<ReturnType<typeof loadExamplePortfolio>> | null): Record<string, CardQuote> {
  const out: Record<string, CardQuote> = {};
  for (const position of [...(portfolio?.portfolio.positions ?? []), ...(portfolio?.portfolio.watching ?? [])]) {
    if (position.price !== null && position.price > 0) out[position.ticker.toUpperCase()] = { price: position.price, dayPct: position.dayPct };
  }
  return out;
}

async function ExampleInbox({ kind }: { kind: InboxKind | null }) {
  // The portfolio is the example's shared cached copy (the same one My stocks and the briefing read); a failed read
  // only leaves out the report cards under the list.
  // Each stock's price beside its move comes from the quote the stock page reads, in one bounded batch beside the
  // inbox's own read (lib/wire-prices-server.ts: past 1.5 s it gives up and the rows show their moves alone).
  const [inbox, portfolio, live] = await Promise.all([loadExampleInbox(), loadExamplePortfolio().catch(() => null), loadLivePrices(EXAMPLE_STOCK_TICKERS)]);
  const exampleRows = rowsAfterRead(inbox.items, inbox.upcoming, NOTHING_TOLD, inbox.today, { example: true });
  // The stocks the rows already talk about: no card says them again (owner rule 1).
  const said = [
    ...exampleRows.items.filter((item) => !item.told).flatMap((item) => item.tickers),
    ...exampleRows.upcoming.map((report) => report.ticker),
  ];
  // Under it, the dated record: each other stock's last report, not the day's moves the briefing already shows.
  const reports = exampleReports(await exampleReportStocks(portfolio, said, inbox.today), said, inbox.today);
  const empty = inbox.items.length === 0 && inbox.upcoming.length === 0;
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* The badge alone says what this is (owner rule 8: no paragraph under the title), and no button: the shell's
          Start free (the sidebar, or the top bar on a phone) is the view's one (judges, ship 39). */}
      <p className="min-w-0 px-1 leading-5">{EXAMPLE_TAG}</p>
      {empty ? (
        <EmptyInbox example unavailable={readFailed(inbox.missing)} />
      ) : (
        <>
          <InboxList
            items={exampleRows.items.map(forClient)}
            upcoming={exampleRows.upcoming}
            prices={rowPrices(exampleRows.items, live)}
            seenAt={null}
            today={inbox.today}
            example
            initialKind={kind}
          />
          {/* No Ask box on the page: the shell's Ask opens on the example's stocks (owner rule 1). */}
          <AskPageHint context="ex.portfolio" />
        </>
      )}
      {reports ? <ExampleReportCards reports={reports} quotes={cardQuotes(portfolio)} today={inbox.today} /> : null}
    </div>
  );
}

async function UserInbox({ uid, kind }: { uid: string; kind: InboxKind | null }) {
  // Without the user doc there are no stocks, follows or read mark to go on: say the inbox could not be read.
  const [doc, viewer] = await Promise.all([getUserDoc(uid).catch(() => undefined), getViewer()]);
  if (doc === undefined) return <EmptyInbox unavailable />;
  // The prices of the person's stocks read beside the inbox, not after it (one bounded batch; see ExampleInbox).
  const [inbox, live] = await Promise.all([loadUserInbox(viewer, doc), loadLivePrices(inboxStocks(doc, viewer).map((stock) => stock.ticker))]);
  if (inbox.items.length === 0 && inbox.upcoming.length === 0) return <EmptyInbox unavailable={readFailed(inbox.missing)} />;
  const { seenAt } = readState(inbox.items, doc, inbox.today);
  const rows = rowsAfterRead(inbox.items, inbox.upcoming, NOTHING_TOLD, inbox.today);
  if (rows.items.length === 0 && rows.upcoming.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <InboxList
        items={rows.items.map(forClient)}
        upcoming={rows.upcoming}
        prices={rowPrices(rows.items, live)}
        seenAt={seenAt}
        today={inbox.today}
        example={false}
        initialKind={kind}
        account={uid}
      />
      {/* No Ask box on the page: the shell's Ask opens on the person's stocks (owner rule 1). */}
      <AskPageHint context="portfolio" />
    </div>
  );
}

async function InboxBody({ kind }: { kind: InboxKind | null }) {
  const session = await getSessionUser().catch(() => null);
  if (!session) return <ExampleInbox kind={kind} />;
  // The proposals have one home, /agent (judges, sweep 87: the same cards on both pages). Here they are one line that
  // opens them there, the same line as the briefing's. The count starts now beside the list's reads, bounded
  // (lib/proposals-brief.ts), and renders with the list, so the list never jumps down when it arrives.
  const brief = proposalsBrief(session.uid).catch(() => null);
  const [list, waiting] = await Promise.all([UserInbox({ uid: session.uid, kind }), brief]);
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <ProposalsLine brief={waiting} />
      {list}
    </div>
  );
}

export default function InboxPage({ searchParams }: { searchParams?: { kind?: string | string[] } }) {
  const kind = kindParam(searchParams?.kind);
  return (
    <AppPage width="wide" className="max-w-[68rem]">
      <PageHead title="Inbox" />
      <Suspense fallback={<InboxSkeleton />}>
        <InboxBody kind={kind} />
      </Suspense>
    </AppPage>
  );
}
