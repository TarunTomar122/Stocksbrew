import type { AgentScope, AgentTrigger } from "@/lib/agent-jobs";
import { fmtPlanDay } from "@/lib/dividend-plan";

import { nextAgentCheck, type AgentsSource, type LogRow } from "./log";
import type { HomeMode, Loaded, Noticed } from "./pick";
import { questionFor, type HomeQuestion } from "./questions";
import { askHref } from "@/lib/next-steps";

/**
 * Each lead finding on the My stocks overview as a small agent loop: what was
 * found, the evidence, a question for Ask, and the watch (what would keep
 * watching it, when it was last checked, and when it is checked next). Built
 * only from what the overview already loaded: the finding itself, the data
 * checks in ./log.ts and the person's own agents and run log. A next check is
 * only named when the run log proves the after-close runner is running, and an
 * agent is only named when one of theirs really has the rule. Pure.
 */

/** What would keep watching a finding. */
export type WatchPlan =
  /** A request the agents box reads back before saving ("Tell me 3 days before NVDA reports earnings"). */
  | {
      kind: "agent";
      request: string;
      href: string;
      shape: "earnings" | "move" | "other";
      /** Days before the report, or the % move, read from the request; an agent only matches with the same one. */
      amount: number | null;
    }
  /** The reason watcher, which already checks this finding (lib/thesis-watch). */
  | { kind: "reasons"; text: string };

export type FindingLoop = {
  ask: HomeQuestion | null;
  watch: WatchPlan | null;
  /** The data check that explains the finding, with its real date (and time when we have one). */
  check: LogRow | null;
};

/** An agent of the person's that already has a finding's rule. */
export type AgentMatch = {
  id: string;
  name: string;
  enabled: boolean;
  lastRun: AgentsSource["runs"][number] | null;
  /** YYYY-MM-DD of the next after-close check, only when the run log proves the runner is running. */
  next: string | null;
};

/** Which data check (a ./log.ts row id) explains a finding. */
export function checkIdOf(item: Pick<Noticed, "id" | "tool">): string | null {
  if (item.tool === "earnings") return "calendar";
  if (item.id.startsWith("reason")) return "reasons";
  if (item.tool === "memo") return item.id;
  if (item.tool === "ideas" || item.tool === "xray" || item.tool === "stress") return "prices";
  return null;
}

/**
 * The question a finding raises for Ask. A reason finding asks about the reason itself, so the question and the
 * item Ask opens on (contextFor) match; the memo's line asks about the person's own week.
 */
export function askFor(item: Noticed, mode: HomeMode): HomeQuestion | null {
  const reasonTicker = item.id.startsWith("reason") && item.ticker ? item.ticker : null;
  const reasonQuestion = reasonTicker ? (mode === "mine" ? `Is my reason for owning ${reasonTicker} still holding up?` : `Is the reason for owning ${reasonTicker} still holding up?`) : null;
  const question = reasonQuestion ?? questionFor(item) ?? (item.tool === "memo" && mode === "mine" ? "What changed in my portfolio since yesterday?" : null);
  return question ? { question, href: askHref(question, contextFor(item, mode)) } : null;
}

/**
 * The item the question is about, so Ask's first answer starts from it (lib/ask-context.ts): the reason
 * check, the memo, the stock, or else the whole portfolio. From the example, it is marked as the example.
 */
export function contextFor(item: Pick<Noticed, "id" | "tool" | "ticker">, mode: HomeMode): string {
  const prefix = mode === "mine" ? "" : "ex.";
  const ticker = item.ticker && /^[A-Z][A-Z0-9.-]{0,9}$/.test(item.ticker) ? item.ticker : null;
  if (item.id.startsWith("reason") && ticker) return `${prefix}reason:${ticker}`;
  if (item.tool === "memo") return `${prefix}memo`;
  // A stock question from the example is about a real stock, so it needs no example marker.
  if (ticker) return `stock:${ticker}`;
  return `${prefix}portfolio`;
}

function shapeOf(request: string): { shape: "earnings" | "move" | "other"; amount: number | null } {
  const earnings = /^Tell me (\d+) days? before \S+ reports earnings$/.exec(request);
  if (earnings) return { shape: "earnings", amount: Number(earnings[1]) };
  const move = / moves (\d+)% in a day$/.exec(request);
  if (move) return { shape: "move", amount: Number(move[1]) };
  return { shape: "other", amount: null };
}

/** What would keep watching a finding: the reason watcher for a reason, else the agent request it carries. */
export function watchPlan(item: Noticed, mode: HomeMode): WatchPlan | null {
  if (item.id.startsWith("reason-") && item.ticker) {
    return {
      kind: "reasons",
      text: `The reason watcher keeps checking ${mode === "example" ? "the example's" : "your"} reason for owning ${item.ticker}.`,
    };
  }
  if (item.watch) return { kind: "agent", request: item.watch.request, href: item.watch.href, ...shapeOf(item.watch.request) };
  return null;
}

