/**
 * The reads and the store behind agent proposals (lib/proposals.ts).
 *
 * `syncProposals` reads the person's own records side by side, each with its own time limit, runs the rules, marks the
 * waiting proposals whose facts went stale, and stores the new ones once (the id is the event's hash, so a second
 * sync never stores the same event twice). It runs from the pages in a Suspense boundary, at most once every few
 * minutes per person, so no page waits on it. `listProposals` and `waitingCount` are the cheap reads for the inbox,
 * the briefing line and the bell.
 */

import { filingFact, isMajorFiling } from "@/lib/agent-events-filings";
import { isAgentCall } from "@/lib/agent-jobs";
import { listJobs, listRuns, resolveScope } from "@/lib/agent-jobs-data";
import { etToday } from "@/lib/day-words";
import { can } from "@/lib/entitlements";
import { viewerFromUserDoc } from "@/lib/entitlements-server";
import { afterResponse } from "@/lib/after-response";
import { describeWatch, nextCheckWords } from "@/lib/agent-watch";
import { loadWatches } from "@/lib/agent-watch-server";
import { agentLines } from "@/lib/portfolio-home/agent-lines";
import { adminFirestore } from "@/lib/firebase-admin";
import { getFilingChangesFor } from "@/lib/filing-changes/server";
import { getFilingsStream } from "@/lib/filings";
import { getLatestPriceQuotes } from "@/lib/firestore";
import { inboxStocks } from "@/lib/inbox/server";
import { reportsSource } from "@/lib/inbox/sources";
import {
  candidates,
  isWaiting,
  newProposal,
  pickNew,
  proposalDocId,
  proposalId,
  PROPOSALS_COLLECTION,
  alertFromDoc,
  outcomesOf,
  readProposal,
  refreshOf,
  staleReason,
  toCard,
  waitingOf,
  type Proposal,
  type ProposalAlert,
  type ProposalCallLog,
  type ProposalCard,
  type ProposalInputs,
  type ProposalQuote,
  type ProposalReason,
  type ProposalOutcome,
  type ProposalStock,
  type WatchSummary,
  UNVERIFIED,
} from "@/lib/proposals";
import { resultsFor } from "@/lib/results/server";
import { getDailySeries } from "@/lib/screener-series";
import { filingLine } from "@/lib/since-visit-server";
import { CHECKS_COLLECTION, checkDocId, lastChange, readStoredCheck } from "@/lib/thesis-watch/store";
import { getUserDoc, type UserDoc } from "@/lib/watchlist";

/** How long any one read may take before the rules go on without it. */
const READ_MS = 2500;
/** A person's proposals are worked out again at most this often (per server). */
const SYNC_EVERY_MS = 10 * 60_000;
const SERIES_CHUNK = 40;

function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        console.warn("[proposals] read failed:", error instanceof Error ? error.message : error);
        resolve(null);
      },
    );
  });
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/* ── the store ──────────────────────────────────────────────────────────── */

const collection = () => adminFirestore.collection(PROPOSALS_COLLECTION);

/** Every stored proposal of this person, any status. */
export async function listProposals(uid: string): Promise<Proposal[]> {
  return (await readStore(uid)).proposals;
}

/**
 * When this person's proposals were last worked out sits beside them, as `{uid}__sync` in the same collection (no
 * proposal, so readProposal skips it), so every server instance shares one throttle and the one query reads both.
 */
const syncDocId = (uid: string) => `${uid}__sync`;

async function readStore(uid: string): Promise<{ proposals: Proposal[]; nextAt: number | null; watch: WatchSummary | null }> {
  const snap = await collection().where("uid", "==", uid).get();
  // null: no sync doc yet (this server's own memory decides); 0: the doc says "now" (never run, or reset).
  let nextAt: number | null = null;
  let watch: WatchSummary | null = null;
  const proposals: Proposal[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (doc.id === syncDocId(uid)) {
      const at = typeof data.next_at === "string" ? Date.parse(data.next_at) : NaN;
      nextAt = Number.isFinite(at) ? at : 0;
      watch = readWatch(data.watch);
      continue;
    }
    const proposal = readProposal(data);
    if (proposal && proposal.uid === uid) proposals.push(proposal);
  }
  return { proposals, nextAt, watch };
}

