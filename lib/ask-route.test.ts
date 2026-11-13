import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The /api/ask route end to end with a stand-in model and a made-up signed-in
 * uid: a link's context opens before the model writes, the model sees it as a
 * finished lookup, the card reaches the page, and the numbers check counts it.
 * No real account, no network, no writes.
 */

const UID = "test-uid-route-0001";

const state = vi.hoisted(() => ({
  prompts: [] as unknown[],
  calls: [] as Array<[string, ...unknown[]]>,
  reply: "" as string,
}));

// React's request cache only exists under the server build; outside Next it is a pass-through.
vi.mock("react", async () => ({ ...(await vi.importActual<typeof import("react")>("react")), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("@/lib/auth-server", () => ({ getSessionUser: async () => ({ uid: UID }) }));
vi.mock("@/lib/watchlist", () => ({
  getUserDoc: async (uid: string) => {
    state.calls.push(["getUserDoc", uid]);
    return { uid, tracked_stocks: ["US_NVDA"], watchlist_positions: { US_NVDA: "holding" } };
  },
  resolveIsSubscribed: () => false,
}));
vi.mock("@/lib/entitlements-server", () => ({
  getViewer: async () => ({ uid: UID, signedIn: true, isSubscribed: false, plan: "free", tracked: ["US_NVDA"], covered: ["US_NVDA"], coverage: null, trialEligible: false }),
  canSeeLevels: () => true,
}));
vi.mock("@/lib/ask-data", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ask-data")>("@/lib/ask-data");
  const { memoryAskUsageStore } = await import("@/lib/ask-limits");
  return { ...actual, askUsageStore: memoryAskUsageStore() };
});
vi.mock("@/lib/agent-jobs-data", () => ({
  // The idea-basket store (lib/basket-agent/data.ts, read by Ask's basket tools) subclasses it when it loads.
  AgentJobError: class AgentJobError extends Error {},
  listJobs: async (uid: string) => {
    state.calls.push(["listJobs", uid]);
    return [
      { id: "abc123def", uid, name: "NVDA below $150", enabled: true, template: "price-level", trigger: { type: "price", rule: "crosses_below", level: 150 }, scope: { kind: "tickers", tickers: ["NVDA"] } },
    ];
  },
  listRuns: async (uid: string) => {
    state.calls.push(["listRuns", uid]);
    return [
      {
        id: "r1",
        job_id: "abc123def",
        uid,
        job_name: "NVDA below $150",
        day: "2026-11-10",
        ran_at: "2026-11-10T22:00:00Z",
        decision: "notify",
        summary: "NVDA closed at $148.20, below your $150 level.",
        findings: [],
        checked: [],
      },
    ];
  },
}));
vi.mock("@/lib/ask-llm", async () => {
  const { MockLanguageModelV3, simulateReadableStream } = await import("ai/test");
  const model = new MockLanguageModelV3({
    doStream: async (options) => {
      state.prompts.push(options.prompt);
      const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: state.reply },
            { type: "text-end", id: "t" },
            { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
          ],
        }),
      };
    },
  });
  return { askModel: () => ({ model, via: "openai" }) };
});

import { AbstractChat, DefaultChatTransport, type UIMessage } from "ai";

import { POST } from "@/app/api/ask/route";
import { askUsageStore } from "@/lib/ask-data";

