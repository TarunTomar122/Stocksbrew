/**
 * The landing's loop: one real case told from the request to what happened after, on the example portfolio's own
 * standing agents (lib/agent-sequence-server.ts reads them). Five steps: what was asked, the days the agent checked, what
 * it found, what it decided, and what the stock did next against the S&P 500. Pure, so the case-selection rule and the
 * outcome maths are tested on their own (lib/agent-loop.test.ts).
 *
 * Every figure is stored data, as it stood when the agent acted: the request is the agent's saved trigger, the checks
 * are its stored runs, the finding and the decision (it told you, and when) are the run's own, and the outcome comes
 * from daily closes, starting at the close the run stored as the newest it read. Nothing is worked out again from
 * today's data, nothing is made up, and nothing is worded by a model.
 */

import type { AgentJob } from "@/lib/agent-jobs";
import { RUN_DAYS_SHOWN, runDaysOf, type SequenceRunDay } from "@/lib/agent-sequence";
import { etDayOf } from "@/lib/day-words";
import { usd } from "@/lib/proposals";

/** How many trading days after the decision count as its full outcome. */
export const OUTCOME_SESSIONS = 5;
/** How many closes the "it found" chart shows, ending on the day of the finding. */
export const FOUND_CHART_SESSIONS = 20;

/** The finding kinds the loop can tell: price facts, each with the close it was read from. */
const PRICE_KINDS = new Set(["move", "level"]);

export type LoopPoint = { date: string; close: number };

export type LoopRunInput = {
  id?: string;
  job_id: string;
  day: string;
  ran_at: string;
  decision: string;
  /** The newest close the run read, as stored with it. */
  latest_close?: string | null;
  findings: ReadonlyArray<{
    ticker?: string | null;
    kind?: string;
    headline?: string;
    at?: string;
    change_pct?: number;
    close?: number;
    source?: string;
  }>;
};

export type LoopJobInput = Pick<AgentJob, "id" | "name" | "template" | "trigger" | "scope" | "created_at" | "enabled">;

/** One stored finding the loop could tell: the run that said it, the close it read, and the message it sent. */
export type LoopCandidate = {
  jobId: string;
  runDay: string;
  ranAt: string;
  ticker: string;
  /** The day of the close the finding is about (the chart ends on it). */
  day: string;
  /** The last close the agent had when it told you: the outcome starts here (decisionCloseDay). */
  fromDay: string;
  close: number;
  changePct: number | null;
  source: string;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const ET_CLOCK = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: false });