/**
 * What the agent watches for the person, as of the last full sync: their stocks, live price alerts and running agents.
 * The tile that fills an odd row of proposal cards (components/proposals/proposal-cards.tsx).
 */

function readWatch(raw: unknown): WatchSummary | null {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const count = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);
  const stocks = count(data?.stocks);
  const alerts = count(data?.alerts);
  const agents = count(data?.agents);
  return stocks !== null && alerts !== null && agents !== null ? { stocks, alerts, agents } : null;
}

function watchOf(inputs: ProposalInputs): WatchSummary | null {
  if (!inputs.alerts || !inputs.jobs) return null;
  return {
    stocks: inputs.stocks.length,
    alerts: inputs.alerts.filter((alert) => alert.live && (alert.kind === "price_threshold" || alert.kind === "")).length,
    agents: inputs.jobs.filter((job) => job.enabled).length,
  };
}

export async function getProposal(uid: string, id: string): Promise<Proposal | null> {
  const snap = await collection().doc(proposalDocId(uid, id)).get();
  const proposal = snap.exists ? readProposal(snap.data()) : null;
  return proposal && proposal.uid === uid ? proposal : null;
}

/** How many proposals wait for this person: the bell's count and the briefing's line. Never throws. */
export async function waitingCount(uid: string, now: Date = new Date()): Promise<number> {
  const all = await within(listProposals(uid), READ_MS);
  return all ? waitingOf(all, now).length : 0;
}

/* ── the reads ──────────────────────────────────────────────────────────── */

function usTicker(instrumentId: string): string | null {
  return instrumentId.startsWith("US_") ? instrumentId.slice(3).replace(/_/g, ".").toUpperCase() : null;
}

