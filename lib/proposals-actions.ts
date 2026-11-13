/**
 * Accepting or dismissing an agent proposal (lib/proposals.ts).
 *
 * Accept claims the proposal first (pending → applying, in a transaction), so two clicks or two tabs apply it once;
 * then it runs the action through the app's own write paths, with the person's plan and its limits:
 * - price alerts and the earnings reminder: lib/stock-alerts.ts (createStockAlert, deleteStockAlert, which only turns
 *   an alert off);
 * - Watching: lib/radar-mutations.ts addRadarStock, keyed by the proposal so a retry is the same mutation, and never
 *   with `move`: a stock already followed keeps its kind, and a holding is never changed;
 * - agents: lib/agent-jobs-data.ts updateJob and createJob, with the plan's running limit;
 * - the practice ticket: nothing is written, the person places the order on /practice.
 * The outcome is stored on the proposal. A failure (a plan limit, say) puts it back to pending with the reason, so the
 * card shows the limit's own words and the person can try again or dismiss it. Accepting an accepted proposal is a
 * no-op. Nothing here sends an email, places a trade or deletes anything.
 */

import { AgentJobError, createJob, listJobs, updateJob } from "@/lib/agent-jobs-data";
import { limitFor, lockCopy, type Plan } from "@/lib/entitlements";
import { adminFirestore } from "@/lib/firebase-admin";
import {
  APPLYING_STALE_MS,
  proposalDocId,
  PROPOSALS_COLLECTION,
  readProposal,
  stableJson,
  UNVERIFIED,
  usd,
  type Proposal,
  type ProposalAction,
  type ProposalResult,
  type ProposalStatus,
} from "@/lib/proposals";
import { addRadarStock } from "@/lib/radar-mutations";
import { applyBasketChange } from "@/lib/basket-agent/data";
import { basketHref, MAX_LINES, MIN_LINES } from "@/lib/basket-agent/model";
import { createStockAlert, deleteStockAlert, StockAlertError } from "@/lib/stock-alerts";
import { freshStaleReason } from "@/lib/proposals-server";

/* ── the store, behind a seam so tests can use a fake ───────────────────── */

export type ClaimOutcome =
  | { kind: "claimed"; proposal: Proposal }
  | { kind: "missing" }
  | { kind: "expired"; proposal: Proposal }
  | { kind: "decided"; proposal: Proposal };

export type ProposalStore = {
  /** pending (or an accept stuck mid-way) → `to`, in one transaction. */
  claim(uid: string, id: string, to: "applying" | "dismissed", now: Date): Promise<ClaimOutcome>;
  /** Write the outcome onto the proposal. */
  finish(uid: string, id: string, patch: { status: ProposalStatus; result: ProposalResult | null; decided_at: string | null; updated_at: string; expired_reason?: string | null }): Promise<void>;
};

export const firestoreProposalStore: ProposalStore = {
  async claim(uid, id, to, now) {
    const ref = adminFirestore.collection(PROPOSALS_COLLECTION).doc(proposalDocId(uid, id));
    return adminFirestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const proposal = snap.exists ? readProposal(snap.data()) : null;
      if (!proposal || proposal.uid !== uid) return { kind: "missing" } as const;
      const outcome = claimOf(proposal, now);
      if (outcome !== "claim") {
        if (outcome === "expired" && proposal.status === "pending") {
          tx.set(ref, { status: "expired", expired_reason: "expired", updated_at: now.toISOString() }, { merge: true });
        }
        return { kind: outcome, proposal } as const;
      }
      const at = now.toISOString();
      tx.set(ref, to === "dismissed" ? { status: "dismissed", decided_at: at, updated_at: at } : { status: "applying", updated_at: at }, { merge: true });
      return { kind: "claimed", proposal } as const;
    });
  },
  async finish(uid, id, patch) {
    await adminFirestore.collection(PROPOSALS_COLLECTION).doc(proposalDocId(uid, id)).set(patch, { merge: true });
  },
};

