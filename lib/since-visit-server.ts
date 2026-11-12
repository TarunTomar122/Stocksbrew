/**
 * The reads behind "Since you last looked" (lib/since-visit.ts). Starts from the signed-in person's own user doc
 * (their `briefing_visits`, tracked stocks and stated reasons), then reads only when the module can show: every read
 * runs side by side, from cached shared reads where one exists, each with its own time limit. A read that fails or
 * runs out of time leaves its kind of change out and marks the result incomplete, so the page never says "nothing
 * changed" on a partial read. Read only: the visit itself is written by app/api/briefing/visit.
 */

import { listRuns } from "@/lib/agent-jobs-data";
import { filingFact, filingHeadline, isMajorFiling, ITEM_WORDS, MAJOR_ITEMS } from "@/lib/agent-events-filings";
import { within } from "@/lib/briefing-premarket-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { getFilingsStream } from "@/lib/filings";
import { getInsiderTrades } from "@/lib/follow";
import { resultsFor } from "@/lib/results/server";
import { resultFact } from "@/lib/results/words";
import { getDailySeries } from "@/lib/screener-series";
import {
  readVisits,
  sinceWindow,
  visitStart,
  type CallStep,
  type SinceInputs,
  type SinceWindow,
  type Verdict,
} from "@/lib/since-visit";
import { readTheses } from "@/lib/thesis";
import { CHECKS_COLLECTION, checkDocId, readStoredCheck } from "@/lib/thesis-watch/store";
import { getUserDoc } from "@/lib/watchlist";
import { etToday } from "@/lib/day-words";

/** How long any one read may take before the module goes on without it. */
const READ_MS = 1500;
/** The daily-series read keeps the first 40 symbols per call. */
const SERIES_CHUNK = 40;

export type SinceVisitLoad = { window: SinceWindow; inputs: SinceInputs; complete: boolean };

/**
 * "hidden": nothing to show on purpose (a first visit, one under three hours ago, nothing tracked); the visit is
 * recorded. "failed": the user doc could not be read in time, so we do not know the previous visit; the module hides
 * and the visit is left untouched. "ready": the reads, with `complete` false when any of them missed.
 */
export type SinceVisitResult = { kind: "hidden" } | { kind: "failed" } | { kind: "ready"; load: SinceVisitLoad };

const CALL_STEPS = new Set<CallStep>(["Add", "Hold", "Trim"]);
const isStep = (value: unknown): value is CallStep => typeof value === "string" && CALL_STEPS.has(value as CallStep);
const text = (value: unknown) => (typeof value === "string" ? value : "");

/** "BRK.B" from "US_BRK_B"; null for a stock outside the US (none of the reads below cover it). */
function usTicker(instrumentId: string): string | null {
  return instrumentId.startsWith("US_") ? instrumentId.slice(3).replace(/_/g, ".").toUpperCase() : null;
}

/** The major 8-K items (MAJOR_ITEMS), most newsworthy first, as lib/agent-events-filings orders them. */
const ITEM_NEWS_ORDER = ["1.03", "4.02", "1.05", "5.01", "2.01", "3.01", "2.05", "2.06", "1.01", "1.02", "4.01"].filter((code) => (MAJOR_ITEMS as readonly string[]).includes(code));

/** "Filed an 8-K on a new material agreement", "Filed its annual report (10-K)": the filing's headline without its ticker. */
function filingLine(fact: NonNullable<ReturnType<typeof filingFact>>): string {
  if (fact.group === "13D/G") return "An investor reported an active stake over 5%";
  if (fact.group === "8-K") {
    const lead = ITEM_NEWS_ORDER.find((code) => fact.items.includes(code));
    return lead ? `Filed an 8-K on ${ITEM_WORDS[lead]}` : "Filed an 8-K";
  }
  const headline = filingHeadline(fact);
  return headline.startsWith(`${fact.ticker} `) ? `${headline.charAt(fact.ticker.length + 1).toUpperCase()}${headline.slice(fact.ticker.length + 2)}` : headline;
}

async function readCalls(ids: string[]): Promise<SinceInputs["calls"]> {
  if (ids.length === 0) return {};
  const collection = adminFirestore.collection("tm_call_stability");
  const snaps = await adminFirestore.getAll(...ids.map((id) => collection.doc(id)));
  const out: NonNullable<SinceInputs["calls"]> = {};
  snaps.forEach((snap, index) => {
    const ticker = usTicker(ids[index]!);
    if (!ticker || !snap.exists) return;
    const changes = (snap.data() as Record<string, unknown> | undefined)?.changes;
    if (!Array.isArray(changes)) return;
    const list = changes
      .map((raw) => (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}))
      .filter((raw) => /^\d{4}-\d{2}-\d{2}/.test(text(raw.date)) && isStep(raw.to))
      .map((raw) => ({ date: text(raw.date).slice(0, 10), from: isStep(raw.from) ? raw.from : null, to: raw.to as CallStep }));
    if (list.length > 0) out[ticker] = list;
  });
  return out;
}

async function readReasons(uid: string, theses: ReturnType<typeof readTheses>): Promise<SinceInputs["reasons"]> {
  const ids = Object.keys(theses).filter((id) => usTicker(id));
  if (ids.length === 0) return {};
  const collection = adminFirestore.collection(CHECKS_COLLECTION);
  const snaps = await adminFirestore.getAll(...ids.map((id) => collection.doc(checkDocId(uid, id))));
  const out: NonNullable<SinceInputs["reasons"]> = {};
  snaps.forEach((snap, index) => {
    const id = ids[index]!;
    const stored = snap.exists ? readStoredCheck(snap.data()) : null;
    const ticker = usTicker(id);
    if (!stored || !ticker || stored.uid !== uid) return;
    out[ticker] = {
      verdict: stored.verdict as Verdict,
      history: stored.history.map((row) => ({ day: row.day, verdict: row.verdict as Verdict })),
      reason: theses[id]?.reason ?? null,
      kind: theses[id]?.kind ?? null,
    };
  });
  return out;
}