/** The person's US stocks, holding or watching. */
export function proposalStocks(doc: UserDoc | null): ProposalStock[] {
  const tracked = Array.isArray(doc?.tracked_stocks) ? doc!.tracked_stocks.filter((id): id is string => typeof id === "string") : [];
  const positions = (doc?.watchlist_positions ?? {}) as Record<string, string>;
  const holdings = (doc?.watchlist_holdings ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const out: ProposalStock[] = [];
  const seen = new Set<string>();
  for (const id of tracked) {
    const ticker = usTicker(id);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    const holding = holdings[id];
    const held = positions[id] === "holding" || (positions[id] === undefined && Boolean(holding));
    out.push({ ticker, instrumentId: id, position: held ? "holding" : "watchlist" });
  }
  return out;
}

async function readAlerts(uid: string): Promise<ProposalAlert[]> {
  const snap = await adminFirestore.collection("tm_alerts").where("uid", "==", uid).get();
  return snap.docs.map((doc) => alertFromDoc(doc.id, doc.data() as Record<string, unknown>));
}

async function readSeries(tickers: string[]): Promise<NonNullable<ProposalInputs["series"]>> {
  const chunks: string[][] = [];
  for (let index = 0; index < tickers.length; index += SERIES_CHUNK) chunks.push(tickers.slice(index, index + SERIES_CHUNK));
  const sets = await Promise.all(chunks.map((chunk) => getDailySeries(chunk)));
  return Object.assign({}, ...sets.map((set) => set.series));
}

/** The latest quote per ticker (tm_latest_prices, the price the stock page prints). */
export async function readQuotes(stocks: Array<{ ticker: string; instrumentId: string }>): Promise<Record<string, ProposalQuote>> {
  if (stocks.length === 0) return {};
  const rows = await getLatestPriceQuotes(stocks.map((stock) => stock.instrumentId));
  const out: Record<string, ProposalQuote> = {};
  for (const stock of stocks) {
    const row = rows.get(stock.instrumentId);
    const price = num(row?.quote?.current);
    if (!row || price === null || price <= 0) continue;
    out[stock.ticker] = { price, dayPct: num(row.quote?.day_change_pct), at: text(row.captured_at) || text(row.updated_at) || null };
  }
  return out;
}

async function readResults(tickers: string[], today: string): Promise<NonNullable<ProposalInputs["results"]>> {
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
  const reads = await resultsFor(tickers, { since, today });
  return reads.map((read) => ({
    ticker: read.ticker.toUpperCase(),
    reportDate: read.reportDate,
    movePct: read.move?.pct ?? null,
    guidance: read.guidance?.change ?? null,
    epsVerdict: read.eps?.verdict ?? null,
    epsSurprisePct: num(read.eps?.surprisePct),
    revenueVerdict: read.revenue?.verdict ?? null,
    sources: read.sources.map((source) => ({ label: source.label, source: source.source || null, at: source.at, url: source.url })),
  }));
}

async function readFilings(tickers: Set<string>, now: Date): Promise<NonNullable<ProposalInputs["filings"]>> {
  const stream = await getFilingsStream();
  const from = now.getTime() - 6 * 86_400_000;
  const out: NonNullable<ProposalInputs["filings"]> = [];
  for (const filing of stream) {
    const at = Date.parse(filing.filedAt);
    if (Number.isFinite(at) && at <= from) break;
    if (!tickers.has(filing.ticker)) continue;
    const fact = filingFact(filing);
    if (!fact || !isMajorFiling(fact)) continue;
    out.push({ ticker: fact.ticker, filed_at: fact.filed_at, line: filingLine(fact), url: filing.url || null });
  }
  return out;
}

/** Filings whose risk factors changed, on the person's holdings (tm_filing_changes), every stored comparison with changes. */
async function readFilingChanges(stocks: ProposalStock[]): Promise<NonNullable<ProposalInputs["filingChanges"]>> {
  const held = stocks.filter((stock) => stock.position === "holding").map((stock) => stock.ticker);
  if (held.length === 0) return [];
  const out: NonNullable<ProposalInputs["filingChanges"]> = [];
  for (const doc of await getFilingChangesFor(held)) {
    for (const comparison of [doc.latest, ...doc.history]) {
      if (comparison.status !== "changes") continue;
      const { filing, base } = comparison;
      out.push({
        ticker: doc.ticker,
        form: filing.form,
        accession: filing.accession,
        filed: filing.filed,
        url: filing.url,
        added: comparison.added,
        dropped: comparison.dropped.length,
        base: base ? { form: base.form, filed: base.filed, url: base.url } : null,
        partial: comparison.scope === "partial",
      });
    }
  }
  return out;
}

/** Shares held in the person's practice account by ticker (tm_practice_accounts, lib/practice-store.ts). */
async function readPractice(uid: string): Promise<Record<string, number>> {
  // Only the positions: the account doc also carries the whole order log.
  const [snap] = await adminFirestore.getAll(adminFirestore.collection("tm_practice_accounts").doc(uid), { fieldMask: ["positions"] });
  const positions = snap?.exists ? ((snap.data() as Record<string, unknown> | undefined)?.positions as Record<string, { shares?: unknown }> | undefined) : undefined;
  const out: Record<string, number> = {};
  for (const [symbol, position] of Object.entries(positions ?? {})) {
    const shares = num(position?.shares);
    if (shares !== null && shares > 0) out[symbol.toUpperCase()] = shares;
  }
  return out;
}

/** Our call on one stock now; a stock with no stored call has a call of null (not a failed read). */
async function readCall(instrumentId: string): Promise<ProposalCallLog> {
  const [snap] = await adminFirestore.getAll(adminFirestore.collection("tm_call_stability").doc(instrumentId), { fieldMask: ["call"] });
  const call = snap?.exists ? (snap.data() as Record<string, unknown> | undefined)?.call : null;
  return { call: isAgentCall(call) ? call : null, changes: [] };
}

async function readReasons(uid: string, stocks: ProposalStock[]): Promise<Record<string, ProposalReason>> {
  const held = stocks.filter((stock) => stock.position === "holding");
  if (held.length === 0) return {};
  const snaps = await adminFirestore.getAll(...held.map((stock) => adminFirestore.collection(CHECKS_COLLECTION).doc(checkDocId(uid, stock.instrumentId))));
  const out: Record<string, ProposalReason> = {};
  snaps.forEach((snap, index) => {
    const stored = snap.exists ? readStoredCheck(snap.data()) : null;
    if (!stored || stored.uid !== uid) return;
    const change = lastChange(stored.history);
    out[held[index]!.ticker] = {
      verdict: stored.verdict,
      since: change?.day ?? stored.history[0]?.day ?? stored.day ?? null,
      signals: stored.signals.map((signal) => ({ text: signal.text, asOf: signal.asOf, level: signal.level })),
    };
  });
  return out;
}

/** Everything the rules read for this person. A read that fails or runs out of time is left undefined. */
export async function loadProposalInputs(uid: string, doc: UserDoc | null, now: Date = new Date()): Promise<{ inputs: ProposalInputs; complete: boolean }> {
  const viewer = viewerFromUserDoc(uid, doc);
  const plan = viewer.plan;
  const today = etToday(now);
  const stocks = proposalStocks(doc);
  const tickers = stocks.map((stock) => stock.ticker);
  let complete = true;
  const guard = <T,>(promise: Promise<T>): Promise<T | undefined> =>
    within(promise, READ_MS).then((value) => {
      if (value === null) complete = false;
      return value ?? undefined;
    });
  const [scope, series, quotes, alerts, results, filings, filingChanges, reasons, runs, jobs, upcoming, practice] = await Promise.all([
    guard(resolveScope(uid, { kind: "watchlist" }, { calls: true })),
    guard(readSeries(tickers)),
    guard(readQuotes(stocks)),
    guard(readAlerts(uid)),
    guard(readResults(tickers, today)),
    guard(readFilings(new Set(tickers), now)),
    guard(readFilingChanges(stocks)),
    can("reason_watch", plan) ? guard(readReasons(uid, stocks)) : Promise.resolve({}),
    guard(listRuns(uid, 60)),
    guard(listJobs(uid)),
    guard(reportsSource(inboxStocks(doc, viewer), today)),
    guard(readPractice(uid)),
  ]);
  const inputs: ProposalInputs = {
    now,
    today,
    plan,
    stocks,
    levels: scope?.levels ?? undefined,
    calls: scope?.calls ? Object.fromEntries(Object.entries(scope.calls).map(([ticker, log]) => [ticker, { call: log.call, changes: log.changes.map((change) => ({ date: change.date, from: change.from, to: change.to })) }])) : undefined,
    series,
    quotes,
    alerts,
    results,
    filings,
    filingChanges,
    reasons,
    runs: runs?.map((run) => ({
      id: run.id,
      job_id: run.job_id,
      job_name: run.job_name,
      day: run.day,
      ran_at: run.ran_at,
      decision: run.decision,
      findings: run.findings.map((finding) => ({
        ticker: finding.ticker,
        headline: finding.headline,
        kind: finding.kind,
        change_pct: finding.change_pct,
        close: finding.close,
        url: finding.url,
        source: finding.source,
        at: finding.at,
      })),
    })),
    jobs: jobs?.map((job) => ({ id: job.id, name: job.name, enabled: job.enabled, trigger: job.trigger, scope: job.scope })),
    upcoming: upcoming?.map((report) => ({ ticker: report.ticker, date: report.date, session: report.session, usualPct: report.usualPct })),
    practice,
  };
  return { inputs, complete };
}

/**
 * Why a proposal no longer fits, from the facts read again right before an accept: the stock's price, the person's
 * alerts and stocks, our call, the practice account and the agents, as each action needs. A read that fails says
 * nothing (null), so a slow store never blocks an accept on a guess.
 */
export async function freshStaleReason(uid: string, proposal: Proposal, now: Date = new Date()): Promise<string | null> {
  const action = proposal.action;
  // The plan and stocks matter only to the watch and agent checks; the alert and ticket checks never wait on them.
  const base: ProposalInputs = { now, today: etToday(now), plan: "free", stocks: [] };
  switch (action.type) {
    case "alert_price":
    case "alert_earnings": {
      const instrumentId = action.instrument_id;
      const [alerts, quotes] = await Promise.all([within(readAlerts(uid), READ_MS), within(readQuotes([{ ticker: action.ticker, instrumentId }]), READ_MS)]);
      // Never act on facts that could not be checked: no alerts read, or (for a price alert) no price now.
      if (!alerts || (action.type === "alert_price" && !quotes?.[action.ticker])) return UNVERIFIED;
      return staleReason(proposal, { ...base, alerts, quotes: quotes ?? undefined });
    }
    case "practice_ticket": {
      const instrumentId = proposal.instrument_id ?? `US_${action.ticker.replace(/\./g, "_")}`;
      const [call, practice] = await Promise.all([within(readCall(instrumentId), READ_MS), action.side === "sell" ? within(readPractice(uid), READ_MS) : Promise.resolve({})]);
      if (!call || !practice) return UNVERIFIED;
      return staleReason(proposal, { ...base, calls: { [action.ticker]: call }, practice: action.side === "sell" ? practice : undefined });
    }
    case "watch_add": {
      const doc = await within(getUserDoc(uid), READ_MS);
      if (!doc) return UNVERIFIED;
      return staleReason(proposal, { ...base, plan: viewerFromUserDoc(uid, doc).plan, stocks: proposalStocks(doc) });
    }
    case "agent_enable":
    case "agent_create": {
      const jobs = await within(listJobs(uid), READ_MS);
      if (!jobs) return UNVERIFIED;
      return staleReason(proposal, { ...base, jobs: jobs.map((job) => ({ id: job.id, name: job.name, enabled: job.enabled, trigger: job.trigger, scope: job.scope })) });
    }
  }
  return UNVERIFIED;
}

/* ── sync ───────────────────────────────────────────────────────────────── */

/** When this server may next work out a person's proposals (beside the shared `next_at` on the sync doc). */
const nextSync = new Map<string, number>();
/** A sync already running for a person: a second page load waits for it rather than running every read again. */
const running = new Map<string, Promise<SyncResult>>();
/** After a sync whose reads missed something, the next try waits this long (not every page load). */
const RETRY_MS = 2 * 60_000;

/** Mark a waiting proposal expired, only while it is still waiting (an accept in flight wins; one stuck long ago does not). */
async function expire(uid: string, proposal: Proposal, reason: string, now: Date): Promise<boolean> {
  const ref = collection().doc(proposalDocId(uid, proposal.id));
  return adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? readProposal(snap.data()) : null;
    if (!current || !(current.status === "pending" || (current.status === "applying" && isWaiting(current, now)))) return false;
    tx.set(ref, { status: "expired", expired_reason: reason, updated_at: now.toISOString() }, { merge: true });
    return true;
  });
}

