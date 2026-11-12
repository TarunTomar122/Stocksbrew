import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MeterResult } from "@/lib/entitlements-server";
import type { SharedLookup, SharedReport } from "@/lib/research/shared";
import type { ResearchIndexItem, ResearchReport } from "@/lib/research/types";

/** POST /api/research with every store, meter and the run itself faked: no model is ever called here. */
const state = vi.hoisted(() => ({
  calls: [] as string[],
  meter: null as MeterResult | null,
  items: [] as ResearchIndexItem[] | "throw",
  lookups: [] as Array<SharedLookup | null>,
  claim: { claimed: true } as { claimed: true } | { claimed: false; lock: unknown } | "throw",
  released: [] as string[],
  peek: { allowed: true, used: 0, limit: 3, remaining: 3, per: "month" } as MeterResult,
}));

vi.mock("@/lib/entitlements-server", () => ({
  METER_UNAVAILABLE_MESSAGE: "try again",
  getViewer: async () => ({ uid: "reader", plan: "free", isSubscribed: false }),
  peekMeter: async () => state.peek,
  consumeMeter: async (_f: string, _p: string, _u: string, _n: Date, key: string) => {
    state.calls.push(`consume:${key}`);
    return state.meter;
  },
}));
vi.mock("@/lib/ask-llm", () => ({ askModel: () => ({ via: "anthropic", model: {} }) }));
vi.mock("@/lib/stock", () => ({ getStockSummary: async () => ({ name: "MP Materials" }) }));
vi.mock("@/lib/research/gather", () => ({ STEP_LOADERS: {} }));
vi.mock("@/lib/research/write", () => ({ writeReport: async () => ({}) }));
vi.mock("@/lib/research/run", () => ({
  runResearch: async () => {
    state.calls.push("run");
    return { status: "failed" };
  },
}));
vi.mock("@/lib/research/store", () => ({
  researchStore: {
    list: async () => {
      if (state.items === "throw") throw new Error("store down");
      return state.items;
    },
    save: async (report: ResearchReport) => {
      state.calls.push(`save:${report.uid}`);
    },
  },
  runningItem: () => null,
}));
vi.mock("@/lib/research/shared", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/research/shared")>();
  return {
    ...real,
    lookupSharedReport: async () => (state.lookups.length > 1 ? state.lookups.shift()! : state.lookups[0] ?? null),
    claimRun: async () => {
      state.calls.push("claim");
      if (state.claim === "throw") throw new Error("store down");
      return state.claim;
    },
    releaseRun: async (_t: string, _k: string, outcome: string) => {
      state.released.push(outcome);
    },
    putSharedReport: async () => true,
    readRunLock: async () => null,
    getSharedReport: async () => null,
  };
});

import { POST } from "./route";
import { EMPTY_CHARTS, initialSteps } from "@/lib/research/types";

const ALLOWED: MeterResult = { allowed: true, used: 1, limit: 3, remaining: 2, per: "month" };

function shared(): SharedReport {
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
  };
}
const fresh: SharedLookup = { report: shared(), verdict: { fresh: true, reason: "fresh" } };

function post(body: Record<string, unknown>) {
  return POST(new NextRequest("http://localhost/api/research", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
}

beforeEach(() => {
  state.calls = [];
  state.meter = ALLOWED;
  state.items = [];
  state.lookups = [];
  state.claim = { claimed: true };
  state.released = [];
  state.peek = { allowed: true, used: 0, limit: 3, remaining: 3, per: "month" };
});

describe("POST /api/research: handing over the shared report", () => {
  it("charges first, then saves the copy, and never runs", async () => {
    state.lookups = [fresh];
    const response = await post({ ticker: "MP" });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"cached":true');
    expect(state.calls).toEqual(["consume:MP:20261112T181711Z", "save:reader"]);
  });

  it("a retry at the limit still gets the report it already paid for (the charge's own key decides, not the peek)", async () => {
    state.lookups = [fresh];
    state.peek = { allowed: false, used: 3, limit: 3, remaining: 0, per: "month" };
    // consumeMeter finds this charge's key already counted and lets it through without counting again.
    state.meter = { allowed: true, used: 3, limit: 3, remaining: 0, per: "month" };
    const response = await post({ ticker: "MP" });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"cached":true');
    expect(state.calls).toEqual(["consume:MP:20261112T181711Z", "save:reader"]);
  });

  it("past the limit with no fresh copy, a run is refused before anything starts", async () => {
    state.peek = { allowed: false, used: 3, limit: 3, remaining: 0, per: "month" };
    const response = await post({ ticker: "MP" });
    expect(response.status).toBe(429);
    expect(state.calls).toEqual([]);
  });

  it("past the limit at charge time returns the limit answer and saves nothing", async () => {
    state.lookups = [fresh];
    state.meter = { allowed: false, used: 3, limit: 3, remaining: 0, per: "month" };
    const response = await post({ ticker: "MP" });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: "limit", limit: 3 });
    expect(state.calls).toEqual(["consume:MP:20261112T181711Z"]);
  });

  it("a meter that failed closed returns try-again and saves nothing", async () => {
    state.lookups = [fresh];
    state.meter = { allowed: false, used: 0, limit: 3, remaining: 0, per: "month", unavailable: true };
    const response = await post({ ticker: "MP" });
    expect(response.status).toBe(503);
    expect(state.calls).not.toContain("save:reader");
    expect(state.calls).not.toContain("run");
  });
});

describe("POST /api/research: their own history", () => {
  it("a history it cannot read means try again: no hand-over, no charge, no run", async () => {
    state.lookups = [fresh];
    state.items = "throw";
    const response = await post({ ticker: "MP", fresh: true });
    expect(response.status).toBe(503);
    expect(state.calls).toEqual([]);
  });
});

describe("POST /api/research: the stock's run lock", () => {
  it("fails closed: a lock it cannot take means try again, never a run", async () => {
    state.claim = "throw";
    const response = await post({ ticker: "MP" });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "busy" });
    expect(state.calls).toEqual(["claim"]);
  });

  it("after claiming, hands over a fresh copy that appeared meanwhile instead of running, and frees the lock", async () => {
    state.lookups = [null, fresh];
    const response = await post({ ticker: "MP" });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"cached":true');
    expect(state.calls).toEqual(["claim", "consume:MP:20261112T181711Z", "save:reader"]);
    expect(state.released).toEqual(["handover"]);
  });

  it("runs when there is still no fresh copy after the claim, and frees the lock when done", async () => {
    state.lookups = [null];
    const response = await post({ ticker: "MP" });
    await response.text();
    expect(state.calls).toEqual(["claim", "run"]);
    expect(state.released).toEqual(["failed"]);
  });

  it("someone else's run holds the lock: waits instead of running", async () => {
    state.claim = { claimed: false, lock: { ticker: "MP", key: "other", started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString(), done_at: null, outcome: null } };
    const response = await post({ ticker: "MP" });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('"status":"running"');
    await reader.cancel();
    expect(state.calls).toEqual(["claim"]);
  });
});
