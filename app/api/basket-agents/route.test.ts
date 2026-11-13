import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  uid: null as string | null,
  plan: "free" as "free" | "pro",
  calls: [] as unknown[][],
  enabled: true,
  fail: null as Error | null,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("next/headers", () => ({ headers: () => new Map() }));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {}, adminAuth: {} }));
vi.mock("@/lib/auth-server", () => ({
  getSessionUser: async () => (state.uid ? { uid: state.uid } : null),
}));
vi.mock("@/lib/entitlements-server", () => ({
  getViewer: async () => ({
    uid: state.uid,
    signedIn: Boolean(state.uid),
    plan: state.uid ? state.plan : "anon",
  }),
}));
vi.mock("@/lib/basket-agent/data", async () => {
  const { AgentJobError } = await vi.importActual<
    typeof import("@/lib/agent-jobs-data")
  >("@/lib/agent-jobs-data");
  class BasketAgentError extends AgentJobError {}
  return {
    BasketAgentError,
    limitWords: (limit: number) =>
      `Your plan runs ${limit} agents at a time. Pause another to run this one.`,
    listBaskets: async (uid: string) => [{ id: "b1", uid }],
    unknownTickers: async (tickers: string[]) =>
      tickers.filter((ticker) => ticker === "ZZZZ"),
    listBasketRuns: async (uid: string) => [{ uid, day: "2026-11-12" }],
    getBasket: async (uid: string, id: string) =>
      id === "b1" ? { id, uid, lines: [] } : null,
    replayDraft: async (draft: unknown) => {
      state.calls.push(["replay", draft]);
      return {
        from: "2026-10-16",
        to: "2026-11-12",
        sessions: 20,
        days: [],
        proposals: [],
        counts: { propose: 0, nothing: 20, could_not_check: 0 },
        notes: [],
        replayed_at: "x",
        runs: [],
        tickers: [],
      };
    },
    replaySummary: (replay: { from: string }) => ({ from: replay.from }),
    createBasket: async (
      uid: string,
      draft: unknown,
      replay: unknown,
      plan: string,
    ) => {
      state.calls.push(["create", uid, replay, plan]);
      if (state.fail) throw state.fail;
      return { id: "b1", uid, enabled: state.enabled, ...(draft as object) };
    },
    runBasket: async (basket: { id: string }, now: Date, options: unknown) => {
      state.calls.push(["run", basket.id, now instanceof Date, options]);
      return {
        status: "recorded",
        run: { day: "2026-11-12", decision: "nothing" },
      };
    },
    updateBasket: async (
      uid: string,
      id: string,
      patch: unknown,
      plan: string,
    ) => {
      state.calls.push(["update", uid, id, patch, plan]);
      if (state.fail) throw state.fail;
      return { id, uid };
    },
  };
});

const { GET, POST } = await import("./route");
const replayRoute = await import("./replay/route");
const one = await import("./[id]/route");
const { AgentJobError } = await import("@/lib/agent-jobs-data");

const body = {
  idea: "Power for AI data centers",
  lines: [
    { ticker: "VRT", reason: "Cools the racks." },
    { ticker: "ETN", reason: "Sells the switchgear." },
  ],
  uid: "someone-else",
};
const req = (method: string, payload?: unknown) =>
  new NextRequest("http://localhost/api/basket-agents", {
    method,
    body: payload === undefined ? undefined : JSON.stringify(payload),
    headers: { "content-type": "application/json" },
  });
const params = (id: string) => ({ params: { id } });

beforeEach(() => {
  state.uid = "u1";
  state.plan = "free";
  state.calls = [];
  state.enabled = true;
  state.fail = null;
});

