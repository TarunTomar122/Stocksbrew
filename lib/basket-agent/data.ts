/**
 * Store access and reads for idea-basket agents (lib/basket-agent/model.ts).
 *
 * - The basket and its switch: `tm_agent_baskets/{uid}__{id}`, only ever the signed-in person's own (the uid comes
 *   from the session, and every read checks the stored uid). Removing archives it; nothing is deleted. Every change to
 *   its companies bumps `version`, inside a transaction, so an edit never undoes an accepted proposal.
 * - One dated decision per basket per market day: `tm_agent_basket_runs/{uid}__{id}__{day}`, including "nothing to
 *   change".
 * - The live check reads the reason watcher's own facts (lib/thesis-watch/data.ts loadStockFacts); the replay reads
 *   each company's dated history once and builds every day from it (lib/basket-agent/history.ts).
 *
 * It counts as one of the person's agents: a basket switched on past the plan's limit (lib/entitlements.ts `agents`,
 * jobs and baskets together) is saved paused, never thrown away.
 */

import { randomBytes } from "node:crypto";

import {
  agentMarketDay,
  AgentJobError,
  lastSettledDay,
  listJobs,
} from "@/lib/agent-jobs-data";
import { draftBasket } from "@/lib/ask-basket";
import { absoluteDay, etDayOf } from "@/lib/day-words";
import { parseHistoryDoc } from "@/lib/dividend-plan";
import { latestReportFor } from "@/lib/earnings-day";
import { earningsDayHref } from "@/lib/earnings-day-shared";
import { limitFor, systemPlanOf, type Plan } from "@/lib/entitlements";
import { adminFirestore } from "@/lib/firebase-admin";
import { getInvestmentTheme, INVESTMENT_THEMES } from "@/lib/investment-themes";
import { loadDailySeries } from "@/lib/portfolio-data";
import { getThematicScreens } from "@/lib/screens";
import { getCoverage, getRecentMoves } from "@/lib/seo/family-data";
import { moveHref } from "@/lib/seo/families";
import { getStockCallHistory } from "@/lib/stock-events";
import { getStockOwnership } from "@/lib/stock-ownership";
import { isThesisKind } from "@/lib/thesis";
import { THRESHOLDS } from "@/lib/thesis-watch/rules";
import { closesOnDays, loadStockFacts } from "@/lib/thesis-watch/data";
import { addDays, type YearFigures } from "@/lib/thesis-watch/facts";
import { readThesisSpec } from "@/lib/thesis-monitor/model";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

import { checkBasket, type CheckCandidate, type TickerFacts } from "./check";
import { runningBasketCount } from "./count";
import {
  emptyHistory,
  monthMove,
  type MetricsSnapshot,
  type Series,
  type TickerHistory,
} from "./history";
import {
  BASKET_ID_RE,
  BASKET_RUNS_COLLECTION,
  BASKETS_COLLECTION,
  MAX_BASKETS_PER_USER,
  MAX_LINES,
  MIN_LINES,
  basketDocId,
  basketRunDocId,
  datedReason,
  instrumentIdOf,
  mainKind,
  mergeLines,
  reasonText,
  recentlyDropped,
  type BasketAgent,
  type BasketChange,
  type BasketDraft,
  type BasketRun,
  type ReplaySummary,
} from "./model";
import { replayBasket, REPLAY_WEEKS, type BasketReplay } from "./replay";

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
const fin = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const MAX_CANDIDATES = 16;
const MAX_RUNS_LISTED = 120;

export class BasketAgentError extends AgentJobError {}

/** What a save says when the basket changed since the editor opened it. */
export const VERSION_CONFLICT =
  "This basket changed since you opened it, maybe from a proposal you accepted. Reload to see it, then edit again.";

/* ── the store ──────────────────────────────────────────────────────────── */

const baskets = () => adminFirestore.collection(BASKETS_COLLECTION);
const runs = () => adminFirestore.collection(BASKET_RUNS_COLLECTION);

