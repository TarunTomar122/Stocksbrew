import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentJob, AgentJobDraft } from "@/lib/agent-jobs";

const state = vi.hoisted(() => ({
  uid: "me" as string | null,
  plan: "free" as "free" | "pro",
  existing: [] as AgentJob[],
  created: [] as Array<{ draft: AgentJobDraft; runLimit: number; enabled: boolean }>,
}));

vi.mock("@/lib/auth-server", () => ({ getSessionUser: async () => (state.uid ? { uid: state.uid } : null) }));
vi.mock("@/lib/entitlements-server", () => ({ getViewer: async () => ({ uid: state.uid, plan: state.plan }) }));
vi.mock("@/lib/agent-jobs-data", () => {
  class AgentJobError extends Error {
    status = 400;
  }
  return {
    AgentJobError,
    listJobs: async () => state.existing,
    // Mirrors the real createJob: past the run limit a new job is saved switched off.
    createJob: async (uid: string, draft: AgentJobDraft, now: Date, runLimit: number) => {
      const running = state.existing.filter((job) => job.enabled).length + state.created.filter((entry) => entry.enabled).length;
      const enabled = running < runLimit;
      state.created.push({ draft, runLimit, enabled });
      return { ...draft, id: `new${state.created.length}`, uid, mode: "tell_me", enabled, created_at: now.toISOString(), updated_at: now.toISOString() };
    },
  };
});

import { POST } from "./route";

const LEVEL = { template: "price-level", name: "NVDA below $150", trigger: { type: "price", rule: "crosses_below", level: 150 }, scope: { kind: "tickers", tickers: ["NVDA"] } };
const FUND = { template: "fund-filing", name: "NVDA: new 13F filings", trigger: { type: "event", event: "fund_13f" }, scope: { kind: "tickers", tickers: ["NVDA"] } };

function job(draft: Record<string, unknown>, enabled = true): AgentJob {
  return { ...(draft as unknown as AgentJobDraft), id: "old1", uid: "me", mode: "tell_me", enabled, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" };
}

function save(drafts: unknown) {
  return POST(new NextRequest("http://localhost/api/agents/save", { method: "POST", body: JSON.stringify({ drafts }) }));
}

beforeEach(() => {
  state.uid = "me";
  state.plan = "free";
  state.existing = [];
  state.created = [];
});

describe("POST /api/agents/save", () => {
  it("asks a signed-out visitor to sign in and writes nothing", async () => {
    state.uid = null;
    const response = await save([LEVEL]);
    expect(response.status).toBe(401);
    expect(state.created).toEqual([]);
  });

  it("saves each draft through createJob with the plan's run limit, and pauses past it", async () => {
    state.existing = [job({ ...FUND, scope: { kind: "watchlist" } })];
    const response = await save([LEVEL, FUND]);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(state.created.map((entry) => entry.draft.template)).toEqual(["price-level", "fund-filing"]);
    expect(state.created.every((entry) => entry.runLimit === 2)).toBe(true);
    expect(body.jobs.map((saved: AgentJob) => saved.enabled)).toEqual([true, false]);
    expect(body.paused).toEqual({ count: 1, limit: 2 });
  });

  it("skips an agent the person already has instead of writing it again", async () => {
    state.existing = [job({ ...LEVEL, name: "My own name for it" })];
    const body = await (await save([LEVEL, FUND])).json();
    expect(state.created.map((entry) => entry.draft.template)).toEqual(["fund-filing"]);
    expect(body.already).toEqual(["NVDA below $150"]);
  });

  it("refuses the whole request, before writing anything, when it would pass the account's limit", async () => {
    state.existing = Array.from({ length: 19 }, (_, index) => ({ ...job({ ...LEVEL, trigger: { ...LEVEL.trigger, level: 100 + index } }), id: `old${index}` }));
    const response = await save([LEVEL, FUND]);
    expect(response.status).toBe(409);
    expect(state.created).toEqual([]);
  });

  it("validates every draft with the agents API's own check", async () => {
    const response = await save([LEVEL, { ...LEVEL, trigger: { type: "price", rule: "crosses_below", level: -5 } }]);
    expect(response.status).toBe(400);
    expect(state.created).toEqual([]);
    expect((await save([])).status).toBe(400);
    expect((await save(Array.from({ length: 7 }, () => LEVEL))).status).toBe(400);
  });
});
