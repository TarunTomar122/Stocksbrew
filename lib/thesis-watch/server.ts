import { isCovered, type Viewer } from "@/lib/entitlements-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { newYorkToday } from "@/lib/portfolio-data";
import { readTheses, type Thesis } from "@/lib/thesis";
import type { UserDoc } from "@/lib/watchlist";

import { loadConditionInputs } from "./condition-data";
import { judgeConditions, nextConditionRecords, type Condition, type ConditionRecord, type ConditionResult } from "./conditions";
import { closesOnDays, loadStockFacts, tickerFromId } from "./data";
import { thesisModelReader } from "./model";
import { evaluate, ruleNote, savedDay, withConditions, type ReasonCheck, type Verdict } from "./rules";
import { CHECKS_COLLECTION, checkDocId, lastChange, nextStoredCheck, readStoredCheck, toDoc, type StoredCheck } from "./store";
import { wordNote } from "./word";

/**
 * The reason watcher for one signed-in person: every saved reason on a stock
 * they still track, checked against today's facts. Free checks covered
 * stocks only; Pro checks every reason (`reason_watch` in lib/entitlements.ts).
 * Locked stocks are named but nothing about them is computed or sent.
 *
 * Runs when the person opens Portfolio, the stock page, My stocks or the
 * memo, at most once a day per stock in effect: the facts are cached per stock
 * per day and the stored check is only rewritten when the day or the findings
 * change. A model rewords a note only when the findings change and only when
 * the caller can wait for it (the API route, not a page render).
 */

export type CheckView = {
  instrumentId: string;
  ticker: string;
  kind: ReasonCheck["kind"];
  verdict: Verdict;
  headline: string;
  note: string;
  wordedBy: "rules" | "model";
  signals: ReasonCheck["signals"];
  checked: ReasonCheck["checked"];
  quote: string | null;
  limit: string | null;
  asOf: string;
  /** The verdict before the latest change and the day it changed, when there was one. */
  change: { from: Verdict; day: string } | null;
  /** The reason's measurable conditions, checked tonight, in the order saved. Empty when it has none. */
  conditions: ConditionView[];
};

/** One condition as a page shows it: tonight's result, the day a new report was checked, and since when. */
export type ConditionView = ConditionResult & { checkedOn: string | null; since: string | null };

function conditionViews(results: readonly ConditionResult[], records: readonly ConditionRecord[] | null): ConditionView[] {
  return results.map((result) => {
    const record = records?.find((row) => row.key === result.key) ?? null;
    return { ...result, checkedOn: record?.checked_on ?? null, since: record?.since ?? null };
  });
}

export type ReasonChecks = {
  checks: Record<string, CheckView>;
  /** Stocks with a reason that this plan does not check (Free, not covered). */
  locked: string[];
  /** Stocks with a reason we could not check (no data for it, or not a US stock). */
  unchecked: string[];
  /** Every reason on a tracked stock, by instrument id, for the surfaces that list them. */
  theses: Record<string, Thesis>;
  /**
   * The stored checks could not be read, so nothing was written: a check built
   * without them would replace their history and wording. The page still shows
   * tonight's verdicts. Absent when the read worked.
   */
  storedReadFailed?: boolean;
  /** Writes to tm_thesis_checks that failed. Absent when there were none. */
  writeFailures?: number;
};

export const EMPTY_CHECKS: ReasonChecks = { checks: {}, locked: [], unchecked: [], theses: {} };

function trackedTheses(userDoc: UserDoc | null): Record<string, Thesis> {
  if (!userDoc) return {};
  const tracked = new Set(Array.isArray(userDoc.tracked_stocks) ? userDoc.tracked_stocks : []);
  const all = readTheses((userDoc as unknown as Record<string, unknown>).theses);
  return Object.fromEntries(Object.entries(all).filter(([id]) => tracked.has(id)));
}

/** Whether this viewer's plan checks the reason on this stock. */
export function watches(viewer: Viewer, instrumentId: string): boolean {
  if (viewer.plan === "pro") return true;
  if (viewer.plan === "anon") return false;
  return isCovered(viewer, instrumentId);
}

function viewOf(
  check: ReasonCheck,
  stored: Pick<StoredCheck, "note" | "wordedBy" | "history"> | null,
  note: { note: string; wordedBy: "rules" | "model" },
  conditions: ConditionView[] = [],
): CheckView {
  return {
    instrumentId: check.instrumentId,
    ticker: check.ticker,
    kind: check.kind,
    verdict: check.verdict,
    headline: check.headline,
    note: note.note,
    wordedBy: note.wordedBy,
    signals: check.signals,
    checked: check.checked,
    quote: check.quote,
    limit: check.limit,
    asOf: check.asOf,
    change: stored ? lastChange(stored.history) : null,
    conditions,
  };
}

