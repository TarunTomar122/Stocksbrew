import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ uid: null as string | null, calls: [] as unknown[][] }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T>(fn: T) => fn }));
vi.mock("next/headers", () => ({ headers: () => new Map() }));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {}, adminAuth: {} }));
vi.mock("@/lib/auth-server", () => ({ getSessionUser: async () => (state.uid ? { uid: state.uid } : null) }));
vi.mock("@/lib/entitlements-server", () => ({ getViewer: async () => ({ uid: state.uid, signedIn: Boolean(state.uid), plan: "free" }) }));

const OWN = "abc123def456";
const THESIS = { statement: "AI", lines: [{ ticker: "NVDA", conditions: [{ metric: "revenue_growth", op: "above", value: 40 }] }], created_at: "", updated_at: "", version: 2 };

vi.mock("@/lib/basket-agent/data", async () => {
  const { AgentJobError } = await vi.importActual<typeof import("@/lib/agent-jobs-data")>("@/lib/agent-jobs-data");
  return {
    BasketAgentError: class extends AgentJobError {},
    limitWords: () => "Your plan runs 2 agents at a time.",
    namesFor: async () => ({}),
    unknownTickers: async (tickers: string[]) => tickers.filter((ticker) => ticker === "ZZZZ"),
    // The store reads are scoped by uid: only "owner" has the thesis.
    getBasket: async (uid: string, id: string) => (uid === "owner" && id === OWN ? { id, uid, enabled: true, name: "AI", source: { kind: "own" }, lines: [{ ticker: "NVDA" }], thesis: THESIS } : null),
  };
});
vi.mock("@/lib/thesis-monitor/data", async () => {
  const { AgentJobError } = await vi.importActual<typeof import("@/lib/agent-jobs-data")>("@/lib/agent-jobs-data");
  class ThesisError extends AgentJobError {}
  return {
    ThesisError,
    readState: async () => null,
    listTheses: async () => [],
    runThesis: async () => null,
    saveThesis: async (uid: string, id: string, draft: unknown, version: number) => {
      state.calls.push(["save", uid, id, version]);
      return { id, uid, enabled: false, thesis: THESIS };
    },
    createHoldingsThesis: async (uid: string) => {
      state.calls.push(["create", uid]);
      return { id: OWN, uid, enabled: false, thesis: THESIS };
    },
    removeThesisLines: async (uid: string, id: string) => {
      state.calls.push(["remove", uid, id]);
      if (uid !== "owner") throw new ThesisError("That thesis does not exist.", 404);
    },
  };
});
vi.mock("@/lib/thesis-monitor/validate", () => ({
  linesFit: async (all: Array<{ ticker: string }>) => (all.some((line) => line.ticker === "ZZZZ") ? { ok: false, status: 400, error: "We don't follow ZZZZ yet." } : { ok: true }),
  saveAllowed: () => ({ ok: true }),
}));

const collection = await import("./route");
const one = await import("./[id]/route");

const body = { statement: "AI infrastructure demand keeps growing", lines: [{ ticker: "NVDA", conditions: [{ metric: "revenue_growth", op: "above", value: 40 }] }] };
const req = (method: string, payload?: unknown) =>
  new NextRequest(`http://localhost:8000/api/theses/${OWN}`, { method, ...(payload ? { body: JSON.stringify(payload), headers: { "content-type": "application/json" } } : {}) });
const params = { params: { id: OWN } };

beforeEach(() => {
  state.uid = null;
  state.calls = [];
});

describe("auth on every thesis route", () => {
  it("answers 401 signed out", async () => {
    expect((await collection.GET()).status).toBe(401);
    expect((await collection.POST(req("POST", body))).status).toBe(401);
    expect((await one.GET(req("GET"), params)).status).toBe(401);
    expect((await one.PATCH(req("PATCH", { ...body, version: 2 }), params)).status).toBe(401);
    expect((await one.DELETE(req("DELETE"), params)).status).toBe(401);
    expect(state.calls).toEqual([]);
  });
});

describe("another person's thesis is not found", () => {
  it("GET, PATCH and DELETE on someone else's id answer 404 and write nothing", async () => {
    state.uid = "intruder";
    const read = await one.GET(req("GET"), params);
    expect(read.status).toBe(404);
    expect(await read.json()).toEqual({ error: "That thesis does not exist." });
    expect((await one.PATCH(req("PATCH", { ...body, version: 2 }), params)).status).toBe(404);
    expect(state.calls.filter(([kind]) => kind === "save")).toEqual([]);
    expect((await one.DELETE(req("DELETE"), params)).status).toBe(404);
  });

  it("the owner reads it and saves over the version they opened", async () => {
    state.uid = "owner";
    const read = await one.GET(req("GET"), params);
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ id: OWN, href: `/agents/theses/${OWN}` });
    const saved = await one.PATCH(req("PATCH", { ...body, version: 2 }), params);
    expect(saved.status).toBe(200);
    expect(state.calls).toContainEqual(["save", "owner", OWN, 2]);
  });
});

describe("validation", () => {
  it("refuses a bad draft, a missing version and a company we don't follow, before any write", async () => {
    state.uid = "owner";
    expect((await one.PATCH(req("PATCH", { statement: "", lines: [], version: 2 }), params)).status).toBe(400);
    expect((await one.PATCH(req("PATCH", body), params)).status).toBe(400);
    const unknown = await collection.POST(req("POST", { ...body, lines: [{ ...body.lines[0], ticker: "ZZZZ" }] }));
    expect(unknown.status).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it("creates a thesis over holdings with the session's uid, and says when it was saved paused", async () => {
    state.uid = "owner";
    const created = await collection.POST(req("POST", body));
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ ok: true, id: OWN, paused: { feature: "agents" } });
    expect(state.calls).toEqual([["create", "owner"]]);
  });
});