export function basketFromDoc(
  data: Record<string, unknown> | undefined,
  uid: string,
): BasketAgent | null {
  if (
    !data ||
    data.uid !== uid ||
    !BASKET_ID_RE.test(text(data.id)) ||
    !Array.isArray(data.lines)
  )
    return null;
  const source = (
    data.source && typeof data.source === "object"
      ? data.source
      : { kind: "own" }
  ) as BasketAgent["source"];
  const idea = text(data.idea);
  const lines = (data.lines as Array<Record<string, unknown>>)
    .filter(
      (line) =>
        line && typeof line === "object" && typeof line.ticker === "string",
    )
    .map((line) => ({
      ticker: text(line.ticker),
      company: text(line.company) || null,
      kind: isThesisKind(line.kind) ? line.kind : null,
      reason: text(line.reason),
      added_at: text(line.added_at),
    }));
  // A stored kind we do not know is read as the basket's own kind, never passed on to the words that name it.
  const fallback = mainKind(
    lines.flatMap((line) => (line.kind ? [{ kind: line.kind }] : [])),
    idea,
  );
  return {
    id: text(data.id),
    uid,
    name: text(data.name) || "My idea",
    idea,
    source,
    lines: lines.map((line) => ({ ...line, kind: line.kind ?? fallback })),
    enabled: data.enabled === true,
    archived: data.archived === true,
    created_at: text(data.created_at),
    updated_at: text(data.updated_at),
    last_checked_day: text(data.last_checked_day) || null,
    replay:
      data.replay && typeof data.replay === "object"
        ? (data.replay as ReplaySummary)
        : null,
    dropped: Array.isArray(data.dropped)
      ? (data.dropped as BasketAgent["dropped"]).filter(
          (entry) =>
            entry &&
            typeof entry.ticker === "string" &&
            typeof entry.day === "string",
        )
      : [],
    version:
      typeof data.version === "number" && Number.isInteger(data.version)
        ? data.version
        : 1,
    thesis: readThesisSpec(data.thesis),
  };
}

export async function listBaskets(uid: string): Promise<BasketAgent[]> {
  const snap = await baskets().where("uid", "==", uid).get();
  return snap.docs
    .map((doc) => basketFromDoc(doc.data() as Record<string, unknown>, uid))
    .filter(
      (basket): basket is BasketAgent => basket !== null && !basket.archived,
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function getBasket(
  uid: string,
  id: string,
): Promise<BasketAgent | null> {
  if (!BASKET_ID_RE.test(id)) return null;
  const snap = await baskets().doc(basketDocId(uid, id)).get();
  const basket = snap.exists
    ? basketFromDoc(snap.data() as Record<string, unknown>, uid)
    : null;
  return basket && !basket.archived ? basket : null;
}

/**
 * How many agents this person has switched on, jobs and baskets together, leaving one basket out. The same count as
 * lib/agent-jobs-data.ts createJob and updateJob use (every switched-on job), so both sides agree on the limit.
 */
export async function runningAgents(
  uid: string,
  exceptBasket: string | null = null,
): Promise<number> {
  const [jobs, running] = await Promise.all([
    listJobs(uid),
    runningBasketCount(uid, exceptBasket),
  ]);
  return jobs.filter((job) => job.enabled).length + running;
}

export function limitWords(limit: number): string {
  return limit === 1
    ? "Your plan runs one agent at a time. Pause the one that is running to run this one."
    : `Your plan runs ${limit} agents at a time. Pause another to run this one.`;
}

/**
 * The switched-on baskets the nightly run leaves out because the plan has no room for them (jobs come first, then the
 * oldest baskets), as the runner decides it.
 */
export function basketsOverPlan(
  list: readonly BasketAgent[],
  jobsRunning: number,
  limit: number,
): Set<string> {
  const room = Math.max(0, limit - jobsRunning);
  const on = list
    .filter((basket) => basket.enabled)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return new Set(on.slice(room).map((basket) => basket.id));
}

/**
 * Save a basket with the replay that ran before it. It switches on when the plan has room for one more agent;
 * otherwise it is saved paused and the caller says why.
 */
export async function createBasket(
  uid: string,
  draft: BasketDraft,
  replay: ReplaySummary | null,
  plan: Plan,
  now = new Date(),
  /** A thesis over holdings is saved with its lines in the same write (lib/thesis-monitor). */
  thesis: BasketAgent["thesis"] = null,
): Promise<BasketAgent> {
  const existing = await listBaskets(uid);
  if (existing.length >= MAX_BASKETS_PER_USER)
    throw new BasketAgentError(
      `You can keep up to ${MAX_BASKETS_PER_USER} idea baskets and theses together. Remove one to add another.`,
    );
  const room = (await runningAgents(uid)) < limitFor("agents", plan);
  const stamp = now.toISOString();
  const basket: BasketAgent = {
    ...draft,
    id: randomBytes(8).toString("hex").slice(0, 12),
    uid,
    lines: mergeLines([], draft.lines, now),
    enabled: room,
    archived: false,
    created_at: stamp,
    updated_at: stamp,
    last_checked_day: null,
    replay,
    dropped: [],
    version: 1,
    ...(thesis ? { thesis } : {}),
  };
  await baskets()
    .doc(basketDocId(uid, basket.id))
    .set(JSON.parse(JSON.stringify(basket)));
  return basket;
}

export type BasketPatch = {
  /** A new name, idea and companies, saved only over `version` (the version the editor opened). */
  draft?: BasketDraft;
  version?: number;
  /** The replay of the edited basket, kept with it. */
  replay?: ReplaySummary | null;
  enabled?: boolean;
  archived?: boolean;
};

/** Edit, pause, switch on or remove one of the person's baskets. Switching on checks the plan's room first. */
export async function updateBasket(
  uid: string,
  id: string,
  patch: BasketPatch,
  plan: Plan,
  now = new Date(),
): Promise<BasketAgent | null> {
  const before = await getBasket(uid, id);
  if (!before) throw new BasketAgentError("That basket does not exist.", 404);
  if (patch.enabled === true && !before.enabled) {
    const limit = limitFor("agents", plan);
    if ((await runningAgents(uid, id)) >= limit)
      throw new BasketAgentError(limitWords(limit), 409, "agents");
  }
  const ref = baskets().doc(basketDocId(uid, id));
  return adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const basket = snap.exists
      ? basketFromDoc(snap.data() as Record<string, unknown>, uid)
      : null;
    if (!basket || basket.archived)
      throw new BasketAgentError("That basket does not exist.", 404);
    const update: Record<string, unknown> = { updated_at: now.toISOString() };
    if (typeof patch.enabled === "boolean") update.enabled = patch.enabled;
    if (patch.draft) {
      // A thesis over holdings takes its companies from its lines (lib/thesis-monitor), not from the basket editor.
      if (basket.source.kind === "holdings")
        throw new BasketAgentError(
          "This is a thesis over your holdings. Edit its lines instead.",
          409,
        );
      if (patch.version !== basket.version)
        throw new BasketAgentError(VERSION_CONFLICT, 409);
      const kept = new Set(patch.draft.lines.map((line) => line.ticker));
      const day = agentMarketDay(now);
      update.name = patch.draft.name;
      update.idea = patch.draft.idea;
      update.lines = mergeLines(basket.lines, patch.draft.lines, now);
      // A company the person takes out is not proposed back for a while.
      update.dropped = [
        ...basket.dropped,
        ...basket.lines
          .filter((line) => !kept.has(line.ticker))
          .map((line) => ({ ticker: line.ticker, day })),
      ].slice(-60);
      update.version = basket.version + 1;
      if (patch.replay !== undefined) update.replay = patch.replay;
    }
    if (patch.archived === true) {
      update.archived = true;
      update.enabled = false;
    }
    tx.set(ref, JSON.parse(JSON.stringify(update)), { merge: true });
    return patch.archived === true
      ? null
      : (basketFromDoc(
          { ...basket, ...update, uid, id } as unknown as Record<
            string,
            unknown
          >,
          uid,
        ) ?? basket);
  });
}

