import { etToday } from "@/lib/day-words";
import { adminFirestore } from "@/lib/firebase-admin";
import { FRESHNESS_FORMS, sharedReportFreshness, strictTime, type FreshnessSignals, type FreshnessVerdict } from "@/lib/research/freshness";
import { RESEARCH_SHARED_COLLECTION, isReportKey, reportKeyAt, type ResearchReport } from "@/lib/research/types";

/**
 * The shared copy of each stock's newest long research report
 * (`tm_research_shared/{TICKER}`), and the lock that keeps two people asking at
 * once from paying for two runs (`tm_research_shared/{TICKER}__running`).
 *
 * What is shared holds nothing about the person who ran it. A report is built
 * only from what every reader may see (lib/research/gather.ts asks for the call
 * with its levels redacted and reads nothing from the person's list), so the
 * body, sources and charts are the same whoever asked; the uid, the public link,
 * the token counts and the person's own key are dropped here.
 *
 * Additive only: the shared doc is replaced only by a newer report, and a person
 * who is handed it gets their own copy in their own history under a new key.
 * Nothing in the per-person store is ever changed or deleted.
 */

/** A run that holds the lock longer than this has died somewhere; the route's maxDuration is 300 s. */
export const RESEARCH_LOCK_TTL_MS = 330_000;

export type SharedReport = Omit<ResearchReport, "uid" | "share_id" | "usage" | "key" | "shared_from"> & {
  kind: "shared";
  /** The run that wrote it, in the runner's own store. */
  source_key: string;
  /** When it was finished: the age the freshness rule reads. */
  written_at: string;
  /** When this copy was stored. */
  stored_at: string;
};

export type RunLock = {
  ticker: string;
  key: string;
  started_at: string;
  expires_at: string;
  done_at: string | null;
  /** "handover": the claimer found a fresh shared copy after all and ran nothing; waiters take that copy. */
  outcome: RunOutcome | null;
};

export type RunOutcome = "ready" | "failed" | "handover";

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sharedRef(ticker: string) {
  return adminFirestore.collection(RESEARCH_SHARED_COLLECTION).doc(ticker);
}

function lockRef(ticker: string) {
  return adminFirestore.collection(RESEARCH_SHARED_COLLECTION).doc(`${ticker}__running`);
}

/** The shareable part of a finished report. Null for anything not finished. */
export function toShared(report: ResearchReport, now: Date = new Date()): SharedReport | null {
  if (report.status !== "ready" || !report.body || !isReportKey(report.key)) return null;
  const { uid: _uid, share_id: _share, usage: _usage, key, shared_from: _from, ...rest } = report;
  return plain({ ...rest, kind: "shared" as const, source_key: key, written_at: report.finished_at ?? report.updated_at, stored_at: now.toISOString() });
}

/** The shared report as this person's own saved report: a new key, their uid, the original's dates. */
export function copyForPerson(shared: SharedReport, uid: string, now: Date = new Date()): ResearchReport {
  const { kind: _kind, source_key, written_at, stored_at: _stored, ...rest } = shared;
  return plain({
    ...rest,
    key: reportKeyAt(now),
    uid,
    status: "ready" as const,
    finished_at: shared.finished_at ?? written_at,
    updated_at: now.toISOString(),
    usage: null,
    error: null,
    share_id: null,
    shared_from: source_key,
  });
}

function asShared(data: Record<string, unknown> | undefined, ticker: string): SharedReport | null {
  if (!data || data.kind !== "shared" || data.ticker !== ticker || data.status !== "ready" || !data.body) return null;
  if (typeof data.written_at !== "string" || !isReportKey(data.source_key)) return null;
  return data as unknown as SharedReport;
}

export async function getSharedReport(ticker: string): Promise<SharedReport | null> {
  const snap = await sharedRef(ticker).get();
  return snap.exists ? asShared(snap.data(), ticker) : null;
}

/** Store a finished report as the stock's shared copy, unless a newer one is already there. True when stored. */
export async function putSharedReport(report: ResearchReport, now: Date = new Date()): Promise<boolean> {
  const shared = toShared(report, now);
  if (!shared) return false;
  const ref = sharedRef(report.ticker);
  return adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? asShared(snap.data(), report.ticker) : null;
    if (current && Date.parse(current.written_at) >= Date.parse(shared.written_at)) return false;
    tx.set(ref, shared);
    return true;
  });
}

function asLock(data: Record<string, unknown> | undefined): RunLock | null {
  if (!data || typeof data.key !== "string" || typeof data.started_at !== "string" || typeof data.expires_at !== "string") return null;
  return {
    ticker: String(data.ticker ?? ""),
    key: data.key,
    started_at: data.started_at,
    expires_at: data.expires_at,
    done_at: typeof data.done_at === "string" ? data.done_at : null,
    outcome: data.outcome === "ready" || data.outcome === "failed" || data.outcome === "handover" ? data.outcome : null,
  };
}

