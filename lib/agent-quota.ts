import {
  AGENT_PER_MINUTE_CALL_LIMIT,
  AGENT_USAGE_COLLECTION,
} from "@/lib/agent-access-config";
import { agentDailyLimit, agentUpgradeUrl, freeDailyLimitMessage, type AgentPlan } from "@/lib/agent-tiers";
import { adminFirestore } from "@/lib/firebase-admin";

export class AgentQuotaError extends Error {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number,
    public readonly code: "minute_limit" | "daily_limit",
    /** Set when going Pro lifts the limit (a Free account's daily allowance). */
    public readonly upgradeUrl: string | null = null,
  ) {
    super(message);
    this.name = "AgentQuotaError";
  }
}

export type AgentUsage = {
  used: number;
  remaining: number;
  limit: number;
  period: "day";
};

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10).replaceAll("-", "_");
}

function minuteKey(now: Date): string {
  return now.toISOString().slice(0, 16);
}

/**
 * Count one call against the account's UTC day and its clock minute: one small transaction per call on
 * `tm_agent_usage/{uid}_{YYYY_MM_DD}`. The date is in the doc id, so the count starts again at 00:00 UTC. The plan
 * only sets the daily limit; both plans count on the same doc, so an account that drops to Free mid-day keeps its
 * count and one that goes Pro gets the rest of Pro's allowance at once.
 */
export async function consumeAgentQuota(uid: string, tool: string, now: Date, plan: AgentPlan): Promise<AgentUsage> {
  const dailyLimit = agentDailyLimit(plan);
  const ref = adminFirestore.collection(AGENT_USAGE_COLLECTION).doc(`${uid}_${dayKey(now)}`);
  return adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const calls = typeof data.calls === "number" ? data.calls : 0;
    const currentMinute = minuteKey(now);
    const storedMinute = typeof data.minute_key === "string" ? data.minute_key : "";
    const minuteCalls = storedMinute === currentMinute && typeof data.minute_calls === "number"
      ? data.minute_calls
      : 0;

    if (calls >= dailyLimit) {
      const nextDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      throw new AgentQuotaError(
        plan === "free" ? freeDailyLimitMessage() : `Daily agent allowance of ${dailyLimit} calls reached.`,
        Math.max(60, Math.ceil((nextDay.getTime() - now.getTime()) / 1000)),
        "daily_limit",
        plan === "free" ? agentUpgradeUrl() : null,
      );
    }
    if (minuteCalls >= AGENT_PER_MINUTE_CALL_LIMIT) {
      throw new AgentQuotaError(
        `Per-minute agent limit of ${AGENT_PER_MINUTE_CALL_LIMIT} calls reached.`,
        60,
        "minute_limit",
      );
    }

    const tools = data.tools && typeof data.tools === "object"
      ? { ...(data.tools as Record<string, number>) }
      : {};
    tools[tool] = (typeof tools[tool] === "number" ? tools[tool] : 0) + 1;
    const nextCalls = calls + 1;
    tx.set(ref, {
      uid,
      day: dayKey(now),
      calls: nextCalls,
      minute_key: currentMinute,
      minute_calls: minuteCalls + 1,
      tools,
      updated_at: now.toISOString(),
    }, { merge: true });
    return {
      used: nextCalls,
      remaining: Math.max(0, dailyLimit - nextCalls),
      limit: dailyLimit,
      period: "day",
    };
  });
}

export async function getAgentUsage(uid: string, now = new Date(), plan: AgentPlan = "pro"): Promise<AgentUsage> {
  const limit = agentDailyLimit(plan);
  const ref = adminFirestore.collection(AGENT_USAGE_COLLECTION).doc(`${uid}_${dayKey(now)}`);
  const snap = await ref.get();
  const used = snap.exists && typeof snap.data()?.calls === "number" ? snap.data()!.calls : 0;
  return { used, remaining: Math.max(0, limit - used), limit, period: "day" };
}