export type BasketChangeOutcome =
  | "done"
  | "already"
  | "missing"
  | "full"
  | "min";

/**
 * Apply one accepted proposal: drop a company, or add one with the reason the agent found. Idempotent: a company
 * already out (or already in) is "already". A basket never goes under MIN_LINES or over MAX_LINES. Writes only the
 * person's own basket, inside a transaction, and bumps its version.
 */
export async function applyBasketChange(
  uid: string,
  change: {
    basket_id: string;
    op: BasketChange["op"];
    ticker: string;
    company: string | null;
    kind: BasketChange["kind"];
    reason: string | null;
  },
  now = new Date(),
): Promise<BasketChangeOutcome> {
  if (!BASKET_ID_RE.test(change.basket_id)) return "missing";
  const ref = baskets().doc(basketDocId(uid, change.basket_id));
  return adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const basket = snap.exists
      ? basketFromDoc(snap.data() as Record<string, unknown>, uid)
      : null;
    if (!basket || basket.archived) return "missing" as const;
    const has = basket.lines.some((line) => line.ticker === change.ticker);
    const stamp = now.toISOString();
    if (change.op === "drop") {
      if (!has) return "already" as const;
      if (basket.lines.length <= MIN_LINES) return "min" as const;
      tx.set(
        ref,
        {
          lines: basket.lines.filter((line) => line.ticker !== change.ticker),
          dropped: [
            ...basket.dropped,
            { ticker: change.ticker, day: agentMarketDay(now) },
          ].slice(-60),
          version: basket.version + 1,
          updated_at: stamp,
        },
        { merge: true },
      );
      return "done" as const;
    }
    if (has) return "already" as const;
    if (basket.lines.length >= MAX_LINES) return "full" as const;
    const line = {
      ticker: change.ticker,
      company: change.company,
      kind: change.kind,
      reason: reasonText(change.reason) || "The agent found it fits the idea.",
      added_at: stamp,
    };
    tx.set(
      ref,
      {
        lines: [...basket.lines, JSON.parse(JSON.stringify(line))],
        version: basket.version + 1,
        updated_at: stamp,
      },
      { merge: true },
    );
    return "done" as const;
  });
}

/* ── runs ───────────────────────────────────────────────────────────────── */

type StoredRun = BasketRun & { provisional?: boolean };