/** Write newer words and figures over a proposal, only while it is still waiting. */
async function refreshWords(uid: string, proposal: Proposal, patch: Record<string, unknown>, now: Date): Promise<boolean> {
  const ref = collection().doc(proposalDocId(uid, proposal.id));
  return adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? readProposal(snap.data()) : null;
    if (!current || current.status !== "pending") return false;
    tx.set(ref, { ...patch, updated_at: now.toISOString() }, { merge: true });
    return true;
  });
}

/** Store a new proposal once: a document that already exists (another sync got there first) is left as it is. */
async function store(proposal: Proposal): Promise<boolean> {
  try {
    await collection().doc(proposalDocId(proposal.uid, proposal.id)).create(proposal as unknown as Record<string, unknown>);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/exist|409|conflict/i.test(message)) return false;
    throw error;
  }
}

export type SyncResult = { waiting: Proposal[]; created: number; expired: number; complete: boolean; skipped: boolean; watch: WatchSummary | null; all: Proposal[] };

/**
 * Work out this person's proposals and store the new ones. With `force` false (the pages), it runs at most once every
 * SYNC_EVERY_MS per person across servers (the sync doc's `next_at`), or RETRY_MS after a sync whose reads missed;
 * otherwise it only reads the store. A sync already running for the person is shared.
 */
