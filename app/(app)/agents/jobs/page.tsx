import type { Metadata } from "next";
import { unstable_cache } from "next/cache";

import { JobsWorkspace } from "@/components/agents-jobs/jobs-workspace";
import { AppPage } from "@/components/oa/kit";
import { parseJobDraft } from "@/lib/agent-jobs";
import { agentMarketDay, listJobs, listRuns, loadFacts, replayDraft, resolveScope } from "@/lib/agent-jobs-data";
import { getSessionUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agents",
  description:
    "Agents that watch your stocks on a schedule, on an event or on a price, and report back in one line: what happened and whether it needs you. Replay one on the last four weeks before you switch it on.",
  alternates: { canonical: "/agents" },
};

// Both of these are the same for every visitor on a given market day, and
// each costs several store reads. Compute them once per day, not per request.
// They throw on failure so a failed read is never the cached answer.
const availableSources = unstable_cache(
  async (day: string) => (await loadFacts([], { end: day })).facts.available,
  ["agents-available-sources-v1"],
  { revalidate: 900 },
);

const sampleReplay = unstable_cache(
  async (_day: string) => {
    const draft = parseJobDraft(SAMPLE);
    return draft.ok ? replayDraft(null, draft.draft) : null;
  },
  ["agents-sample-replay-v1"],
  { revalidate: 3600 },
);

/** The example shown before someone has a job of their own: a real rule on real prices. */
const SAMPLE = {
  template: "big-move",
  scope: { kind: "tickers", tickers: ["NVDA", "AAPL", "MSFT", "AMZN", "TSLA"] },
  trigger: { pct: 4 },
};

export default async function AgentJobsPage({ searchParams }: { searchParams?: { job?: string | string[] } }) {
  const session = await getSessionUser().catch(() => null);
  const focus = typeof searchParams?.job === "string" ? searchParams.job : null;
  const sampleDraft = parseJobDraft(SAMPLE);

  const [jobs, runs, sources, scope] = await Promise.all([
    session ? listJobs(session.uid).catch(() => []) : [],
    session ? listRuns(session.uid).catch(() => []) : [],
    availableSources(agentMarketDay()).catch(() => ({ fund_filings: false, congress: false, insiders: false, earnings: false, movers: false })),
    session ? resolveScope(session.uid, { kind: "watchlist" }).catch(() => ({ tickers: [], levels: {} })) : { tickers: [], levels: {} },
  ]);
  // The example is for signed-out visitors; it is always labelled as an example.
  const sample =
    !session && sampleDraft.ok
      ? await sampleReplay(agentMarketDay())
          .then((replay) => (replay ? { draft: sampleDraft.draft, replay } : null))
          .catch(() => null)
      : null;

  return (
    <AppPage width="wide" className="max-w-[68rem]">
        <JobsWorkspace
          signedIn={Boolean(session)}
          initialJobs={jobs}
          initialRuns={runs}
          available={sources}
          tracked={scope.tickers.length}
          levels={scope.levels}
          today={agentMarketDay()}
          focusJobId={focus}
          sample={sample}
        />
    </AppPage>
  );
}
