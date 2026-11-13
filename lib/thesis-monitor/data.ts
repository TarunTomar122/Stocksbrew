/**
 * Store access for theses (lib/thesis-monitor/model.ts): saving a thesis on the person's own basket, checking it, and
 * the reads the thesis page, the agent's proposals and the nightly runner need.
 *
 * - The thesis itself is the `thesis` field of `tm_agent_baskets/{uid}__{id}`, written inside a transaction over the
 *   version the editor opened. A thesis over holdings is created as a basket (createBasket), so it is counted against
 *   the plan's agent limit like any basket and saved paused when there is no room.
 * - Each check rewrites `tm_agent_thesis_checks/{uid}__{id}`: the lines' records, the events, the dated history. Only
 *   the owner's documents are read or written: the uid comes from the session (or, for the nightly run, from the
 *   basket's own stored uid) and every read checks the stored uid.
 */

import { agentMarketDay, AgentJobError, listJobs } from "@/lib/agent-jobs-data";
import { basketFromDoc, basketsOverPlan, createBasket, getBasket, listBaskets, quotesFor, type CardQuote } from "@/lib/basket-agent/data";
import { BASKETS_COLLECTION, MAX_BASKETS_PER_USER, basketDocId, BASKET_ID_RE, inferKind, instrumentIdOf, mergeLines, nameFromIdea, reasonText, type BasketAgent } from "@/lib/basket-agent/model";
import { limitFor, systemPlanOf, type Plan } from "@/lib/entitlements";
import { adminFirestore } from "@/lib/firebase-admin";
import { getFilingChangesFor } from "@/lib/filing-changes/server";
import { conditionInputsFor } from "@/lib/thesis-watch/condition-data";
import type { ConditionInputs } from "@/lib/thesis-watch/conditions";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

import { checkThesis } from "./check";
import type { ProposalThesis } from "./proposals";
import {
  holdingsOf,
  MAX_COMPANIES,
  MIN_HOLDINGS,
  readThesisState,
  THESIS_CHECKS_COLLECTION,
  thesisStateDocId,
  type ThesisDraft,
  type ThesisSpec,
  type ThesisState,
} from "./model";

export class ThesisError extends AgentJobError {}

export const THESIS_VERSION_CONFLICT = "This thesis changed since you opened it. Reload to see it, then edit again.";

const states = () => adminFirestore.collection(THESIS_CHECKS_COLLECTION);
const baskets = () => adminFirestore.collection(BASKETS_COLLECTION);

/* ── reads ──────────────────────────────────────────────────────────────── */

type StateOwner = Pick<BasketAgent, "id" | "thesis">;

/**
 * The state is this thesis's own: the basket has a thesis and the state was made for it. Lines taken off and put
 * back are a new thesis (a new `created_at`), so the old one's state is never shown or carried over. Pure.
 */
export function stateFits(state: ThesisState | null, basket: StateOwner): state is ThesisState {
  return Boolean(state && basket.thesis && state.basket_id === basket.id && state.spec_created_at === basket.thesis.created_at);
}

/** One thesis's latest check, or null when there is none for the thesis the basket carries now. */
export async function readState(uid: string, basket: StateOwner): Promise<ThesisState | null> {
  if (!BASKET_ID_RE.test(basket.id) || !basket.thesis) return null;
  const snap = await states().doc(thesisStateDocId(uid, basket.id)).get();
  const state = snap.exists ? readThesisState(snap.data(), uid) : null;
  return stateFits(state, basket) ? state : null;
}

/** States for several of the person's theses in one read; missing ones (and earlier theses') are left out. */
export async function readStates(uid: string, list: readonly StateOwner[]): Promise<Map<string, ThesisState>> {
  const owned = list.filter((basket) => BASKET_ID_RE.test(basket.id) && basket.thesis);
  if (owned.length === 0) return new Map();
  const snaps = await adminFirestore.getAll(...owned.map((basket) => states().doc(thesisStateDocId(uid, basket.id))));
  const out = new Map<string, ThesisState>();
  snaps.forEach((snap, index) => {
    const state = snap.exists ? readThesisState(snap.data(), uid) : null;
    if (stateFits(state, owned[index]!)) out.set(owned[index]!.id, state);
  });
  return out;
}

/** The person's baskets that carry a thesis, with their latest check. */
export async function listTheses(uid: string): Promise<Array<{ basket: BasketAgent; state: ThesisState | null }>> {
  const list = (await listBaskets(uid)).filter((basket) => basket.thesis);
  const found = await readStates(uid, list);
  return list.map((basket) => ({ basket, state: found.get(basket.id) ?? null }));
}

/* ── saving ─────────────────────────────────────────────────────────────── */

