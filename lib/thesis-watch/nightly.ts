import { viewerFromUserDoc, type Viewer } from "@/lib/entitlements-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { LocalFirestore } from "@/lib/local-firestore";
import { newYorkToday } from "@/lib/portfolio-data";
import { readTheses } from "@/lib/thesis";
import type { UserDoc } from "@/lib/watchlist";

import type { Verdict } from "./rules";
import { checkReasons, type CheckOptions, type ReasonChecks } from "./server";

/**
 * The nightly reason check (scripts/run-reason-checks.ts, after the standing
 * agents in the VPS after_close group): every account with a saved reason gets
 * the same check the web app runs when the person opens a page, so the
 * watcher's verdicts are tonight's even for someone who has not visited.
 *
 * Same code, same plan line: `checkReasons` with the account's own viewer
 * (Pro: every reason; Free: covered stocks only; nobody signed out has a
 * reason), rules wording only (no model call in a batch), writes through the
 * same store code to tm_thesis_checks. The user docs are only read.
 */

/** Users read per store query; the store answers at most 10,000. */
export const USER_QUERY_CAP = 10_000;
/** Accounts checked at once; each one's own stock reads already run in parallel. */
export const DEFAULT_CONCURRENCY = 4;
/** Stop starting new accounts after this long, so a slow night cannot hold the after-close group. */
export const DEFAULT_BUDGET_MS = 15 * 60 * 1000;

export type NightlySummary = {
  day: string;
  dryRun: boolean;
  /** User docs read in the first pass. */
  users: number;
  /** Accounts with at least one saved reason (on any stock). */
  withReasons: number;
  /** Accounts actually checked (the rest ran out of time or failed). */
  accountsChecked: number;
  /** Saved reasons on stocks the account still tracks. */
  reasons: number;
  /** Reasons with a verdict tonight. */
  checked: number;
  /** Reasons the plan does not check (Free, not a covered stock). */
  locked: number;
  /** Reasons on stocks with no data to check (a fund, a non-US listing). */
  unchecked: number;
  /** Verdicts that changed today. */
  changedToday: number;
  verdicts: Record<Verdict, number>;
  /** Accounts that threw, or whose stored checks could not be read (nothing is written for those). */
  failed: number;
  /** Writes to tm_thesis_checks that failed. */
  writeFailures: number;
  skippedForTime: number;
  /** Whether the user list hit the store's query cap (some accounts were not read). */
  capped: boolean;
  seconds: number;
};

export type NightlyDeps = {
  /** Every user doc id with its saved reasons (only the `theses` field is needed). */
  listUsers: () => Promise<Array<{ uid: string; theses: unknown }>>;
  /** The full user docs for these ids (missing ones left out). */
  readUsers: (uids: string[]) => Promise<UserDoc[]>;
  check: (viewer: Viewer, doc: UserDoc, options: CheckOptions) => Promise<ReasonChecks>;
  viewerFor: (uid: string, doc: UserDoc) => Viewer;
  /** Milliseconds, for the time budget; `Date.now` outside tests. */
  clock: () => number;
};

export type NightlyOptions = {
  now?: Date;
  /** Read and decide everything, write nothing. */
  dryRun?: boolean;
  concurrency?: number;
  budgetMs?: number;
};

const READ_CHUNK = 100;

export const storeDeps: NightlyDeps = {
  async listUsers() {
    // Only the reasons field comes back. The LocalDB adapter takes the field list as an array, Firestore as arguments.
    const users = adminFirestore.collection("users") as unknown as { select: (...fields: unknown[]) => { get: () => Promise<{ docs: Array<{ id: string; data: () => unknown }> }> } };
    const query = (adminFirestore as unknown) instanceof LocalFirestore ? users.select(["theses"]) : users.select("theses");
    const snap = await query.get();
    return snap.docs.map((doc) => ({ uid: doc.id, theses: (doc.data() as Record<string, unknown> | undefined)?.theses }));
  },
  async readUsers(uids) {
    const out: UserDoc[] = [];
    for (let i = 0; i < uids.length; i += READ_CHUNK) {
      const chunk = uids.slice(i, i + READ_CHUNK);
      const snaps = await adminFirestore.getAll(...chunk.map((uid) => adminFirestore.collection("users").doc(uid)));
      snaps.forEach((snap, index) => {
        // The document id is the uid; a stray `uid` field inside the data must not replace it.
        if (snap.exists) out.push({ ...(snap.data() as Omit<UserDoc, "uid">), uid: chunk[index]! });
      });
    }
    return out;
  },
  check: (viewer, doc, options) => checkReasons(viewer, doc, options),
  viewerFor: (uid, doc) => viewerFromUserDoc(uid, doc),
  clock: () => Date.now(),
};