/** Whether a proposal can be decided now: "claim", or why not. */
export function claimOf(proposal: Pick<Proposal, "status" | "expires_at" | "updated_at">, now: Date): "claim" | "expired" | "decided" {
  const stuck = proposal.status === "applying" && now.getTime() - Date.parse(proposal.updated_at) > APPLYING_STALE_MS;
  if (proposal.status !== "pending" && !stuck) return proposal.status === "expired" ? "expired" : "decided";
  if (Date.parse(proposal.expires_at) <= now.getTime()) return "expired";
  return "claim";
}

/* ── the write paths, behind a seam ─────────────────────────────────────── */

export type ActionDeps = {
  createAlert: typeof createStockAlert;
  deleteAlert: typeof deleteStockAlert;
  /** Turn an alert this accept turned off back on (a move whose new alert could not be set), unless it had fired. */
  restoreAlert: (uid: string, alertId: string) => Promise<void>;
  addStock: typeof addRadarStock;
  listJobs: typeof listJobs;
  updateJob: typeof updateJob;
  createJob: typeof createJob;
  /** Takes a company out of, or puts one into, the person's idea basket (lib/basket-agent/data.ts). Defaults to it. */
  editBasket?: typeof applyBasketChange;
  /**
   * The facts read again right before the action: why the proposal no longer fits (lib/proposals.ts staleReason on a
   * fresh read of the stock's price, the person's alerts, our call, the practice account), or null.
   */
  staleNow: (uid: string, proposal: Proposal) => Promise<string | null>;
};

export const defaultActionDeps: ActionDeps = {
  createAlert: createStockAlert,
  deleteAlert: deleteStockAlert,
  restoreAlert: async (uid, alertId) => {
    const ref = adminFirestore.collection("tm_alerts").doc(alertId);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : undefined;
    // Only an alert that was live before this accept turned it off: a fired one stays off.
    if (!data || data.uid !== uid || data.triggered === true) return;
    await ref.set({ active: true, updated_at: new Date().toISOString() }, { merge: true });
  },
  addStock: addRadarStock,
  listJobs,
  updateJob,
  createJob,
  editBasket: applyBasketChange,
  staleNow: (uid, proposal) => freshStaleReason(uid, proposal),
};

export type Actor = { uid: string; email: string | null; plan: Plan };

const ok = (code: string, message: string, now: Date, extra: Partial<ProposalResult> = {}): ProposalResult => ({ ok: true, code, message, at: now.toISOString(), ...extra });
const fail = (code: string, message: string, now: Date): ProposalResult => ({ ok: false, code, message, at: now.toISOString() });

function alertError(error: unknown, now: Date): ProposalResult {
  if (error instanceof StockAlertError) return fail(error.code, error.message, now);
  console.warn("[proposals] alert write failed:", error instanceof Error ? error.message : error);
  return fail("failed", "The alert could not be saved just now. Try again in a minute.", now);
}

async function priceAlert(action: Extract<ProposalAction, { type: "alert_price" }>, actor: Actor, id: string, now: Date, deps: ActionDeps): Promise<ProposalResult> {
  if (!actor.email) return fail("no_email", "Add an email to your account to get alerts.", now);
  const create = () =>
    deps.createAlert({
      uid: actor.uid,
      email: actor.email!,
      instrumentId: action.instrument_id,
      ticker: action.ticker,
      kind: "price_threshold",
      condition: action.condition,
      targetPrice: action.price,
      note: "Set from your agent's proposal",
      metadata: { proposal_id: id },
      plan: actor.plan,
    });
  const side = `${action.ticker} ${action.condition} ${usd(action.price)}`;
  let alertId: string | null = null;
  let already = false;
  let oldOff = false;
  try {
    alertId = (await create()).alert_id;
  } catch (error) {
    if (error instanceof StockAlertError && error.code === "alert_exists") already = true;
    else if (error instanceof StockAlertError && error.code === "plan_limit" && action.replaces) {
      // Moving an alert on a full Free plan: the old one frees its slot first, and comes back if the new one fails.
      try {
        await deps.deleteAlert(actor.uid, action.replaces.alert_id);
        oldOff = true;
        alertId = (await create()).alert_id;
      } catch (retry) {
        if (oldOff) await deps.restoreAlert(actor.uid, action.replaces.alert_id).catch(() => undefined);
        return alertError(retry, now);
      }
    } else return alertError(error, now);
  }
  if (action.replaces && !oldOff) {
    // A move is create-new, then turn-off-old. If the old one cannot be turned off, the new one this accept made is
    // turned off again and the accept is refused, so the person never ends up with both live and no word of it.
    try {
      await deps.deleteAlert(actor.uid, action.replaces.alert_id);
    } catch (error) {
      // Already gone (turned off elsewhere, or not theirs): the move has nothing left to turn off.
      if (!(error instanceof StockAlertError && error.code === "alert_not_found")) {
        const rollback = alertId ? await deps.deleteAlert(actor.uid, alertId).then(() => true, () => false) : true;
        if (rollback) return fail("move_failed", `Your ${usd(action.replaces.price)} alert couldn't be turned off, so nothing changed. Try again in a minute.`, now);
        // Neither step could be undone: both are live, and the card says so.
        return ok("both_live", `Set ${side}, but your ${usd(action.replaces.price)} alert is still on too. Turn it off on My stocks.`, now, { ref: alertId, href: "/portfolio?tab=alerts" });
      }
    }
  }
  if (already && !action.replaces) return ok("already", `Your alert is already set: ${side}.`, now);
  return ok("done", action.replaces ? `Alert moved: ${side}.` : `Alert set: ${side}.`, now, { ref: alertId });
}

