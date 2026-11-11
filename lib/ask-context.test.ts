import { describe, expect, it } from "vitest";

import { ASK_CONTEXT_MAX, askContext, contextLabel, contextQuestion, contextToolCall, formatAskContext, parseAskContext } from "@/lib/ask-context";
import { askHref } from "@/lib/next-steps";

const VALID = [
  "stock:NVDA",
  "stock:BRK.B",
  "research:NVDA:20261110T153012Z",
  "reason:KO",
  "ex.reason:MSFT",
  "memo",
  "memo:call:AAPL:2026-11-05",
  "ex.memo",
  "ex.memo:week",
  "brief:HIMS:2026-11-10:move-HIMS",
  "agent:abc123def",
  "portfolio",
  "ex.portfolio",
];

describe("parseAskContext", () => {
  it("reads every shape and writes it back the same way", () => {
    for (const raw of VALID) {
      const parsed = parseAskContext(raw);
      expect(parsed, raw).not.toBeNull();
      expect(formatAskContext(parsed!)).toBe(raw);
    }
  });

  it("reads the parts it needs", () => {
    expect(parseAskContext("research:nvda:20261110T153012Z")).toEqual({ kind: "research", ticker: "NVDA", id: "20261110T153012Z", day: null, example: false });
    expect(parseAskContext("brief:HIMS:2026-11-10:move-HIMS")).toEqual({ kind: "brief", ticker: "HIMS", id: "move-HIMS", day: "2026-11-10", example: false });
    expect(parseAskContext("ex.portfolio")).toMatchObject({ kind: "portfolio", example: true });
  });

  it("refuses anything that is not exactly one of the shapes", () => {
    for (const raw of [
      null,
      42,
      "",
      "stock",
      "stock:",
      "stock:NVDA:extra",
      "stock:<script>",
      "research:NVDA",
      "research:NVDA:yesterday",
      "reason:",
      "agent:ABC",
      "agent:abc",
      "agent:abc123def:more",
      "brief:HIMS:yesterday:move-HIMS",
      "brief:HIMS:2026-11-10:",
      "brief:HIMS:2026-11-10:move HIMS",
      "memo:has spaces",
      "portfolio:extra",
      "user:someone-else",
      "uid:abc123",
      // The example portfolio has no research, agents, briefing or stock pages of its own.
      "ex.agent:abc123def",
      "ex.stock:NVDA",
      "ex.research:NVDA:20261110T153012Z",
      `memo:${"a".repeat(ASK_CONTEXT_MAX)}`,
    ]) {
      expect(parseAskContext(raw), String(raw)).toBeNull();
    }
  });

  it("builds from parts and refuses bad parts", () => {
    expect(askContext("research", { ticker: "nvda", id: "20261110T153012Z" })).toMatchObject({ kind: "research", ticker: "NVDA" });
    expect(askContext("research", { ticker: "NVDA", id: "nope" })).toBeNull();
    expect(askContext("agent", { id: "abc123def", example: true })).toBeNull();
  });
});

