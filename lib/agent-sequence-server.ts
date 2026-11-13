/**
 * The landing's agent section: the example portfolio's loop (one stored case from request to outcome,
 * lib/agent-loop.ts) and, as its fallback, the proposal engine (lib/proposals.ts `candidates`) run over the public
 * example portfolio on today's real data, its strongest proposal shaped into steps (lib/agent-sequence.ts).
 *
 * The example portfolio is not a person and has no user doc, so the reads are the proposal engine's own sources taken
 * for the example's stocks: our calls, the levels a signed-out visitor may see (the showcase stocks'), quotes, daily closes,
 * results, major filings, the example agents and their runs, upcoming reports. It has no price alerts and no practice
 * account, so those read as empty, which is true. Nothing is written: the proposal is worked out and shown, never
 * stored. Shared by every visitor, cached for half an hour, and never calls a model.
 */

import { cache } from "react";

import { filingFact, isMajorFiling } from "@/lib/agent-events-filings";
import { agentMarketDay, listJobs, listRuns, resolveScope } from "@/lib/agent-jobs-data";
import { nextCheckFor } from "@/lib/agent-watch";
import { EXAMPLE_AGENTS_UID } from "@/lib/entitlements";
import { adminFirestore } from "@/lib/firebase-admin";
import { getFilingsSince } from "@/lib/filings";
import { reportsSource } from "@/lib/inbox/sources";
import { loopOf, type AgentLoop } from "@/lib/agent-loop";
import { firstSequence, type AgentSequence } from "@/lib/agent-sequence";
import { BENCHMARK_SYMBOL, EXAMPLE_STOCK_TICKERS } from "@/lib/portfolio-data";
import { candidates, latestPrice, type ProposalInputs, type ProposalStock } from "@/lib/proposals";
import { readQuotes } from "@/lib/proposals-server";
import { resultsFor } from "@/lib/results/server";
import { getRecentDailySeries } from "@/lib/screener-series";
import { isFeaturedStockTicker } from "@/lib/seo/stock-pages";
import { sharedCache } from "@/lib/shared-cache";
import { filingLine } from "@/lib/since-visit-server";

/** How long one read may take: past it the strip is not worked out (a weaker pick must not be cached for everyone). */
const READ_MS = 6000;
/** The whole strip's limit on the page: past it, the section shows without it (the read keeps filling the cache). */
export const SEQUENCE_TIMEOUT_MS = 3000;
const REVALIDATE_SECONDS = 30 * 60;

