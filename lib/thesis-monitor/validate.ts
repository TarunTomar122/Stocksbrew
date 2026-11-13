import { unknownTickers } from "@/lib/basket-agent/data";
import { instrumentIdOf } from "@/lib/basket-agent/model";
import { createIpRateLimiter } from "@/lib/ip-rate-limit";
import { conditionInputsFor } from "@/lib/thesis-watch/condition-data";
import { conditionsFitStock, METRICS, type ConditionInputs, type ConditionMetric } from "@/lib/thesis-watch/conditions";

import type { ThesisLine } from "./model";

/**
 * The server-side checks a thesis save makes beyond the shape (lib/thesis-monitor/model.ts parseThesisDraft): every
 * company is one we follow, and every new or changed line is on a figure we store for that company (a price line
 * within the band around its price). Reads stored public figures only; writes nothing.
 */

export type FitResult = { ok: true } | { ok: false; status: number; error: string };

/** Why a line does not fit, in words. Pure. */
export function misfitWords(ticker: string, metric: ConditionMetric): string {
  if (metric === "price") return `${ticker}'s price line is too far from its price. Pick a level nearer where it trades.`;
  return `We don't have ${METRICS[metric].words} for ${ticker}, so that line can't be checked. Pick another figure.`;
}

/** The first line that does not fit its company's stored figures, or null. Pure. */
export function firstMisfit(lines: readonly ThesisLine[], inputs: ReadonlyMap<string, ConditionInputs>): { ticker: string; metric: ConditionMetric } | null {
  for (const line of lines) {
    const metric = conditionsFitStock(line.conditions, inputs.get(line.ticker) ?? null);
    if (metric) return { ticker: line.ticker, metric };
  }
  return null;
}

export async function linesFit(all: readonly ThesisLine[], changed: readonly ThesisLine[], today: string): Promise<FitResult> {
  const unknown = await unknownTickers(all.map((line) => line.ticker));
  if (unknown.length > 0)
    return { ok: false, status: 400, error: `We don't follow ${unknown.join(", ")} yet, so the agent couldn't check ${unknown.length === 1 ? "it" : "them"}.` };
  if (changed.length === 0) return { ok: true };
  let figures: Map<string, ConditionInputs>;
  try {
    figures = await conditionInputsFor(changed.map((line) => instrumentIdOf(line.ticker)), today);
  } catch {
    return { ok: false, status: 503, error: "We couldn't read the figures just now. Try again in a minute." };
  }
  const byTicker = new Map<string, ConditionInputs>();
  for (const line of changed) {
    const found = figures.get(instrumentIdOf(line.ticker));
    if (found) byTicker.set(line.ticker, found);
  }
  const misfit = firstMisfit(changed, byTicker);
  return misfit ? { ok: false, status: 400, error: misfitWords(misfit.ticker, misfit.metric) } : { ok: true };
}

/** Saves per person in ten minutes: each reads figures for up to twelve companies and runs a first check. */
export const SAVES_PER_WINDOW = 12;
const takeSave = createIpRateLimiter({ limit: SAVES_PER_WINDOW, windowMs: 10 * 60_000 });

export function saveAllowed(uid: string, now: number = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
  return takeSave(`thesis-save:${uid}`, now);
}
