import { unstable_cache } from "next/cache";

import { readAgentRuns, readBriefs, readCalls, readEarnings, readFilings, readInsiders, readMoves, readPremarket } from "./read";
import { isWeekend, nyClock, previousWeekday, whenWord } from "./time";
import type { AgentLog } from "./types";
import { buildAgentLog, type AgentLogFacts } from "./words";

/**
 * "What the agent did today": one cached read for everyone (the market's log has nothing personal in it). Each
 * source is read on its own; one that fails is left out, and a log whose every source failed is not cached, so a
 * store blip never sticks for the cache window. Before the day's first jobs have run (or on a weekend) the log is
 * the previous weekday's.
 */

/** How long a built log is served before it is rebuilt in the background. */
export const AGENT_LOG_REVALIDATE_SECONDS = 300;
/** Fewer real lines than this and the day has barely started: the previous weekday's log is shown instead. */
const MIN_LINES = 2;

async function factsFor(day: string): Promise<AgentLogFacts> {
  const reads = {
    premarket: readPremarket(day),
    briefs: readBriefs(day),
    calls: readCalls(day),
    moves: readMoves(day),
    filings: readFilings(day),
    insiders: readInsiders(day),
    earnings: readEarnings(day),
    agents: readAgentRuns(day),
  };
  const keys = Object.keys(reads) as Array<keyof typeof reads>;
  const settled = await Promise.allSettled(keys.map((key) => reads[key]));
  if (settled.every((result) => result.status === "rejected")) throw new Error("agent log: no source could be read");
  const facts: AgentLogFacts = {};
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") (facts as Record<string, unknown>)[keys[index]!] = result.value;
  });
  return facts;
}

function lines(log: AgentLog | null): number {
  return log ? log.entries.filter((entry) => !entry.quiet).length : 0;
}

async function logFor(day: string, today: string, now: Date): Promise<AgentLog | null> {
  const clock = nyClock(now);
  return buildAgentLog({
    day,
    when: whenWord(day, today),
    // The after-close jobs run into the evening; until then the day's log is still filling up.
    ongoing: day === today && (clock?.minutes ?? 0) < 20 * 60,
    facts: await factsFor(day),
    movesHref: day === today ? "/movers" : `/movers/${day}`,
  });
}

async function loadAgentLog(today: string): Promise<AgentLog | null> {
  const now = new Date();
  const own = isWeekend(today) ? null : await logFor(today, today, now);
  if (lines(own) >= MIN_LINES) return own;
  try {
    const before = await logFor(previousWeekday(today), today, now);
    return lines(before) > lines(own) ? before : own;
  } catch (error) {
    // With nothing of its own to show, a failed read of the day before is a failure (not cached), not an empty log.
    if (!own) throw error;
    return own;
  }
}

/** Keyed by its argument (the New York day), so each day has its own entry. */
const cachedLog = unstable_cache(loadAgentLog, ["agent-log-v3"], { revalidate: AGENT_LOG_REVALIDATE_SECONDS });

/** The agent's log for the current New York trading day, or null when there is nothing real to show or the store is down. */
export async function getAgentLog(now: Date = new Date()): Promise<AgentLog | null> {
  const today = nyClock(now)?.day;
  if (!today) return null;
  return cachedLog(today).catch(() => null);
}