function runFromDoc(
  data: Record<string, unknown> | undefined,
  uid: string,
): StoredRun | null {
  if (!data || data.uid !== uid || !text(data.basket_id) || !text(data.day))
    return null;
  const decision = data.decision;
  if (
    decision !== "propose" &&
    decision !== "nothing" &&
    decision !== "could_not_check"
  )
    return null;
  return {
    id: text(data.id),
    uid,
    basket_id: text(data.basket_id),
    basket_name: text(data.basket_name),
    day: text(data.day),
    ran_at: text(data.ran_at),
    decision,
    summary: text(data.summary),
    statuses: Array.isArray(data.statuses)
      ? (data.statuses as BasketRun["statuses"])
      : [],
    changes: Array.isArray(data.changes)
      ? (data.changes as BasketRun["changes"])
      : [],
    missing: Array.isArray(data.missing)
      ? (data.missing as string[]).filter((entry) => typeof entry === "string")
      : [],
    ...(data.provisional === true ? { provisional: true } : {}),
  };
}

/**
 * The person's basket runs, newest first; one basket's when `basketId` is given. Read newest first and capped in the
 * store; a store that cannot sort that way (no index) falls back to reading them all.
 */
export async function listBasketRuns(
  uid: string,
  basketId: string | null = null,
  limit = MAX_RUNS_LISTED,
): Promise<BasketRun[]> {
  const scoped = basketId
    ? runs().where("uid", "==", uid).where("basket_id", "==", basketId)
    : runs().where("uid", "==", uid);
  const snap = await (async () => {
    try {
      return await scoped.orderBy("day", "desc").limit(limit).get();
    } catch {
      return scoped.get();
    }
  })();
  return snap.docs
    .map((doc) => runFromDoc(doc.data() as Record<string, unknown>, uid))
    .filter(
      (run): run is StoredRun =>
        run !== null && (!basketId || run.basket_id === basketId),
    )
    .sort(
      (a, b) => b.day.localeCompare(a.day) || b.ran_at.localeCompare(a.ran_at),
    )
    .slice(0, limit);
}

/* ── candidates ─────────────────────────────────────────────────────────── */

/**
 * The companies that could join: the idea's theme (its companies and its watch list, with the reviewed reason for
 * each), then the Ask basket's own selection on the idea's words (themes, and today's screens when `screens`). A
 * screen's reason says the day it held, never "today".
 */
export async function candidatesFor(
  basket: Pick<BasketDraft, "idea" | "source">,
  options: { screens: boolean; day?: string },
): Promise<CheckCandidate[]> {
  const out = new Map<string, CheckCandidate>();
  if (basket.source.kind === "theme") {
    const theme = getInvestmentTheme(basket.source.slug);
    for (const candidate of [
      ...(theme?.candidates ?? []),
      ...(theme?.watchlist ?? []),
    ]) {
      const ticker = candidate.ticker.trim().toUpperCase();
      if (ticker && !out.has(ticker))
        out.set(ticker, {
          ticker,
          company: candidate.company || null,
          reason: reasonText(candidate.benefitMechanism),
        });
    }
  }
  const screens = options.screens
    ? ((await getThematicScreens("US").catch(() => null))?.screens ?? [])
    : [];
  const draft = draftBasket({
    thesis: basket.idea,
    themes: INVESTMENT_THEMES,
    screens,
    maxLines: MAX_CANDIDATES,
  });
  const label = absoluteDay(options.day ?? agentMarketDay());
  for (const line of draft.lines) {
    if (!out.has(line.ticker))
      out.set(line.ticker, {
        ticker: line.ticker,
        company: line.company,
        reason: reasonText(datedReason(line.why_it_fits, label)),
      });
  }
  return [...out.values()].slice(0, MAX_CANDIDATES);
}

/* ── the live check ─────────────────────────────────────────────────────── */

async function liveFacts(
  tickers: string[],
  day: string,
): Promise<Map<string, TickerFacts>> {
  const stocks = tickers.map((ticker) => ({
    ticker,
    instrumentId: instrumentIdOf(ticker),
  }));
  const [facts, series] = await Promise.all([
    loadStockFacts(stocks, day),
    loadDailySeries(tickers).catch(() => new Map()),
  ]);
  const out = new Map<string, TickerFacts>();
  for (const stock of stocks) {
    const found = facts.get(stock.instrumentId);
    if (found)
      out.set(stock.ticker, {
        facts: found,
        ret1m: monthMove(
          (series.get(stock.ticker) as Series | undefined) ?? null,
          day,
        ),
      });
  }
  return out;
}

