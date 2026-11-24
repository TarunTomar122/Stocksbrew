import { beforeEach, describe, expect, it, vi } from "vitest";

/** The REST agent API's answers when the caller cannot be checked, and the active-token cap behind personal tokens. */

const store = vi.hoisted(() => ({ current: null as null | import("@/lib/test-utils/fake-store").FakeStore }));
const execute = vi.hoisted(() => vi.fn(async () => ({ ok: true })));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", async () => {
  const { createFakeStore } = await import("@/lib/test-utils/fake-store");
  store.current = createFakeStore();
  return { adminFirestore: store.current.firestore, adminAuth: {} };
});
vi.mock("@/lib/agent-intelligence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent-intelligence")>()),
  executeAgentTool: execute,
}));

import { AGENT_MAX_ACTIVE_TOKENS, AGENT_TOKEN_COLLECTION } from "@/lib/agent-access-config";
import { runAgentApiRequest } from "@/lib/agent-api";
import { countActivePersonalAgentTokens, issuePersonalAgentToken, listPersonalAgentTokens } from "@/lib/agent-auth";

const UID = "rest-test-uid";

function request(token?: string) {
  return new Request("http://localhost/api/agent/v1/stock", { headers: token ? { authorization: `Bearer ${token}` } : {} });
}

beforeEach(() => {
  store.current!.docs.clear();
  store.current!.docs.set(`users/${UID}`, { tracked_stocks: [] });
  execute.mockClear();
});

describe("runAgentApiRequest", () => {
  it("answers 401 without a token and 503 with Retry-After when the store cannot be read", async () => {
    expect((await runAgentApiRequest(request(), "search_stocks", {})).status).toBe(401);

    const { token } = await issuePersonalAgentToken(UID, "test");
    const ok = await runAgentApiRequest(request(token), "search_stocks", {});
    expect(ok.status).toBe(200);

    const get = vi.spyOn(store.current!.firestore, "collection").mockImplementation(() => {
      throw new Error("store down");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const blip = await runAgentApiRequest(request(token), "search_stocks", {});
      expect(blip.status).toBe(503);
      expect(blip.headers.get("retry-after")).toBe("30");
      expect(await blip.json()).toMatchObject({ error: "temporarily_unavailable" });
    } finally {
      get.mockRestore();
      error.mockRestore();
    }
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("the active-token cap", () => {
  it("counts every active token even behind more than 25 revoked ones, and lists the active ones first", async () => {
    for (let i = 0; i < 30; i += 1) {
      store.current!.docs.set(`${AGENT_TOKEN_COLLECTION}/revoked${i}`, {
        uid: UID,
        kind: "personal",
        prefix: "sb",
        label: `old ${i}`,
        created_at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(),
        revoked_at: "2026-11-02T00:00:00Z",
      });
    }
    for (let i = 0; i < AGENT_MAX_ACTIVE_TOKENS; i += 1) {
      store.current!.docs.set(`${AGENT_TOKEN_COLLECTION}/active${i}`, {
        uid: UID,
        kind: "personal",
        prefix: "sb",
        label: `live ${i}`,
        // older than every revoked one: a 25-row read would have missed them all
        created_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
        revoked_at: null,
      });
    }
    expect(await countActivePersonalAgentTokens(UID)).toBe(AGENT_MAX_ACTIVE_TOKENS);
    await expect(issuePersonalAgentToken(UID, "one more")).rejects.toMatchObject({ code: "token_limit_reached" });
    const listed = await listPersonalAgentTokens(UID);
    expect(listed).toHaveLength(25);
    expect(listed.filter((t) => !t.revoked_at)).toHaveLength(AGENT_MAX_ACTIVE_TOKENS);
  });
});
