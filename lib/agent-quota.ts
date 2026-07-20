import {
  AGENT_MONTHLY_CALL_LIMIT,
  AGENT_PER_MINUTE_CALL_LIMIT,
  AGENT_USAGE_COLLECTION,
} from "@/lib/agent-access-config";
import { adminFirestore } from "@/lib/firebase-admin";

export class AgentQuotaError extends Error {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number,
    public readonly code: "minute_limit" | "monthly_limit",
  ) {
    super(message);
    this.name = "AgentQuotaError";
  }
}

function monthKey(now: Date): string {
  return now.toISOString().slice(0, 7).replace("-", "_");
}

function minuteKey(now: Date): string {
  return now.toISOString().slice(0, 16);
}

export async function consumeAgentQuota(uid: string, tool: string, now = new Date()): Promise<{
  used: number;
  remaining: number;
  limit: number;
}> {
  const ref = adminFirestore.collection(AGENT_USAGE_COLLECTION).doc(`${uid}_${monthKey(now)}`);
  return adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const calls = typeof data.calls === "number" ? data.calls : 0;
    const currentMinute = minuteKey(now);
    const storedMinute = typeof data.minute_key === "string" ? data.minute_key : "";
    const minuteCalls = storedMinute === currentMinute && typeof data.minute_calls === "number"
      ? data.minute_calls
      : 0;

    if (calls >= AGENT_MONTHLY_CALL_LIMIT) {
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      throw new AgentQuotaError(
        `Monthly agent allowance of ${AGENT_MONTHLY_CALL_LIMIT} calls reached.`,
        Math.max(60, Math.ceil((nextMonth.getTime() - now.getTime()) / 1000)),
        "monthly_limit",
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
      month: monthKey(now),
      calls: nextCalls,
      minute_key: currentMinute,
      minute_calls: minuteCalls + 1,
      tools,
      updated_at: now.toISOString(),
    }, { merge: true });
    return {
      used: nextCalls,
      remaining: Math.max(0, AGENT_MONTHLY_CALL_LIMIT - nextCalls),
      limit: AGENT_MONTHLY_CALL_LIMIT,
    };
  });
}

export async function getAgentUsage(uid: string, now = new Date()): Promise<{
  used: number;
  remaining: number;
  limit: number;
}> {
  const ref = adminFirestore.collection(AGENT_USAGE_COLLECTION).doc(`${uid}_${monthKey(now)}`);
  const snap = await ref.get();
  const used = snap.exists && typeof snap.data()?.calls === "number" ? snap.data()!.calls : 0;
  return { used, remaining: Math.max(0, AGENT_MONTHLY_CALL_LIMIT - used), limit: AGENT_MONTHLY_CALL_LIMIT };
}
