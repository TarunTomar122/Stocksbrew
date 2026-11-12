import type { Metadata } from "next";
import { Suspense } from "react";

import { AppPage, PageHead } from "@/components/oa/kit";
import { ProposalsSection } from "@/components/proposals/proposals-section";
import { ActivityRecord } from "@/components/thread/activity-record";
import { ThreadComposer } from "@/components/thread/thread-composer";
import { ThreadSkeleton } from "@/components/thread/thread-skeleton";
import { ThreadView } from "@/components/thread/thread-view";
import { loadProposalCards } from "@/lib/proposals-server";
import { getSessionUser } from "@/lib/auth-server";
import { loadBriefingPage } from "@/lib/briefing-data";
import { loadExampleBriefing } from "@/lib/briefing-example";
import { viewerFromUserDoc } from "@/lib/entitlements-server";
import { buildRecord, type RecordDay } from "@/lib/thread/record";
import { loadExampleThread, loadMemberThread } from "@/lib/thread/server";
import { threadSuggestions } from "@/lib/thread/suggest";
import type { Thread } from "@/lib/thread/types";
import { getUserDoc } from "@/lib/watchlist";

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
function Layout({ thread, record, signedIn, lead = null }: { thread: Thread; record: RecordDay[]; signedIn: boolean; lead?: React.ReactNode }) {
  // A thread with nothing to say (no stocks yet, still reading, could not read) keeps the agent's one note saying why;
  // the record still shows what was answered (it comes from the proposals, not the thread), and takes new answers.
  const noteOnly = thread.status !== "ready" || thread.days.length === 0;
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
      <ActivityRecord days={record} today={thread.today} />
      <ThreadComposer signedIn={signedIn} example={thread.example} suggestions={threadSuggestions(thread)} />
    </div>
  );
}

async function ExampleThread() {
  const thread = await loadExampleThread({ briefing: () => loadExampleBriefing() });
  return <Layout thread={thread} record={buildRecord(thread, [], thread.today)} signedIn={false} />;
}

async function MemberThread({ uid }: { uid: string }) {
  // The agent's proposals (and its status: agents, alerts, next check) are worked out beside the thread's reads,
  // bounded from now (lib/proposals-server.ts loadProposalCards).
  const proposals = loadProposalCards(uid).catch(() => null);
  const doc = await getUserDoc(uid).catch(() => null);
  const viewer = viewerFromUserDoc(uid, doc);
  const [thread, loaded] = await Promise.all([loadMemberThread({ doc, viewer, briefing: () => loadBriefingPage({ persist: false }) }), proposals]);
  // "Needs you" leads; the record below carries each answered proposal's outcome beside the agent's notes.
  const lead = <ProposalsSection load={Promise.resolve(loaded)} statusAlone />;
  return <Layout thread={thread} record={buildRecord(thread, loaded?.outcomes ?? [], thread.today)} signedIn lead={lead} />;
}

async function AgentBody() {
  const session = await getSessionUser().catch(() => null);
  return session ? <MemberThread uid={session.uid} /> : <ExampleThread />;
}

export default function AgentPage() {
  return (
    <AppPage className="!max-w-[68rem]">
      <PageHead title="Your agent" />
      <Suspense fallback={<ThreadSkeleton />}>
        <AgentBody />
      </Suspense>
    </AppPage>
  );
}