/** A check of a basket on `day`, decided and not written. */
export async function checkNow(
  basket: Pick<BasketAgent, "idea" | "source" | "lines" | "dropped">,
  day: string,
) {
  const candidates = await candidatesFor(basket, { screens: true, day });
  const lineTickers = basket.lines.map((line) => line.ticker);
  const tickers = [
    ...new Set([
      ...lineTickers,
      ...candidates.map((candidate) => candidate.ticker),
    ]),
  ];
  const [facts, closes] = await Promise.all([
    liveFacts(tickers, day),
    closesOnDays(
      basket.lines.map((line) => ({
        ticker: line.ticker,
        day: etDayOf(line.added_at) ?? day,
      })),
    ),
  ]);
  const savedCloses: Record<string, number | null> = {};
  for (const line of basket.lines)
    savedCloses[line.ticker] =
      closes.get(`${line.ticker}|${etDayOf(line.added_at) ?? day}`) ?? null;
  return checkBasket({
    day,
    lines: basket.lines,
    kind: mainKind(basket.lines, basket.idea),
    facts,
    candidates,
    savedCloses,
    skip: recentlyDropped(basket.dropped, day),
  });
}

/** The last session with a final close: the last settled day, stepped back over a weekend. */
export function settledSession(now: Date = new Date()): string {
  let day = lastSettledDay(now);
  for (let step = 0; step < 3; step += 1) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) break;
    day = addDays(day, -1);
  }
  return day;
}

const sameChange = (
  a: Pick<BasketChange, "op" | "ticker">,
  b: Pick<BasketChange, "op" | "ticker">,
) => a.op === b.op && a.ticker === b.ticker;

/**
 * Each change's `since`: carried from the last run that decided (a day that could not check does not break the
 * stretch) when it proposed the same change, else this day.
 */
export function withSince(
  changes: BasketChange[],
  earlier: readonly Pick<BasketRun, "day" | "decision" | "changes">[],
  day: string,
): BasketChange[] {
  const previous = earlier.find(
    (run) => run.day < day && run.decision !== "could_not_check",
  );
  return changes.map((change) => {
    const before = previous?.changes.find((entry) => sameChange(entry, change));
    return { ...change, since: before ? (before.since ?? previous!.day) : day };
  });
}

export type BasketRunOutcome = {
  status: "recorded" | "already_ran";
  run: BasketRun;
};

/**
 * Check one basket and record the decision: one run per basket per market day. The nightly run is dated today; the
 * first check when a basket is switched on (`provisional`) is dated the last settled session, and the nightly run
 * writes over a provisional run of the same day.
 */
export async function runBasket(
  basket: BasketAgent,
  now = new Date(),
  options: { dryRun?: boolean; provisional?: boolean } = {},
): Promise<BasketRunOutcome> {
  const day = options.provisional ? settledSession(now) : agentMarketDay(now);
  const ref = runs().doc(basketRunDocId(basket.uid, basket.id, day));
  const existing = await ref.get();
  if (existing.exists) {
    const run = runFromDoc(
      existing.data() as Record<string, unknown>,
      basket.uid,
    );
    if (run && (options.provisional || !run.provisional))
      return { status: "already_ran", run };
  }
  const [evaluation, earlier] = await Promise.all([
    checkNow(basket, day),
    listBasketRuns(basket.uid, basket.id, 6).catch(() => []),
  ]);
  const run: StoredRun = {
    ...evaluation,
    changes: withSince(evaluation.changes, earlier, day),
    id: basketRunDocId(basket.uid, basket.id, day),
    uid: basket.uid,
    basket_id: basket.id,
    basket_name: basket.name,
    ran_at: now.toISOString(),
    ...(options.provisional ? { provisional: true } : {}),
  };
  if (options.dryRun) return { status: "recorded", run };
  await ref.set(JSON.parse(JSON.stringify(run)));
  await baskets()
    .doc(basketDocId(basket.uid, basket.id))
    .set(
      { last_checked_day: day, updated_at: now.toISOString() },
      { merge: true },
    );
  return { status: "recorded", run };
}

export type BasketRunAllSummary = {
  day: string;
  baskets: number;
  recorded: number;
  already_ran: number;
  failed: number;
  over_plan: number;
  /** Baskets of an account that no longer exists: left as they are, never run. */
  no_account: number;
  /** Left for the next run because the time budget ran out (the scheduled step has a hard limit). */
  deferred: number;
  decisions: Record<BasketRun["decision"], number>;
};

/**
 * Check every basket that is switched on, once. Within each account's plan: running jobs come first, then the oldest
 * baskets up to the plan's agent limit. An account whose user record is gone is skipped; one that could not be read
 * still runs. Nothing is switched off here. Safe to run more than once a day.
 */
