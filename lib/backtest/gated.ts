import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { limitFor, type Plan } from "@/lib/entitlements";
import { consumeMeter, getViewer } from "@/lib/entitlements-server";

import { normalizeWeightsInput } from "./engine";
import { runBacktest, type BacktestResponse } from "./index";

/** What the plan did to a run. Sent to the browser so the page can say it plainly. */
export type BacktestGate = {
  plan: Plan;
  trialEligible: boolean;
  /** Runs used and allowed today; null when the plan has no daily limit to show. */
  meter: { used: number; limit: number } | null;
  /** Set when the start date was moved forward to fit the plan's lookback. */
  lookback: { years: number; start: string } | null;
};

export type GatedBacktestResponse =
  | (BacktestResponse & { gate: BacktestGate })
  | { ok: false; error: { code: "limit_reached"; message: string; symbols?: undefined }; gate: BacktestGate };

/** The earliest start date a plan may test from, or null when the plan has the full history. */
export function earliestBacktestStart(plan: Plan, now: Date = new Date()): string | null {
  const years = limitFor("backtest_history", plan);
  return Number.isFinite(years) ? isoYearsAgo(years, now) : null;
}

/** A stable key for signed-out visitors: a hash of the address, never the address itself. */
export function anonSubject(): string {
  const store = headers();
  const forwarded = store.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || store.get("x-real-ip") || "unknown";
  return `anon_${createHash("sha256").update(address).digest("hex").slice(0, 24)}`;
}

function isoYearsAgo(years: number, now: Date): string {
  const date = new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()));
  return date.toISOString().slice(0, 10);
}

/**
 * Run a backtest under the viewer's plan: the lookback is clamped to what the
 * plan allows and the run counts against today's allowance. Asking for the
 * same setup again the same day is free, so a shared link or a refresh never
 * costs a run. Enforced here, on the server, for the page and the API alike.
 */
export async function runGatedBacktest(input: unknown, now: Date = new Date()): Promise<GatedBacktestResponse> {
  const viewer = await getViewer();
  const gate: BacktestGate = { plan: viewer.plan, trialEligible: viewer.trialEligible, meter: null, lookback: null };

  let setup: Record<string, unknown> =
    input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {};

  const years = limitFor("backtest_history", viewer.plan);
  if (Number.isFinite(years)) {
    const earliest = isoYearsAgo(years, now);
    const asked = typeof setup.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(setup.start) ? setup.start : null;
    if (!asked || asked < earliest) {
      setup = { ...setup, start: earliest };
      gate.lookback = { years, start: earliest };
    }
  }

  // Validate before counting, so a typo never costs a run, and key the run by
  // the normalised setup, so the same mix counts once however it was sent.
  let normalised: unknown;
  try {
    normalised = normalizeWeightsInput(setup);
  } catch {
    const invalid = await runBacktest(setup);
    return { ...invalid, gate };
  }
  const key = createHash("sha256").update(JSON.stringify(normalised)).digest("hex").slice(0, 20);
  const meter = await consumeMeter("backtest", viewer.plan, viewer.uid ?? anonSubject(), now, key);
  if (Number.isFinite(meter.limit)) gate.meter = { used: meter.used, limit: meter.limit };
  if (!meter.allowed) {
    const again = "A setup you already ran today opens again without counting.";
    const message =
      viewer.plan === "anon"
        ? `Signed out, you get ${meter.limit} a day. Sign in free for ${limitFor("backtest", "free")} a day. ${again}`
        : viewer.plan === "pro"
          ? `That is today's ${meter.limit} runs. The count resets at midnight UTC. ${again}`
          : `Free runs ${meter.limit} a day and the count resets at midnight UTC. ${again} Pro runs ${limitFor("backtest", "pro")} a day.`;
    return { ok: false, error: { code: "limit_reached", message }, gate };
  }

  const response = await runBacktest(setup);
  return { ...response, gate };
}