async function readStored(uid: string, ids: string[]): Promise<Map<string, StoredCheck>> {
  const out = new Map<string, StoredCheck>();
  if (ids.length === 0) return out;
  const snaps = await adminFirestore.getAll(...ids.map((id) => adminFirestore.collection(CHECKS_COLLECTION).doc(checkDocId(uid, id))));
  snaps.forEach((snap, index) => {
    const stored = snap.exists ? readStoredCheck(snap.data()) : null;
    if (stored) out.set(ids[index]!, stored);
  });
  return out;
}

export type CheckOptions = {
  /** Only these stocks (instrument ids); all reasons when left out. */
  only?: readonly string[];
  /** Write the result to tm_thesis_checks (default true). */
  persist?: boolean;
  /** Let a model reword notes whose findings changed (default false: page renders do not wait for a model). */
  word?: boolean;
  now?: Date;
};

export async function checkReasons(viewer: Viewer, userDoc: UserDoc | null, options: CheckOptions = {}): Promise<ReasonChecks> {
  if (!viewer.uid || !userDoc) return EMPTY_CHECKS;
  const uid = viewer.uid;
  const now = options.now ?? new Date();
  const today = newYorkToday(now);
  const theses = trackedTheses(userDoc);
  const only = options.only ? new Set(options.only) : null;
  const wanted = Object.keys(theses).filter((id) => !only || only.has(id));
  const locked = wanted.filter((id) => !watches(viewer, id));
  const open = wanted.filter((id) => watches(viewer, id));
  const us = open.filter((id) => id.startsWith("US_"));
  const unchecked = open.filter((id) => !id.startsWith("US_"));
  if (us.length === 0) return { checks: {}, locked, unchecked, theses };

  const stocks = us.map((id) => ({ instrumentId: id, ticker: tickerFromId(id) }));
  const holdings = userDoc.watchlist_holdings ?? {};
  const needClose = stocks
    .filter((stock) => !(typeof holdings[stock.instrumentId]?.average_cost === "number" && holdings[stock.instrumentId]!.average_cost! > 0))
    .map((stock) => ({ ticker: stock.ticker, day: savedDay(theses[stock.instrumentId]!.created_at) }))
    .filter((request) => /^\d{4}-\d{2}-\d{2}$/.test(request.day));
  let storedReadFailed = false;
  const factsLoad = loadStockFacts(stocks, today);
  // The measurable conditions' own figures (reports, results, EPS), only for reasons that have conditions.
  const withLines = stocks.filter((stock) => (theses[stock.instrumentId]!.conditions ?? []).length > 0);
  const [facts, closes, stored, conditionInputs] = await Promise.all([
    factsLoad,
    needClose.length > 0 ? closesOnDays(needClose) : Promise.resolve(new Map<string, number>()),
    readStored(uid, us).catch((error) => {
      console.warn("[thesis-watch] stored checks read failed:", error instanceof Error ? error.message : error);
      storedReadFailed = true;
      return new Map<string, StoredCheck>();
    }),
    withLines.length > 0 ? factsLoad.then((loaded) => loadConditionInputs(withLines, loaded, today)) : Promise.resolve(new Map()),
  ]);

  // At most four wording calls at once: the first visit of a day can redraft every holding's note.
  const baseReader = options.word ? thesisModelReader() : null;
  const reader = baseReader ? limitConcurrency(baseReader, 4) : null;
  const checks: Record<string, CheckView> = {};
  const writes: Promise<unknown>[] = [];
  await Promise.all(
    stocks.map(async (stock) => {
      const stockFacts = facts.get(stock.instrumentId);
      const thesis = theses[stock.instrumentId]!;
      if (!stockFacts) {
        unchecked.push(stock.instrumentId);
        return;
      }
      const cost = holdings[stock.instrumentId]?.average_cost;
      const before = stored.get(stock.instrumentId) ?? null;
      const results = judgeConditions(thesis.conditions ?? [], conditionInputs.get(stock.instrumentId) ?? null, today, before?.conditions ?? []);
      const check = withConditions(
        evaluate(
          thesis,
          stockFacts,
          { avgCost: typeof cost === "number" && cost > 0 ? cost : null, savedClose: closes.get(`${stock.ticker}|${savedDay(thesis.created_at)}`) ?? null },
          today,
        ),
        results,
      );
      // Nothing fired and nothing to show it was looked at (a fund, a stock with no results on file): no verdict.
      if (check.signals.length === 0 && check.checked.length === 0 && !results.some((result) => result.status !== "unknown")) {
        unchecked.push(stock.instrumentId);
        return;
      }
      // A report is checked once: the records say which report each condition last judged (lib/thesis-watch/conditions.ts).
      const records = nextConditionRecords(before?.conditions ?? [], results, today);
      const reasonUpdatedAt = thesis.updated_at || thesis.created_at;
      // The stored note is kept while the rules would write the same words (same findings, same figures),
      // and a rules note gets one try at a model's wording when the caller can wait for it.
      const draft = ruleNote(check);
      const keep = before && before.reasonUpdatedAt === reasonUpdatedAt && before.draft === draft && before.note && (before.wordedBy === "model" || before.wordTried || !reader);
      const note = keep
        ? { note: before!.note, wordedBy: before!.wordedBy, wordTried: before!.wordTried }
        : reader
          ? { ...(await wordNote(check, reader)), wordTried: true }
          : { note: draft, wordedBy: "rules" as const, wordTried: false };
      const next = nextStoredCheck(before, { uid, check, reasonUpdatedAt, note: note.note, wordedBy: note.wordedBy, draft, wordTried: note.wordTried, day: today, now, conditions: records });
      // Without the stored checks a write would replace their history: write nothing until they can be read.
      if (next && options.persist !== false && !storedReadFailed) {
        writes.push(adminFirestore.collection(CHECKS_COLLECTION).doc(checkDocId(uid, stock.instrumentId)).set(toDoc(next)));
      }
      checks[stock.instrumentId] = viewOf(check, next ?? before, note, conditionViews(results, records));
    }),
  );
  const saved = await Promise.allSettled(writes);
  let writeFailures = 0;
  for (const result of saved) {
    if (result.status !== "rejected") continue;
    writeFailures += 1;
    console.warn("[thesis-watch] save failed:", result.reason instanceof Error ? result.reason.message : "unknown error");
  }
  return {
    checks,
    locked,
    unchecked,
    theses,
    ...(storedReadFailed ? { storedReadFailed } : {}),
    ...(writeFailures > 0 ? { writeFailures } : {}),
  };
}

