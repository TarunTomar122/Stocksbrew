import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MeterResult } from "@/lib/entitlements-server";
import type { RunLock, SharedLookup, SharedReport } from "@/lib/research/shared";
import type { ResearchEvent, ResearchReport } from "@/lib/research/types";

const state = vi.hoisted(() => ({
  calls: [] as string[],
  meter: null as MeterResult | null | "throw",
  saveFails: false,
  saved: [] as ResearchReport[],
  lookups: [] as Array<SharedLookup | "throw">,
  locks: [] as Array<RunLock | null>,
  held: [] as Array<{ ticker: string; status: string; created_at: string; key: string }> | "throw",
}));

vi.mock("@/lib/entitlements-server", () => ({
  METER_UNAVAILABLE_MESSAGE: "try again",
  consumeMeter: async (_feature: string, _plan: string, _uid: string, _now: Date, key: string) => {
    state.calls.push(`consume:${key}`);
    if (state.meter === "throw") throw new Error("down");
    return state.meter;
  },
}));
vi.mock("@/lib/research/store", () => ({
  researchStore: {
    list: async () => {
      if (state.held === "throw") throw new Error("down");
      return state.held;
    },
    save: async (report: ResearchReport) => {
      state.calls.push("save");
      if (state.saveFails) throw new Error("store down");
      state.saved.push(report);
    },
  },
}));
vi.mock("@/lib/research/shared", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/research/shared")>();
  return {
    ...real,
    lookupSharedReport: async () => {
      const next = state.lookups.length > 1 ? state.lookups.shift()! : state.lookups[0] ?? null;
      if (next === "throw") throw new Error("down");
      return next;
    },
    readRunLock: async () => (state.locks.length > 1 ? state.locks.shift()! : state.locks[0] ?? null),
  };
});

import { handOver, waitForRun } from "./handover";
import { EMPTY_CHARTS, initialSteps } from "./types";

const ALLOWED: MeterResult = { allowed: true, used: 1, limit: 3, remaining: 2, per: "month" };

function shared(patch: Partial<SharedReport> = {}): SharedReport {
  return {
    kind: "shared",
    source_key: "20261112T181711Z",
    written_at: "2026-11-12T18:19:00.000Z",
    stored_at: "2026-11-12T18:19:01.000Z",
    ticker: "MP",
    name: "MP Materials",
    status: "ready",
    created_at: "2026-11-12T18:17:11.000Z",
    updated_at: "2026-11-12T18:19:00.000Z",
    finished_at: "2026-11-12T18:19:00.000Z",
    steps: initialSteps(),
    body: { headline: "h", summary: [], business: [], drivers: [], bull: [], bear: [], valuation: [], numbers: [], ownership: [], risks: [], change: [], watch: [] },
    sources: [],
    charts: { ...EMPTY_CHARTS, stats: [] },
    missing: [],
    audit: null,
    error: null,
    ...patch,
  };
}

const fresh = (report = shared()): SharedLookup => ({ report, verdict: { fresh: true, reason: "fresh" } });
const stale = (report = shared()): SharedLookup => ({ report, verdict: { fresh: false, reason: "filing" } });
const lock = (patch: Partial<RunLock> = {}): RunLock => ({
  ticker: "MP",
  key: "run-a",
  started_at: "2026-11-12T18:17:00.000Z",
  expires_at: new Date(Date.now() + 300_000).toISOString(),
  done_at: null,
  outcome: null,
  ...patch,
});

beforeEach(() => {
  state.calls = [];
  state.meter = ALLOWED;
  state.saveFails = false;
  state.saved = [];
  state.lookups = [];
  state.locks = [];
  state.held = [];
});