export async function syncProposals(uid: string, options: { now?: Date; force?: boolean; doc?: UserDoc | null } = {}): Promise<SyncResult> {
  if (options.force) return runSync(uid, options);
  const inFlight = running.get(uid);
  if (inFlight) return inFlight;
  const run = runSync(uid, options).finally(() => running.delete(uid));
  running.set(uid, run);
  return run;
}

async function runSync(uid: string, options: { now?: Date; force?: boolean; doc?: UserDoc | null }): Promise<SyncResult> {
  const now = options.now ?? new Date();
  const { proposals: existing, nextAt, watch: storedWatch } = await readStore(uid);
  // The shared doc decides (so a reset after an answer holds on every server); this server's memory only stands in
  // when there is no doc yet or its write failed.
  const next = nextAt ?? nextSync.get(uid) ?? 0;
  // A next time far in the future (a skewed clock) is not trusted.
  if (!options.force && now.getTime() < next && next - now.getTime() <= SYNC_EVERY_MS) {
    return { waiting: waitingOf(existing, now), created: 0, expired: 0, complete: true, skipped: true, watch: storedWatch, all: existing };
  }
  nextSync.set(uid, now.getTime() + RETRY_MS);
  const doc = options.doc !== undefined ? options.doc : await getUserDoc(uid).catch(() => null);
  if (!doc) return { waiting: waitingOf(existing, now), created: 0, expired: 0, complete: false, skipped: true, watch: storedWatch, all: existing };
  const { inputs, complete } = await loadProposalInputs(uid, doc, now);

  let expired = 0;
  const kept: Proposal[] = [];
  const drafts = candidates(inputs);
  const draftById = new Map(drafts.map((draft) => [proposalId(draft.event.key), draft]));
  for (const proposal of existing) {
    if (!isWaiting(proposal, now) && proposal.status !== "pending") {
      kept.push(proposal);
      continue;
    }
    const reason = staleReason(proposal, inputs);
    if (reason && (await expire(uid, proposal, reason, now).catch(() => false))) {
      expired += 1;
      kept.push({ ...proposal, status: "expired", expired_reason: reason, updated_at: now.toISOString() });
      continue;
    }
    // The same proposal made again today: its figures (the price) and words follow the latest read.
    const draft = draftById.get(proposal.id);
    const refresh = draft && proposal.status === "pending" ? refreshOf(proposal, draft) : null;
    if (refresh && (await refreshWords(uid, proposal, refresh, now).catch(() => false))) kept.push({ ...proposal, ...refresh });
    else kept.push(proposal);
  }

  const fresh = pickNew(drafts, kept, now).map((draft) => newProposal(uid, draft, now));
  let created = 0;
  for (const proposal of fresh) {
    if (await store(proposal).catch((error) => {
      console.warn("[proposals] store failed:", error instanceof Error ? error.message : error);
      return false;
    })) {
      created += 1;
      kept.push(proposal);
    }
  }
  const watch = watchOf(inputs);
  // A full read is not repeated for SYNC_EVERY_MS; one that missed something is tried again after RETRY_MS. An answer
  // given while this ran (a reset newer than this run's start) wins: the next load works out the next proposal.
  const after = now.getTime() + (complete ? SYNC_EVERY_MS : RETRY_MS);
  nextSync.set(uid, after);
  const syncRef = collection().doc(syncDocId(uid));
  await adminFirestore
    .runTransaction(async (tx) => {
      const snap = await tx.get(syncRef);
      const resetAt = snap.exists ? (snap.data() as Record<string, unknown> | undefined)?.reset_at : null;
      if (typeof resetAt === "string" && Date.parse(resetAt) >= now.getTime()) return;
      tx.set(syncRef, { uid, synced_at: now.toISOString(), next_at: new Date(after).toISOString(), complete, ...(watch ? { watch } : {}) }, { merge: true });
    })
    .catch(() => undefined);
  return { waiting: waitingOf(kept, now), created, expired, complete, skipped: false, watch: watch ?? storedWatch, all: kept };
}