export function findingLoop(item: Noticed, checks: ReadonlyMap<string, LogRow>, mode: HomeMode): FindingLoop {
  const id = checkIdOf(item);
  return { ask: askFor(item, mode), watch: watchPlan(item, mode), check: id ? (checks.get(id) ?? null) : null };
}

/** The check rows the lead findings show as their own, so the log can leave them out. */
export function foldedCheckIds(lead: Array<Pick<Noticed, "id" | "tool">>, checks: ReadonlyMap<string, LogRow>): Set<string> {
  return new Set(lead.map(checkIdOf).filter((id): id is string => id !== null && checks.has(id)));
}

/* ── the agent that already watches it ─────────────────────────────────── */

function covers(scope: AgentScope | undefined, ticker: string, tracked: ReadonlySet<string>): boolean {
  if (!scope) return false;
  if (scope.kind === "tickers") return scope.tickers.some((symbol) => symbol.trim().toUpperCase() === ticker);
  if (scope.kind === "watchlist") return tracked.has(ticker);
  return false;
}

/** The same rule with the same threshold: a 10% move agent does not do what "moves 5%" asks. */
function fits(trigger: AgentTrigger | undefined, shape: "earnings" | "move", amount: number | null): boolean {
  if (!trigger || amount === null) return false;
  // Unset thresholds read as the agent runner's own defaults (lib/agent-jobs.ts).
  if (shape === "earnings") return trigger.type === "event" && trigger.event === "earnings_approaching" && (trigger.days_before ?? 3) === amount;
  return trigger.type === "price" && trigger.rule === "moves_pct" && (trigger.pct ?? 5) === amount;
}

/**
 * The person's agent that already does what a finding's watch would ask for: an earnings reminder or a big-move
 * alert with the same threshold covering the stock, by name or through the watchlist (`tracked` holds tickers). An enabled one wins
 * over a paused one. Other requests are not matched, so nothing is claimed about them.
 */
export function matchAgent(plan: WatchPlan | null, ticker: string | null, agents: AgentsSource, tracked: ReadonlySet<string>, today: string): AgentMatch | null {
  if (!plan || plan.kind !== "agent" || plan.shape === "other" || !ticker) return null;
  const symbol = ticker.toUpperCase();
  const shape = plan.shape;
  const found = agents.jobs.filter((job) => fits(job.trigger, shape, plan.amount) && covers(job.scope, symbol, tracked)).sort((a, b) => Number(b.enabled) - Number(a.enabled))[0];
  if (!found) return null;
  const lastRun =
    agents.runs.filter((run) => run.job_id === found.id).sort((a, b) => b.day.localeCompare(a.day) || b.ran_at.localeCompare(a.ran_at))[0] ?? null;
  const next = found.enabled && !found.weekly ? (nextAgentCheck(agents, today)?.day ?? null) : null;
  return { id: found.id, name: found.name, enabled: found.enabled, lastRun, next };
}

/** "Nov 10 at 5:41 PM ET", or the day alone when there is no time. */
export function stampWords(at: string | null, day: string | null): string {
  if (at) {
    const date = new Date(at);
    if (!Number.isNaN(date.getTime()) && at.includes("T")) {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).formatToParts(date);
      const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
      // No-break spaces keep "3:13 PM ET" on one line.
      return `${get("month")}\u00a0${get("day")} at ${get("hour")}:${get("minute")}\u00a0${get("dayPeriod")}\u00a0ET`;
    }
  }
  return day && /^\d{4}-\d{2}-\d{2}/.test(day) ? fmtPlanDay(day) : "";
}

const RAN: Record<AgentsSource["runs"][number]["decision"], string> = {
  notify: "and had something to tell you",
  nothing: "and found nothing to tell you",
  could_not_check: "but could not check",
};

/**
 * Whether an agent already watches the finding, in one sentence, or null when there is nothing honest to say
 * (the reason watcher's own line says it, or the request is one we do not match).
 */
export function watchStatus(input: {
  plan: WatchPlan | null;
  match: AgentMatch | null;
  /** How the person's agents came back; "none" for the example, which has no agents. */
  agents: Loaded<AgentsSource>["state"] | "none";
}): string | null {
  const { plan, match, agents } = input;
  if (!plan || plan.kind !== "agent") return null;
  if (agents === "slow" || agents === "failed") return "We could not read your agents just now.";
  if (match) {
    const name = `“${match.name}”`;
    if (!match.enabled) return `Your agent ${name} does this, but it is paused.`;
    const run = match.lastRun;
    const ran = run ? stampWords(run.ran_at, run.day) : "";
    return run && ran ? `Your agent ${name} does this. It last ran ${ran} ${RAN[run.decision]}.` : `Your agent ${name} does this. It has not run yet.`;
  }
  if (plan.shape === "other" && agents === "ready") return null;
  return agents === "none" ? "No agent watches this yet." : "None of your agents does this yet.";
}

/** "After the close today", "After the close on Nov 12". */
export function nextWords(day: string, today: string): string {
  return day === today ? "After the close today." : `After the close on ${fmtPlanDay(day)}.`;
}