function specOf(draft: ThesisDraft, before: ThesisSpec | null | undefined, now: Date): ThesisSpec {
  const stamp = now.toISOString();
  return {
    statement: draft.statement,
    lines: draft.lines.map((line) => ({ ticker: line.ticker, conditions: line.conditions })),
    created_at: before?.created_at || stamp,
    updated_at: stamp,
    version: (before?.version ?? 0) + 1,
  };
}

/** The basket the thesis over holdings is stored as: its companies are the holdings with a line. */
function holdingsBasket(draft: ThesisDraft, names: Record<string, string>) {
  const kind = inferKind(draft.statement);
  // The person's statement, when its first sentence fits, is each company's reason: they are in it for the thesis.
  const reason = reasonText(draft.statement) || "Part of this thesis.";
  return {
    name: draft.name || nameFromIdea(draft.statement),
    idea: draft.statement,
    source: { kind: "holdings" as const },
    lines: draft.lines.map((line) => ({ ticker: line.ticker, company: names[line.ticker] ?? null, kind, reason })),
  };
}

/**
 * Create a thesis over the person's holdings. Every company must be one they hold now, at least MIN_HOLDINGS of them.
 * Saved paused when the plan has no room for one more agent (createBasket decides, as for any basket).
 */
export async function createHoldingsThesis(uid: string, draft: ThesisDraft, plan: Plan, names: Record<string, string>, now = new Date()): Promise<BasketAgent> {
  const held = new Set(holdingsOf(await getUserDoc(uid)));
  const outside = draft.lines.filter((line) => !held.has(line.ticker)).map((line) => line.ticker);
  if (outside.length > 0) throw new ThesisError(`You don't hold ${outside.join(", ")}. A thesis over your holdings takes only stocks you own.`, 400);
  if (draft.lines.length < MIN_HOLDINGS) throw new ThesisError(`Give at least ${MIN_HOLDINGS} of your holdings a line.`, 400);
  if (draft.lines.length > MAX_COMPANIES) throw new ThesisError(`A thesis spans up to ${MAX_COMPANIES} companies.`, 400);
  // Theses and idea baskets share one cap; say it in a thesis's words, not the basket's.
  if ((await listBaskets(uid)).length >= MAX_BASKETS_PER_USER)
    throw new ThesisError(`You can keep up to ${MAX_BASKETS_PER_USER} theses and idea baskets together. Remove one to add another.`, 400);
  return createBasket(uid, holdingsBasket(draft, names), null, plan, now, specOf(draft, null, now));
}

/**
 * Save a thesis on one of the person's baskets, over the version the editor opened (0 for a basket with no thesis
 * yet). On an idea basket the lines must be on its own companies (the basket editor changes those). On a thesis over
 * holdings the companies follow the lines, and every one must still be held. Returns the saved basket.
 */
export async function saveThesis(
  uid: string,
  basketId: string,
  draft: ThesisDraft,
  version: number,
  names: Record<string, string>,
  now = new Date(),
): Promise<BasketAgent> {
  const current = await getBasket(uid, basketId);
  if (!current) throw new ThesisError("That thesis does not exist.", 404);
  const holdings = current.source.kind === "holdings";
  if (holdings) {
    const held = new Set(holdingsOf(await getUserDoc(uid)));
    // A company already in the thesis stays even after it is sold; a new one must be held.
    const known = new Set(current.lines.map((line) => line.ticker));
    const outside = draft.lines.filter((line) => !held.has(line.ticker) && !known.has(line.ticker)).map((line) => line.ticker);
    if (outside.length > 0) throw new ThesisError(`You don't hold ${outside.join(", ")}. A thesis over your holdings takes only stocks you own.`, 400);
    if (draft.lines.length < MIN_HOLDINGS) throw new ThesisError(`Give at least ${MIN_HOLDINGS} of your holdings a line.`, 400);
  } else {
    const inBasket = new Set(current.lines.map((line) => line.ticker));
    const outside = draft.lines.filter((line) => !inBasket.has(line.ticker)).map((line) => line.ticker);
    if (outside.length > 0) throw new ThesisError(`${outside.join(", ")} ${outside.length === 1 ? "isn't" : "aren't"} in this basket. Add ${outside.length === 1 ? "it" : "them"} in the basket first.`, 400);
  }
  const ref = baskets().doc(basketDocId(uid, basketId));
  return adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
    const basket = data ? basketFromDoc(data, uid) : null;
    if (!basket || basket.archived) throw new ThesisError("That thesis does not exist.", 404);
    if ((basket.thesis?.version ?? 0) !== version) throw new ThesisError(THESIS_VERSION_CONFLICT, 409);
    const thesis = specOf(draft, basket.thesis, now);
    const update: Record<string, unknown> = { thesis, updated_at: now.toISOString() };
    if (basket.source.kind === "holdings") {
      const next = holdingsBasket({ ...draft, name: draft.name || basket.name }, names);
      const kept = new Set(next.lines.map((line) => line.ticker));
      update.name = next.name;
      update.idea = next.idea;
      update.lines = mergeLines(basket.lines, next.lines, now);
      update.dropped = [...basket.dropped, ...basket.lines.filter((line) => !kept.has(line.ticker)).map((line) => ({ ticker: line.ticker, day: agentMarketDay(now) }))].slice(-60);
      update.version = basket.version + 1;
    }
    tx.set(ref, JSON.parse(JSON.stringify(update)), { merge: true });
    return { ...basket, ...(update as Partial<BasketAgent>), thesis };
  });
}

