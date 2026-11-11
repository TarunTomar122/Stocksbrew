import type { AgentJob, AgentRun } from "@/lib/agent-jobs";
import { AFTER_CLOSE_RUN_ET, afterCloseRunOn, afterCloseTimeEt } from "@/lib/agent-schedule";
import { fmtDollars, fmtPlanDay } from "@/lib/dividend-plan";
import { sessionWords, whenWords } from "@/lib/earnings-season";
import type { InsightTone } from "@/lib/insights";
import { usd } from "@/lib/portfolio-ideas/words";
import { countWord } from "@/lib/read-format";
import type { Verdict } from "@/lib/thesis-watch/rules";

import { daysUntil, nextPayment, type HomeMode, type HomeSources, type Loaded } from "./pick";

/**
 * "What the agent checked, and what is next" on the My stocks overview. Built
 * only from what the overview's sources already returned, each row dated with
 * the day its data is from: the memo's week and last close, the reason checks,
 * the earnings calendar's capture time, the day the holdings were priced, and
 * the person's own standing agents' run log (tm_agent_runs). Upcoming rows are
 * real dates (reports, dividend payments). A next agent check is only shown
 * when the run log proves the after-close runner is running: it ran for the
 * last market day. Nothing here is a check that did not happen. Pure.
 */

/** The person's standing agents and their recent runs, newest first. */
export type AgentsSource = {
  /** `weekly` marks a once-a-week schedule, which is not due on most days. */
  jobs: Array<Pick<AgentJob, "id" | "name" | "enabled"> & { weekly?: boolean } & Partial<Pick<AgentJob, "trigger" | "scope">>>;
  runs: Array<Pick<AgentRun, "job_id" | "job_name" | "day" | "ran_at" | "decision" | "summary">>;
};

export type LogRow = {
  id: string;
  /** YYYY-MM-DD the row is about. */
  day: string;
  /** An exact instant when we have one (ISO), for the time beside the day. */
  at: string | null;
  text: string;
  /** What changed, or what the check found, in one short sentence. */
  changed: string | null;
  tone: InsightTone;
  ticker: string | null;
  href: string | null;
};

/** `hasAgents` is null when the run log did not answer, so the page never tells someone with agents that they have none. */
export type AgentLog = { checked: LogRow[]; next: LogRow[]; hasAgents: boolean | null };

/** Most rows in each list; the lists scroll inside a fixed height beyond about eight. */
export const MAX_CHECKED = 8;
export const MAX_NEXT = 5;
/** How many standing agents' latest runs the log names. */
const MAX_AGENT_ROWS = 4;

const DAY = /^\d{4}-\d{2}-\d{2}/;

function ready<T>(loaded: Loaded<T> | undefined): T | null {
  return loaded?.state === "ready" ? loaded.value : null;
}

const VERDICT_WORDS: Record<Verdict, string> = { holds: "holds", weaker: "weaker", broken: "broken", played_out: "played out" };

