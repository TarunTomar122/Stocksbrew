import type { Metadata } from "next";
import { unstable_cache } from "next/cache";

import { JobsWorkspace } from "@/components/agents-jobs/jobs-workspace";
import { getViewer } from "@/lib/entitlements-server";
import { PlainAgentBox } from "@/components/agents-plain/plain-agent-box";
import { AppPage } from "@/components/oa/kit";
import { AGENT_SAMPLE_JOB, hiddenTemplateIds, parseJobDraft } from "@/lib/agent-jobs";
import { agentMarketDay, listJobs, listRuns, loadFacts, replayDraft, resolveScope } from "@/lib/agent-jobs-data";
import { draftFromParam, type LinkedDraft } from "@/lib/agent-jobs-link";
import { afterCloseDayWords, afterCloseTimeEt, nextAfterCloseRun } from "@/lib/agent-schedule";
import { parseByRules } from "@/lib/agents-plain/parse";
import { plainCatalog } from "@/lib/agents-plain/server";
import { getSessionUser } from "@/lib/auth-server";
import { getCoverage } from "@/lib/seo/family-data";

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
  async (_day: string, watch: string) => {
    const draft = parseJobDraft(sampleFor(watch || null));
    return draft.ok ? replayDraft(null, draft.draft) : null;
  },
  ["agents-sample-replay-v2"],
  { revalidate: 3600 },
);

/** The example shown before someone has a job of their own: a real rule on real prices. */
const SAMPLE = AGENT_SAMPLE_JOB;

/** "Watch MSFT for me" from the landing card: the same big-move rule, on that one stock. */
function sampleFor(watch: string | null) {
  return watch ? { ...SAMPLE, scope: { kind: "tickers", tickers: [watch] } } : SAMPLE;
}

/** A ticker from `?watch=`, or null. Letters, digits, a dot or a dash, as tickers are written. */
function watchParam(value: string | string[] | undefined): string | null {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(raw) ? raw : null;
}

/** A request from a "Watch this for me" link (`?q=`), as plain text the box reads back; nothing is saved from it. */
function askParam(value: string | string[] | undefined): string | null {
  const raw = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return raw ? raw.slice(0, 300) : null;
}

/**
 * The agent a link asked for, filled in before anyone signs in. `?draft=` is a draft the page wrote itself before a
 * sign-in (checked again here like any input); `?q=` is a request in words, read with the fixed rules only (no
 * model, no meter) and used when it reads as exactly one agent. Anything else goes to the box above as words.
 */
async function linkedDraft(draft: string | string[] | undefined, words: string | null, hidden: string[]): Promise<LinkedDraft | null> {
  const fromUrl = draftFromParam(draft, hidden);
  if (fromUrl) return { draft: fromUrl };
  if (!words) return null;
  const catalog = await plainCatalog().catch(() => null);
  if (!catalog || catalog.byTicker.size === 0) return null;
  const rules = parseByRules(words, catalog, { hidden });
  if (!rules.confident || rules.spec.watches.length !== 1 || rules.spec.cannot.length > 0) return null;
  const watch = rules.spec.watches[0]!;
  return { draft: watch.draft, note: watch.note };
}

export default async function AgentJobsPage({
  searchParams,
}: {
  searchParams?: { job?: string | string[]; watch?: string | string[]; q?: string | string[]; draft?: string | string[] };
}) {
  const session = await getSessionUser().catch(() => null);
  const focus = typeof searchParams?.job === "string" ? searchParams.job : null;
  const hidden = hiddenTemplateIds();
  const words = askParam(searchParams?.q);
  const next = nextAfterCloseRun(new Date());
  const schedule = { time: afterCloseTimeEt(next), next: afterCloseDayWords(next) };
  // Only a stock we follow: an unknown ticker would replay nothing and still be named, and every string would be a cache entry.
  const asked = watchParam(searchParams?.watch);
  const watch = asked ? await getCoverage().then((coverage) => (coverage.bySymbol.has(asked) ? asked : null)).catch(() => null) : null;
  const sampleDraft = parseJobDraft(sampleFor(watch));

  const [linked, jobs, runs, sources, scope] = await Promise.all([
    linkedDraft(searchParams?.draft, words, hidden).catch(() => null),
    session ? listJobs(session.uid).catch(() => []) : [],
    session ? listRuns(session.uid).catch(() => []) : [],
    availableSources(agentMarketDay()).catch(() => ({ fund_filings: false, congress: false, insiders: false, earnings: false, movers: false })),
    session ? resolveScope(session.uid, { kind: "watchlist" }).catch(() => ({ tickers: [], levels: {} })) : { tickers: [], levels: {} },
  ]);
  // The example is for signed-out visitors, or anyone who came to watch one stock; it is always labelled as an example.
  // A visitor who came with an agent of their own sees that one instead, so the example is not read at all.
  const sample =
    !linked && (!session || watch) && sampleDraft.ok
      ? await sampleReplay(agentMarketDay(), watch ?? "")
          .then((replay) => (replay ? { draft: sampleDraft.draft, replay } : null))
          .catch(() => null)
      : null;

  return (
    <AppPage width="wide" className="max-w-[68rem]">
        <JobsWorkspace
          signedIn={Boolean(session)}
          plan={session ? (await getViewer()).plan : "anon"}
          initialJobs={jobs}
          initialRuns={runs}
          available={sources}
          tracked={scope.tickers.length}
          levels={scope.levels}
          today={agentMarketDay()}
          focusJobId={focus}
          sample={sample}
          linked={linked}
          schedule={schedule}
          hiddenTemplates={hidden}
          lead={<PlainAgentBox signedIn={Boolean(session)} available={sources} prefill={linked ? null : words} />}
        />
    </AppPage>
  );
}