async function earningsAlert(action: Extract<ProposalAction, { type: "alert_earnings" }>, actor: Actor, id: string, now: Date, deps: ActionDeps): Promise<ProposalResult> {
  if (!actor.email) return fail("no_email", "Add an email to your account to get reminders.", now);
  try {
    const made = await deps.createAlert({
      uid: actor.uid,
      email: actor.email,
      instrumentId: action.instrument_id,
      ticker: action.ticker,
      kind: "earnings_24h",
      note: `Earnings reminder · ${action.label}`,
      metadata: { event_date: action.report_date, proposal_id: id },
      plan: actor.plan,
    });
    return ok("done", `Reminder on: we'll email you the day before ${action.ticker} reports.`, now, { ref: made.alert_id });
  } catch (error) {
    if (error instanceof StockAlertError && error.code === "alert_exists") return ok("already", `Your ${action.ticker} earnings reminder is already on.`, now);
    return alertError(error, now);
  }
}

/** Adds a stock to Watching. Never `move`: a stock already followed keeps its kind, a holding keeps its numbers. */
async function watchAction(action: Extract<ProposalAction, { type: "watch_add" }>, actor: Actor, id: string, now: Date, deps: ActionDeps): Promise<ProposalResult> {
  try {
    const result = await deps.addStock({
      uid: actor.uid,
      instrumentId: action.instrument_id,
      positionType: "watchlist",
      mutationId: `proposal_${id}`,
      requestedBy: "agent",
    });
    if (result.already_tracked) return ok("already", `${action.ticker} is already on your list.`, now);
    return ok("done", `Added ${action.ticker} to Watching.`, now);
  } catch (error) {
    console.warn("[proposals] watchlist write failed:", error instanceof Error ? error.message : error);
    return fail("failed", "Your list could not be changed just now. Try again in a minute.", now);
  }
}

function agentError(error: unknown, now: Date): ProposalResult {
  if (error instanceof AgentJobError) return fail(error.feature ?? (error.status === 404 ? "stale" : "agent"), error.message, now);
  console.warn("[proposals] agent write failed:", error instanceof Error ? error.message : error);
  return fail("failed", "The agent could not be changed just now. Try again in a minute.", now);
}