/** The weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD day. */
function weekday(day: string): number {
  const index = new Date(`${day}T12:00:00Z`).getUTCDay();
  return index === 0 ? 7 : index;
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The weekday before `day` (Friday for a Monday). */
export function previousWeekday(day: string): string {
  let out = shiftDay(day, -1);
  while (weekday(out) > 5) out = shiftDay(out, -1);
  return out;
}

/** `day` itself when it is a weekday, else the next one. */
function weekdayOnOrAfter(day: string): string {
  let out = day;
  while (weekday(out) > 5) out = shiftDay(out, 1);
  return out;
}

/** The New York day of an instant ("2026-11-12T01:00Z" is still Nov 11 there); a plain day stays as it is. */
export function nyDay(value: string): string {
  if (!value.includes("T")) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/* ── checked ───────────────────────────────────────────────────────────── */

function memoRow(sources: Partial<HomeSources>, mode: HomeMode): LogRow | null {
  const memo = ready(sources.memo)?.memo;
  if (!memo) return null;
  const mine = mode === "mine";
  const written = mine && DAY.test(memo.writtenAt ?? "") ? memo.writtenAt : null;
  const day = written ? nyDay(written) : (memo.endDay ?? memo.monday);
  if (!DAY.test(day ?? "")) return null;
  const through = memo.endDay ? `, up to the ${fmtPlanDay(memo.endDay)} close` : "";
  const watch = memo.hurt.length;
  const look = memo.look.length;
  const found =
    watch + look === 0
      ? "Nothing needed a decision."
      : `Found ${[watch > 0 ? `${countWord(watch).toLowerCase()} to watch` : null, look > 0 ? `${countWord(look).toLowerCase()} worth a look` : null].filter(Boolean).join(" and ")}.`;
  return {
    id: `memo-${memo.weekKey}`,
    day,
    at: written,
    text: mine ? `Wrote your memo for the week of ${fmtPlanDay(memo.monday)}${through}.` : `Went through the example's week of ${fmtPlanDay(memo.monday)} for its memo${through}.`,
    changed: found,
    tone: watch > 0 ? "down" : "flat",
    ticker: null,
    href: "/portfolio/memo",
  };
}

function reasonsRow(sources: Partial<HomeSources>, mode: HomeMode): LogRow | null {
  const source = ready(sources.reasons);
  const checks = source?.checks ?? [];
  const days = checks.map((check) => check.asOf ?? "").filter((day) => DAY.test(day)).sort();
  const day = days[days.length - 1];
  if (checks.length === 0 || !day) return null;
  const n = checks.length;
  const holding = checks.filter((check) => check.verdict === "holds").length;
  // A change is only known from a stored earlier check, so the example (checked fresh each time) never has one.
  const changes = checks
    .filter((check) => check.change && DAY.test(check.change.day))
    .sort((a, b) => b.change!.day.localeCompare(a.change!.day))
    .slice(0, 2)
    .map((check) => `${check.ticker} went from ${VERDICT_WORDS[check.change!.from]} to ${VERDICT_WORDS[check.verdict]} on ${fmtPlanDay(check.change!.day)}`);
  const standing =
    holding === n ? (n === 1 ? "It still holds." : `All ${n} still hold.`) : n === 1 ? "It no longer holds." : `${countWord(holding)} of ${countWord(n).toLowerCase()} still hold.`;
  return {
    id: "reasons",
    day: nyDay(day),
    at: null,
    text: mode === "mine" ? `Checked the ${n === 1 ? "reason" : `${n} reasons`} you gave for owning your stocks.` : `Checked the ${n === 1 ? "reason" : `${n} reasons`} for owning the example's stocks.`,
    changed: changes.length > 0 ? `${changes.join("; ")}.` : standing,
    // Red only when most reasons no longer hold; "Six of seven still hold" is mostly good news.
    tone: holding === n ? "up" : holding * 2 >= n ? "flat" : "down",
    ticker: null,
    href: mode === "mine" ? "/watchlist?reasons=1" : "/watchlist",
  };
}

function calendarRow(sources: Partial<HomeSources>, mode: HomeMode): LogRow | null {
  const view = ready(sources.season);
  if (!view?.asOf || !DAY.test(view.asOf)) return null;
  const holdings = view.season.reporting.filter((stock) => stock.kind === "holding" && stock.next);
  const first = holdings[0];
  const your = mode === "example" ? "the example's" : "your";
  return {
    id: "calendar",
    day: nyDay(view.asOf),
    at: view.asOf.includes("T") ? view.asOf : null,
    text: `Checked the earnings calendar for ${your} holdings.`,
    changed:
      holdings.length === 0
        ? "None of them reports in the next six weeks."
        : `${holdings.length === 1 ? "One reports" : `${countWord(holdings.length)} report`} in the next six weeks${first ? `, ${first.name} first` : ""}.`,
    tone: "flat",
    ticker: null,
    href: "/portfolio/earnings",
  };
}

function pricesRow(sources: Partial<HomeSources>, mode: HomeMode): LogRow | null {
  const goal = ready(sources.goal);
  if (!goal?.pricesAsOf || !DAY.test(goal.pricesAsOf)) return null;
  const example = mode === "example";
  return {
    id: "prices",
    day: goal.pricesAsOf.slice(0, 10),
    at: null,
    text: `Priced ${example ? "the example's" : "your"} holdings at the ${fmtPlanDay(goal.pricesAsOf)} close.`,
    changed: goal.portfolioValue !== null ? `${example ? "They were" : "Your holdings were"} worth ${usd(goal.portfolioValue)}${goal.unvalued.length > 0 ? `, leaving out ${goal.unvalued.length} without a share count` : ""}.` : null,
    tone: "flat",
    ticker: null,
    href: "/watchlist",
  };
}

/** The newest run of each standing agent that still exists, newest first. */
function latestRuns(agents: AgentsSource): AgentsSource["runs"] {
  const live = new Set(agents.jobs.map((job) => job.id));
  const seen = new Set<string>();
  const out: AgentsSource["runs"] = [];
  const sorted = [...agents.runs].sort((a, b) => b.day.localeCompare(a.day) || b.ran_at.localeCompare(a.ran_at));
  for (const run of sorted) {
    if (!live.has(run.job_id) || seen.has(run.job_id) || !DAY.test(run.day)) continue;
    seen.add(run.job_id);
    out.push(run);
  }
  return out;
}

function agentRows(agents: AgentsSource | null): LogRow[] {
  if (!agents) return [];
  return latestRuns(agents)
    .slice(0, MAX_AGENT_ROWS)
    .map((run) => ({
      id: `run-${run.job_id}-${run.day}`,
      day: run.day,
      at: DAY.test(run.ran_at) ? run.ran_at : null,
      text: run.job_name ? `${run.job_name}: ${run.summary}` : run.summary,
      changed: run.decision === "could_not_check" ? "It could not check this time." : null,
      tone: run.decision === "notify" ? "down" : "flat",
      ticker: null,
      href: `/agents?job=${encodeURIComponent(run.job_id)}`,
    }));
}

/* ── next ──────────────────────────────────────────────────────────────── */

function reportRows(sources: Partial<HomeSources>, today: string): LogRow[] {
  const season = ready(sources.season)?.season;
  if (!season) return [];
  return season.reporting
    .filter((stock) => stock.kind === "holding" && stock.next && stock.next.date >= today)
    .slice(0, 2)
    .map((stock) => {
      const session = sessionWords(stock.next!.session);
      return {
        id: `report-${stock.ticker}`,
        day: stock.next!.date,
        at: null,
        text: `${stock.name} reports ${whenWords(stock.next!.date, today)}${session ? ` ${session}` : ""}.`,
        changed: null,
        tone: "flat" as const,
        ticker: stock.ticker,
        href: "/portfolio/earnings",
      };
    });
}

function dividendRow(sources: Partial<HomeSources>, today: string): LogRow | null {
  const source = ready(sources.dividends);
  const next = source ? nextPayment(source.plan) : null;
  if (!next || next.payment.payDate < today) return null;
  const { stock, payment } = next;
  const amount = payment.amount !== null ? `about ${fmtDollars(payment.amount)}` : "its dividend";
  return {
    id: `dividend-${stock.ticker}`,
    day: payment.payDate,
    at: null,
    text: `${stock.name} pays ${amount} ${payment.payDateKnown ? "on" : "around"} ${fmtPlanDay(payment.payDate)}${payment.status === "estimate" ? ", estimated from its past payments" : ""}.`,
    changed: null,
    tone: "up",
    ticker: stock.ticker,
    href: "/portfolio/dividends",
  };
}

/** Minutes after midnight in New York, and the New York day, of an instant. */
function nyClock(iso: string): { day: string; minutes: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** The after-close runner's start (lib/agent-schedule.ts, kept in step with the VPS timer); a run made by hand ("Run now") earlier proves nothing about it. */
const AFTER_CLOSE_MINUTES = AFTER_CLOSE_RUN_ET.hour * 60 + AFTER_CLOSE_RUN_ET.minute;

/** The first day on or after `day` that the after-close runner reads a new close (weekdays that are not NYSE holidays). */
function nextRunDay(day: string): string {
  let next = day;
  for (let i = 0; i < 14; i++, next = shiftDay(next, 1)) {
    const run = afterCloseRunOn(next);
    if (run?.marketDay) return next;
  }
  return weekdayOnOrAfter(day);
}

/** The market day of a run the scheduled runner made: on a weekday, after the close, evening of the same day or early the next morning. */
function scheduledRunDay(run: AgentsSource["runs"][number]): string | null {
  const clock = nyClock(run.ran_at);
  if (!clock || weekday(run.day) > 5) return null;
  if (clock.day === run.day && clock.minutes >= AFTER_CLOSE_MINUTES) return run.day;
  // A long after-close group can finish after midnight.
  if (clock.day === shiftDay(run.day, 1) && clock.minutes < 6 * 60) return run.day;
  return null;
}

/**
 * The next after-close check, only when the run log shows the scheduled runner
 * ran after the last market day's close (or today's): then it is due after
 * today's close, or the next weekday's. Runs made by hand do not count, and
 * weekly agents are left out of the count (most days they are not due). With
 * no such run, there is no promise to make.
 */
export function nextAgentCheck(agents: AgentsSource | null, today: string): LogRow | null {
  if (!agents) return null;
  const on = agents.jobs.filter((job) => job.enabled && !job.weekly).length;
  if (on === 0) return null;
  const newest = agents.runs.map(scheduledRunDay).filter((day): day is string => day !== null).sort().pop() ?? null;
  if (!newest || newest < previousWeekday(today)) return null;
  const day = newest >= today ? nextRunDay(shiftDay(today, 1)) : nextRunDay(today);
  const at = afterCloseRunOn(day);
  return {
    id: "agents-next",
    day,
    at: null,
    text: `Your ${on === 1 ? "agent checks" : `${on} agents check`} again after the close${day === today ? " today" : ""}${at ? `, from ${afterCloseTimeEt(at)}` : ""}.`,
    changed: null,
    tone: "flat",
    ticker: null,
    href: "/agents",
  };
}

/** Newest first; a row with an exact time sorts by it within its day. */
function newestFirst(a: LogRow, b: LogRow): number {
  return b.day.localeCompare(a.day) || (b.at ?? "").localeCompare(a.at ?? "");
}

/**
 * The checks of the data itself (the memo, the reasons, the earnings calendar, the prices), by row id, for a
 * finding to show the one that explains it ("Checked the earnings calendar … Nov 9, 3:13 PM ET").
 */
export function dataChecks(sources: Partial<HomeSources>, mode: HomeMode, today: string): Map<string, LogRow> {
  const rows = [memoRow(sources, mode), reasonsRow(sources, mode), calendarRow(sources, mode), pricesRow(sources, mode)];
  return new Map(rows.filter((row): row is LogRow => row !== null && row.day <= today).map((row) => [row.id, row]));
}

export function buildAgentLog(input: {
  sources: Partial<HomeSources>;
  agents: Loaded<AgentsSource> | null;
  mode: HomeMode;
  today: string;
  /** Check rows a lead finding already shows as its own last check (see ./loop.ts), so the log keeps the rest. */
  omit?: ReadonlySet<string>;
}): AgentLog {
  const { sources, mode, today } = input;
  const agents = mode === "mine" ? ready(input.agents ?? undefined) : null;
  const checked = [memoRow(sources, mode), reasonsRow(sources, mode), calendarRow(sources, mode), pricesRow(sources, mode), ...agentRows(agents)]
    .filter((row): row is LogRow => row !== null && row.day <= today && !input.omit?.has(row.id))
    .sort(newestFirst)
    .slice(0, MAX_CHECKED);
  const next = [...reportRows(sources, today), dividendRow(sources, today), nextAgentCheck(agents, today)]
    .filter((row): row is LogRow => row !== null && daysUntil(row.day, today) >= 0)
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(0, MAX_NEXT);
  return { checked, next, hasAgents: agents ? agents.jobs.length > 0 : null };
}