async function readAgentRuns(uid: string, from: number): Promise<SinceInputs["agentRuns"]> {
  const runs = await listRuns(uid, 60);
  return runs
    .filter((run) => run.decision === "notify" && Date.parse(run.ran_at) > from)
    .map((run) => ({
      ran_at: run.ran_at,
      job_name: run.job_name,
      findings: run.findings.map((finding) => ({
        ticker: finding.ticker,
        headline: finding.headline,
        kind: finding.kind,
        close: finding.close,
        level: finding.level,
        zone: finding.zone,
        call_from: finding.call_from,
        call_to: finding.call_to,
      })),
    }));
}

async function readResults(tickers: string[], window: SinceWindow, today: string): Promise<SinceInputs["results"]> {
  const reads = await resultsFor(tickers, { since: window.fromDay, today });
  return reads.map((read) => ({
    ticker: read.ticker,
    reportDate: read.reportDate,
    session: read.session ?? null,
    // The headline figure only: the card already shows today's move.
    fact: resultFact({ ...read, move: null }, today),
  }));
}

async function readInsiders(tickers: Set<string>, from: number): Promise<SinceInputs["insiders"]> {
  const trades = await getInsiderTrades(1500);
  // The stored times have no zone (New York wall clock); a day's margin either way, the exact cut is in insiderEvents.
  const floor = new Date(from - 86_400_000).toISOString().slice(0, 10);
  return trades
    .filter((trade) => tickers.has(trade.symbol.toUpperCase()) && !trade.plan_10b5_1 && trade.filed_at.slice(0, 10) >= floor)
    .map((trade) => ({ symbol: trade.symbol, side: trade.tx_type, value: trade.value, role: trade.role, insider: trade.insider, filed_at: trade.filed_at }));
}

async function readFilings(tickers: Set<string>, from: number): Promise<SinceInputs["filings"]> {
  const stream = await getFilingsStream();
  const out: NonNullable<SinceInputs["filings"]> = [];
  for (const filing of stream) {
    const at = Date.parse(filing.filedAt);
    // Newest first: stop at the window's start.
    if (Number.isFinite(at) && at <= from) break;
    if (!tickers.has(filing.ticker)) continue;
    const fact = filingFact(filing);
    if (!fact || !isMajorFiling(fact)) continue;
    out.push({ ticker: fact.ticker, filed_at: fact.filed_at, line: filingLine(fact) });
  }
  return out;
}

async function readSeries(tickers: string[]): Promise<SinceInputs["series"]> {
  const chunks: string[][] = [];
  for (let index = 0; index < tickers.length; index += SERIES_CHUNK) chunks.push(tickers.slice(index, index + SERIES_CHUNK));
  const sets = await Promise.all(chunks.map((chunk) => getDailySeries(chunk)));
  return Object.assign({}, ...sets.map((set) => set.series));
}

/** Everything the module needs for this person at `now` (see SinceVisitResult). Never throws. */
export async function loadSinceVisit(uid: string, now: Date = new Date()): Promise<SinceVisitResult> {
  // The same request's user doc the briefing reads (React cache); a missing doc is a hidden module, a failed or slow
  // read is "failed", so the visit is not moved on a guess.
  const read = await within(
    getUserDoc(uid).then((value) => ({ doc: value })),
    READ_MS,
  );
  if (!read) return { kind: "failed" };
  const doc = read.doc;
  if (!doc) return { kind: "hidden" };
  const record = doc as unknown as Record<string, unknown>;
  const window = sinceWindow(visitStart(readVisits(record.briefing_visits), now), now);
  if (!window) return { kind: "hidden" };
  const ids = (Array.isArray(doc.tracked_stocks) ? doc.tracked_stocks : []).filter((id): id is string => typeof id === "string" && Boolean(usTicker(id)));
  if (ids.length === 0) return { kind: "hidden" };
  const tickers = [...new Set(ids.map((id) => usTicker(id)!))];
  const tickerSet = new Set(tickers);
  const today = etToday(now);
  const theses = readTheses(record.theses);

  let complete = true;
  const guard = <T,>(label: string, promise: Promise<T>): Promise<T | undefined> =>
    within(
      promise.catch((error) => {
        console.warn(`[since-visit] ${label} read failed:`, error instanceof Error ? error.message : error);
        throw error;
      }),
      READ_MS,
    ).then((value) => {
      if (value === null) {
        complete = false;
        console.warn(`[since-visit] ${label} read missed (failed or over ${READ_MS}ms)`);
      }
      return value ?? undefined;
    });

  const [calls, reasons, agentRuns, results, insiders, filings, series] = await Promise.all([
    guard("calls", readCalls(ids)),
    guard("reason checks", readReasons(uid, theses)),
    guard("agent runs", readAgentRuns(uid, window.from)),
    guard("results", readResults(tickers, window, today)),
    guard("insiders", readInsiders(tickerSet, window.from)),
    guard("filings", readFilings(tickerSet, window.from)),
    guard("prices", readSeries(tickers)),
  ]);
  return { kind: "ready", load: { window, inputs: { calls, reasons, agentRuns, results, insiders, filings, series }, complete } };
}
