import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), writes: [] as string[], factsAsked: [] as string[], failReads: false, failWrites: false }));

vi.mock("@/lib/entitlements-server", () => ({
  isCovered: (viewer: { plan: string; covered: string[] }, id: string) => viewer.plan === "pro" || viewer.covered.includes(id),
}));
vi.mock("@/lib/firebase-admin", () => {
  const ref = (path: string) => ({
    path,
    get: async () => {
      if (state.failReads) throw new Error("LocalDB batch read failed (503)");
      return { exists: state.docs.has(path), data: () => state.docs.get(path) };
    },
    set: async (data: Record<string, unknown>) => {
      if (state.failWrites) throw new Error("LocalDB write failed (503)");
      state.writes.push(path);
      state.docs.set(path, data);
    },
  });
  return {
    adminFirestore: {
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
      getAll: async (...refs: Array<{ get: () => Promise<unknown> }>) => Promise.all(refs.map((r) => r.get())),
    },
  };
});
vi.mock("@/lib/portfolio-data", () => ({
  newYorkToday: (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now),
}));
vi.mock("./model", () => ({ thesisModelReader: () => null }));
vi.mock("./data", async () => {
  const { emptyFacts } = await import("./facts");
  return {
    tickerFromId: (id: string) => id.split("_").slice(1).join("."),
    closesOnDays: async () => new Map(),
    loadStockFacts: async (stocks: Array<{ instrumentId: string; ticker: string }>, today: string) => {
      state.factsAsked.push(...stocks.map((s) => s.instrumentId));
      return new Map(stocks.map((s) => [s.instrumentId, { ...emptyFacts(s.ticker, s.instrumentId, s.ticker, today), close: { value: 100, day: today }, revenueGrowth: -5, payout: 40 }]));
    },
  };
});

vi.mock("./condition-data", () => ({
  // AMD-like figures for every stock with lines: revenue growth 42% after the Nov 3 report, stored Nov 8.
  loadConditionInputs: async (stocks: Array<{ instrumentId: string; ticker: string }>) =>
    new Map(
      stocks.map((stock) => [
        stock.instrumentId,
        {
          ticker: stock.ticker,
          report: { date: "2026-11-03", quarter: "Q3", acceptedAt: "2026-11-03T21:16:27Z", url: null },
          values: { revenue_growth: { value: 41.87, asOf: "2026-11-08T09:54:21Z", source: "Company results, last 12 months", href: null } },
        },
      ]),
    ),
}));

import { checkReasons } from "./server";

