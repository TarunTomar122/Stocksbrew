import type { Metadata } from "next";
import { Suspense } from "react";

import { FirstLookOffer, FirstLookSlot } from "@/components/first-look/panel";
import { PREVIEW_PARAM } from "@/lib/first-look/state";
import { AppPage, PageHead } from "@/components/oa/kit";
import { ProposalsSection } from "@/components/proposals/proposals-section";
import { ActivityRecord } from "@/components/thread/activity-record";
import { ThreadComposer } from "@/components/thread/thread-composer";
import { ThreadSkeleton } from "@/components/thread/thread-skeleton";
import { ThreadView } from "@/components/thread/thread-view";
import { loadProposalCards } from "@/lib/proposals-server";
import { getSessionUser } from "@/lib/auth-server";
import { getScreenerRows } from "@/lib/screener";
import { loadBriefingPage } from "@/lib/briefing-data";
import { loadExampleBriefing } from "@/lib/briefing-example";
import { viewerFromUserDoc } from "@/lib/entitlements-server";
import { loadConditionRecord } from "@/lib/thesis-watch/condition-record";
import { todayQuietItem } from "@/lib/agent-recipes/quiet-server";
import { buildRecord, type RecordDay } from "@/lib/thread/record";
import { loadExampleThread, loadMemberThread } from "@/lib/thread/server";
import { threadSuggestions } from "@/lib/thread/suggest";
import type { Thread } from "@/lib/thread/types";
import { getUserDoc } from "@/lib/watchlist";
import { etToday } from "@/lib/day-words";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your agent",
  description: "A running note from your agent on your stocks: what moved and why, our call, what is coming up, and the one thing to do next.",
  alternates: { canonical: "/agent" },
  // Someone's own thread, or the example's: nothing for a search engine.
  robots: { index: false, follow: true },
};

const EXAMPLE_TAG = (
  <span className="mr-2 inline-flex h-[20px] items-center rounded border border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_7%,transparent)] px-1.5 align-[2px] text-[12px] font-medium text-oa-primary">
    Example
  </span>
);

/**
 * One column (owner rules 4 and 10: no short side rail): what needs the person (the proposals, with the agent's status
 * beside them), then the dated record of what the agent did, then the box to ask it something.
 */
/**
 * Each stock's latest price for the record's stock-move lines (owner rule 4: the current price beside a move). The
 * thread already read these stocks' screener rows for this request (lib/thread/server.ts sideReads), and the lookup
 * is memoised per request and cached, so this reuses that snapshot rather than adding a read.
 */
/** How long the record waits for its prices before showing the moves without them. */
const PRICES_MS = 800;

async function recordPrices(record: RecordDay[]): Promise<Record<string, number>> {
  const tickers = [...new Set(record.flatMap((day) => day.items.filter((item) => item.ticker && item.figure && item.figure.label !== "price now").map((item) => item.ticker!)))];
  if (tickers.length === 0) return {};
  // Bounded like the thread's own side reads: a slow lookup costs the prices, never the page (owner rule 11).
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), PRICES_MS);
  });
  const rows = await Promise.race([getScreenerRows(tickers).catch(() => null), late]).finally(() => clearTimeout(timer));
  const out: Record<string, number> = {};
  for (const [ticker, row] of rows ?? []) if (typeof row.price === "number" && Number.isFinite(row.price) && row.price > 0) out[ticker] = row.price;
  return out;
}

function Layout({ thread, record, signedIn, lead = null, prices = {} }: { thread: Thread; record: RecordDay[]; signedIn: boolean; lead?: React.ReactNode; prices?: Record<string, number> }) {
  // A thread with nothing to say (no stocks yet, still reading, could not read) keeps the agent's one note saying why;
  // the record still shows what was answered (it comes from the proposals, not the thread), and takes new answers.
  // Ready with nothing listed (only reports coming up, or past checks that found nothing): the record says so itself.
  const noteOnly = thread.status !== "ready";
  return (
    // On a phone the reply box and the tab bar sit over the page's foot: the column ends clear of both.
    <div className="flex min-w-0 flex-col gap-5 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
      {thread.example ? (
        <p className="min-w-0 px-1 text-pretty text-[14px] leading-5 text-oa-muted-fg">
          {EXAMPLE_TAG}
          This is the example portfolio&apos;s agent, writing about real moves in its stocks. Sign in and it writes about yours.
        </p>
      ) : null}
      {lead}
      {noteOnly ? <ThreadView thread={thread} /> : null}
      <ActivityRecord days={record} today={thread.today} prices={prices} empty={noteOnly ? null : "Nothing to report yet. I'll add a line here after my next check."} />
      <ThreadComposer signedIn={signedIn} example={thread.example} suggestions={threadSuggestions(thread)} />
    </div>
  );
}

async function ExampleThread() {
  const thread = await loadExampleThread({ briefing: () => loadExampleBriefing() });
  const record = buildRecord(thread, [], thread.today);
  return <Layout thread={thread} record={record} signedIn={false} prices={await recordPrices(record)} />;
}

/**
 * Today's quiet checks across every agent (jobs, baskets, theses) as one record line, bounded like the prices: a slow
 * read leaves the thread's own line in place (undefined), never the page waiting.
 */
async function agentsQuietLine(uid: string, today: string): Promise<RecordDay["items"][number] | null | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), PRICES_MS);
  });
  return Promise.race([todayQuietItem(uid, today).catch(() => undefined), late]).finally(() => clearTimeout(timer));
}

async function MemberThread({ uid }: { uid: string }) {
  // The agent's proposals (and its status: agents, alerts, next check) are worked out beside the thread's reads,
  // bounded from now (lib/proposals-server.ts loadProposalCards).
  const proposals = loadProposalCards(uid).catch(() => null);
  const doc = await getUserDoc(uid).catch(() => null);
  const viewer = viewerFromUserDoc(uid, doc);
  const [thread, loaded, checked, quiet] = await Promise.all([
    loadMemberThread({ doc, viewer, briefing: () => loadBriefingPage({ persist: false }) }),
    proposals,
    // The report-day checks of the person's measurable lines that held; one small read, never the page's cost.
    loadConditionRecord(viewer, doc, etToday()).catch(() => []),
    agentsQuietLine(uid, etToday()),
  ]);
  // "Needs you" leads; the record below carries each answered proposal's outcome beside the agent's notes.
  const lead = <ProposalsSection load={Promise.resolve(loaded)} statusAlone />;
  const record = buildRecord(thread, loaded?.outcomes ?? [], thread.today, checked, quiet);
  return <Layout thread={thread} record={record} signedIn lead={lead} prices={await recordPrices(record)} />;
}

async function AgentBody() {
  const session = await getSessionUser().catch(() => null);
  return session ? <MemberThread uid={session.uid} /> : <ExampleThread />;
}

export default function AgentPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  // `?first-look=1`: any signed-in person sees the agent's first look on their stocks; nothing is written until a tap.
  const preview = searchParams?.[PREVIEW_PARAM] === "1";
  return (
    <AppPage className="!max-w-[68rem]">
      <PageHead
        title="Your agent"
        inline
        actions={
          <Suspense fallback={null}>
            <FirstLookOffer preview={preview} />
          </Suspense>
        }
      />
      {/* The first look streams on its own, above the thread, for a new person (lib/first-look/state.ts). */}
      <Suspense fallback={null}>
        <FirstLookSlot preview={preview} />
      </Suspense>
      <Suspense fallback={<ThreadSkeleton />}>
        <AgentBody />
      </Suspense>
    </AppPage>
  );
}
