import { beforeEach, describe, expect, it, vi } from "vitest";

/** A tiny in-memory stand-in for the document store: enough for a transaction on one doc. */
const store = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), fail: false }));

// React's request cache only exists inside the server runtime.
vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", () => {
  const ref = (collection: string, id: string) => ({
    path: `${collection}/${id}`,
    async get() {
      if (store.fail) throw new Error("store down");
      const data = store.docs.get(`${collection}/${id}`);
      return { exists: data !== undefined, data: () => data };
    },
  });
  return {
    adminAuth: {},
    adminFirestore: {
      collection: (collection: string) => ({ doc: (id: string) => ref(collection, id) }),
      async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
        if (store.fail) throw new Error("store down");
        const writes: Array<[string, Record<string, unknown>]> = [];
        const result = await fn({
          get: (r: { get: () => Promise<unknown> }) => r.get(),
          set: (r: { path: string }, data: Record<string, unknown>) => writes.push([r.path, data]),
        });
        for (const [path, data] of writes) store.docs.set(path, { ...(store.docs.get(path) ?? {}), ...data });
        return result;
      },
    },
  };
});
vi.mock("next/headers", () => ({ headers: () => new Map() }));
vi.mock("@/lib/auth-server", () => ({ getSessionUser: async () => null }));
vi.mock("@/lib/seo/stock-pages", () => ({ isFeaturedStockTicker: (ticker: string) => ticker === "SHOW" }));

import { FAIL_CLOSED_METERS, canSeeLevels, consumeMeter, coveredSlotsLeft, isCovered, peekMeter, type Viewer } from "./entitlements-server";

const DAY = new Date("2026-11-10T15:00:00Z");
const NEXT_DAY = new Date("2026-11-11T00:00:01Z");

function viewer(plan: Viewer["plan"], covered: string[] = []): Viewer {
  return {
    uid: plan === "anon" ? null : "u1",
    signedIn: plan !== "anon",
    isSubscribed: plan === "pro",
    plan,
    tracked: covered,
    covered,
    coverage: null,
    trialEligible: false,
  };
}

beforeEach(() => {
  store.docs.clear();
  store.fail = false;
});

describe("consumeMeter", () => {
  it("gives a signed-out visitor no questions", async () => {
    const result = await consumeMeter("ask", "anon", "anon_x", DAY);
    expect(result.allowed).toBe(false);
    expect(store.docs.size).toBe(0);
  });

  it("counts Free questions up to three a day, then refuses without counting", async () => {
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await consumeMeter("ask", "free", "u1", DAY));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[2]).toMatchObject({ used: 3, remaining: 0, limit: 3, per: "day" });
    expect(results[3]).toMatchObject({ used: 3, remaining: 0 });
  });

  it("resets at midnight UTC", async () => {
    for (let i = 0; i < 3; i += 1) await consumeMeter("ask", "free", "u1", DAY);
    expect((await consumeMeter("ask", "free", "u1", NEXT_DAY)).allowed).toBe(true);
  });

  it("does not charge twice for the same request key", async () => {
    const first = await consumeMeter("backtest", "free", "u1", DAY, "setup-a");
    const again = await consumeMeter("backtest", "free", "u1", DAY, "setup-a");
    expect(first.used).toBe(1);
    expect(again).toMatchObject({ allowed: true, used: 1 });
  });

  it("keeps people apart", async () => {
    for (let i = 0; i < 3; i += 1) await consumeMeter("ask", "free", "u1", DAY);
    expect((await consumeMeter("ask", "free", "u2", DAY)).allowed).toBe(true);
  });

  it("gives Pro its own larger allowance", async () => {
    const result = await consumeMeter("ask", "pro", "u1", DAY);
    expect(result).toMatchObject({ allowed: true, limit: 50, remaining: 49 });
  });

  it("fails closed on a costly feature when the store is down, and says try again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    store.fail = true;
    for (const feature of ["ask", "deep_research"] as const) {
      const result = await consumeMeter(feature, "free", "u1", DAY);
      expect(result, feature).toMatchObject({ allowed: false, unavailable: true, remaining: 0 });
    }
    expect(FAIL_CLOSED_METERS.has("ask") && FAIL_CLOSED_METERS.has("deep_research")).toBe(true);
  });

  it("still fails open on a cheap meter when the store is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    store.fail = true;
    const result = await consumeMeter("backtest", "free", "u1", DAY);
    expect(result.allowed).toBe(true);
    expect(result.unavailable).toBeUndefined();
  });

  it("peeks as null when the store is down, which the research route reads as try again", async () => {
    store.fail = true;
    expect(await peekMeter("deep_research", "free", "u1", DAY)).toBeNull();
  });

  it("does not meter features that are not meters", async () => {
    const result = await consumeMeter("wire", "anon", "anon_x", DAY);
    expect(result.allowed).toBe(true);
    expect(store.docs.size).toBe(0);
  });
});

describe("peekMeter", () => {
  it("reads without spending", async () => {
    await consumeMeter("ask", "free", "u1", DAY);
    const peek = await peekMeter("ask", "free", "u1", DAY);
    expect(peek).toMatchObject({ used: 1, remaining: 2 });
    expect((await peekMeter("ask", "free", "u1", DAY))?.used).toBe(1);
    expect(await peekMeter("wire", "free", "u1", DAY)).toBeNull();
  });
});

describe("coverage checks", () => {
  it("covers every stock on Pro and nothing signed out", () => {
    expect(isCovered(viewer("pro"), "US_NVDA")).toBe(true);
    expect(isCovered(viewer("anon"), "US_NVDA")).toBe(false);
  });

  it("matches tickers in any spelling on Free", () => {
    const free = viewer("free", ["US_BRK_B", "US_NVDA"]);
    expect(isCovered(free, "BRK.B")).toBe(true);
    expect(isCovered(free, "brk-b")).toBe(true);
    expect(isCovered(free, "nvda")).toBe(true);
    expect(isCovered(free, "US_AAPL")).toBe(false);
  });

  it("shows the showcase stocks' levels to everyone", () => {
    expect(canSeeLevels(viewer("anon"), "US_SHOW")).toBe(true);
    expect(canSeeLevels(viewer("anon"), "US_NVDA")).toBe(false);
  });

  it("counts covered slots left", () => {
    expect(coveredSlotsLeft(viewer("free", ["US_A", "US_B"]))).toBe(3);
    expect(coveredSlotsLeft(viewer("anon"))).toBe(0);
    expect(coveredSlotsLeft(viewer("pro"))).toBe(Number.POSITIVE_INFINITY);
  });
});