async function agentAction(action: Extract<ProposalAction, { type: "agent_enable" | "agent_create" }>, actor: Actor, now: Date, deps: ActionDeps): Promise<ProposalResult> {
  const runLimit = limitFor("agents", actor.plan);
  if (action.type === "agent_enable") {
    try {
      await deps.updateJob(actor.uid, action.job_id, { enabled: action.enabled }, now, runLimit, actor.plan);
      return ok("done", action.enabled ? `Turned on "${action.job_name}".` : `Paused "${action.job_name}".`, now, { ref: action.job_id });
    } catch (error) {
      return agentError(error, now);
    }
  }
  try {
    const jobs = await deps.listJobs(actor.uid);
    const same = jobs.find((job) => job.template === action.template && stableJson(job.trigger) === stableJson(action.trigger));
    if (same) return ok("already", `You already have "${same.name}".`, now, { ref: same.id, href: "/agents" });
    const job = await deps.createJob(actor.uid, { template: action.template, name: action.name, trigger: action.trigger, scope: action.scope }, now, runLimit, actor.plan);
    // Saved switched off past the plan's running limit: the limit's own words.
    if (!job.enabled) return ok("saved_paused", lockCopy("agents").title, now, { ref: job.id, href: "/agents" });
    return ok("done", `Added "${job.name}".`, now, { ref: job.id, href: "/agents" });
  } catch (error) {
    return agentError(error, now);
  }
}

/** An idea basket edit: only the basket changes, nothing is bought or sold. */
async function basketAction(action: Extract<ProposalAction, { type: "basket_edit" }>, actor: Actor, now: Date, deps: ActionDeps): Promise<ProposalResult> {
  const href = basketHref(action.basket_id);
  try {
    const outcome = await (deps.editBasket ?? applyBasketChange)(actor.uid, { basket_id: action.basket_id, op: action.op, ticker: action.ticker, company: action.company, kind: action.kind, reason: action.reason }, now);
    if (outcome === "missing") return fail("stale", "That idea basket no longer exists.", now);
    if (outcome === "full") return fail("basket_full", `That basket already holds ${MAX_LINES} companies. Take one out first.`, now);
    if (outcome === "min") return fail("basket_min", `A basket keeps at least ${MIN_LINES} companies. Add one first.`, now);
    const where = `“${action.basket_name}”`;
    if (outcome === "already") return ok("already", action.op === "drop" ? `${action.ticker} is already out of ${where}.` : `${action.ticker} is already in ${where}.`, now, { href });
    return ok("done", action.op === "drop" ? `Took ${action.ticker} out of ${where}.` : `Added ${action.ticker} to ${where}.`, now, { ref: action.basket_id, href });
  } catch (error) {
    console.warn("[proposals] basket write failed:", error instanceof Error ? error.message : error);
    return fail("failed", "The basket could not be changed just now. Try again in a minute.", now);
  }
}

export function practiceHref(ticker: string, side: "buy" | "sell"): string {
  return `/practice?symbol=${encodeURIComponent(ticker)}&side=${side}#ticket`;
}

/** Run one proposal's action. Never throws: a failure is a result with ok false. */
export async function applyAction(proposal: Proposal, actor: Actor, now: Date, deps: ActionDeps = defaultActionDeps): Promise<ProposalResult> {
  const action = proposal.action;
  switch (action.type) {
    case "alert_price":
      return priceAlert(action, actor, proposal.id, now, deps);
    case "alert_earnings":
      return earningsAlert(action, actor, proposal.id, now, deps);
    case "watch_add":
      return watchAction(action, actor, proposal.id, now, deps);
    case "agent_enable":
    case "agent_create":
      return agentAction(action, actor, now, deps);
    case "basket_edit":
      return basketAction(action, actor, now, deps);
    case "practice_ticket":
      return ok("opened", `Opened a practice ticket for ${action.ticker}. Nothing is placed until you confirm.`, now, { href: practiceHref(action.ticker, action.side) });
  }
  return fail("failed", "This proposal can't be applied.", now);
}

/* ── decide ─────────────────────────────────────────────────────────────── */

export type Decision = "accept" | "dismiss";

export type DecideOutcome = {
  status: number;
  body: { ok: boolean; status: ProposalStatus | null; result: ProposalResult | null; already?: boolean; error?: string };
};