describe("/api/basket-agents", () => {
  it("needs a signed-in person on every route and touches nothing otherwise", async () => {
    state.uid = null;
    expect((await GET()).status).toBe(401);
    expect((await POST(req("POST", body))).status).toBe(401);
    expect((await replayRoute.POST(req("POST", body))).status).toBe(401);
    expect((await one.GET(req("GET"), params("b1"))).status).toBe(401);
    expect(
      (await one.PATCH(req("PATCH", { enabled: true }), params("b1"))).status,
    ).toBe(401);
    expect((await one.DELETE(req("DELETE"), params("b1"))).status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("refuses a malformed basket before reading anything", async () => {
    const res = await POST(
      req("POST", { idea: "x", lines: [{ ticker: "VRT", reason: "y" }] }),
    );
    expect(res.status).toBe(400);
    expect((await replayRoute.POST(req("POST", { lines: [] }))).status).toBe(
      400,
    );
    expect(state.calls).toEqual([]);
  });

  it("replays on the server before saving, saves under the session's uid, and runs today's first check", async () => {
    const res = await POST(req("POST", body));
    expect(res.status).toBe(200);
    expect(state.calls.map((call) => call[0])).toEqual([
      "replay",
      "create",
      "run",
    ]);
    // The first check is provisional: the nightly check still runs that evening.
    expect(state.calls[2]![3]).toEqual({ provisional: true });
    expect(state.calls[1]).toEqual([
      "create",
      "u1",
      { from: "2026-10-16" },
      "free",
    ]);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      basket: { uid: "u1" },
      paused: null,
      run: { decision: "nothing" },
    });
  });

  it("says it was saved paused past the plan's limit, and runs nothing", async () => {
    state.enabled = false;
    const json = await (await POST(req("POST", body))).json();
    expect(json.paused).toMatchObject({
      feature: "agents",
      plan: "free",
      limit: 2,
    });
    expect(state.calls.map((call) => call[0])).toEqual(["replay", "create"]);
  });

  it("refuses a company we do not follow on every route that takes a basket", async () => {
    const odd = {
      ...body,
      lines: [...body.lines, { ticker: "ZZZZ", reason: "Made up." }],
    };
    for (const res of [
      await POST(req("POST", odd)),
      await replayRoute.POST(req("POST", odd)),
      await one.PATCH(req("PATCH", { basket: odd, version: 1 }), params("b1")),
    ]) {
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("ZZZZ");
    }
    expect(state.calls).toEqual([]);
  });

  it("replays without writing", async () => {
    const res = await replayRoute.POST(req("POST", body));
    expect(res.status).toBe(200);
    expect(state.calls.map((call) => call[0])).toEqual(["replay"]);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("edits, switches and removes only the person's own basket, with the plan's limit", async () => {
    expect((await one.PATCH(req("PATCH", {}), params("b1"))).status).toBe(400);
    expect(
      (await one.PATCH(req("PATCH", { enabled: true }), params("b1"))).status,
    ).toBe(200);
    expect(state.calls.at(-1)).toEqual([
      "update",
      "u1",
      "b1",
      { enabled: true },
      "free",
    ]);
    // An edit needs the version it was made on, and new companies get a new replay kept with the basket.
    expect(
      (await one.PATCH(req("PATCH", { basket: body }), params("b1"))).status,
    ).toBe(400);
    await one.PATCH(req("PATCH", { basket: body, version: 3 }), params("b1"));
    expect(state.calls.at(-2)![0]).toBe("replay");
    expect(state.calls.at(-1)![3]).toMatchObject({
      version: 3,
      replay: { from: "2026-10-16" },
      draft: {
        name: "Power for AI data centers",
        lines: [{ ticker: "VRT" }, { ticker: "ETN" }],
      },
    });
    expect((await one.DELETE(req("DELETE"), params("b1"))).status).toBe(200);
    expect(state.calls.at(-1)).toEqual([
      "update",
      "u1",
      "b1",
      { archived: true },
      "free",
    ]);
    expect((await one.GET(req("GET"), params("nope"))).status).toBe(404);
  });

  it("limits how many replays one person can start, across the replay and save routes", async () => {
    state.uid = "busy-replayer";
    const statuses: number[] = [];
    for (let index = 0; index < 9; index += 1)
      statuses.push((await replayRoute.POST(req("POST", body))).status);
    expect(statuses.slice(0, 8).every((status) => status === 200)).toBe(true);
    expect(statuses[8]).toBe(429);
    const save = await POST(req("POST", body));
    expect(save.status).toBe(429);
    expect(save.headers.get("retry-after")).toBeTruthy();
    state.uid = "someone-else";
    expect((await replayRoute.POST(req("POST", body))).status).toBe(200);
  });

  it("answers a plan refusal with its status and the lock's feature", async () => {
    state.fail = new AgentJobError(
      "Your plan runs 2 agents at a time.",
      409,
      "agents",
    );
    const res = await one.PATCH(req("PATCH", { enabled: true }), params("b1"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Your plan runs 2 agents at a time.",
      feature: "agents",
      plan: "free",
    });
  });
});
