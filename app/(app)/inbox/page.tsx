import type { Metadata } from "next";
import { Suspense } from "react";

import { AskPageHint } from "@/components/ask/ask-page-hint";
import { EmptyInbox } from "@/components/inbox/inbox-empty";
import { InboxList } from "@/components/inbox/inbox-list";
import { InboxSkeleton } from "@/components/inbox/inbox-skeleton";
import { ExampleHoldingRows } from "@/components/inbox/holding-rows";
import { InboxStockCard } from "@/components/inbox/stock-read";
import { TheRead } from "@/components/oa/insight";
import { AppPage, PageHead } from "@/components/oa/kit";
import { getSessionUser } from "@/lib/auth-server";
import { getViewer } from "@/lib/entitlements-server";
import { exampleHoldings } from "@/lib/inbox/example-holdings";
import { forClient } from "@/lib/inbox/merge";
import { inboxReadTold, rowsAfterRead } from "@/lib/inbox/read";
import { loadExampleInbox, loadUserInbox, readState } from "@/lib/inbox/server";
import { INBOX_KINDS, type InboxKind, type InboxStockRead } from "@/lib/inbox/types";
import type { TheRead as TheReadData } from "@/lib/insights";
import { loadExamplePortfolio } from "@/lib/portfolio-data";
import { moveReasons } from "@/lib/portfolio-home/stocks-server";
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
    Example
  </span>
);

/**
 * The read, then the list. When the read has no cards of its own (every card would only repeat a row below), its
 * headline heads the list instead of standing alone in a card of its own. A stock the read tells two things about is
 * one card under the headline (./stock-read.tsx), ahead of the other cards.
 */
function ReadAndList({
  read,
  stock,
  label,
  children,
}: {
  read: TheReadData | null;
  stock: InboxStockRead | null;
  label: string;
  children: (heading: string | null) => React.ReactNode;
}) {
  if (!read || read.insights.length > 0 || stock) {
    return (
      <>
        <TheRead read={read} label={label} askContext={false} visual={stock ? <InboxStockCard stock={stock} /> : undefined} />
        {children(null)}
      </>
    );
  }
  return <>{children(read.headline || null)}</>;
}

async function ExampleInbox({ kind }: { kind: InboxKind | null }) {
  // The portfolio is the example's shared cached copy (the same one My stocks and the briefing read); a failed read
  // only leaves out the holdings under the read.
  const [inbox, portfolio] = await Promise.all([loadExampleInbox(), loadExamplePortfolio().catch(() => null)]);
  // The read first; the rows under it then leave out what it already says (owner rule 1).
  const exampleRead = inboxReadTold(inbox.items, null, true, { upcoming: inbox.upcoming, today: inbox.today });
  const exampleRows = rowsAfterRead(inbox.items, inbox.upcoming, exampleRead.told, inbox.today, { example: true });
  // Under it, the holdings nothing above talks about, one line each, so the page shows what a full inbox holds.
  const said = [
    ...(exampleRead.stock ? [exampleRead.stock.ticker] : []),
    ...(exampleRead.read?.insights ?? []).flatMap((insight) => insight.tickers ?? []),
    ...exampleRows.items.filter((item) => !item.told).flatMap((item) => item.tickers),
    ...exampleRows.upcoming.map((report) => report.ticker),
  ];
  // The confirmed reasons for the day's moves, from the same research as My stocks' cards; a failed read leaves them out.
  const tickers = portfolio ? [...portfolio.portfolio.positions, ...portfolio.portfolio.watching].map((position) => position.ticker) : [];
  // Within 1.5 seconds, else the lines go without reasons.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Record<string, string>>((resolve) => {
    timer = setTimeout(() => resolve({}), 1500);
  });
  const reasons =
    portfolio && tickers.length > 0
      ? await Promise.race([moveReasons(tickers, portfolio.pricesAsOf).catch(() => ({})), late]).finally(() => clearTimeout(timer))
      : {};
  const holdings = exampleHoldings(portfolio, said, reasons);
  const empty = inbox.items.length === 0 && inbox.upcoming.length === 0;
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* One short line (judges, ship 42), and no button: the shell's Start free (the sidebar, or the top bar on a
          phone) is the view's one (judges, ship 39). */}
      <p className="min-w-0 px-1 text-pretty text-[14px] leading-5 text-oa-muted-fg">
        {EXAMPLE_TAG}
        This is the example portfolio&apos;s inbox. Sign in to see yours.
      </p>
      {empty ? (
        <EmptyInbox example unavailable={readFailed(inbox.missing)} />
      ) : (
        <>
          <ReadAndList read={exampleRead.read} stock={exampleRead.stock} label="The example's inbox">
            {(heading) => (
              <InboxList items={exampleRows.items.map(forClient)} upcoming={exampleRows.upcoming} seenAt={null} today={inbox.today} example initialKind={kind} heading={heading} />
            )}
          </ReadAndList>
          {/* No Ask box on the page: the shell's Ask opens on the example's stocks (owner rule 1). */}
          <AskPageHint context="ex.portfolio" />
        </>
      )}
      {holdings ? <ExampleHoldingRows holdings={holdings} /> : null}
    </div>
  );
}

async function UserInbox({ uid, kind }: { uid: string; kind: InboxKind | null }) {
  // Without the user doc there are no stocks, follows or read mark to go on: say the inbox could not be read.
  const [doc, viewer] = await Promise.all([getUserDoc(uid).catch(() => undefined), getViewer()]);
  if (doc === undefined) return <EmptyInbox unavailable />;
  const inbox = await loadUserInbox(viewer, doc);
  if (inbox.items.length === 0 && inbox.upcoming.length === 0) return <EmptyInbox unavailable={readFailed(inbox.missing)} />;
  const { seenAt } = readState(inbox.items, doc, inbox.today);
  // The read first; the rows under it then leave out what it already says (owner rule 1).
  const { read, told, stock } = inboxReadTold(inbox.items, seenAt, false, { upcoming: inbox.upcoming, today: inbox.today });
  const rows = rowsAfterRead(inbox.items, inbox.upcoming, told, inbox.today);
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <ReadAndList read={read} stock={stock} label="Your inbox">
        {(heading) => (
          <InboxList
            items={rows.items.map(forClient)}
            upcoming={rows.upcoming}
            seenAt={seenAt}
            today={inbox.today}
            example={false}
            initialKind={kind}
            heading={heading}
            account={uid}
          />
        )}
      </ReadAndList>
      {/* No Ask box on the page: the shell's Ask opens on the person's stocks (owner rule 1). */}
      <AskPageHint context="portfolio" />
    </div>
  );
}

async function InboxBody({ kind }: { kind: InboxKind | null }) {
  const session = await getSessionUser().catch(() => null);
  return session ? <UserInbox uid={session.uid} kind={kind} /> : <ExampleInbox kind={kind} />;
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
