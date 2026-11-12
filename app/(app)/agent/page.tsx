import type { Metadata } from "next";
import { Suspense } from "react";

import { BriefingAgentsGhost, BriefingAgentsStrip, BriefingExampleAgents } from "@/components/briefing/agents-strip";
import { AppPage, PageHead } from "@/components/oa/kit";
import { ProposalsSection } from "@/components/proposals/proposals-section";
import { ScrollToToday } from "@/components/thread/scroll-to-today";
import { ThreadComposer } from "@/components/thread/thread-composer";
import { ThreadSkeleton } from "@/components/thread/thread-skeleton";
import { ThreadLinks, ThreadView } from "@/components/thread/thread-view";
import { loadWatches } from "@/lib/agent-watch-server";
import { loadProposalCards } from "@/lib/proposals-server";
import { getSessionUser } from "@/lib/auth-server";
import { loadBriefingPage } from "@/lib/briefing-data";
import { loadExampleBriefing } from "@/lib/briefing-example";
import { viewerFromUserDoc } from "@/lib/entitlements-server";
import { newYorkToday } from "@/lib/portfolio-data";
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

/** The conversation on the left; the agents and the pages it draws from in the rail (owner rule 10). */
function Layout({ thread, signedIn, rail, lead = null }: { thread: Thread; signedIn: boolean; rail: React.ReactNode; lead?: React.ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-x-6">
      <div className="flex min-w-0 flex-col gap-4">
        {thread.example ? (
          <p className="min-w-0 px-1 text-pretty text-[14px] leading-5 text-oa-muted-fg">
            {EXAMPLE_TAG}
            This is the example portfolio&apos;s agent, writing about real moves in its stocks. Sign in and it writes about yours.
          </p>
        ) : null}
        {lead}
        <ThreadView thread={thread} />
        <ThreadComposer signedIn={signedIn} example={thread.example} suggestions={threadSuggestions(thread)} />
        <ScrollToToday />
      </div>
      <aside className="hidden min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:flex">
        {rail}
        <ThreadLinks example={thread.example} />
      </aside>
    </div>
  );
}

async function ExampleThread() {
  const thread = await loadExampleThread({ briefing: () => loadExampleBriefing() });
  const rail = (
    <Suspense fallback={<BriefingAgentsGhost />}>
      <BriefingExampleAgents today={newYorkToday()} />
    </Suspense>
  );
  return <Layout thread={thread} signedIn={false} rail={rail} />;
}

async function MemberThread({ uid }: { uid: string }) {
  const today = newYorkToday();
  // The rail's one read starts now (loadWatches is React-cached on uid and day), beside the thread's own reads.
  void loadWatches(uid, today).catch(() => null);
  // The agent's proposals are worked out beside the thread's reads, bounded from now (lib/proposals-server.ts).
  const proposals = loadProposalCards(uid).catch(() => null);
  const doc = await getUserDoc(uid).catch(() => null);
  const viewer = viewerFromUserDoc(uid, doc);
  const thread = await loadMemberThread({ doc, viewer, briefing: () => loadBriefingPage({ persist: false }) });
  const rail = (
    <Suspense fallback={<BriefingAgentsGhost />}>
      <BriefingAgentsStrip uid={uid} today={today} inBriefing={[]} portfolio={thread.stocks > 0} />
    </Suspense>
  );
  // "Waiting for you": the agent's proposals lead the page, rendered with the thread (so nothing shifts in later and
  // the scroll to today sees them).
  const lead = <ProposalsSection load={proposals} />;
  return <Layout thread={thread} signedIn rail={rail} lead={lead} />;
}

async function AgentBody() {
  const session = await getSessionUser().catch(() => null);
  return session ? <MemberThread uid={session.uid} /> : <ExampleThread />;
}

export default function AgentPage() {
  return (
    <AppPage>
      <PageHead title="Your agent" />
      <Suspense fallback={<ThreadSkeleton />}>
        <AgentBody />
      </Suspense>
    </AppPage>
  );
}
