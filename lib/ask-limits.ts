import { ASK_LIMITS, type AskPlan } from "@/lib/ask-config";

/**
 * The daily question allowance for Ask. Pure: the store is passed in, so the
 * same code runs against the real document store and against a Map in tests.
 */

export type AskUsageDoc = {
  key: string;
  plan: AskPlan;
  day: string;
  questions: number;
  updated_at: string;
};

/** The one thing the limiter needs from a store: read a doc, then write it, without another writer in between. */
export interface AskUsageStore {
  transact<T>(docId: string, update: (current: Partial<AskUsageDoc> | null) => { write: AskUsageDoc | null; result: T }): Promise<T>;
}

export type AskAllowance = {
  ok: true;
  plan: AskPlan;
  limit: number;
  used: number;
  remaining: number;
  resets_at: string;
};

/** The structured answer the route returns with a 429. */
export type AskLimitReached = {
  ok: false;
  error: "limit_reached";
  plan: AskPlan;
  limit: number;
  used: number;
  remaining: 0;
  resets_at: string;
  /** What would lift the limit, so the UI can offer the right next step. */
  next_step: "sign_in" | "upgrade" | "wait";
  message: string;
};

export type AskQuotaResult = AskAllowance | AskLimitReached;

export function askDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Midnight UTC after `now`. */
export function askResetsAt(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

export function askPlanFor(input: { uid: string | null; isPro: boolean }): AskPlan {
  if (!input.uid) return "anonymous";
  return input.isPro ? "pro" : "free";
}

/** Doc ids hold a person or an anonymous key and a day. Slashes would nest the path. */
export function askUsageDocId(key: string, day: string): string {
  return `${key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120)}__${day}`;
}

function limitMessage(plan: AskPlan, limit: number): string {
  if (plan === "anonymous") return "Asking takes a free account.";
  if (plan === "free") return `You have used today's ${limit} questions on the Free plan. They reset at midnight UTC.`;
  return `You have used today's ${limit} questions. They reset at midnight UTC.`;
}

/** Decide from a count, without touching anything. */
export function decideAskQuota(used: number, plan: AskPlan, now: Date): AskQuotaResult {
  const limit = ASK_LIMITS[plan].questionsPerDay;
  const count = Number.isFinite(used) && used > 0 ? Math.floor(used) : 0;
  const resets_at = askResetsAt(now);
  if (count >= limit) {
    return {
      ok: false,
      error: "limit_reached",
      plan,
      limit,
      used: count,
      remaining: 0,
      resets_at,
      next_step: plan === "anonymous" ? "sign_in" : plan === "free" ? "upgrade" : "wait",
      message: limitMessage(plan, limit),
    };
  }
  return { ok: true, plan, limit, used: count, remaining: limit - count, resets_at };
}

/**
 * Count one question against today's allowance. Returns the allowance after
 * the question, or `limit_reached` without counting anything.
 */
export async function consumeAskQuota(
  store: AskUsageStore,
  input: { key: string; plan: AskPlan; now?: Date },
): Promise<AskQuotaResult> {
  const now = input.now ?? new Date();
  const day = askDayKey(now);
  return store.transact<AskQuotaResult>(askUsageDocId(input.key, day), (current) => {
    const used = current && current.day === day && typeof current.questions === "number" ? current.questions : 0;
    const before = decideAskQuota(used, input.plan, now);
    if (!before.ok) return { write: null, result: before };
    const next = used + 1;
    return {
      write: { key: input.key, plan: input.plan, day, questions: next, updated_at: now.toISOString() },
      result: { ...before, used: next, remaining: before.limit - next },
    };
  });
}

/** Read today's allowance without counting a question. */
export async function peekAskQuota(
  store: AskUsageStore,
  input: { key: string; plan: AskPlan; now?: Date },
): Promise<AskQuotaResult> {
  const now = input.now ?? new Date();
  const day = askDayKey(now);
  return store.transact<AskQuotaResult>(askUsageDocId(input.key, day), (current) => {
    const used = current && current.day === day && typeof current.questions === "number" ? current.questions : 0;
    return { write: null, result: decideAskQuota(used, input.plan, now) };
  });
}

/** An in-memory store for tests and for local runs without a database. */
export function memoryAskUsageStore(seed: Record<string, Partial<AskUsageDoc>> = {}): AskUsageStore & { docs: Map<string, Partial<AskUsageDoc>> } {
  const docs = new Map<string, Partial<AskUsageDoc>>(Object.entries(seed));
  return {
    docs,
    async transact(docId, update) {
      const { write, result } = update(docs.get(docId) ?? null);
      if (write) docs.set(docId, write);
      return result;
    },
  };
}