/** Accept or dismiss one proposal for its owner. Idempotent: a decided proposal answers with what it already is. */
export async function decideProposal(
  input: { actor: Actor; id: string; decision: Decision; now?: Date },
  store: ProposalStore = firestoreProposalStore,
  deps: ActionDeps = defaultActionDeps,
): Promise<DecideOutcome> {
  const now = input.now ?? new Date();
  const claim = await store.claim(input.actor.uid, input.id, input.decision === "accept" ? "applying" : "dismissed", now);
  if (claim.kind === "missing") return { status: 404, body: { ok: false, status: null, result: null, error: "That proposal does not exist." } };
  if (claim.kind === "expired") return { status: 410, body: { ok: false, status: "expired", result: claim.proposal.result, error: "This proposal has expired." } };
  if (claim.kind === "decided") {
    const current = claim.proposal;
    const same = (input.decision === "accept" && current.status === "accepted") || (input.decision === "dismiss" && current.status === "dismissed");
    // Applying: another click's accept is still running; say so rather than run it twice.
    if (current.status === "applying") return { status: 409, body: { ok: false, status: "applying", result: null, error: "This proposal is being applied." } };
    return same
      ? { status: 200, body: { ok: true, status: current.status, result: current.result, already: true } }
      : { status: 409, body: { ok: false, status: current.status, result: current.result, error: `This proposal was already ${current.status}.` } };
  }
  if (input.decision === "dismiss") return { status: 200, body: { ok: true, status: "dismissed", result: null } };

  // The facts again, read now: a proposal that no longer fits (the price already went past the level, the call
  // changed) is refused and goes away, rather than setting an alert that fires at once. Facts that could not be read
  // are never acted on: the proposal stays waiting and says so.
  const stale = await deps.staleNow(input.actor.uid, claim.proposal).catch(() => UNVERIFIED);
  const result =
    stale === UNVERIFIED
      ? fail("unverified", claim.proposal.action.type === "basket_edit" ? BASKET_UNVERIFIED_WORDS : UNVERIFIED_WORDS, now)
      : stale
        ? fail("stale", STALE_WORDS[stale] ?? STALE_WORDS.default!, now)
        : await applyAction(claim.proposal, input.actor, now, deps);
  const at = now.toISOString();
  // A fact that changed makes the proposal go away; any other failure leaves it waiting with the reason.
  const status: ProposalStatus = result.ok ? "accepted" : result.code === "stale" ? "expired" : "pending";
  const patch = { status, result, decided_at: result.ok ? at : null, updated_at: at, ...(status === "expired" ? { expired_reason: stale ?? "stale" } : {}) };
  // The action has happened by now: the outcome is said as it is even when recording it fails (tried twice), so the
  // card never offers it again as if nothing was done.
  try {
    await store.finish(input.actor.uid, input.id, patch);
  } catch {
    await store.finish(input.actor.uid, input.id, patch).catch((error) => {
      console.warn("[proposals] could not record the outcome:", error instanceof Error ? error.message : error);
    });
  }
  return { status: 200, body: { ok: result.ok, status, result } };
}

/** An accept refused because the latest facts could not be read: nothing ran, try again. */
export const UNVERIFIED_WORDS = "Couldn't check the latest price; try again in a minute.";

/** The same for an idea-basket change, whose re-check reads the basket, not a price. */
export const BASKET_UNVERIFIED_WORDS = "Couldn't check the basket; try again in a minute.";

/** Why an accept was refused because the facts changed, one line for the card. */
const STALE_WORDS: Record<string, string> = {
  price_past_level: "The price is already past that level, so the alert would fire at once. This one is gone.",
  alert_set: "That alert is already set. This one is gone.",
  alert_gone: "The alert it would move is no longer on. This one is gone.",
  report_passed: "That report has already come out. This one is gone.",
  call_changed: "Our call on it changed since. This one is gone.",
  not_in_practice: "Your practice account no longer holds it. This one is gone.",
  tracked: "It is already on your list. This one is gone.",
  agent_gone: "That agent no longer exists. This one is gone.",
  agent_already: "That agent is already set that way. This one is gone.",
  agent_exists: "You already have an agent for that. This one is gone.",
  basket_gone: "That idea basket no longer exists. This one is gone.",
  basket_already: "The basket already has that change. This one is gone.",
  thesis_gone: "That thesis no longer exists. This one is gone.",
  thesis_paused: "That thesis is paused. This one is gone.",
  default: "The facts changed since, so this one is gone.",
};