const reason = (kind: string) => ({ kind, reason: null, created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z" });
const userDoc = {
  uid: "made-up-uid",
  tracked_stocks: ["US_NVDA", "US_KO", "US_AAPL"],
  watchlist_positions: { US_NVDA: "holding", US_KO: "holding", US_AAPL: "holding" },
  theses: { US_NVDA: reason("growth"), US_KO: reason("dividend"), US_GONE: reason("trade") },
} as never;
const viewer = (plan: "free" | "pro", covered: string[] = []) => ({ uid: "made-up-uid", signedIn: true, isSubscribed: plan === "pro", plan, tracked: [], covered, coverage: null, trialEligible: false });
const NOW = new Date("2026-11-11T16:00:00Z");

beforeEach(() => {
  state.docs.clear();
  state.writes = [];
  state.factsAsked = [];
  state.failReads = false;
  state.failWrites = false;
});

describe("checkReasons", () => {
  it("Free: checks covered stocks only and computes nothing about the rest", async () => {
    const result = await checkReasons(viewer("free", ["US_NVDA"]), userDoc, { now: NOW });
    expect(Object.keys(result.checks)).toEqual(["US_NVDA"]);
    expect(result.checks.US_NVDA!.verdict).toBe("broken");
    expect(result.locked).toEqual(["US_KO"]);
    expect(state.factsAsked).toEqual(["US_NVDA"]);
    // Only the person's own check documents, and never a reason for a stock they stopped tracking.
    expect(state.writes).toEqual(["tm_thesis_checks/made-up-uid__US_NVDA"]);
  });

  it("Pro: checks every reason on a tracked stock, and writes once a day", async () => {
    const result = await checkReasons(viewer("pro"), userDoc, { now: NOW });
    expect(Object.keys(result.checks).sort()).toEqual(["US_KO", "US_NVDA"]);
    expect(state.writes).toHaveLength(2);
    await checkReasons(viewer("pro"), userDoc, { now: new Date("2026-11-11T20:00:00Z") });
    expect(state.writes).toHaveLength(2);
    await checkReasons(viewer("pro"), userDoc, { now: new Date("2026-11-12T16:00:00Z") });
    expect(state.writes).toHaveLength(4);
  });

  it("gives no verdict when nothing could be checked", async () => {
    const fundOnly = { ...(userDoc as Record<string, unknown>), theses: { US_KO: reason("value") } } as never;
    const result = await checkReasons(viewer("pro"), fundOnly, { now: NOW });
    expect(result.checks).toEqual({});
    expect(result.unchecked).toEqual(["US_KO"]);
    expect(state.writes).toEqual([]);
  });

  it("writes nothing when asked not to, and nothing for a signed-out viewer", async () => {
    await checkReasons(viewer("pro"), userDoc, { now: NOW, persist: false });
    expect(state.writes).toEqual([]);
    expect(await checkReasons({ ...viewer("pro"), uid: null }, userDoc, { now: NOW })).toMatchObject({ checks: {} });
  });

  it("writes nothing when the stored checks cannot be read, so their history is never replaced", async () => {
    await checkReasons(viewer("pro"), userDoc, { now: NOW });
    const before = JSON.stringify([...state.docs.entries()]);
    state.writes = [];
    state.failReads = true;
    const result = await checkReasons(viewer("pro"), userDoc, { now: new Date("2026-11-12T16:00:00Z") });
    expect(Object.keys(result.checks).sort()).toEqual(["US_KO", "US_NVDA"]);
    expect(result.storedReadFailed).toBe(true);
    expect(state.writes).toEqual([]);
    expect(JSON.stringify([...state.docs.entries()])).toBe(before);
  });

  it("checks a reason's measurable lines: a broken one breaks the reason and is stored with its dated figure", async () => {
    const lines = {
      ...(userDoc as Record<string, unknown>),
      theses: {
        US_NVDA: { ...reason("growth"), conditions: [{ metric: "revenue_growth", op: "above", value: 45 }] },
        US_KO: { ...reason("dividend"), conditions: [{ metric: "revenue_growth", op: "above", value: 20 }, { metric: "gross_margin", op: "above", value: 50 }] },
      },
    } as never;
    const result = await checkReasons(viewer("pro"), lines, { now: NOW });
    const nvda = result.checks.US_NVDA!;
    expect(nvda.verdict).toBe("broken");
    expect(nvda.signals[0]!.text).toBe("Revenue growth is 42%, under your 45%.");
    expect(nvda.conditions.map((line) => line.status)).toEqual(["broken"]);
    const ko = result.checks.US_KO!;
    expect(ko.conditions.map((line) => [line.status, line.nowText])).toEqual([
      ["holds", "42%"],
      ["unknown", null],
    ]);
    const stored = state.docs.get("tm_thesis_checks/made-up-uid__US_KO") as { conditions: Array<Record<string, unknown>> };
    expect(stored.conditions[0]).toMatchObject({ key: "revenue_growth:above:20", status: "holds", report_date: "2026-11-03", source: "Revenue growth 42% after the Q3 report, Nov 3 (SEC 8-K)" });
    // The Q3 report was eight days old when the line was first saved: a baseline, not news.
    expect(stored.conditions[0]!.checked_on).toBeNull();
    // The next night, same report: nothing new is written about it.
    state.writes = [];
    await checkReasons(viewer("pro"), lines, { now: new Date("2026-11-11T22:00:00Z") });
    expect(state.writes).toEqual([]);
  });

  it("counts failed writes", async () => {
    state.failWrites = true;
    const result = await checkReasons(viewer("pro"), userDoc, { now: NOW });
    expect(result.writeFailures).toBe(2);
    expect(result.storedReadFailed).toBeUndefined();
  });
});
