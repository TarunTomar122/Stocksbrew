import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("@/lib/entitlements-server", () => ({ viewerFromUserDoc: () => null }));
vi.mock("@/lib/portfolio-data", () => ({
  newYorkToday: (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now),
}));
vi.mock("./server", () => ({ checkReasons: async () => ({ checks: {}, locked: [], unchecked: [], theses: {} }) }));

import type { Viewer } from "@/lib/entitlements-server";
import type { UserDoc } from "@/lib/watchlist";

import { runFailed, runNightlyReasonChecks, summaryLine, type NightlyDeps } from "./nightly";
import type { CheckOptions, ReasonChecks } from "./server";

const at = "2026-10-01T00:00:00.000Z";
const reason = (kind: string) => ({ kind, reason: null, created_at: at, updated_at: at });
const NOW = new Date("2026-11-11T23:00:00Z");

function viewer(uid: string, doc: UserDoc): Viewer {
  const pro = (doc as { is_subscribed?: boolean }).is_subscribed === true;
  return { uid, signedIn: true, isSubscribed: pro, plan: pro ? "pro" : "free", tracked: [], covered: ["US_KO"], coverage: null, trialEligible: false };
}

function deps(users: Array<Record<string, unknown>>, overrides: Partial<NightlyDeps> = {}) {
  const calls: Array<{ uid: string; plan: string; options: CheckOptions }> = [];
  let t = 0;
  const base: NightlyDeps = {
    listUsers: async () => users.map((user) => ({ uid: user.uid as string, theses: user.theses })),
    readUsers: async (uids) => users.filter((user) => uids.includes(user.uid as string)) as unknown as UserDoc[],
    viewerFor: viewer,
    check: async (v, doc, options): Promise<ReasonChecks> => {
      calls.push({ uid: v.uid!, plan: v.plan, options });
      const theses = (doc as unknown as { theses: Record<string, ReturnType<typeof reason>> }).theses;
      const ids = Object.keys(theses);
      const open = ids.filter((id) => v.plan === "pro" || v.covered.includes(id));
      return {
        theses: theses as never,
        locked: ids.filter((id) => !open.includes(id)),
        unchecked: [],
        checks: Object.fromEntries(
          open.map((id, i) => [id, { verdict: i === 0 ? "weaker" : "holds", change: i === 0 ? { from: "holds", day: "2026-11-11" } : null } as never]),
        ),
      };
    },
    clock: () => (t += 1000),
    ...overrides,
  };
  return { deps: base, calls };
}

const users = [
  { uid: "made-up-pro", is_subscribed: true, theses: { US_NVDA: reason("growth"), US_KO: reason("dividend") } },
  { uid: "made-up-free", theses: { US_NVDA: reason("growth"), US_KO: reason("dividend") } },
  { uid: "made-up-none", theses: {} },
  { uid: "made-up-junk", theses: { nope: { kind: "growth" } } },
];

describe("nightly reason check", () => {
  it("checks every account with a reason, on its own plan, rules only", async () => {
    const { deps: d, calls } = deps(users);
    const summary = await runNightlyReasonChecks(d, { now: NOW });
    expect(calls.map((call) => [call.uid, call.plan]).sort()).toEqual([
      ["made-up-free", "free"],
      ["made-up-pro", "pro"],
    ]);
    for (const call of calls) expect(call.options).toMatchObject({ persist: true, word: false, now: NOW });
    expect(summary).toMatchObject({
      day: "2026-11-11",
      users: 4,
      withReasons: 2,
      accountsChecked: 2,
      reasons: 4,
      checked: 3,
      locked: 1,
      changedToday: 2,
      verdicts: { holds: 1, weaker: 2, broken: 0, played_out: 0 },
      failed: 0,
      capped: false,
    });
  });

  it("writes nothing on a dry run", async () => {
    const { deps: d, calls } = deps(users);
    const summary = await runNightlyReasonChecks(d, { now: NOW, dryRun: true });
    expect(calls.every((call) => call.options.persist === false)).toBe(true);
    expect(summaryLine(summary)).toMatch(/^dry run, nothing written: /);
  });

  it("counts a failed account and goes on, without naming it", async () => {
    const { deps: d } = deps(users);
    const check = d.check;
    d.check = async (v, doc, options) => {
      if (v.uid === "made-up-pro") throw new Error("LocalDB write failed for users/made-up-pro");
      return check(v, doc, options);
    };
    const summary = await runNightlyReasonChecks(d, { now: NOW });
    expect(summary.failed).toBe(1);
    expect(summary.accountsChecked).toBe(1);
    expect(summaryLine(summary)).not.toMatch(/made-up|NVDA|KO/);
  });

  it("counts unreadable stored checks as a failed account and adds up failed writes", async () => {
    const { deps: d } = deps(users);
    const check = d.check;
    d.check = async (v, doc, options) => {
      const result = await check(v, doc, options);
      return v.uid === "made-up-pro" ? { ...result, storedReadFailed: true } : { ...result, writeFailures: 2 };
    };
    const summary = await runNightlyReasonChecks(d, { now: NOW });
    expect(summary.failed).toBe(1);
    expect(summary.writeFailures).toBe(2);
    expect(runFailed(summary)).toBe(true);
    expect(summaryLine(summary)).toMatch(/1 failed, 2 writes failed/);
  });

  it("goes red when time ran out or nothing could be checked, green on a clean night", async () => {
    const { deps: d } = deps(users);
    const clean = await runNightlyReasonChecks(d, { now: NOW });
    expect(runFailed(clean)).toBe(false);
    expect(runFailed({ ...clean, skippedForTime: 1 })).toBe(true);
    expect(runFailed({ ...clean, checked: 0, unchecked: 3 })).toBe(true);
    expect(runFailed({ ...clean, checked: 0, unchecked: 0 })).toBe(false);
  });

  it("stops starting accounts when the time budget is spent", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ uid: `made-up-${i}`, theses: { US_KO: reason("dividend") } }));
    const { deps: d, calls } = deps(many);
    // Each clock read moves a second on; a 4.5-second budget lets the first few start.
    const summary = await runNightlyReasonChecks(d, { now: NOW, concurrency: 1, budgetMs: 4500 });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBeLessThan(10);
    expect(summary.accountsChecked + summary.skippedForTime).toBe(10);
  });

  it("never runs more accounts at once than asked", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ uid: `made-up-${i}`, theses: { US_KO: reason("dividend") } }));
    let active = 0;
    let peak = 0;
    const { deps: d } = deps(many);
    const check = d.check;
    d.check = async (v, doc, options) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return check(v, doc, options);
    };
    const summary = await runNightlyReasonChecks(d, { now: NOW, concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
    expect(summary.accountsChecked).toBe(12);
  });

  it("says when the user list hit the store's cap", async () => {
    const { deps: d } = deps([]);
    d.listUsers = async () => Array.from({ length: 10_000 }, (_, i) => ({ uid: `u${i}`, theses: {} }));
    const summary = await runNightlyReasonChecks(d, { now: NOW });
    expect(summary.capped).toBe(true);
    expect(summaryLine(summary)).toMatch(/user list capped/);
  });
});
