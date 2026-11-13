/**
 * A person's idea baskets as a reader outside the basket pages sees them (Ask, the MCP server and the REST API): each
 * basket's companies with the latest check's verdict on each one's reason, and what that check decided. Reads only:
 * nothing here switches a basket on, edits it or accepts a proposal.
 *
 * Scoping: every read takes the uid the caller resolved from its own session or token, and the store reads check the
 * stored uid (./data.ts), so another person's basket id finds nothing.
 */

import { listJobs } from "@/lib/agent-jobs-data";
import { limitFor, type Plan } from "@/lib/entitlements";

import { basketsOverPlan, getBasket, listBasketRuns, listBaskets } from "./data";
import {
  basketHref,
  KIND_WORDS,
  VERDICT_SHORT,
  type BasketAgent,
  type BasketDecision,
  type BasketRun,
  type StatusVerdict,
} from "./model";

export const DECISION_WORDS: Record<BasketDecision, string> = {
  propose: "Proposes a change",
  nothing: "Nothing to change",
  could_not_check: "Couldn't check",
};

/** Companies that need a look come first, as on the basket's page. */
const VERDICT_RANK: Record<StatusVerdict, number> = { broken: 0, played_out: 1, weaker: 2, unknown: 3, holds: 4 };

export type BasketCompany = {
  ticker: string;
  company: string | null;
  /** "Growth", "Dividend": the kind of reason, which decides the check. */
  kind: string;
  /** The person's own reason for it. */
  reason: string;
  verdict: StatusVerdict;
  verdict_words: string;
  /** The fact that decided the verdict (at most 15 words), or null before the first check. */
  line: string | null;
  /** The figure the basket compares companies on ("Revenue growth +18%"), when the check had one. */
  figure: string | null;
  /** When that fact is from. */
  as_of: string | null;
};

export type BasketChangeView = {
  op: "drop" | "add";
  ticker: string;
  company: string | null;
  line: string;
  /** The first day of the run of checks that proposed it. */
  since: string | null;
};

export type BasketDecisionView = {
  day: string;
  decision: BasketDecision;
  decision_words: string;
  summary: string;
  ran_at: string | null;
  /** Changes it proposes that still apply to the basket as it is now. */
  changes: BasketChangeView[];
  /** Companies with no facts that day. */
  missing: string[];
};

export type BasketSummary = {
  id: string;
  name: string;
  idea: string;
  /** Switched on by the person. */
  enabled: boolean;
  /** Switched on, but the plan's running limit leaves it out of the nightly check. */
  paused_by_plan: boolean;
  /** How many companies' reasons hold, are weaker, broken, played out or not checked. */
  counts: Record<StatusVerdict, number>;
  companies: BasketCompany[];
  latest: BasketDecisionView | null;
  created_at: string;
  href: string;
};

export type BasketReplayView = {
  from: string;
  to: string;
  sessions: number;
  proposals: number;
  /** Replayed on other companies than the basket holds now (it was edited or a proposal was accepted since). */
  earlier: boolean;
};

export type BasketDetail = BasketSummary & {
  /** The checks before the latest, newest first: day, decision and its sentence. */
  recent: Array<{ day: string; decision: BasketDecision; decision_words: string; summary: string }>;
  replay: BasketReplayView | null;
};

/** Run records older than the latest that a detail lists. */
export const RECENT_RUNS = 9;

function emptyCounts(): Record<StatusVerdict, number> {
  return { holds: 0, weaker: 0, broken: 0, played_out: 0, unknown: 0 };
}

/** The changes a run proposes that still apply: dropping a company still in the basket, adding one not in it. */
function liveChanges(run: BasketRun, basket: BasketAgent): BasketChangeView[] {
  const held = new Set(basket.lines.map((line) => line.ticker));
  return run.changes
    .filter((change) => (change.op === "drop" ? held.has(change.ticker) : !held.has(change.ticker)))
    .map((change) => ({ op: change.op, ticker: change.ticker, company: change.company ?? null, line: change.line, since: change.since ?? null }));
}

function decisionOf(run: BasketRun | null, basket: BasketAgent): BasketDecisionView | null {
  if (!run) return null;
  return {
    day: run.day,
    decision: run.decision,
    decision_words: DECISION_WORDS[run.decision],
    summary: run.summary,
    ran_at: run.ran_at || null,
    changes: liveChanges(run, basket),
    missing: run.missing,
  };
}

