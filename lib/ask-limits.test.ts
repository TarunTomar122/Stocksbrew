import { describe, expect, it } from "vitest";

import { ASK_LIMITS } from "@/lib/ask-config";
import {
  askDayKey,
  askPlanFor,
  askResetsAt,
  askUsageDocId,
  consumeAskQuota,
  decideAskQuota,
  memoryAskUsageStore,
  peekAskQuota,
} from "@/lib/ask-limits";

const NOW = new Date("2026-11-09T15:30:00Z");

describe("askPlanFor", () => {
  it("maps who is asking to a plan", () => {
    expect(askPlanFor({ uid: null, isPro: false })).toBe("anonymous");
    expect(askPlanFor({ uid: null, isPro: true })).toBe("anonymous");
    expect(askPlanFor({ uid: "u1", isPro: false })).toBe("free");
    expect(askPlanFor({ uid: "u1", isPro: true })).toBe("pro");
  });
});

describe("day keys", () => {
  it("uses the UTC day and resets at the next UTC midnight", () => {
    expect(askDayKey(NOW)).toBe("2026-11-09");
    expect(askResetsAt(NOW)).toBe("2026-11-10T00:00:00.000Z");
    expect(askResetsAt(new Date("2026-12-31T23:59:59Z"))).toBe("2027-01-01T00:00:00.000Z");
  });

  it("builds a doc id that cannot nest a path", () => {
    expect(askUsageDocId("anon/../x y", "2026-11-09")).toBe("anon____x_y__2026-11-09");
  });
});

describe("decideAskQuota", () => {
  it("allows below the limit and reports what is left", () => {
    const result = decideAskQuota(1, "free", NOW);
    expect(result).toMatchObject({ ok: true, limit: ASK_LIMITS.free.questionsPerDay, used: 1, remaining: ASK_LIMITS.free.questionsPerDay - 1 });
    // Signed out has no allowance: the first question asks them to sign in.
    expect(decideAskQuota(0, "anonymous", NOW)).toMatchObject({ ok: false, limit: 0, next_step: "sign_in" });
  });

  it("returns a structured limit_reached with the right next step per plan", () => {
    const anonymous = decideAskQuota(ASK_LIMITS.anonymous.questionsPerDay, "anonymous", NOW);
    expect(anonymous).toMatchObject({ ok: false, error: "limit_reached", plan: "anonymous", remaining: 0, next_step: "sign_in", resets_at: "2026-11-10T00:00:00.000Z" });
    expect(decideAskQuota(ASK_LIMITS.free.questionsPerDay, "free", NOW)).toMatchObject({ ok: false, next_step: "upgrade" });
    expect(decideAskQuota(ASK_LIMITS.pro.questionsPerDay + 5, "pro", NOW)).toMatchObject({ ok: false, next_step: "wait" });
  });

  it("treats a broken count as zero", () => {
    expect(decideAskQuota(Number.NaN, "free", NOW)).toMatchObject({ ok: true, used: 0 });
    expect(decideAskQuota(-3, "free", NOW)).toMatchObject({ ok: true, used: 0 });
  });
});

describe("consumeAskQuota", () => {
  it("counts each question and stops at the limit without counting past it", async () => {
    const store = memoryAskUsageStore();
    const limit = ASK_LIMITS.free.questionsPerDay;
    for (let i = 1; i <= limit; i += 1) {
      const result = await consumeAskQuota(store, { key: "u_a", plan: "free", now: NOW });
      expect(result).toMatchObject({ ok: true, used: i, remaining: limit - i });
    }
    const blocked = await consumeAskQuota(store, { key: "u_a", plan: "free", now: NOW });
    expect(blocked).toMatchObject({ ok: false, error: "limit_reached", used: limit });
    await consumeAskQuota(store, { key: "u_a", plan: "free", now: NOW });
    expect(store.docs.get(askUsageDocId("u_a", "2026-11-09"))?.questions).toBe(limit);
  });

  it("never counts a signed-out question", async () => {
    const store = memoryAskUsageStore();
    expect(await consumeAskQuota(store, { key: "anon_a", plan: "anonymous", now: NOW })).toMatchObject({ ok: false, next_step: "sign_in" });
    expect(store.docs.size).toBe(0);
  });

  it("keeps people apart", async () => {
    const store = memoryAskUsageStore();
    await consumeAskQuota(store, { key: "u1", plan: "free", now: NOW });
    const other = await consumeAskQuota(store, { key: "u2", plan: "free", now: NOW });
    expect(other).toMatchObject({ ok: true, used: 1 });
  });

  it("starts again on a new day", async () => {
    const store = memoryAskUsageStore();
    for (let i = 0; i < ASK_LIMITS.free.questionsPerDay; i += 1) await consumeAskQuota(store, { key: "u_a", plan: "free", now: NOW });
    const tomorrow = new Date("2026-11-10T00:00:01Z");
    expect(await consumeAskQuota(store, { key: "u_a", plan: "free", now: tomorrow })).toMatchObject({ ok: true, used: 1 });
  });

  it("applies the higher limit as soon as the plan changes", async () => {
    const store = memoryAskUsageStore();
    for (let i = 0; i < ASK_LIMITS.free.questionsPerDay; i += 1) await consumeAskQuota(store, { key: "u1", plan: "free", now: NOW });
    expect(await consumeAskQuota(store, { key: "u1", plan: "free", now: NOW })).toMatchObject({ ok: false });
    expect(await consumeAskQuota(store, { key: "u1", plan: "pro", now: NOW })).toMatchObject({ ok: true, used: ASK_LIMITS.free.questionsPerDay + 1 });
  });

  it("ignores a stored count from another day", async () => {
    const store = memoryAskUsageStore({ [askUsageDocId("u1", "2026-11-09")]: { day: "2026-11-08", questions: 999 } });
    expect(await consumeAskQuota(store, { key: "u1", plan: "free", now: NOW })).toMatchObject({ ok: true, used: 1 });
  });
});

describe("peekAskQuota", () => {
  it("reads without counting", async () => {
    const store = memoryAskUsageStore();
    await consumeAskQuota(store, { key: "u1", plan: "free", now: NOW });
    const first = await peekAskQuota(store, { key: "u1", plan: "free", now: NOW });
    const second = await peekAskQuota(store, { key: "u1", plan: "free", now: NOW });
    expect(first).toMatchObject({ ok: true, used: 1 });
    expect(second).toMatchObject({ ok: true, used: 1 });
  });
});

describe("the limits table", () => {
  it("gives more to people who sign in, and more again on Pro", () => {
    expect(ASK_LIMITS.anonymous.questionsPerDay).toBeLessThan(ASK_LIMITS.free.questionsPerDay);
    expect(ASK_LIMITS.free.questionsPerDay).toBeLessThan(ASK_LIMITS.pro.questionsPerDay);
  });
});