describe("what the context opens", () => {
  it("maps each kind to the lookup the model could also make, with ids only", () => {
    expect(contextToolCall(parseAskContext("stock:NVDA")!)).toEqual({ tool: "get_stock", input: { ticker: "NVDA" } });
    expect(contextToolCall(parseAskContext("research:NVDA:20261110T153012Z")!)).toEqual({ tool: "get_my_research", input: { ticker: "NVDA", key: "20261110T153012Z" } });
    expect(contextToolCall(parseAskContext("reason:KO")!)).toEqual({ tool: "get_my_reasons", input: { ticker: "KO" } });
    expect(contextToolCall(parseAskContext("memo")!)).toEqual({ tool: "get_my_week", input: {} });
    expect(contextToolCall(parseAskContext("memo:call:AAPL:2026-11-05")!)).toEqual({ tool: "get_my_week", input: { item_id: "call:AAPL:2026-11-05" } });
    expect(contextToolCall(parseAskContext("brief:HIMS:2026-11-10:move-HIMS")!)).toEqual({
      tool: "open_briefing_item",
      input: { ticker: "HIMS", day: "2026-11-10", item_id: "move-HIMS" },
    });
    expect(contextToolCall(parseAskContext("agent:abc123def")!)).toEqual({ tool: "get_my_agents", input: { job_id: "abc123def" } });
    expect(contextToolCall(parseAskContext("ex.portfolio")!)).toEqual({ tool: "get_my_portfolio", input: {} });
    // No lookup ever takes a uid: the server supplies it.
    for (const raw of VALID) expect(Object.keys(contextToolCall(parseAskContext(raw)!).input)).not.toContain("uid");
  });

  it("says plainly where the answer starts, in full sentences for the page", () => {
    expect(contextLabel(parseAskContext("research:NVDA:20261110T153012Z")!)).toBe("your NVDA research report");
    expect(contextLabel(parseAskContext("ex.portfolio")!)).toBe("the example portfolio");
    expect(contextQuestion(parseAskContext("ex.portfolio")!)).toBe("How is the example portfolio doing this week?");
    for (const raw of VALID) {
      const parsed = parseAskContext(raw)!;
      expect(contextQuestion(parsed).trim().endsWith("?") || contextQuestion(parsed).endsWith(".")).toBe(true);
      expect(contextLabel(parsed)).not.toMatch(/undefined|null/);
    }
  });
});

describe("askHref", () => {
  it("keeps today's links exactly as they were", () => {
    expect(askHref("Why did HIMS fall 16.5%?")).toBe("/ask?q=Why%20did%20HIMS%20fall%2016.5%25%3F");
    expect(askHref("Why did HIMS fall 16.5%?", null)).toBe("/ask?q=Why%20did%20HIMS%20fall%2016.5%25%3F");
  });

  it("adds a short id-only context, and drops one that is not valid", () => {
    const href = askHref("What changed?", "research:NVDA:20261110T153012Z");
    const url = new URL(href, "https://example.test");
    expect(url.searchParams.get("q")).toBe("What changed?");
    expect(url.searchParams.get("ctx")).toBe("research:NVDA:20261110T153012Z");
    expect(href.length).toBeLessThan(90);
    expect(askHref("What changed?", parseAskContext("ex.memo"))).toContain("&ctx=ex.memo");
    expect(askHref("What changed?", "research:NVDA:not-a-key")).toBe("/ask?q=What%20changed%3F");
  });
});

describe("openContext", () => {
  const fake = (cards: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(cards).map(([name, card]) => [name, { execute: async () => card }])) as never;

  it("opens the item, and skips one that is gone or needs an account", async () => {
    const { openContext } = await import("@/lib/ask-context-open");
    const agents = { card: "agents", total: 1, rows: [], focus: "abc123def", focus_missing: false, source: "s", as_of: null };
    expect(await openContext(parseAskContext("agent:abc123def")!, fake({ get_my_agents: agents }))).toMatchObject({ toolName: "get_my_agents", fellBack: false });
    expect(await openContext(parseAskContext("agent:abc123def")!, fake({ get_my_agents: { card: "error", message: "gone" } }))).toBeNull();
    expect(await openContext(parseAskContext("memo")!, fake({ get_my_week: { card: "sign_in", message: "sign in" } }))).toBeNull();
    expect(await openContext(parseAskContext("memo")!, fake({}))).toBeNull();
  });

  it("a briefing line no longer saved opens the stock instead", async () => {
    const { openContext } = await import("@/lib/ask-context-open");
    const quote = { card: "quote", ticker: "HIMS", source: "s", as_of: null };
    const opened = await openContext(parseAskContext("brief:HIMS:2026-11-10:move-HIMS")!, fake({ open_briefing_item: { card: "error", message: "gone" }, get_stock: quote }));
    expect(opened).toMatchObject({ toolName: "get_stock", input: { ticker: "HIMS" }, fellBack: true });
  });
});