export async function runAllBasketAgents(
  now = new Date(),
  log: (line: string) => void = () => {},
  options: {
    dryRun?: boolean;
    /** No basket starts after this time (ms since epoch): the runner's step is killed at its limit. Ten minutes by default. */
    deadline?: number;
  } = {},
): Promise<BasketRunAllSummary> {
  const deadline = options.deadline ?? Date.now() + 10 * 60_000;
  const snap = await baskets().where("enabled", "==", true).get();
  const all = snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return basketFromDoc(data, text(data.uid));
    })
    .filter(
      (basket): basket is BasketAgent =>
        basket !== null && basket.enabled && !basket.archived,
    );
  const byUid = new Map<string, BasketAgent[]>();
  for (const basket of all)
    byUid.set(basket.uid, [...(byUid.get(basket.uid) ?? []), basket]);
  const summary: BasketRunAllSummary = {
    day: agentMarketDay(now),
    baskets: all.length,
    recorded: 0,
    already_ran: 0,
    failed: 0,
    over_plan: 0,
    no_account: 0,
    deferred: 0,
    decisions: { propose: 0, nothing: 0, could_not_check: 0 },
  };
  const runnable: BasketAgent[] = [];
  for (const [uid, owned] of byUid) {
    const system = systemPlanOf(uid);
    const doc = system ? null : await getUserDoc(uid).catch(() => undefined);
    if (!system && doc === null) {
      summary.no_account += owned.length;
      continue;
    }
    // An account that cannot be read still runs: an outage should not silence anyone's agents.
    const plan: Plan =
      system ??
      (doc === undefined ? "pro" : resolveIsSubscribed(doc) ? "pro" : "free");
    const jobs = await listJobs(uid).catch(() => []);
    // Counted as every limit check counts them: every switched-on job, then the baskets.
    const jobsRunning = jobs.filter((job) => job.enabled).length;
    const limit =
      !system && doc === undefined
        ? Number.POSITIVE_INFINITY
        : limitFor("agents", plan);
    const over = basketsOverPlan(owned, jobsRunning, limit);
    // A thesis over holdings takes its slot (it is one of the person's agents) but is checked by the thesis check alone
    // (lib/thesis-monitor), not for companies to add or drop.
    runnable.push(
      ...owned.filter(
        (basket) => !over.has(basket.id) && basket.source.kind !== "holdings",
      ),
    );
    summary.over_plan += over.size;
  }
  for (const basket of runnable) {
    if (Date.now() >= deadline) {
      summary.deferred += 1;
      continue;
    }
    try {
      const outcome = await runBasket(basket, now, { dryRun: options.dryRun });
      summary[outcome.status] += 1;
      if (outcome.status === "recorded")
        summary.decisions[outcome.run.decision] += 1;
      // Basket ids only: a log line never carries a person's uid or email.
      log(
        `basket ${basket.id} ${options.dryRun && outcome.status === "recorded" ? "would record" : outcome.status} ${outcome.run.decision}`,
      );
    } catch (error) {
      summary.failed += 1;
      log(
        `basket ${basket.id} failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  return summary;
}

/* ── history for the replay ─────────────────────────────────────────────── */

function yearsOf(raw: unknown): YearFigures[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object",
    )
    .map((row) => ({
      label: typeof row.period === "string" ? row.period : "",
      revenue: fin(row.revenue) ? row.revenue : null,
      eps: fin(row.eps_diluted) ? row.eps_diluted : null,
      netIncome: fin(row.net_income) ? row.net_income : null,
      fcf: fin(row.free_cash_flow) ? row.free_cash_flow : null,
    }));
}

async function readMetrics(instrumentId: string): Promise<MetricsSnapshot[]> {
  const snap = await adminFirestore
    .collection("tm_stock_metrics_history")
    .doc(instrumentId)
    .collection("snapshots")
    .select(
      "snapshot_date",
      "sector_label",
      "metrics.sales_yy_ttm",
      "metrics.eps_next_y_growth",
      "metrics.eps_yy_ttm",
      "metrics.pe",
      "metrics.payout_ratio",
      "metrics.market_cap",
    )
    .get();
  return snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const metrics = (data.metrics ?? {}) as Record<string, unknown>;
      const day = text(data.snapshot_date) || doc.id;
      return {
        day,
        revenueGrowth: fin(metrics.sales_yy_ttm) ? metrics.sales_yy_ttm : null,
        epsNextYearGrowth: fin(metrics.eps_next_y_growth)
          ? metrics.eps_next_y_growth
          : null,
        epsGrowth: fin(metrics.eps_yy_ttm) ? metrics.eps_yy_ttm : null,
        pe: fin(metrics.pe) && metrics.pe > 0 ? metrics.pe : null,
        payout: fin(metrics.payout_ratio) ? metrics.payout_ratio : null,
        marketCap: fin(metrics.market_cap) ? metrics.market_cap : null,
        sector: text(data.sector_label) || null,
      };
    })
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day))
    .sort((a, b) => a.day.localeCompare(b.day));
}

async function readYears(instrumentId: string): Promise<YearFigures[]> {
  const snap = await adminFirestore
    .collection("tm_stock_facts")
    .doc(instrumentId)
    .get();
  return snap.exists
    ? yearsOf((snap.data() as Record<string, unknown>).financial_history)
    : [];
}

/** Past payments only: how often it pays is worked out from them, day by day (history.ts perYearAsOf). */
async function readDividends(
  ticker: string,
): Promise<TickerHistory["dividends"]> {
  const snap = await adminFirestore
    .collection("tm_dividend_history")
    .doc(ticker)
    .get();
  const parsed = snap.exists ? parseHistoryDoc(snap.data()) : null;
  return parsed ? { payments: parsed.payments } : null;
}

/** Labelled headlines about the company published on or after `since`, newest first, each with its day and tone. */
async function readNews(
  ticker: string,
  since: string,
): Promise<TickerHistory["news"]> {
  // Ids and times only: the replay counts tones by day and shows no headline.
  const query = adminFirestore
    .collection("tm_agent_news")
    .where("stock_tickers", "array-contains", ticker)
    .select("id", "published_at");
  const snap = await (async () => {
    try {
      return await query.orderBy("published_at", "desc").limit(150).get();
    } catch {
      return query.limit(150).get();
    }
  })();
  const rows = snap.docs
    .map((doc) => {
      const data = doc.data() as { id?: string; published_at?: string };
      return {
        id: String(data.id ?? doc.id),
        day: etDayOf(String(data.published_at ?? "")) ?? "",
      };
    })
    .filter((row) => row.day >= since)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 120);
  if (rows.length === 0) return [];
  const labels = await adminFirestore.getAll(
    ...rows.map((row) =>
      adminFirestore.collection("tm_agent_news_tone").doc(row.id),
    ),
    { fieldMask: ["tone"] },
  );
  const out: TickerHistory["news"] = [];
  labels.forEach((label, index) => {
    const tone = label.exists
      ? (label.data() as { tone?: string } | undefined)?.tone
      : null;
    if (tone === "positive" || tone === "negative" || tone === "neutral")
      out.push({ day: rows[index]!.day, tone });
  });
  return out;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

async function readHistory(
  ticker: string,
  end: string,
  moves: Awaited<ReturnType<typeof getRecentMoves>>,
  series: Series | null,
): Promise<TickerHistory> {
  const instrumentId = instrumentIdOf(ticker);
  const soft = <T>(work: Promise<T>, fallback: T): Promise<T> =>
    work.catch(() => fallback);
  const since = addDays(end, -(7 * REPLAY_WEEKS + 60));
  const [metrics, years, calls, dividends, ownership, news, report] =
    await Promise.all([
      soft(readMetrics(instrumentId), []),
      soft(readYears(instrumentId), []),
      soft(getStockCallHistory(instrumentId), []),
      soft(readDividends(ticker), null),
      soft(getStockOwnership(ticker, "US"), { funds: null, insiders: null }),
      soft(readNews(ticker, since), []),
      soft(latestReportFor(ticker, end), null),
    ]);
  const history = emptyHistory(ticker, instrumentId, ticker);
  history.series = series;
  history.metrics = metrics;
  history.years = years;
  history.calls = calls.map((call) => ({
    date: call.date,
    stance: call.stance,
  }));
  history.dividends = dividends;
  // A sale counts from the day it was filed; one with no filing date is left out (its trade date is not when anyone knew).
  history.insiderSales = (ownership.insiders?.rows ?? [])
    .filter(
      (trade) =>
        trade.action === "sell" && !trade.planned && fin(trade.valueUsd),
    )
    .map((trade) => ({
      day: (trade.filedDate ?? "").slice(0, 10),
      usd: trade.valueUsd ?? 0,
    }))
    .filter((sale) => DAY_RE.test(sale.day));
  history.fundCuts = [
    ...(ownership.funds?.rows ?? [])
      .filter(
        (fund) =>
          fund.action === "trimmed" &&
          fin(fund.changePct) &&
          fund.changePct <= -THRESHOLDS.fundCutPct &&
          fund.filedDate,
      )
      .map((fund) => ({
        day: fund.filedDate!,
        fund: fund.fund,
        href: fund.href,
        action: "trimmed" as const,
        changePct: fund.changePct,
      })),
    ...(ownership.funds?.exits ?? [])
      .filter(
        (fund) =>
          fund.filedDate &&
          fin(fund.prevPortfolioPct) &&
          fund.prevPortfolioPct >= 1,
      )
      .map((fund) => ({
        day: fund.filedDate!,
        fund: fund.fund,
        href: fund.href,
        action: "sold" as const,
        changePct: null,
      })),
  ];
  // An explanation counts from the day it was written; with no date it is unknown (history.ts never reads it).
  history.moves = moves
    .filter((move) => move.ticker === ticker)
    .map((move) => {
      const written = etDayOf(move.researchedAt ?? "");
      return {
        day: move.day,
        known: written ? (written < move.day ? move.day : written) : null,
        pct: move.pct,
        headline: move.headline,
        href: moveHref(ticker, move.day),
      };
    });
  history.news = news;
  history.reports = report
    ? [
        {
          day: report.event_date,
          guidance: report.guidance?.change ?? null,
          href: earningsDayHref(report.ticker, report.event_date),
        },
      ]
    : [];
  return history;
}

export type BasketReplayResult = BasketReplay & {
  replayed_at: string;
  tickers: string[];
};

/**
 * Replay a draft over the last four weeks. Reads only; writes nothing. Each company's figures come from its dated
 * history (nothing dated after a day is read for that day); the companies it could add are today's lists (the idea's
 * theme and its theme matches), and today's screen matches are left out.
 */
export async function replayDraft(
  draft: BasketDraft,
  now = new Date(),
): Promise<BasketReplayResult> {
  const end = lastSettledDay(now);
  const candidates = await candidatesFor(draft, { screens: false, day: end });
  const tickers = [
    ...new Set([
      ...draft.lines.map((line) => line.ticker),
      ...candidates.map((candidate) => candidate.ticker),
    ]),
  ];
  const [seriesMap, moves] = await Promise.all([
    loadDailySeries([...tickers, "SPY"]).catch(() => new Map()),
    getRecentMoves(end).catch(() => []),
  ]);
  const histories = new Map<string, TickerHistory>();
  const loaded = await Promise.all(
    tickers.map((ticker) =>
      readHistory(
        ticker,
        end,
        moves,
        (seriesMap.get(ticker) as Series | undefined) ?? null,
      ),
    ),
  );
  loaded.forEach((history) => histories.set(history.ticker, history));
  const market = (seriesMap.get("SPY") as Series | undefined) ?? null;
  const replay = replayBasket({
    lines: draft.lines,
    kind: mainKind(draft.lines, draft.idea),
    candidates,
    histories,
    market,
    // The last session with a final close, as the price history has it.
    end: market?.dates.filter((date) => date <= end).at(-1) ?? end,
  });
  return {
    ...replay,
    replayed_at: now.toISOString(),
    tickers: draft.lines.map((line) => line.ticker),
  };
}

/** What is kept on the basket: the replay without its per-day statuses, with the companies it was run on. */
export function replaySummary(replay: BasketReplayResult): ReplaySummary {
  return {
    from: replay.from,
    to: replay.to,
    sessions: replay.sessions,
    days: replay.days,
    proposals: replay.proposals,
    counts: replay.counts,
    notes: replay.notes,
    replayed_at: replay.replayed_at,
    tickers: replay.tickers,
  };
}

/* ── the stocks we follow ────────────────────────────────────────────────── */

/**
 * The tickers we do not follow (not in the screening universe), so a basket never holds a company the agent cannot
 * check. Empty when the universe could not be read: then nothing is refused on a guess.
 */
export async function unknownTickers(
  tickers: readonly string[],
): Promise<string[]> {
  const coverage = await getCoverage().catch(() => null);
  if (!coverage || coverage.bySymbol.size === 0) return [];
  return tickers.filter(
    (ticker) => !coverage.bySymbol.has(ticker.toUpperCase()),
  );
}

/** Company names from the screening universe, by ticker, for companies that came without one. */
export async function namesFor(
  tickers: readonly string[],
): Promise<Record<string, string>> {
  const coverage = await getCoverage().catch(() => null);
  const out: Record<string, string> = {};
  for (const ticker of tickers) {
    const name = coverage?.bySymbol.get(ticker.toUpperCase())?.name;
    if (name) out[ticker] = name;
  }
  return out;
}

/* ── prices for the cards ───────────────────────────────────────────────── */

export type CardQuote = { price: number; dayPct: number | null };

/** The latest price and today's move per ticker (tm_latest_prices, the price the stock page prints). Never throws. */
export async function quotesFor(
  tickers: readonly string[],
): Promise<Record<string, CardQuote>> {
  if (tickers.length === 0) return {};
  const { getLatestPriceQuotes } = await import("@/lib/firestore");
  const rows = await getLatestPriceQuotes(tickers.map(instrumentIdOf)).catch(
    () => new Map(),
  );
  const out: Record<string, CardQuote> = {};
  for (const ticker of tickers) {
    const quote = (
      rows.get(instrumentIdOf(ticker)) as
        | { quote?: { current?: unknown; day_change_pct?: unknown } }
        | undefined
    )?.quote;
    if (fin(quote?.current) && quote!.current > 0)
      out[ticker] = {
        price: quote!.current as number,
        dayPct: fin(quote?.day_change_pct)
          ? (quote!.day_change_pct as number)
          : null,
      };
  }
  return out;
}
