import { AGENT_JOB_ID_RE, describeJob, runDocId, scheduleDue, type AgentDecision, type AgentJob } from "@/lib/agent-jobs";
import { afterCloseRunOn, afterCloseTimeEt } from "@/lib/agent-schedule";
import { fmtPlanDay } from "@/lib/dividend-plan";
import { nextRunDay, previousMarketDay, runnerDay, scheduledRunDay, type AgentsSource } from "@/lib/portfolio-home/log";

/**
 * A person's active watches (their switched-on standing agents) as the My
 * stocks overview and the Today briefing show them: what each one watches in
 * plain words, when it last checked and what it found, and when it checks
 * next. Built only from the jobs and their stored runs (tm_agent_jobs,
 * tm_agent_runs). A next check is named only when the run log proves the
 * after-close runner checked that agent for the last market day it was due
 * (`provenFor`), never for a day it was already run for, and it follows the real schedule (lib/agent-schedule.ts):
 * market days only, and a weekly agent only on its own day. Pure.
 */

type SourceJob = AgentsSource["jobs"][number];
type SourceRun = AgentsSource["runs"][number];

export type WatchLast = {
  day: string;
  /** "Nov 10 at 5:41 PM ET", or the day alone when the run has no time. */
  when: string;
  decision: AgentDecision;
  /** "Nothing to report.", what it found, or that it could not check. */
  outcome: string;
  /** Stocks the run's findings name (empty when it found nothing). */
  tickers: string[];
};

export type ActiveWatch = {
  id: string;
  name: string;
  /** What it watches, as one plain sentence ("Tell me 3 days before NVDA reports earnings."). */
  what: string;
  /** The agent on /agents, opened, with its latest run on top. */
  href: string;
  last: WatchLast | null;
  /** YYYY-MM-DD of the next after-close check; null when nothing proves the runner is running. */
  next: string | null;
};

export type WatchSummary = {
  rows: ActiveWatch[];
  /** Agents the person switched off; not active, only counted. */
  paused: number;
};

/** Most watches a panel lists; it scrolls past about eight. The jobs cap (20) is the real limit. */
export const MAX_WATCH_ROWS = 20;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The agent's page on /agents, opened at its run log. */
export function agentHref(jobId: string): string {
  return `/agents?job=${encodeURIComponent(jobId)}`;
}

/** "Nov 10 at 5:41 PM ET", or the day alone when there is no time. */
export function stampWords(at: string | null, day: string | null): string {
  if (at) {
    const date = new Date(at);
    if (!Number.isNaN(date.getTime()) && at.includes("T")) {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).formatToParts(date);
      const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
      // No-break spaces keep "3:13 PM ET" on one line.
      return `${get("month")} ${get("day")} at ${get("hour")}:${get("minute")} ${get("dayPeriod")} ET`;
    }
  }
  return day && /^\d{4}-\d{2}-\d{2}/.test(day) ? fmtPlanDay(day) : "";
}