/** A lock some run still holds: not finished and not past its time. */
export function lockHeld(lock: RunLock | null, now: number = Date.now()): boolean {
  return Boolean(lock && !lock.done_at && Date.parse(lock.expires_at) > now);
}

export async function readRunLock(ticker: string): Promise<RunLock | null> {
  const snap = await lockRef(ticker).get();
  return snap.exists ? asLock(snap.data()) : null;
}

/** Claim the one run on this stock. When another run holds it, that run's lock comes back instead. */
export async function claimRun(ticker: string, key: string, now: Date = new Date()): Promise<{ claimed: true } | { claimed: false; lock: RunLock }> {
  const ref = lockRef(ticker);
  return adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? asLock(snap.data()) : null;
    if (current && lockHeld(current, now.getTime()) && current.key !== key) return { claimed: false as const, lock: current };
    tx.set(ref, {
      kind: "running",
      ticker,
      key,
      started_at: now.toISOString(),
      expires_at: new Date(now.getTime() + RESEARCH_LOCK_TTL_MS).toISOString(),
      done_at: null,
      outcome: null,
    });
    return { claimed: true as const };
  });
}

/** Let go of the lock, only if it is still this run's. */
export async function releaseRun(ticker: string, key: string, outcome: RunOutcome, now: Date = new Date()): Promise<void> {
  const ref = lockRef(ticker);
  await adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? asLock(snap.data()) : null;
    if (!current || current.key !== key || current.done_at) return;
    tx.set(ref, { done_at: now.toISOString(), outcome }, { merge: true });
  });
}

/* ── is it still fresh ──────────────────────────────────────────────────── */

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * What has happened to the stock that the freshness rule reads: its latest earnings day, its newest 10-Q, 10-K or
 * 8-K, and the latest change to our call. Throws when any of them cannot be read, so an outage means a new run,
 * never an old report passed off as current. A record whose date cannot be read sets `unreadable`, which makes any
 * copy stale: we cannot tell whether it came after the report.
 */
export async function loadFreshnessSignals(ticker: string, now: Date = new Date()): Promise<FreshnessSignals> {
  const today = etToday(now);
  const [earnings, filings, call] = await Promise.all([
    adminFirestore.collection("tm_earnings_events").where("ticker", "==", ticker).get(),
    adminFirestore.collection("tm_agent_filings").where("ticker", "==", ticker).get(),
    adminFirestore.collection("tm_call_stability").doc(`US_${ticker.replace(/\./g, "_")}`).get(),
  ]);
  // Every relevant record must have a date we can read; one we cannot makes the copy stale whatever the others say.
  let unreadable = false;
  let latestEarningsDay: string | null = null;
  for (const doc of earnings.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data.market && data.market !== "US") continue;
    const at = strictTime(data.event_date);
    if (!at) {
      unreadable = true;
      continue;
    }
    if (at.day <= today && (!latestEarningsDay || at.day > latestEarningsDay)) latestEarningsDay = at.day;
  }
  const filingsAt: string[] = [];
  for (const doc of filings.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (!(FRESHNESS_FORMS as readonly string[]).includes(text(data.form_group))) continue;
    // A company's record also lists filings about other companies it holds; only its own count.
    if (data.role && data.role !== "subject") continue;
    if (!strictTime(data.filed_at)) {
      unreadable = true;
      continue;
    }
    filingsAt.push(text(data.filed_at));
  }
  let latestCallChangeDay: string | null = null;
  const changes = call.exists ? ((call.data() as Record<string, unknown>)?.changes as unknown) : undefined;
  if (changes !== undefined && changes !== null && !Array.isArray(changes)) unreadable = true;
  for (const change of Array.isArray(changes) ? changes : []) {
    const at = strictTime((change as Record<string, unknown> | null)?.date);
    if (!at) {
      unreadable = true;
      continue;
    }
    if (!latestCallChangeDay || at.day > latestCallChangeDay) latestCallChangeDay = at.day;
  }
  return { latestEarningsDay, filingsAt, latestCallChangeDay, ...(unreadable ? { unreadable: true } : {}) };
}

export type SharedLookup = { report: SharedReport; verdict: FreshnessVerdict } | null;

const NO_SIGNALS: FreshnessSignals = { latestEarningsDay: null, filingsAt: [], latestCallChangeDay: null };

/**
 * The stock's shared report with the freshness verdict on it, or null when there is none. Measured from when its
 * run started reading evidence (created_at). The age is checked before anything else is read, so an old copy costs
 * one read. Call it right before every hand-over: freshness can change while someone waits.
 */
export async function lookupSharedReport(ticker: string, now: Date = new Date()): Promise<SharedLookup> {
  const report = await getSharedReport(ticker);
  if (!report) return null;
  const early = sharedReportFreshness(report.created_at, NO_SIGNALS, now);
  if (!early.fresh) return { report, verdict: early };
  const signals = await loadFreshnessSignals(ticker, now);
  return { report, verdict: sharedReportFreshness(report.created_at, signals, now) };
}