function within<T>(promise: Promise<T>, ms: number, name: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[agent-sequence] ${name} took longer than ${ms}ms`);
      resolve(undefined);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        console.warn(`[agent-sequence] ${name} failed:`, error instanceof Error ? error.message : error);
        resolve(undefined);
      },
    );
  });
}

const exampleStocks = (): ProposalStock[] => EXAMPLE_STOCK_TICKERS.map((ticker) => ({ ticker, instrumentId: `US_${ticker}`, position: "holding" as const }));

async function readFilings(tickers: Set<string>, now: Date): Promise<NonNullable<ProposalInputs["filings"]>> {
  const from = now.getTime() - 6 * 86_400_000;
  const out: NonNullable<ProposalInputs["filings"]> = [];
  for (const filing of await getFilingsSince(from, now.getTime())) {
    const at = Date.parse(filing.filedAt);
    if (Number.isFinite(at) && at <= from) break;
    if (!tickers.has(filing.ticker)) continue;
    const fact = filingFact(filing);
    if (!fact || !isMajorFiling(fact)) continue;
    out.push({ ticker: fact.ticker, filed_at: fact.filed_at, line: filingLine(fact), url: filing.url || null });
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
    moveSession: read.move?.kind === "after_hours" ? "after_hours" : read.move?.kind === "before_open" ? "pre_market" : null,
    guidance: read.guidance?.change ?? null,
    epsVerdict: read.eps?.verdict ?? null,
    epsSurprisePct: typeof read.eps?.surprisePct === "number" && Number.isFinite(read.eps.surprisePct) ? read.eps.surprisePct : null,
    revenueVerdict: read.revenue?.verdict ?? null,
    sources: read.sources.map((source) => ({ label: source.label, source: source.source || null, at: source.at, url: source.url })),
  }));
}

/**
 * Our call's levels for the example's showcase stocks: the ones whose levels are public on their stock pages
 * (lib/entitlements-server.ts canSeeLevels), so the landing shows a signed-out visitor no level it would hide elsewhere.
 * The rest stay locked, as resolveScope leaves them. With the day each was set, for its as-of.
 */
async function readPublicLevels(tickers: string[]): Promise<{ levels: NonNullable<ProposalInputs["levels"]>; setOn: Record<string, string> }> {
  const shown = tickers.filter((ticker) => isFeaturedStockTicker(ticker));
  const levels: NonNullable<ProposalInputs["levels"]> = {};
  const setOn: Record<string, string> = {};
  if (shown.length === 0) return { levels, setOn };
  const collection = adminFirestore.collection("tm_call_stability");
  const snaps = await adminFirestore.getAll(...shown.map((ticker) => collection.doc(`US_${ticker}`)), { fieldMask: ["levels"] });
  snaps.forEach((snap, index) => {
    const raw = (snap.exists ? (snap.data() as Record<string, unknown> | undefined)?.levels : null) as Record<string, unknown> | null | undefined;
    const add = typeof raw?.accumulate_below === "number" && Number.isFinite(raw.accumulate_below) && raw.accumulate_below > 0 ? raw.accumulate_below : null;
    const trim = typeof raw?.trim_above === "number" && Number.isFinite(raw.trim_above) && raw.trim_above > 0 ? raw.trim_above : null;
    if (add === null && trim === null) return;
    const ticker = shown[index]!;
    levels[ticker] = { add_below: add, trim_above: trim };
    if (typeof raw?.set_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.set_on)) setOn[ticker] = raw.set_on;
  });
  return { levels, setOn };
}

/** The example's proposal inputs for today. Reads that fail stay undefined, so the rules that need them make nothing. */
export async function loadExampleInputs(now: Date = new Date()): Promise<{
  inputs: ProposalInputs;
  jobs: Awaited<ReturnType<typeof listJobs>>;
  runs: Awaited<ReturnType<typeof listRuns>>;
  levelsAsOf: Record<string, string>;
}> {
  const today = agentMarketDay(now);
  const stocks = exampleStocks();
  const tickers = stocks.map((stock) => stock.ticker);
  const [scope, publicLevels, seriesSet, quotes, results, filings, runs, jobs, upcoming] = await Promise.all([
    // Signed out (no uid): our calls, with every level locked; the public ones are filled back in below. Never the
    // example's uid, so a user doc under it could not unlock Pro levels for every visitor.
    within(resolveScope(null, { kind: "tickers", tickers }, { calls: true }), READ_MS, "calls"),
    within(readPublicLevels(tickers), READ_MS, "levels"),
    // The proposal rules read at most the last 60 sessions: the recent cut is the same answer.
    within(getRecentDailySeries(tickers), READ_MS, "series"),
    within(readQuotes(stocks), READ_MS, "quotes"),
    within(readResults(tickers, today), READ_MS, "results"),
    within(readFilings(new Set(tickers), now), READ_MS, "filings"),
    within(listRuns(EXAMPLE_AGENTS_UID, 60), READ_MS, "runs"),
    within(listJobs(EXAMPLE_AGENTS_UID), READ_MS, "jobs"),
    within(reportsSource(stocks.map((stock) => ({ instrumentId: stock.instrumentId, ticker: stock.ticker, position: "holding" as const, covered: true })), today), READ_MS, "reports"),
  ]);
  const inputs: ProposalInputs = {
    now,
    today,
    plan: "pro",
    stocks,
    levels: scope?.levels ? { ...scope.levels, ...(publicLevels?.levels ?? {}) } : undefined,
    calls: scope?.calls
      ? Object.fromEntries(Object.entries(scope.calls).map(([ticker, log]) => [ticker, { call: log.call, changes: log.changes.map((change) => ({ date: change.date, from: change.from, to: change.to })) }]))
      : undefined,
    series: seriesSet?.series,
    quotes,
    // The example portfolio has no price alerts and no practice account: empty, not unknown.
    alerts: [],
    practice: {},
    results,
    filings,
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
  };
  return { inputs, jobs: jobs ?? [], runs: runs ?? [], levelsAsOf: publicLevels?.setOn ?? {} };
}

/** When the example's agents check next: the soonest after-close run any of them is proven to make. */
function nextCheckDay(jobs: Awaited<ReturnType<typeof listJobs>>, runs: Awaited<ReturnType<typeof listRuns>>, today: string): string | null {
  const days = jobs
    .map((job) => nextCheckFor(job, runs.filter((run) => run.job_id === job.id), today))
    .filter((day): day is string => Boolean(day))
    .sort();
  return days[0] ?? null;
}

/**
 * The landing's agent sections from one read of the example's inputs: the loop (lib/agent-loop.ts, one stored case told
 * through to its outcome) and the strongest proposal today as a strip (the loop's fallback). Throws when the stocks'
 * prices could not be read (sharedCache must never keep a failure as everyone's answer).
 */
async function buildLanding(today: string): Promise<LandingAgent> {
  const now = new Date();
  const [{ inputs, jobs, runs, levelsAsOf }, bench] = await Promise.all([
    loadExampleInputs(now),
    // The S&P 500 for the loop's outcome: SPY's recent closes (the ~14 KB tail, cached on its own for 3 hours).
    within(getRecentDailySeries([BENCHMARK_SYMBOL]), READ_MS, "benchmark"),
  ]);
  // A read that failed must not become everyone's answer for half an hour: throw, and the next visitor tries again.
  const missing = (["quotes", "series", "calls", "levels", "results", "filings", "runs", "jobs", "upcoming"] as const).filter((key) => !inputs[key]);
  // The series read drops a ticker it could not load rather than failing: a priced stock with no closes is a failed read.
  const unpriced = Object.keys(inputs.quotes ?? {}).filter((ticker) => !inputs.series?.[ticker]?.length);
  if (missing.length > 0 || unpriced.length > 0) throw new Error(`example reads incomplete: ${[...missing, ...unpriced.map((ticker) => `series ${ticker}`)].join(", ")}`);
  // Without SPY's closes the outcome shows the stock alone (lib/agent-loop.ts outcomeOf), and the strip is untouched.
  const benchSeries = bench?.series[BENCHMARK_SYMBOL];
  const drafts = candidates(inputs);
  const sequence = firstSequence(drafts, { inputs, today, nextCheck: nextCheckDay(jobs, runs, today), runs, levelsAsOf });
  const loop = loopOf({
    today,
    jobs,
    runs,
    series: inputs.series ?? {},
    bench: benchSeries,
    now: (ticker) => {
      const point = latestPrice(inputs, ticker);
      if (!point) return null;
      return { price: point.price, dayPct: point.source === "quote" ? inputs.quotes?.[ticker]?.dayPct ?? null : null, at: point.at };
    },
    nextCheck: (job) => nextCheckFor(job, runs.filter((run) => run.job_id === job.id), today),
  });
  return { sequence, loop };
}

export type LandingAgent = { sequence: AgentSequence | null; loop: AgentLoop | null };

const cachedLanding = sharedCache(buildLanding, ["landing-agent-loop-v5"], { revalidate: REVALIDATE_SECONDS });

/**
 * The example's loop and its strongest proposal today; both null when the read failed or ran too long. Once per request
 * (React cache): the loop section and the watch section below it both ask, and a cold cache must not read twice.
 */
export const loadLandingAgent = cache(async (): Promise<LandingAgent> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const empty: LandingAgent = { sequence: null, loop: null };
  const slow = new Promise<LandingAgent>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[landing-agent] took longer than ${SEQUENCE_TIMEOUT_MS}ms; showing the landing without it`);
      resolve(empty);
    }, SEQUENCE_TIMEOUT_MS);
  });
  const done = cachedLanding(agentMarketDay(new Date())).catch((error) => {
    console.warn("[landing-agent] failed:", error instanceof Error ? error.message : error);
    return empty;
  });
  return Promise.race([done, slow]).finally(() => clearTimeout(timer));
});