/** The run's outcome in one short sentence: "Nothing to report." when it found nothing. */
export function outcomeWords(run: Pick<SourceRun, "decision" | "summary">): string {
  if (run.decision === "nothing") return "Nothing to report.";
  if (run.decision === "could_not_check") return "It could not check this time.";
  const summary = run.summary.trim();
  if (!summary) return "It found something to tell you.";
  return /[.!?]$/.test(summary) ? summary : `${summary}.`;
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Each agent's newest run, by job id. */
export function latestRunByJob(runs: AgentsSource["runs"]): Map<string, SourceRun> {
  const out = new Map<string, SourceRun>();
  for (const run of runs) {
    if (!DAY.test(run.day)) continue;
    const seen = out.get(run.job_id);
    if (!seen || run.day > seen.day || (run.day === seen.day && run.ran_at > seen.ran_at)) out.set(run.job_id, run);
  }
  return out;
}

/**
 * The newest market day the after-close runner is proven to have checked this
 * job for (only runs made after the close count, lib/portfolio-home/log.ts
 * `scheduledRunDay`), or null. A daily job must have been run for the last
 * market day; a weekly one on the last day it was due. A job the runner skips
 * (one past the plan's limit, lib/agent-jobs-data.ts `runAllEnabledJobs`) never
 * gets proof, so it is never promised a check.
 */
export function provenFor(job: Pick<SourceJob, "trigger">, runs: AgentsSource["runs"], today: string): string | null {
  const trigger = job.trigger;
  if (trigger?.type !== "schedule" || trigger.cadence !== "weekly") return runnerDay(runs, today);
  const newest = runs.map(scheduledRunDay).filter((day): day is string => day !== null).sort().pop() ?? null;
  if (!newest) return null;
  // The last market day before today it was due on: its own weekday, the runner's rule with nothing run yet.
  let due = previousMarketDay(today);
  for (let i = 0; i < 10 && !scheduleDue(trigger, due, null); i++) due = previousMarketDay(due);
  return scheduleDue(trigger, due, null) && newest >= due ? newest : null;
}

/**
 * When one agent checks next: the first market day's after-close run that
 * has not already checked it (the runner keeps one run per job per day, so a
 * day it was already run for, by hand or not, is skipped), and for a weekly
 * agent the first of those it is due on (lib/agent-jobs.ts `scheduleDue`, the
 * runner's own rule). Null for a paused agent, or when the runner is not
 * proven to be checking this job (`provenFor`). `runs` are this job's runs.
 */
export function nextCheckFor(job: Pick<SourceJob, "enabled" | "trigger">, runs: AgentsSource["runs"], today: string): string | null {
  if (!job.enabled || !provenFor(job, runs, today)) return null;
  const lastRunDay = runs.map((run) => run.day).filter((day) => DAY.test(day)).sort().pop() ?? null;
  const trigger = job.trigger;
  let day = nextRunDay(today);
  for (let i = 0; i < 21; i++, day = nextRunDay(shiftDay(day, 1))) {
    if (!afterCloseRunOn(day)?.marketDay) continue;
    if (lastRunDay && day <= lastRunDay) continue;
    if (trigger?.type === "schedule" && !scheduleDue(trigger, day, lastRunDay)) continue;
    return day;
  }
  return null;
}

/** "after the close today, from 5:30 PM ET" / "after the close tomorrow" / "after the close on Nov 16". */
export function nextCheckWords(day: string, today: string): string {
  if (day === today) {
    const run = afterCloseRunOn(day);
    return `after the close today${run ? `, from ${afterCloseTimeEt(run)}` : ""}`;
  }
  if (day === shiftDay(today, 1)) return "after the close tomorrow";
  return `after the close on ${fmtPlanDay(day)}`;
}

function whatOf(job: SourceJob): string {
  if (job.trigger && job.scope) return describeJob({ trigger: job.trigger, scope: job.scope });
  return job.name;
}

/** The person's active watches, in the order they made them, each with its newest run and next check. */
export function activeWatches(agents: AgentsSource, today: string): WatchSummary {
  const latest = latestRunByJob(agents.runs);
  const active = agents.jobs.filter((job) => job.enabled);
  const rows = active.slice(0, MAX_WATCH_ROWS).map((job): ActiveWatch => {
    const run = latest.get(job.id) ?? null;
    return {
      id: job.id,
      name: job.name,
      what: whatOf(job),
      href: agentHref(job.id),
      last: run
        ? {
            day: run.day,
            when: stampWords(run.ran_at || null, run.day),
            decision: run.decision,
            outcome: outcomeWords(run),
            tickers: run.decision === "notify" ? [...new Set((run.tickers ?? []).map((ticker) => ticker.toUpperCase()))] : [],
          }
        : null,
      next: nextCheckFor(job, agents.runs.filter((one) => one.job_id === job.id), today),
    };
  });
  return { rows, paused: agents.jobs.length - active.length };
}

/**
 * The newest run of an active agent that flagged `ticker`, for a finding or a
 * briefing line to point at ("Your agent “Big daily moves” flagged NVDA on Nov 10").
 * Only each agent's newest run, and only from the last market day or today, so
 * an old alert is not brought back as news.
 */
export function firedFor(ticker: string | null, agents: AgentsSource, today: string): { job: SourceJob; run: SourceRun } | null {
  if (!ticker) return null;
  const since = previousMarketDay(today);
  const symbol = ticker.toUpperCase();
  const latest = latestRunByJob(agents.runs);
  let best: { job: SourceJob; run: SourceRun } | null = null;
  for (const job of agents.jobs) {
    if (!job.enabled) continue;
    const run = latest.get(job.id);
    if (!run || run.day < since || run.decision !== "notify" || !(run.tickers ?? []).some((t) => t.toUpperCase() === symbol)) continue;
    if (!best || run.day > best.run.day || (run.day === best.run.day && run.ran_at > best.run.ran_at)) best = { job, run };
  }
  return best;
}

/** The tickers a stored run's findings name, upper-cased, in order, no repeats. */
export function runTickers(findings: ReadonlyArray<{ ticker: string | null }> | undefined): string[] {
  const out: string[] = [];
  for (const finding of findings ?? []) {
    const ticker = typeof finding?.ticker === "string" ? finding.ticker.trim().toUpperCase() : "";
    if (ticker && /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker) && !out.includes(ticker)) out.push(ticker);
  }
  return out;
}

/** A stored job, cut down to what the watch views read. */
export function watchJob(job: Pick<AgentJob, "id" | "name" | "enabled" | "trigger" | "scope">): SourceJob {
  return {
    id: job.id,
    name: job.name,
    enabled: job.enabled,
    weekly: job.trigger.type === "schedule" && job.trigger.cadence === "weekly",
    trigger: job.trigger,
    scope: job.scope,
  };
}

/* ── reading stored runs (lib/agent-watch-server.ts) ───────────────────── */

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A stored run, cut down to what the watch views read; null for anything that is not one of this person's runs. */
export function watchRunFromDoc(data: Record<string, unknown> | undefined, uid: string): AgentsSource["runs"][number] | null {
  if (!data || data.uid !== uid) return null;
  const jobId = text(data.job_id);
  const day = text(data.day);
  const decision = data.decision;
  if (!jobId || !DAY.test(day) || (decision !== "notify" && decision !== "nothing" && decision !== "could_not_check")) return null;
  return {
    job_id: jobId,
    job_name: text(data.job_name),
    day,
    ran_at: text(data.ran_at),
    decision,
    summary: text(data.summary),
    tickers: runTickers(Array.isArray(data.findings) ? (data.findings as Array<{ ticker: string | null }>) : []),
  };
}

/** The run document ids worth reading: each job's last checked day, and the last market day (the runner's proof). */
export function runIdsToRead(uid: string, jobs: Array<{ id: string; last_checked_day?: string | null }>, today: string): string[] {
  const proofDays = [today, previousMarketDay(today)];
  const ids = new Set<string>();
  for (const job of jobs) {
    if (!AGENT_JOB_ID_RE.test(job.id)) continue;
    const days = [job.last_checked_day ?? null, ...proofDays].filter((day): day is string => Boolean(day && DAY.test(day)));
    for (const day of days) ids.add(runDocId(uid, job.id, day));
  }
  return [...ids];
}