/** Forget the throttle (after an answer, so the next page load can offer the next proposal). */
export async function resetProposalSync(uid: string): Promise<void> {
  nextSync.delete(uid);
  await collection().doc(syncDocId(uid)).set({ uid, next_at: null, reset_at: new Date().toISOString() }, { merge: true }).catch(() => undefined);
}

/**
 * The waiting proposals as cards for a page, started early (beside the page's own reads) and bounded from the start:
 * the sync gets until `syncMs`, then the stored ones are shown while it finishes in the background (kept alive past
 * the response), and a slow price read leaves the cards without a price. Null when nothing could be read.
 */
export type ProposalCardsLoad = { cards: ProposalCard[]; watch: WatchSummary | null; outcomes: ProposalOutcome[] };

export async function loadProposalCards(uid: string, options: { syncMs?: number; doc?: UserDoc | null; now?: Date } = {}): Promise<ProposalCardsLoad | null> {
  const now = options.now ?? new Date();
  // The agents' status read starts now, beside the sync, not after it.
  const agentsRead = agentsStatus(uid, etToday(now));
  // Marked handled now: the early return below never awaits it, and a rejection there must not go unhandled.
  agentsRead.catch(() => {});
  const sync = syncProposals(uid, { now, doc: options.doc });
  afterResponse("proposals sync", sync);
  // The store is read beside the sync from the start, so a slow sync still leaves time for the stored ones.
  const storedRead = within(readStore(uid), (options.syncMs ?? 1500) + 600);
  const synced = await within(sync, options.syncMs ?? 1500);
  const stored = synced ? null : await storedRead;
  const waiting = synced?.waiting ?? (stored ? waitingOf(stored.proposals, now) : null);
  if (!waiting) return null;
  const [cards, agents] = await Promise.all([proposalCards(waiting, 1200), agentsRead]);
  const counts = synced?.watch ?? stored?.watch ?? null;
  return {
    cards,
    watch: counts ? { ...counts, ...(agents ? { agents: agents.running, paused: agents.paused, next: agents.next } : {}) } : null,
    outcomes: outcomesOf(synced?.all ?? stored?.proposals ?? [], now),
  };
}