function request(body: unknown) {
  return new Request("https://example.test/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never;
}

const userMessage = (id: string, text: string) => ({ id, role: "user", parts: [{ type: "text", text }] });

async function chunks(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
}

beforeEach(() => {
  // A fresh daily allowance for every test.
  (askUsageStore as unknown as { docs: Map<string, unknown> }).docs.clear();
  state.prompts = [];
  state.calls = [];
  state.reply = "Your agent fired: NVDA closed at $148.20, under your $150 level.";
});

describe("POST /api/ask with a context", () => {
  it("opens the linked agent for the session's uid before the model writes, and the model starts from it", async () => {
    const response = await POST(request({ messages: [userMessage("u1", "What has this agent found lately?")], context: "agent:abc123def" }));
    expect(response.status).toBe(200);
    const parts = await chunks(response as Response);

    // The page gets the card as the answer's first lookup.
    const input = parts.find((part) => part.type === "tool-input-available");
    const output = parts.find((part) => part.type === "tool-output-available");
    expect(input).toMatchObject({ toolName: "get_my_agents", input: { job_id: "abc123def" } });
    expect(output?.output).toMatchObject({ card: "agents", focus: "abc123def" });
    expect(parts.findIndex((part) => part.type === "tool-output-available")).toBeLessThan(parts.findIndex((part) => part.type === "text-delta"));

    // Only the session's uid was read.
    expect(state.calls.filter(([name]) => name === "listJobs" || name === "listRuns").map(([, uid]) => uid)).toEqual([UID, UID]);

    // The model saw it as a lookup it already made, and the prompt says where the question started.
    const prompt = JSON.stringify(state.prompts[0]);
    expect(prompt).toContain('"toolName":"get_my_agents"');
    expect(prompt).toContain("NVDA closed at $148.20");
    expect(prompt).toContain("The person opened Ask from one of your agents");

    // The numbers check counts the opened card: every figure in the reply is in it.
    const audit = parts.find((part) => part.type === "data-audit");
    expect(audit?.data).toMatchObject({ untraced: [] });
    expect((audit?.data as { checked: number }).checked).toBeGreaterThan(0);
  });

  it("flags a figure that is in no card", async () => {
    state.reply = "It fired at $131.07.";
    const parts = await chunks((await POST(request({ messages: [userMessage("u1", "What did it find?")], context: "agent:abc123def" }))) as Response);
    expect(parts.find((part) => part.type === "data-audit")?.data).toMatchObject({ untraced: ["$131.07"] });
  });

  it("ignores a context that is not one of ours, and opens nothing", async () => {
    for (const context of ["agent:../../users/someone", "uid:test-uid-9999", { kind: "agent" }, "x".repeat(400)]) {
      (askUsageStore as unknown as { docs: Map<string, unknown> }).docs.clear();
      state.prompts = [];
      const response = await POST(request({ messages: [userMessage("u1", "Hello?")], context }));
      expect(response.status).toBe(200);
      const parts = await chunks(response as Response);
      expect(parts.some((part) => part.type === "tool-input-available")).toBe(false);
      expect(JSON.stringify(state.prompts[0])).not.toContain("The person opened Ask from");
    }
    expect(state.calls.some(([name]) => name === "listJobs")).toBe(false);
  });

  it("opens the item with the first question only", async () => {
    const messages = [
      userMessage("u1", "What has this agent found lately?"),
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "It fired yesterday." }] },
      userMessage("u2", "And before that?"),
    ];
    const parts = await chunks((await POST(request({ messages, context: "agent:abc123def" }))) as Response);
    expect(parts.some((part) => part.type === "tool-input-available")).toBe(false);
    expect(state.calls.some(([name]) => name === "listJobs")).toBe(false);
  });

  it("reaches the page as one answer: the opened card, then the text, and a follow-up sends no duplicate lookups", async () => {
    class State {
      status = "ready" as const;
      error = undefined;
      messages: UIMessage[] = [];
      pushMessage = (message: UIMessage) => (this.messages = this.messages.concat(message));
      popMessage = () => (this.messages = this.messages.slice(0, -1));
      replaceMessage = (index: number, message: UIMessage) => (this.messages = [...this.messages.slice(0, index), structuredClone(message), ...this.messages.slice(index + 1)]);
      snapshot = <T,>(value: T): T => structuredClone(value);
    }
    const sent: Array<{ messages: UIMessage[] }> = [];
    const transport = new DefaultChatTransport<UIMessage>({
      api: "/api/ask",
      body: { context: "agent:abc123def" },
      fetch: async (_url, init) => {
        sent.push(JSON.parse(String(init?.body)));
        return POST(request(JSON.parse(String(init?.body))));
      },
    });
    const page = new State();
    let n = 0;
    // AbstractChat is what useChat drives on the page; a bare subclass is enough outside React.
    class PageChat extends AbstractChat<UIMessage> {}
    const chat = new PageChat({ id: "c", generateId: () => `client-${n++}`, transport, state: page as never });
    await chat.sendMessage({ text: "What has this agent found lately?" });
    expect(page.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    const parts = page.messages[1]!.parts.map((part) => part.type);
    expect(parts.filter((type) => type === "tool-get_my_agents")).toHaveLength(1);
    expect(parts.indexOf("tool-get_my_agents")).toBeLessThan(parts.indexOf("text"));

    // The follow-up carries the first answer back once, and opens nothing new.
    state.prompts = [];
    await chat.sendMessage({ text: "And before that?" });
    expect(page.messages.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant"]);
    const followUp = JSON.stringify(state.prompts[0]);
    expect(followUp.match(/"type":"tool-call"/g)).toHaveLength(1);
    expect(followUp.match(/"type":"tool-result"/g)).toHaveLength(1);
    expect(sent[1]!.messages).toHaveLength(3);
  });
});
