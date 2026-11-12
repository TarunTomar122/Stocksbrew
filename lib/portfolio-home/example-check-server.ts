import { cache } from "react";

import { runDocId } from "@/lib/agent-jobs";
import { AGENT_RUNS_COLLECTION } from "@/lib/agent-jobs-data";
import { EXAMPLE_AGENTS_UID } from "@/lib/entitlements";
import { adminFirestore } from "@/lib/firebase-admin";
import { moveStats, sessionWords, whenWords } from "@/lib/earnings-season";
import { loadTickerEarnings } from "@/lib/earnings-season-data";
import { EXAMPLE_STOCK_TICKERS, loadExamplePortfolio, newYorkToday } from "@/lib/portfolio-data";
import { EXAMPLE_AGENTS } from "@/lib/portfolio-home/example-agents";
import {
  exampleAgentsSource,
  flaggedMove,
  flagStepWords,
  shapeExampleChecks,
  storedCheckFromDoc,
  type ExampleChecksView,
  type FlaggedMove,
  type StoredCheck,
} from "@/lib/portfolio-home/example-check";
import { previousMarketDay, type AgentsSource } from "@/lib/portfolio-home/log";
import { sharedCache } from "@/lib/shared-cache";

/**
 * The example agents' newest runs, for My stocks and the landing. One read:
 * the run documents by id (one per job per market day, lib/agent-jobs.ts
 * `runDocId`) for the three fixed example jobs over today and the three market
 * days before it, so a long weekend with a holiday still finds last night's
 * run and a runner that stopped days ago shows nothing rather than an old
 * check. Cached for every visitor for a few minutes (the same for everyone),
 * never calls a model, and has its own time limit.
 */

/** How long the read may take before the page goes on without it. */
export const EXAMPLE_CHECKS_TIMEOUT_MS = 2500;
const REVALIDATE_SECONDS = 5 * 60;
/** Market days before today to look back over. */
const LOOKBACK_MARKET_DAYS = 3;

export function exampleRunDays(today: string): string[] {
  const days = [today];
  for (let i = 0; i < LOOKBACK_MARKET_DAYS; i++) days.push(previousMarketDay(days[days.length - 1]!));
  return days;
}

/** Throws when the read fails (sharedCache must never keep a failure as everyone's answer). */
async function readExampleRuns(today: string): Promise<StoredCheck[]> {
  const collection = adminFirestore.collection(AGENT_RUNS_COLLECTION);
  const refs = EXAMPLE_AGENTS.flatMap((agent) => exampleRunDays(today).map((day) => collection.doc(runDocId(EXAMPLE_AGENTS_UID, agent.id, day))));
  const snaps = await adminFirestore.getAll(...refs);
  return snaps
    .filter((snap) => snap.exists)
    .map((snap) => storedCheckFromDoc(snap.data() as Record<string, unknown> | undefined, EXAMPLE_AGENTS_UID))
    .filter((run): run is StoredCheck => run !== null);
}

const cachedRuns = sharedCache(readExampleRuns, ["example-agent-runs-v2"], { revalidate: REVALIDATE_SECONDS });

/** The example's runs for today's window, once per request; null when the read failed or ran past its limit. */
const exampleRuns = cache(async (today: string): Promise<StoredCheck[] | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[example-checks] took longer than ${EXAMPLE_CHECKS_TIMEOUT_MS}ms; showing the page without them`);
      resolve(null);
    }, EXAMPLE_CHECKS_TIMEOUT_MS);
  });
  const done = cachedRuns(today).catch((error) => {
    console.warn("[example-checks] failed:", error instanceof Error ? error.message : error);
    return null;
  });
  return Promise.race([done, slow]).finally(() => clearTimeout(timer));
});

const DEFS = () => EXAMPLE_AGENTS.map((agent) => ({ id: agent.id, ask: agent.ask, trigger: agent.draft.trigger }));

/**
 * The example agents' latest checks, shaped, or null when none has run lately, the read failed, or it took
 * longer than its limit (the read keeps going and fills the cache for the next visitor).
 */
export async function loadExampleChecks(now: Date = new Date()): Promise<ExampleChecksView | null> {
  const today = newYorkToday(now);
  const runs = await exampleRuns(today);
  return runs ? shapeExampleChecks({ agents: DEFS(), runs, tickers: [...EXAMPLE_STOCK_TICKERS] }, today) : null;
}

/**
 * The example's agents and their recent runs in the shape the finding cards match against (lib/portfolio-home/
 * loop.ts exampleWatchLine), or null when they have not run lately or the read failed.
 */
export async function loadExampleAgentsSource(now: Date = new Date()): Promise<AgentsSource | null> {
  const today = newYorkToday(now);
  const runs = await exampleRuns(today);
  return runs ? exampleAgentsSource(EXAMPLE_AGENTS, runs) : null;
}

/** How long the report history may take before the step goes without its usual move. */
const STEP_HISTORY_MS = 1500;

export type ExampleFlagStep = FlaggedMove & { step: string };

/**
 * The move the example's agents flagged on one of its holdings, with the step after it ("NVDA reports on Tuesday after
 * the close, and its usual move on a report is 3.2%. Check our call on it before then."), for My stocks and the home
 * page. The same cached runs, snapshot and report history the briefing reads. Null when no single holding was
 * flagged lately, or the reads failed.
 */
export async function loadExampleFlagStep(now: Date = new Date()): Promise<ExampleFlagStep | null> {
  const today = newYorkToday(now);
  const [checks, example] = await Promise.all([loadExampleChecks(now), loadExamplePortfolio().catch(() => null)]);
  const flag = flaggedMove(checks, today);
  const position = flag ? example?.portfolio.positions.find((entry) => entry.ticker === flag.ticker && entry.kind === "holding") : null;
  if (!flag || !position) return null;
  const next = position.nextEarnings;
  let usualPct: number | null = null;
  if (next) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), STEP_HISTORY_MS);
    });
    const loaded = await Promise.race([loadTickerEarnings([flag.ticker], today).catch(() => null), late]).finally(() => clearTimeout(timer));
    const entry = loaded?.get(flag.ticker);
    if (entry && !entry.fund) usualPct = moveStats(entry.history.past, entry.history.typicalDayPct).usual;
  }
  const session = next?.time === "amc" || next?.time === "bmo" ? sessionWords(next.time) : "";
  const step = flagStepWords({
    ticker: flag.ticker,
    report: next ? { day: next.date, when: whenWords(next.date, today), session } : null,
    usualPct,
    today,
  });
  return { ...flag, step };
}
