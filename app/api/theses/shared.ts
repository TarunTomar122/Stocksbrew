import { NextResponse } from "next/server";

import { AgentJobError } from "@/lib/agent-jobs-data";
import { namesFor } from "@/lib/basket-agent/data";
import type { BasketAgent } from "@/lib/basket-agent/model";
import { runThesis } from "@/lib/thesis-monitor/data";
import type { ThesisState } from "@/lib/thesis-monitor/model";

/** How long the first check may take before the answer goes back without it (the nightly check then runs it). */
export const FIRST_CHECK_MS = 12_000;

/** The check right after a save, when the basket runs; a slow or failed one is left for the nightly run. */
export async function firstCheck(basket: BasketAgent): Promise<ThesisState | null> {
  if (!basket.enabled || !basket.thesis) return null;
  const outcome = await Promise.race([
    runThesis(basket, new Date()).catch((error) => {
      console.warn("[theses] first check failed:", error instanceof Error ? error.message : "unknown error");
      return null;
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), FIRST_CHECK_MS)),
  ]);
  return outcome?.state ?? null;
}

export async function companyNames(tickers: readonly string[]): Promise<Record<string, string>> {
  return namesFor(tickers).catch(() => ({}));
}

export function refused(error: unknown): NextResponse {
  if (error instanceof AgentJobError) return NextResponse.json({ error: error.message, ...(error.feature ? { feature: error.feature } : {}) }, { status: error.status });
  throw error;
}

export function tooMany(retryAfterSec: number): NextResponse {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return NextResponse.json(
    { error: `That's a lot of saves at once. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.` },
    { status: 429, headers: { "retry-after": String(retryAfterSec) } },
  );
}