/* ── the check ──────────────────────────────────────────────────────────── */

export type ThesisRunOutcome = { state: ThesisState; written: boolean };

/** Check one thesis now and store the result (the same day checked again is judged against the day before). */
export async function runThesis(basket: BasketAgent, now = new Date(), options: { dryRun?: boolean } = {}): Promise<ThesisRunOutcome | null> {
  const spec = basket.thesis;
  if (!spec) return null;
  const day = agentMarketDay(now);
  const tickers = basket.lines.map((line) => line.ticker);
  const lineTickers = spec.lines.map((line) => line.ticker).filter((ticker) => tickers.includes(ticker));
  const [previous, figures, filings] = await Promise.all([
    readState(basket.uid, basket),
    conditionInputsFor(lineTickers.map(instrumentIdOf), day),
    // A failed read is null, not "no filings": the check then keeps the risks it knew.
    getFilingChangesFor(lineTickers).catch(() => null),
  ]);
  const inputs = new Map<string, ConditionInputs>();
  for (const ticker of lineTickers) {
    const found = figures.get(instrumentIdOf(ticker));
    if (found) inputs.set(ticker, found);
  }
  const state = checkThesis({
    uid: basket.uid,
    basketId: basket.id,
    day,
    now,
    lines: spec.lines,
    tickers,
    inputs,
    filings,
    previous,
    spec: { created_at: spec.created_at, version: spec.version },
  });
  if (options.dryRun) return { state, written: false };
  await states().doc(thesisStateDocId(basket.uid, basket.id)).set(JSON.parse(JSON.stringify(state)));
  return { state, written: true };
}

export type ThesisRunAllSummary = {
  day: string;
  theses: number;
  checked: number;
  failed: number;
  over_plan: number;
  no_account: number;
  deferred: number;
  statuses: Record<ThesisState["status"], number>;
};

/**
 * Check every thesis on a switched-on basket, once, within each account's plan the same way the basket runner decides
 * it (jobs first, then the oldest baskets up to the agent limit). An account whose user record is gone is skipped.
 * Safe to run more than once a day.
 */