/** The person's agents now (the same cached read as the agents list): how many run, how many are paused, the next check. */
async function agentsStatus(uid: string, today: string): Promise<{ running: number; paused: number; next: string | null } | null> {
  const loaded = await within(loadWatches(uid, today), 1500);
  if (!loaded || loaded.state !== "ready") return null;
  const { next } = agentLines(loaded.value, today, { describe: describeWatch });
  const running = loaded.value.jobs.filter((job) => job.enabled).length;
  return { running, paused: loaded.value.jobs.length - running, next: next ? nextCheckWords(next, today) : null };
}

/** The cards for the page: the waiting proposals with each stock's latest price and day move. */
export async function proposalCards(waiting: Proposal[], quoteMs = READ_MS): Promise<ProposalCard[]> {
  const stocks = waiting.flatMap((proposal) => (proposal.ticker && proposal.instrument_id ? [{ ticker: proposal.ticker, instrumentId: proposal.instrument_id }] : []));
  // A slow quote read leaves the cards without a price rather than holding the page.
  const quotes = (await within(readQuotes(stocks), quoteMs)) ?? {};
  return waiting.map((proposal) => toCard(proposal, proposal.ticker ? quotes[proposal.ticker] ?? null : null));
}

export { isWaiting };
export type { WatchSummary };
