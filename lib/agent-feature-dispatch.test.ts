import { beforeEach, describe, expect, it, vi } from "vitest";

/** executeAgentTool for the feature tools: scope first, then the allowance, then the loader with the token's own uid. */

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("@/lib/watchlist", () => ({ getUserDoc: vi.fn(), resolveIsSubscribed: vi.fn() }));
// The stock loaders the dispatcher imports wrap reads in React's server-only cache().
vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/agent-quota", () => ({
  AgentQuotaError: class AgentQuotaError extends Error {},
  consumeAgentQuota: vi.fn(async () => ({ used: 1, remaining: 199, limit: 200, period: "day" })),
}));
vi.mock("@/lib/agent-feature-tools", () => ({
  getAgentWhatYouOwn: vi.fn(async () => ({ tool: "what_you_own" })),
  getAgentDividendPlan: vi.fn(async () => ({ tool: "dividend_plan" })),
  getAgentStressTest: vi.fn(async () => ({ tool: "stress_test" })),
  getAgentCopyTest: vi.fn(async () => ({ tool: "copy_test" })),
  readAgentWatchRequest: vi.fn(async () => ({ tool: "watch_in_plain_words" })),
}));

import type { AgentPrincipal } from "@/lib/agent-auth";
import {
  getAgentCopyTest,
  getAgentDividendPlan,
  getAgentStressTest,
  getAgentWhatYouOwn,
  readAgentWatchRequest,
} from "@/lib/agent-feature-tools";
import { executeAgentTool } from "@/lib/agent-intelligence";
import { consumeAgentQuota } from "@/lib/agent-quota";

function principal(scopes: AgentPrincipal["scopes"]): AgentPrincipal {
  return { uid: "owner-uid", tokenId: "t", kind: "personal", scopes, label: "test", clientId: null };
}

beforeEach(() => vi.clearAllMocks());

describe("feature tools in the dispatcher", () => {
  it("needs radar:read for the portfolio tools and checks it before counting a call", async () => {
    for (const tool of ["what_you_own", "dividend_plan", "stress_test"] as const) {
      await expect(executeAgentTool(principal(["stocks:read", "market:read"]), tool, {})).rejects.toMatchObject({ code: "insufficient_scope" });
    }
    expect(consumeAgentQuota).not.toHaveBeenCalled();
    expect(getAgentWhatYouOwn).not.toHaveBeenCalled();
  });

  it("reads only the token owner's portfolio, whatever the arguments say", async () => {
    const out = await executeAgentTool(principal(["radar:read"]), "what_you_own", { uid: "someone-else", limit: 5 });
    expect(getAgentWhatYouOwn).toHaveBeenCalledWith("owner-uid", { limit: 5 });
    expect(out).toMatchObject({ tool: "what_you_own", usage: { limit: 200 } });
    await executeAgentTool(principal(["radar:read"]), "dividend_plan", { payments: "yes" });
    expect(getAgentDividendPlan).toHaveBeenCalledWith("owner-uid", { payments: false });
    await executeAgentTool(principal(["radar:read"]), "stress_test", { holdings: true });
    expect(getAgentStressTest).toHaveBeenCalledWith("owner-uid", { holdings: true });
    expect(consumeAgentQuota).toHaveBeenCalledTimes(3);
  });

  it("puts copy_test under market:read and watch_in_plain_words under stocks:read", async () => {
    await expect(executeAgentTool(principal(["stocks:read"]), "copy_test", {})).rejects.toMatchObject({ code: "insufficient_scope" });
    await executeAgentTool(principal(["market:read"]), "copy_test", { query: "pelosi", kind: "nope", limit: 3 });
    expect(getAgentCopyTest).toHaveBeenCalledWith({ slug: undefined, query: "pelosi", kind: undefined, limit: 3 });
    await expect(executeAgentTool(principal(["market:read"]), "watch_in_plain_words", { text: "x" })).rejects.toMatchObject({ code: "insufficient_scope" });
    await executeAgentTool(principal(["stocks:read"]), "watch_in_plain_words", { text: "tell me if NVDA drops 5%" });
    expect(readAgentWatchRequest).toHaveBeenCalledWith("owner-uid", { text: "tell me if NVDA drops 5%" });
  });
});