export async function runAllThesisMonitors(
  now = new Date(),
  log: (line: string) => void = () => {},
  options: { dryRun?: boolean; deadline?: number } = {},
): Promise<ThesisRunAllSummary> {
  const deadline = options.deadline ?? Date.now() + 10 * 60_000;
  const snap = await baskets().where("enabled", "==", true).get();
  const all = snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return basketFromDoc(data, typeof data.uid === "string" ? data.uid : "");
    })
    .filter((basket): basket is BasketAgent => basket !== null && basket.enabled && !basket.archived);
  const byUid = new Map<string, BasketAgent[]>();
  for (const basket of all) byUid.set(basket.uid, [...(byUid.get(basket.uid) ?? []), basket]);
  const summary: ThesisRunAllSummary = {
    day: agentMarketDay(now),
    theses: all.filter((basket) => basket.thesis).length,
    checked: 0,
    failed: 0,
    over_plan: 0,
    no_account: 0,
    deferred: 0,
    statuses: { holds: 0, strain: 0, broken: 0, waiting: 0 },
  };
  const runnable: BasketAgent[] = [];
  for (const [uid, owned] of byUid) {
    if (!owned.some((basket) => basket.thesis)) continue;
    const system = systemPlanOf(uid);
    const doc = system ? null : await getUserDoc(uid).catch(() => undefined);
    if (!system && doc === null) {
      summary.no_account += owned.filter((basket) => basket.thesis).length;
      continue;
    }
    const plan: Plan = system ?? (doc === undefined ? "pro" : resolveIsSubscribed(doc) ? "pro" : "free");
    const jobs = await listJobs(uid).catch(() => []);
    const limit = !system && doc === undefined ? Number.POSITIVE_INFINITY : limitFor("agents", plan);
    const over = basketsOverPlan(owned, jobs.filter((job) => job.enabled).length, limit);
    for (const basket of owned) {
      if (!basket.thesis) continue;
      if (over.has(basket.id)) summary.over_plan += 1;
      else runnable.push(basket);
    }
  }
  for (const basket of runnable) {
    if (Date.now() >= deadline) {
      summary.deferred += 1;
      continue;
    }
    try {
      const outcome = await runThesis(basket, now, { dryRun: options.dryRun });
      if (!outcome) continue;
      summary.checked += 1;
      summary.statuses[outcome.state.status] += 1;
      // Basket ids only: a log line never carries a person's uid or email.
      log(`thesis ${basket.id} ${options.dryRun ? "would record" : "recorded"} ${outcome.state.status}`);
    } catch (error) {
      summary.failed += 1;
      log(`thesis ${basket.id} failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  return summary;
}

/* ── the page ───────────────────────────────────────────────────────────── */

export type ThesisPageData = {
  basket: BasketAgent & { thesis: ThesisSpec };
  state: ThesisState | null;
  quotes: Record<string, CardQuote>;
  /** The next report on the earnings calendar per company (the night its report lines are judged again). */
  nextReports: Record<string, string>;
};

/** Each company's next report day from the earnings calendar; a slow or failed read leaves it out. Never throws. */
async function nextReportsFor(tickers: readonly string[]): Promise<Record<string, string>> {
  const { getNextEarningsCalendarEventCached } = await import("@/lib/earnings");
  const rows = await Promise.race([
    Promise.all(tickers.map((ticker) => getNextEarningsCalendarEventCached("US", ticker).then((event) => [ticker, event?.event_date ?? null] as const).catch(() => [ticker, null] as const))),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
  ]);
  return Object.fromEntries((rows ?? []).filter((row): row is readonly [string, string] => typeof row[1] === "string"));
}

/** One of the person's theses with its latest check and prices, or null (someone else's id included). */
export async function loadThesis(uid: string, id: string): Promise<ThesisPageData | null> {
  const basket = await getBasket(uid, id);
  if (!basket?.thesis) return null;
  const tickers = basket.thesis.lines.map((line) => line.ticker);
  const [state, quotes, nextReports] = await Promise.all([readState(uid, basket).catch(() => null), quotesFor(tickers), nextReportsFor(tickers)]);
  return { basket: basket as BasketAgent & { thesis: ThesisSpec }, state, quotes, nextReports };
}

/**
 * Take the lines off an idea basket: the basket and its own checks stay, the thesis field is cleared (its check
 * record stays in the store). A thesis over holdings is removed as a basket instead (archived).
 */
export async function removeThesisLines(uid: string, basketId: string, now = new Date()): Promise<void> {
  if (!BASKET_ID_RE.test(basketId)) throw new ThesisError("That thesis does not exist.", 404);
  const ref = baskets().doc(basketDocId(uid, basketId));
  await adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const basket = snap.exists ? basketFromDoc(snap.data() as Record<string, unknown>, uid) : null;
    if (!basket || basket.archived || !basket.thesis) throw new ThesisError("That thesis does not exist.", 404);
    if (basket.source.kind === "holdings") {
      tx.set(ref, { archived: true, enabled: false, updated_at: now.toISOString() }, { merge: true });
      return;
    }
    tx.set(ref, { thesis: null, updated_at: now.toISOString() }, { merge: true });
  });
}

/* ── for the agent's proposals ──────────────────────────────────────────── */

/**
 * Every thesis the person has, with its latest check (null before the first), as the proposal rules read them
 * (lib/thesis-monitor/proposals.ts): switched-on ones with a check draft reviews, and a review whose thesis is gone or
 * paused is set aside. Prices for the affected companies they do not track come with it.
 */
export async function readProposalTheses(uid: string, tracked: ReadonlySet<string>): Promise<ProposalThesis[]> {
  const theses = await listTheses(uid);
  if (theses.length === 0) return [];
  const untracked = [...new Set(theses.flatMap((entry) => (entry.basket.enabled ? (entry.state?.affected ?? []) : [])))].filter((ticker) => !tracked.has(ticker));
  const quotes = untracked.length > 0 ? await quotesFor(untracked).catch(() => ({}) as Record<string, CardQuote>) : {};
  return theses.map(({ basket, state }) => ({
    id: basket.id,
    name: basket.name,
    enabled: basket.enabled,
    state,
    quotes: Object.fromEntries(
      (state?.affected ?? []).filter((ticker) => (quotes as Record<string, CardQuote>)[ticker]).map((ticker) => {
        const quote = (quotes as Record<string, CardQuote>)[ticker]!;
        return [ticker, { price: quote.price, dayPct: quote.dayPct, at: null }];
      }),
    ),
  }));
}