/** The day before a plain day. */
function dayBefore(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * The last day whose close the agent could have had when it ran: the run's own New York day from 4 PM, the day before
 * it until then (a weekend or holiday falls back to the close before it, through closeOnOrBefore). Never earlier than
 * the finding's own day, and the finding's day when the run time cannot be read.
 */
export function decisionCloseDay(ranAt: string, findingDay: string): string {
  const date = new Date(ranAt);
  const day = etDayOf(ranAt);
  if (!day || Number.isNaN(date.getTime())) return findingDay;
  const [hour, minute] = ET_CLOCK.format(date).split(":").map(Number) as [number, number];
  const known = (hour % 24) * 60 + minute >= 16 * 60 ? day : dayBefore(day);
  return known > findingDay ? known : findingDay;
}

/**
 * Every finding the loop could tell, newest first: from runs that told you something (decision "notify"), of a job we
 * have, about one stock, a price fact with its close. One per run: the biggest move in it (the order the landing's move
 * card uses), so a run that found several stocks is still one case.
 */
export function loopCandidates(jobs: ReadonlyArray<LoopJobInput>, runs: ReadonlyArray<LoopRunInput>): LoopCandidate[] {
  const known = new Set(jobs.map((job) => job.id));
  const out: LoopCandidate[] = [];
  for (const run of runs) {
    if (run.decision !== "notify" || !known.has(run.job_id) || !DAY.test(run.day)) continue;
    const usable = run.findings
      // A price fact is about a close the run already had: never one dated after the run itself.
      .filter((finding) => {
        const at = String(finding.at ?? "").slice(0, 10);
        return finding.ticker && PRICE_KINDS.has(finding.kind ?? "") && fin(finding.close) && finding.close > 0 && DAY.test(at) && at <= run.day;
      })
      .sort((a, b) => Math.abs(fin(b.change_pct) ? b.change_pct : 0) - Math.abs(fin(a.change_pct) ? a.change_pct : 0));
    const finding = usable[0];
    if (!finding) continue;
    const ticker = String(finding.ticker).toUpperCase();
    const day = String(finding.at).slice(0, 10);
    out.push({
      jobId: run.job_id,
      runDay: run.day,
      ranAt: run.ran_at,
      ticker,
      day,
      // The close the run stored as the newest it read; the run's clock only when that was not stored.
      fromDay: run.latest_close && DAY.test(run.latest_close) && run.latest_close >= day ? run.latest_close : decisionCloseDay(run.ran_at, day),
      close: finding.close!,
      changePct: fin(finding.change_pct) ? finding.change_pct : null,
      source: finding.source || "Daily closing prices",
    });
  }
  return out.sort(newestFirst);
}

function newestFirst(a: LoopCandidate, b: LoopCandidate): number {
  return b.day.localeCompare(a.day) || b.runDay.localeCompare(a.runDay) || b.ranAt.localeCompare(a.ranAt);
}

/** How many closes the series has after `day`. */
export function sessionsAfter(series: ReadonlyArray<LoopPoint> | undefined, day: string): number {
  return (series ?? []).filter((point) => point.date > day).length;
}

/**
 * THE RULE, fixed before looking at any outcome (so a case is never picked for how it turned out):
 *   1. the newest case with a full outcome, OUTCOME_SESSIONS closes after the close the agent had when it told you;
 *   2. else the newest case with at least one close after it, its outcome said "so far";
 *   3. else the newest case, with no outcome step.
 * "Newest" is the day of the close the finding is about, then the run's day. Nothing here reads a return.
 */
export function pickLoopCase(
  candidates: ReadonlyArray<LoopCandidate>,
  seriesOf: (ticker: string) => ReadonlyArray<LoopPoint> | undefined,
): { candidate: LoopCandidate; sessions: number } | null {
  const withSessions = [...candidates].sort(newestFirst).map((candidate) => ({ candidate, sessions: sessionsAfter(seriesOf(candidate.ticker), candidate.fromDay) }));
  return withSessions.find((entry) => entry.sessions >= OUTCOME_SESSIONS) ?? withSessions.find((entry) => entry.sessions >= 1) ?? withSessions[0] ?? null;
}

/** The last close on or before `day`, or null. */
export function closeOnOrBefore(series: ReadonlyArray<LoopPoint>, day: string): LoopPoint | null {
  let found: LoopPoint | null = null;
  for (const point of series) {
    if (point.date > day) break;
    found = point;
  }
  return found;
}

export type LoopOutcome = {
  /** Closes counted after the start, at most OUTCOME_SESSIONS. */
  sessions: number;
  /** True with all OUTCOME_SESSIONS closes in; false while it is still "so far". */
  full: boolean;
  fromDay: string;
  toDay: string;
  fromClose: number;
  toClose: number;
  /** The stock's change from the start close to the end close, in percent. */
  pct: number;
  /** The S&P 500 (SPY, the fund that tracks it) over the same two closes, or null when its closes for those days are not there. */
  benchPct: number | null;
};

/**
 * What the stock did from the last close on or before `day` (the close the agent had when it told you) to
 * OUTCOME_SESSIONS closes later (or the latest close, when fewer are in), and SPY over exactly the same two days. Null
 * with no close after the start. `series` must be sorted.
 */
export function outcomeOf(series: ReadonlyArray<LoopPoint>, bench: ReadonlyArray<LoopPoint> | undefined, day: string): LoopOutcome | null {
  // Both ends from the same series, so a later adjustment (a split) cannot skew the change.
  const start = closeOnOrBefore(series, day);
  if (!start || !(start.close > 0)) return null;
  const after = series.filter((point) => point.date > start.date);
  if (after.length === 0) return null;
  const sessions = Math.min(after.length, OUTCOME_SESSIONS);
  const end = after[sessions - 1]!;
  const benchFrom = bench ? closeOnOrBefore(bench, start.date) : null;
  const benchTo = bench ? closeOnOrBefore(bench, end.date) : null;
  // Both S&P closes on the very same days as the stock's, or no S&P figure at all.
  const benchPct =
    benchFrom && benchTo && benchFrom.date === start.date && benchTo.date === end.date && benchFrom.close > 0 ? (benchTo.close / benchFrom.close - 1) * 100 : null;
  return {
    sessions,
    full: sessions >= OUTCOME_SESSIONS,
    fromDay: start.date,
    toDay: end.date,
    fromClose: start.close,
    toClose: end.close,
    pct: (end.close / start.close - 1) * 100,
    benchPct,
  };
}

/** What the person asked for, as they would type it, from the agent's saved trigger. */
export function askOfJob(job: Pick<LoopJobInput, "trigger" | "scope" | "name">): string {
  const trigger = job.trigger;
  const only = job.scope.kind === "tickers" && job.scope.tickers.length === 1 ? job.scope.tickers[0]! : null;
  const subject = only ?? "one of my stocks";
  if (trigger.type === "price") {
    if (trigger.rule === "moves_pct" && fin(trigger.pct)) return `Tell me when ${subject} moves ${trigger.pct}% in a day.`;
    if (trigger.rule === "enters_buy_zone") return `Tell me when ${subject} reaches your buy-more price.`;
    if (trigger.rule === "enters_sell_zone") return `Tell me when to sell some of ${only ?? "my stocks"}.`;
    if ((trigger.rule === "crosses_below" || trigger.rule === "crosses_above") && fin(trigger.level) && trigger.level > 0) {
      return `Tell me if ${subject} closes ${trigger.rule === "crosses_below" ? "below" : "above"} ${usd(trigger.level)}.`;
    }
  }
  return job.name.endsWith(".") ? job.name : `${job.name}.`;
}

export type QuietMove = { day: string; ticker: string; pct: number; threshold: number };

/**
 * For an agent that watches daily moves: on its newest quiet check, the biggest close-to-close move among its stocks
 * on the close that check stored as read (`latest_close`), with the line it did not cross. Null for any other agent,
 * without that stored date, or unless every one of its stocks has both closes (a gap could hide a move).
 */
export function quietMoveOf(
  job: Pick<LoopJobInput, "trigger" | "scope">,
  runs: ReadonlyArray<Pick<LoopRunInput, "day" | "decision" | "latest_close">>,
  series: Readonly<Record<string, ReadonlyArray<LoopPoint>>>,
): QuietMove | null {
  const trigger = job.trigger;
  if (trigger.type !== "price" || trigger.rule !== "moves_pct" || !fin(trigger.pct) || job.scope.kind !== "tickers" || job.scope.tickers.length === 0) return null;
  const run = runs
    .filter((entry) => entry.decision === "nothing" && DAY.test(entry.day))
    .sort((a, b) => a.day.localeCompare(b.day))
    .pop();
  if (!run) return null;
  // Only the close the check stored as read: without it, which close it had cannot be proven.
  const read = run.latest_close && DAY.test(run.latest_close) ? run.latest_close : null;
  if (!read) return null;
  let best: QuietMove | null = null;
  for (const raw of job.scope.tickers) {
    const ticker = raw.toUpperCase();
    const points = series[ticker] ?? [];
    const last = closeOnOrBefore(points, read);
    // Every stock must have that very close.
    if (!last || last.date !== read) return null;
    const index = points.indexOf(last);
    const prev = index > 0 ? points[index - 1]! : null;
    if (!prev || !(prev.close > 0)) return null;
    const pct = (last.close / prev.close - 1) * 100;
    if (!best || Math.abs(pct) > Math.abs(best.pct)) best = { day: last.date, ticker, pct, threshold: trigger.pct };
  }
  // A quiet check that missed a move over the line would be a contradiction: say nothing rather than show it.
  return best && Math.abs(best.pct) < best.threshold ? best : null;
}

export type AgentLoop = {
  ticker: string;
  today: string;
  /** The agent's rule in a person's words (from its saved trigger, never quoted as typed), and its saved name. */
  asked: { text: string; name: string; tickers: string[] };
  watched: {
    days: SequenceRunDay[];
    nextDay: string | null;
    /** A move agent's newest quiet check: the biggest close-to-close move among its stocks that day, under its line. */
    quiet: QuietMove | null;
  };
  found: {
    day: string;
    close: number;
    changePct: number | null;
    source: string;
    /** The closes up to and including the finding's day, for the small chart. */
    chart: LoopPoint[];
  };
  decided: {
    /** The run's own day and time: when it told you. */
    toldDay: string;
    toldAt: string;
    /** For a move agent: the line the move crossed (its saved percent), so the decision says which rule fired. */
    line: number | null;
  };
  /** Null when no close has come in since (rule step 3). */
  outcome: LoopOutcome | null;
  /** The stock's price now, for the header. */
  now: { price: number; dayPct: number | null; at: string | null } | null;
};

export type LoopContext = {
  today: string;
  jobs: ReadonlyArray<LoopJobInput>;
  runs: ReadonlyArray<LoopRunInput>;
  series: Readonly<Record<string, ReadonlyArray<LoopPoint>>>;
  bench: ReadonlyArray<LoopPoint> | undefined;
  now: (ticker: string) => { price: number; dayPct: number | null; at: string | null } | null;
  nextCheck: (job: LoopJobInput) => string | null;
};

/**
 * Whether the stored data can tell this case at all: the series has a close on the finding's own day equal to the
 * close the run read (to the cent; an after-hours quote on a report night is not a close), and one before it for the
 * chart. A data check made before ranking, never a look at how the case turned out.
 */
export function tellable(candidate: LoopCandidate, series: ReadonlyArray<LoopPoint> | undefined): boolean {
  if (!series) return false;
  const upTo = series.filter((point) => point.date <= candidate.day);
  const last = upTo[upTo.length - 1];
  return upTo.length >= 2 && last!.date === candidate.day && Math.abs(last!.close - candidate.close) < 0.01;
}

/** The run days the watched step marks: the day it told you and up to RUN_DAYS_SHOWN - 1 after it, oldest first. */
function markedRuns<T extends { day: string }>(runs: ReadonlyArray<T>, fromDay: string): T[] {
  const days = [...new Set(runs.map((run) => run.day).filter((day) => DAY.test(day) && day >= fromDay))].sort().slice(0, RUN_DAYS_SHOWN);
  return runs.filter((run) => days.includes(run.day));
}

/** The loop for the case the rule picks; null when no stored run told anything the loop can show. */
export function loopOf(context: LoopContext): AgentLoop | null {
  const candidates = loopCandidates(context.jobs, context.runs).filter((candidate) => tellable(candidate, context.series[candidate.ticker]));
  const picked = pickLoopCase(candidates, (ticker) => context.series[ticker]);
  if (!picked) return null;
  const { candidate } = picked;
  const job = context.jobs.find((entry) => entry.id === candidate.jobId);
  const series = context.series[candidate.ticker];
  if (!job || !series) return null;
  const upTo = series.filter((point) => point.date <= candidate.day);
  const jobRuns = context.runs.filter((run) => run.job_id === job.id);
  const nextDay = context.nextCheck(job);
  const marked = markedRuns(
    jobRuns.filter((run) => !nextDay || run.day < nextDay),
    candidate.runDay,
  );
  const latestRun = jobRuns.map((run) => run.day).sort().pop() ?? null;
  return {
    ticker: candidate.ticker,
    today: context.today,
    asked: {
      text: askOfJob(job),
      name: job.name,
      tickers: job.scope.kind === "tickers" ? job.scope.tickers.map((ticker) => ticker.toUpperCase()) : [],
    },
    watched: {
      days: runDaysOf(marked),
      // The next check only follows marks that reach the newest run.
      nextDay: marked.some((run) => run.day === latestRun) ? nextDay : null,
      quiet: quietMoveOf(
        job,
        marked.filter((run) => run.day > candidate.runDay),
        context.series,
      ),
    },
    found: {
      day: candidate.day,
      close: candidate.close,
      changePct: candidate.changePct,
      source: candidate.source,
      chart: upTo.slice(-FOUND_CHART_SESSIONS).map((point) => ({ date: point.date, close: point.close })),
    },
    decided: {
      toldDay: candidate.runDay,
      toldAt: candidate.ranAt,
      line: job.trigger.type === "price" && job.trigger.rule === "moves_pct" && fin(job.trigger.pct) ? job.trigger.pct : null,
    },
    outcome: outcomeOf(series, context.bench, candidate.fromDay),
    now: context.now(candidate.ticker),
  };
}