/** One basket with its newest run (runs newest first, this basket's only). Pure. */
export function summarizeBasket(basket: BasketAgent, runs: readonly BasketRun[], pausedByPlan: boolean): BasketSummary {
  const latest = runs.find((run) => run.basket_id === basket.id) ?? null;
  const statuses = new Map((latest?.statuses ?? []).map((status) => [status.ticker, status]));
  const counts = emptyCounts();
  const companies = basket.lines
    .map((line, index) => {
      const status = statuses.get(line.ticker) ?? null;
      const verdict: StatusVerdict = status?.verdict ?? "unknown";
      counts[verdict] += 1;
      const company: BasketCompany = {
        ticker: line.ticker,
        company: line.company,
        kind: KIND_WORDS[line.kind],
        reason: line.reason,
        verdict,
        verdict_words: VERDICT_SHORT[verdict],
        line: status?.line || null,
        figure: status?.metric ? `${status.metric.label} ${status.metric.text}` : null,
        as_of: status?.asOf ?? null,
      };
      return { company, index };
    })
    .sort((a, b) => VERDICT_RANK[a.company.verdict] - VERDICT_RANK[b.company.verdict] || a.index - b.index)
    .map((entry) => entry.company);
  return {
    id: basket.id,
    name: basket.name,
    idea: basket.idea,
    enabled: basket.enabled,
    paused_by_plan: pausedByPlan,
    counts,
    companies,
    latest: decisionOf(latest, basket),
    created_at: basket.created_at,
    href: basketHref(basket.id),
  };
}

/** One basket in full: its summary, the checks before the latest and the replay it ran before it started. Pure. */
export function detailOfBasket(basket: BasketAgent, runs: readonly BasketRun[], pausedByPlan: boolean): BasketDetail {
  const own = runs.filter((run) => run.basket_id === basket.id);
  const summary = summarizeBasket(basket, own, pausedByPlan);
  const tickers = basket.lines.map((line) => line.ticker).sort().join(",");
  const replay = basket.replay;
  return {
    ...summary,
    recent: own.slice(1, 1 + RECENT_RUNS).map((run) => ({ day: run.day, decision: run.decision, decision_words: DECISION_WORDS[run.decision], summary: run.summary })),
    replay:
      replay && typeof replay.from === "string" && typeof replay.to === "string"
        ? {
            from: replay.from,
            to: replay.to,
            sessions: typeof replay.sessions === "number" ? replay.sessions : 0,
            proposals: Array.isArray(replay.proposals) ? replay.proposals.length : 0,
            earlier: Array.isArray(replay.tickers) ? [...replay.tickers].sort().join(",") !== tickers : false,
          }
        : null,
  };
}

/** The switched-on baskets the plan leaves out, as the nightly run decides it. Empty when the jobs could not be read. */
async function overPlan(uid: string, baskets: readonly BasketAgent[], plan: Plan): Promise<Set<string>> {
  if (!baskets.some((basket) => basket.enabled)) return new Set();
  const jobs = await listJobs(uid).catch(() => null);
  if (!jobs) return new Set();
  return basketsOverPlan(baskets, jobs.filter((job) => job.enabled).length, limitFor("agents", plan));
}

/** The person's baskets, oldest first (as their list shows them), each with its latest check. */
export async function loadBasketSummaries(uid: string, plan: Plan): Promise<BasketSummary[]> {
  const baskets = await listBaskets(uid);
  if (baskets.length === 0) return [];
  const [runs, over] = await Promise.all([listBasketRuns(uid), overPlan(uid, baskets, plan)]);
  return baskets.map((basket) => summarizeBasket(basket, runs, over.has(basket.id)));
}

/** One of the person's baskets in full, or null when they have none by that id (someone else's id included). */
export async function loadBasketDetail(uid: string, id: string, plan: Plan): Promise<BasketDetail | null> {
  const basket = await getBasket(uid, id.trim().toLowerCase());
  if (!basket) return null;
  const [runs, over] = await Promise.all([
    listBasketRuns(uid, basket.id, 1 + RECENT_RUNS),
    basket.enabled ? listBaskets(uid).then((all) => overPlan(uid, all, plan)).catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
  ]);
  return detailOfBasket(basket, runs, over.has(basket.id));
}