export async function runNightlyReasonChecks(deps: NightlyDeps, options: NightlyOptions = {}): Promise<NightlySummary> {
  const started = deps.clock();
  const now = options.now ?? new Date();
  const today = newYorkToday(now);
  const dryRun = options.dryRun === true;
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY));

  const listed = await deps.listUsers();
  const withReasons = listed.filter((row) => Object.keys(readTheses(row.theses)).length > 0).map((row) => row.uid);
  const docs = await deps.readUsers(withReasons);

  const summary: NightlySummary = {
    day: today,
    dryRun,
    users: listed.length,
    withReasons: withReasons.length,
    accountsChecked: 0,
    reasons: 0,
    checked: 0,
    locked: 0,
    unchecked: 0,
    changedToday: 0,
    verdicts: { holds: 0, weaker: 0, broken: 0, played_out: 0 },
    failed: 0,
    writeFailures: 0,
    skippedForTime: 0,
    capped: listed.length >= USER_QUERY_CAP,
    seconds: 0,
  };

  let next = 0;
  const worker = async () => {
    while (next < docs.length) {
      const doc = docs[next++]!;
      if (deps.clock() - started > budgetMs) {
        summary.skippedForTime += 1;
        continue;
      }
      try {
        const result = await deps.check(deps.viewerFor(doc.uid, doc), doc, { persist: !dryRun, word: false, now });
        summary.accountsChecked += 1;
        summary.reasons += Object.keys(result.theses).length;
        summary.locked += result.locked.length;
        summary.writeFailures += result.writeFailures ?? 0;
        if (result.storedReadFailed) summary.failed += 1;
        summary.unchecked += result.unchecked.length;
        for (const view of Object.values(result.checks)) {
          summary.checked += 1;
          summary.verdicts[view.verdict] += 1;
          if (view.change?.day === today) summary.changedToday += 1;
        }
      } catch {
        // Counts only: an error message could carry a document path, and with it a uid.
        summary.failed += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, docs.length)) }, worker));
  summary.seconds = Math.round((deps.clock() - started) / 1000);
  return summary;
}

/**
 * Whether the run should show red on the timer: an account failed, a write
 * failed, time ran out, the user list was cut, or there were reasons to check
 * and not one could be (the stock facts reads most likely all failed).
 */
export function runFailed(summary: NightlySummary): boolean {
  return (
    summary.failed > 0 ||
    summary.writeFailures > 0 ||
    summary.skippedForTime > 0 ||
    summary.capped ||
    (summary.checked === 0 && summary.unchecked > 0)
  );
}

/** The one log line: counts only, never a uid or a ticker. */
export function summaryLine(summary: NightlySummary): string {
  const v = summary.verdicts;
  return [
    `${summary.dryRun ? "dry run, nothing written: " : ""}${summary.day}`,
    `${summary.withReasons} of ${summary.users} accounts have reasons, ${summary.accountsChecked} checked`,
    `${summary.reasons} reasons: ${summary.checked} checked (${v.holds} hold, ${v.weaker} weaker, ${v.broken} broken, ${v.played_out} played out), ${summary.locked} locked by plan, ${summary.unchecked} without data`,
    `${summary.changedToday} changed today`,
    `${summary.failed} failed, ${summary.writeFailures} writes failed, ${summary.skippedForTime} skipped for time${summary.capped ? ", user list capped" : ""}`,
    `${summary.seconds}s`,
  ].join("; ");
}