export { VERDICT_RANK } from "./rules";

/* ── the example portfolio ──────────────────────────────────────────────── */

/**
 * Made-up reasons for the example portfolio's holdings (lib/portfolio-data.ts),
 * so a visitor sees what the watcher says. The reasons are invented and said
 * to be; the checks run on the real stored facts, nothing is written.
 */
export const EXAMPLE_REASONS: Record<string, { kind: Thesis["kind"]; savedAt: string }> = {
  MSFT: { kind: "long_term", savedAt: "2026-02-03" },
  AAPL: { kind: "product", savedAt: "2026-02-03" },
  NVDA: { kind: "growth", savedAt: "2026-03-17" },
  JPM: { kind: "dividend", savedAt: "2026-03-17" },
  COST: { kind: "growth", savedAt: "2026-05-11" },
  XOM: { kind: "dividend", savedAt: "2026-05-11" },
  UNH: { kind: "value", savedAt: "2026-06-22" },
};

/**
 * The example's checks. `conditions` (by ticker) adds made-up measurable lines checked on the real stored figures; only
 * the local preview page passes them, so the landing and Ask keep the example as it is.
 */
export async function exampleReasonChecks(now: Date = new Date(), conditions: Record<string, Condition[]> = {}): Promise<CheckView[]> {
  const today = newYorkToday(now);
  const entries = Object.entries(EXAMPLE_REASONS);
  const stocks = entries.map(([ticker]) => ({ instrumentId: `US_${ticker}`, ticker }));
  const withLines = stocks.filter((stock) => (conditions[stock.ticker] ?? []).length > 0);
  const factsLoad = loadStockFacts(stocks, today);
  const [facts, closes, inputs] = await Promise.all([
    factsLoad,
    closesOnDays(entries.map(([ticker, row]) => ({ ticker, day: row.savedAt }))),
    withLines.length > 0 ? factsLoad.then((loaded) => loadConditionInputs(withLines, loaded, today)) : Promise.resolve(new Map()),
  ]);
  const out: CheckView[] = [];
  for (const [ticker, row] of entries) {
    const stockFacts = facts.get(`US_${ticker}`);
    if (!stockFacts) continue;
    const thesis = { kind: row.kind, reason: null, created_at: `${row.savedAt}T00:00:00.000Z` };
    const results = judgeConditions(conditions[ticker] ?? [], inputs.get(`US_${ticker}`) ?? null, today);
    const check = withConditions(evaluate(thesis, stockFacts, { avgCost: null, savedClose: closes.get(`${ticker}|${row.savedAt}`) ?? null }, today), results);
    out.push(viewOf(check, null, { note: ruleNote(check), wordedBy: "rules" }, conditionViews(results, nextConditionRecords([], results, today))));
  }
  return out;
}

/** Wraps an async function so no more than `max` calls run at the same time; the rest wait their turn. */
function limitConcurrency<A extends unknown[], R>(fn: (...args: A) => Promise<R>, max: number): (...args: A) => Promise<R> {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= max) return;
    const start = queue.shift();
    if (start) start();
  };
  return (...args: A) =>
    new Promise<R>((resolve, reject) => {
      queue.push(() => {
        active += 1;
        fn(...args)
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      });
      next();
    });
}
