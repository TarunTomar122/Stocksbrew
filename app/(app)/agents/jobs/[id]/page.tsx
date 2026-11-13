import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JobActions } from "@/components/agent-recipes/job-actions";
import { JobHistory } from "@/components/agent-recipes/job-history";
import { RunReport } from "@/components/agents-jobs/run-list";
import { SignInButton } from "@/components/briefing/sign-in-button";
import { LockCard } from "@/components/oa/gate";
import { AppPage, Empty, PageHead, Panel } from "@/components/oa/kit";
import { jobDisplayName, triggerLabel } from "@/lib/agent-jobs";
import { agentMarketDay, getJob, listJobRuns, listJobs } from "@/lib/agent-jobs-data";
import { presentRun } from "@/lib/agent-jobs-present";
import { historyRows } from "@/lib/agent-recipes/view";
import { afterCloseDayWords, afterCloseTimeEt, nextAfterCloseRun } from "@/lib/agent-schedule";
import { getSessionUser } from "@/lib/auth-server";
import { runningBasketCount } from "@/lib/basket-agent/count";
import { capitalize, dayWords } from "@/lib/day-words";
import { limitFor } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agent",
  robots: { index: false },
};

type Props = { params: { id: string } };

/**
 * One standing job's own page: its rule, the latest thing it found, and every check it made, one dated line each,
 * including the quiet ones ("Checked NVDA filings: nothing new").
 */
export default async function AgentJobPage({ params }: Props) {
  const session = await getSessionUser().catch(() => null);
  if (!session) {
    return (
      <AppPage width="wide" className="max-w-[68rem]">
        <PageHead title="Agent" />
        <Empty title="Sign in to see your agent.">
          <SignInButton label="Sign in" />
        </Empty>
      </AppPage>
    );
  }
  const job = await getJob(session.uid, params.id);
  if (!job) notFound();
  const today = agentMarketDay();
  const [runs, viewer, jobs, baskets] = await Promise.all([
    listJobRuns(session.uid, job.id).catch(() => []),
    getViewer(),
    job.enabled ? Promise.resolve([]) : listJobs(session.uid).catch(() => []),
    job.enabled ? Promise.resolve(0) : runningBasketCount(session.uid).catch(() => 0),
  ]);
  const limit = limitFor("agents", viewer.plan);
  const atLimit = !job.enabled && jobs.filter((other) => other.enabled).length + baskets >= limit;
  const latest = runs[0] ?? null;
  const report = latest && latest.decision === "notify" ? presentRun(latest, job) : null;
  // The latest finding has its own panel above; the history starts after it, so no line is said twice.
  const rows = historyRows(report && report.verdict !== "quiet" ? runs.slice(1) : runs, job, today);
  const next = nextAfterCloseRun(new Date());
  const status = !job.enabled
    ? "Paused"
    : latest
      ? `Checked ${dayWords(latest.day, today)}`
      : `First check ${afterCloseDayWords(next)}, ${afterCloseTimeEt(next)}`;

  return (
    <AppPage width="wide" className="max-w-[68rem]">
      <PageHead
        title={jobDisplayName(job.name)}
        meta={
          <span>
            {triggerLabel(job.trigger)} · {status}
          </span>
        }
        note={false}
        actions={<JobActions id={job.id} enabled={job.enabled} />}
      />

      {atLimit ? <LockCard feature="agents" plan={viewer.plan} trialEligible={viewer.trialEligible} className="mb-4" /> : null}

      <div className="flex min-w-0 flex-col gap-4">
        {report && latest && report.verdict !== "quiet" ? (
          <Panel label={capitalize(dayWords(latest.day, today))}>
            <div className="px-4 py-3">
              <RunReport view={report} />
            </div>
          </Panel>
        ) : null}
        {rows.length > 0 ? (
          <Panel label="What it did" flush>
            <JobHistory rows={rows} />
          </Panel>
        ) : runs.length === 0 ? (
          <Panel label="What it did" flush>
            <p className="px-4 py-3 text-[13.5px] text-oa-muted-fg">
              {job.enabled ? `No checks yet. The first one runs ${afterCloseDayWords(next)}, ${afterCloseTimeEt(next)}.` : "No checks yet. It checks after each close once it is on."}
            </p>
          </Panel>
        ) : null}
      </div>
    </AppPage>
  );
}
