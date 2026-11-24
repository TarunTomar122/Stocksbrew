import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The free MCP tier end to end, through the real route: a personal token issued the way Account issues one, the real
 * bearer check, the real plan lookup, the real tier rules and the real daily counter, over JSON-RPC. Only the store
 * (in memory) and the search index are stand-ins. Made-up uids only.
 */

const store = vi.hoisted(() => ({ current: null as null | import("@/lib/test-utils/fake-store").FakeStore }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", async () => {
  const { createFakeStore } = await import("@/lib/test-utils/fake-store");
  store.current = createFakeStore();
  return { adminFirestore: store.current.firestore, adminAuth: {} };
});
vi.mock("@/lib/search", async () => {
  const { filterSearchEntries } = await import("@/lib/search-shared");
  return {
    filterSearchEntries,
    getSearchIndexForApi: async () => [
      { instrument_id: "US_NVDA", ticker: "NVDA", name: "NVIDIA Corporation" },
      { instrument_id: "US_AMD", ticker: "AMD", name: "Advanced Micro Devices" },
    ],
  };
});

import { AGENT_DAILY_CALL_LIMIT, AGENT_FREE_DAILY_CALL_LIMIT, AGENT_USAGE_COLLECTION } from "@/lib/agent-access-config";
import { issuePersonalAgentToken } from "@/lib/agent-auth";
import { FREE_AGENT_TOOLS } from "@/lib/agent-tiers";

import { POST } from "./route";

const FREE_UID = "free-test-uid";
const PRO_UID = "pro-test-uid";

function usageDoc(uid: string): string {
  return `${AGENT_USAGE_COLLECTION}/${uid}_${new Date().toISOString().slice(0, 10).replaceAll("-", "_")}`;
}

async function rpc(token: string, method: string, params: Record<string, unknown> = {}) {
  const response = await POST(new Request("http://localhost:8003/api/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
  return { status: response.status, body: await response.json() as { result?: Record<string, unknown>; error?: unknown } };
}

async function callTool(token: string, name: string, args: Record<string, unknown> = {}) {
  const { status, body } = await rpc(token, "tools/call", { name, arguments: args });
  const result = body.result as { isError?: boolean; content: Array<{ text: string }>; structuredContent?: Record<string, unknown> };
  return { status, isError: result.isError === true, payload: JSON.parse(result.content[0].text) as Record<string, unknown> };
}

let freeToken = "";
let proToken = "";

beforeEach(async () => {
  store.current!.docs.clear();
  store.current!.docs.set(`users/${FREE_UID}`, { tracked_stocks: [] });
  store.current!.docs.set(`users/${PRO_UID}`, { tracked_stocks: [], is_subscribed: true });
  // Issued the way POST /api/agent-tokens issues them, with no plan check.
  freeToken = (await issuePersonalAgentToken(FREE_UID, "free laptop")).token;
  proToken = (await issuePersonalAgentToken(PRO_UID, "pro laptop")).token;
});

describe("the MCP route on Free", () => {
  it("lists every tool and marks the Pro ones on a Free token, and says the plan in the instructions", async () => {
    const free = await rpc(freeToken, "tools/list");
    expect(free.status).toBe(200);
    const tools = (free.body.result as { tools: Array<{ name: string; description: string }> }).tools;
    expect(tools).toHaveLength(23);
    const proOnly = tools.filter((tool) => tool.description.startsWith("Pro only"));
    expect(proOnly.map((tool) => tool.name).sort()).toEqual(tools.map((tool) => tool.name).filter((name) => !(FREE_AGENT_TOOLS as readonly string[]).includes(name)).sort());
    expect(proOnly).toHaveLength(23 - FREE_AGENT_TOOLS.length);

    const pro = await rpc(proToken, "tools/list");
    expect((pro.body.result as { tools: Array<{ description: string }> }).tools.some((tool) => tool.description.startsWith("Pro only"))).toBe(false);

    const init = await rpc(freeToken, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(String((init.body.result as { instructions?: string }).instructions)).toContain(`${AGENT_FREE_DAILY_CALL_LIMIT} calls a day`);
  });

  it("answers a free tool and counts it against the free allowance", async () => {
    const out = await callTool(freeToken, "search_stocks", { query: "nvidia" });
    expect(out.isError).toBe(false);
    expect(out.payload).toMatchObject({
      matches: [{ ticker: "NVDA" }],
      usage: { used: 1, limit: AGENT_FREE_DAILY_CALL_LIMIT, remaining: AGENT_FREE_DAILY_CALL_LIMIT - 1, plan: "free" },
    });
  });

  it("refuses a Pro tool as one tool error with the upgrade link, and does not count it", async () => {
    const out = await callTool(freeToken, "stress_test", {});
    expect(out.status).toBe(200);
    expect(out.isError).toBe(true);
    expect(out.payload).toMatchObject({ error: "pro_required", upgrade_url: expect.stringMatching(/\/pricing$/) });
    expect(String(out.payload.message)).toContain("stress_test is part of stocksbrew Pro");
    expect(store.current!.docs.get(usageDoc(FREE_UID))).toBeUndefined();
    // The session is not refused: the next free call works.
    expect((await callTool(freeToken, "search_stocks", { query: "amd" })).isError).toBe(false);
  });

  it("stops at the free daily cap with daily_limit and the upgrade link", async () => {
    store.current!.docs.set(usageDoc(FREE_UID), { calls: AGENT_FREE_DAILY_CALL_LIMIT });
    const out = await callTool(freeToken, "search_stocks", { query: "nvidia" });
    expect(out.isError).toBe(true);
    expect(out.payload).toMatchObject({ error: "daily_limit", upgrade_url: expect.stringMatching(/\/pricing$/) });
    expect(String(out.payload.message)).toContain(`today's ${AGENT_FREE_DAILY_CALL_LIMIT} free calls used`);
  });

  it("gives Pro every tool and the Pro allowance past the free cap", async () => {
    store.current!.docs.set(usageDoc(PRO_UID), { calls: AGENT_FREE_DAILY_CALL_LIMIT });
    const out = await callTool(proToken, "search_stocks", { query: "nvidia" });
    expect(out.isError).toBe(false);
    expect(out.payload).toMatchObject({ usage: { used: AGENT_FREE_DAILY_CALL_LIMIT + 1, limit: AGENT_DAILY_CALL_LIMIT, plan: "pro" } });
  });

  it("answers 503, not a 401 that restarts OAuth, when the store cannot be read", async () => {
    const spy = vi.spyOn(store.current!.firestore, "collection").mockImplementationOnce(() => {
      throw new Error("store down");
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { status } = await rpc(freeToken, "tools/list");
    expect(status).toBe(503);
    spy.mockRestore();
    errorLog.mockRestore();
  });

  it("still refuses a call with no token at the HTTP level", async () => {
    const response = await POST(new Request("http://localhost:8003/api/mcp", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
  });
});