describe("handOver: charge first, then save", () => {
  it("charges before it saves, keyed by the shared report so a retry is not charged twice", async () => {
    const result = await handOver(shared(), "reader", "free");
    expect(result.ok).toBe(true);
    expect(state.calls).toEqual(["consume:MP:20261112T181711Z", "save"]);
    expect(state.saved[0]).toMatchObject({ uid: "reader", shared_from: "20261112T181711Z" });
  });

  it("past the limit saves nothing and says so", async () => {
    state.meter = { allowed: false, used: 3, limit: 3, remaining: 0, per: "month" };
    expect(await handOver(shared(), "reader", "free")).toEqual({ ok: false, code: "limit", limit: 3, used: 3 });
    expect(state.calls).toEqual(["consume:MP:20261112T181711Z"]);
  });

  it("a meter it cannot read or that failed closed saves nothing", async () => {
    state.meter = { allowed: false, used: 0, limit: 3, remaining: 0, per: "month", unavailable: true };
    expect(await handOver(shared(), "reader", "free")).toEqual({ ok: false, code: "unavailable" });
    state.meter = "throw";
    expect(await handOver(shared(), "reader", "free")).toEqual({ ok: false, code: "unavailable" });
    expect(state.saved).toEqual([]);
  });

  it("a save that fails is reported, not hidden", async () => {
    state.saveFails = true;
    expect(await handOver(shared(), "reader", "free")).toEqual({ ok: false, code: "save_failed" });
  });
});

describe("waitForRun: freshness checked before every hand-over", () => {
  async function wait(first = lock()): Promise<ResearchEvent[]> {
    const events: ResearchEvent[] = [];
    await waitForRun("MP", first, "reader", "free", (event) => events.push(event), { pollMs: 1, waitMs: 2_000 });
    return events;
  }

  it("hands over the awaited run's report when it is fresh", async () => {
    state.lookups = [null, fresh()];
    state.locks = [lock()];
    const events = await wait();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "done", cached: true });
    expect(state.calls[0]).toBe("consume:MP:20261112T181711Z");
  });

  it("refuses the awaited run's report when something landed while it was written", async () => {
    state.lookups = [stale()];
    const events = await wait();
    expect(events).toEqual([expect.objectContaining({ type: "error", code: "stale" })]);
    expect(state.calls).toEqual([]);
  });

  it("does not hand over an older copy than the run it waited for", async () => {
    state.lookups = [fresh(shared({ created_at: "2026-11-10T10:00:00.000Z" }))];
    state.locks = [lock({ done_at: "2026-11-12T18:19:00.000Z", outcome: "failed" })];
    const events = await wait();
    expect(events).toEqual([expect.objectContaining({ type: "error", code: "failed" })]);
    expect(state.calls).toEqual([]);
  });

  it("opens the copy they already hold, uncounted, instead of charging again", async () => {
    state.lookups = [null, fresh(shared({ created_at: "2026-11-10T10:00:00.000Z" }))];
    state.locks = [lock({ done_at: "2026-11-12T18:17:30.000Z", outcome: "handover" })];
    state.held = [{ ticker: "MP", status: "ready", created_at: "2026-11-10T10:00:00.000Z", key: "mine" }];
    const events = await wait();
    expect(events[0]).toMatchObject({ type: "done", key: "mine", cached: true });
    expect(state.calls).toEqual([]);
  });

  it("a history it cannot read means try again, nothing counted", async () => {
    state.lookups = [null, fresh()];
    state.locks = [lock()];
    state.held = "throw";
    const events = await wait();
    expect(events).toEqual([expect.objectContaining({ type: "error", code: "unavailable" })]);
    expect(state.calls).toEqual([]);
  });

  it("takes any fresh copy when the run found one instead of running", async () => {
    state.lookups = [null, fresh(shared({ created_at: "2026-11-10T10:00:00.000Z" }))];
    state.locks = [lock({ done_at: "2026-11-12T18:17:30.000Z", outcome: "handover" })];
    const events = await wait();
    expect(events[0]).toMatchObject({ type: "done", cached: true });
  });

  it("past the limit, the waiter is told so and nothing is saved", async () => {
    state.meter = { allowed: false, used: 3, limit: 3, remaining: 0, per: "month" };
    state.lookups = [fresh()];
    const events = await wait();
    expect(events).toEqual([expect.objectContaining({ type: "error", code: "limit" })]);
    expect(state.saved).toEqual([]);
  });

  it("a lookup that fails keeps waiting instead of handing over", async () => {
    state.lookups = ["throw", fresh()];
    state.locks = [lock()];
    const events = await wait();
    expect(events[0]).toMatchObject({ type: "done" });
  });
});
