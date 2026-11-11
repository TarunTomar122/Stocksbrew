import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));

import { convertToModelMessages, readUIMessageStream, tool, type ToolSet } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { z } from "zod";

import type { AskCard, AskUIMessage, QuoteCard } from "@/lib/ask-cards";
import { askContext } from "@/lib/ask-context";
import { askUIStream, fallbackWatch } from "@/lib/ask-pipeline";

/**
 * Every answer about a stock ends on "Watch this": the model's own suggestion when it made one, otherwise one the
 * pipeline fills in from what the answer concluded. Stand-in model and tools; no network.
 */

const NOW = new Date("2026-11-11T15:00:00Z");
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };

function quote(ticker: string, report: string | null): QuoteCard {
  return {
    card: "quote",
    ticker,
    name: `${ticker} Corp`,
    sector: null,
    industry: null,
    currency: "USD",
    price: 168.79,
    day_change_pct: -5.53,
    market_cap: null,
    pe_ttm: null,
    dividend_yield: null,
    week_52_high: null,
    week_52_low: null,
    revenue_growth_yoy_pct: null,
    analyst_target: null,
    target_upside_pct: null,
    rsi_14: null,
    score: null,
    verdict: null,
    headline: null,
    thesis: null,
    what_changed: null,
    what_to_watch: null,
    key_points: [],
    risks: [],
    full_read: false,
    next_earnings: report ? { date: report, time: "amc" } : null,
    research_status: "ready",
    source: "test",
    as_of: null,
  };
}

describe("fallbackWatch", () => {
  it("reminds before a report that is close", () => {
    expect(fallbackWatch("It fell today.", [quote("NVDA", "2026-11-17")], NOW)).toEqual({ kind: "earnings_before", ticker: "NVDA", days: 3 });
  });
  it("watches a big daily move when the report is far off and the answer is not about it", () => {
    expect(fallbackWatch("It fell today.", [quote("NVDA", "2027-02-20")], NOW)).toEqual({ kind: "daily_move", ticker: "NVDA", pct: 5 });
    expect(fallbackWatch("It fell today.", [quote("NVDA", null)], NOW)).toEqual({ kind: "daily_move", ticker: "NVDA", pct: 5 });
  });
  it("follows the answer when it talks about insiders", () => {
    expect(fallbackWatch("Insiders sold shares this month.", [quote("NVDA", "2026-11-17")], NOW)).toEqual({ kind: "insider_trade", ticker: "NVDA" });
  });
  it("follows the stock the answer is about, not the page it was asked from", () => {
    const apple = { ...quote("AAPL", null), card: "returns", name: undefined } as unknown as AskCard;
    // The model's own lookup comes first; the page's NVDA card last, as the pipeline orders them.
    expect(fallbackWatch("AAPL is up 12% this year.", [apple, quote("NVDA", "2026-11-17")], NOW)).toMatchObject({ ticker: "AAPL" });
    expect(fallbackWatch("Apple is up 12% this year.", [{ ...quote("AAPL", null), name: "Apple Inc." }, quote("NVDA", "2026-11-17")], NOW)).toMatchObject({ ticker: "AAPL" });
    // An index fund measured alongside never shadows the stock.
    const spy = { card: "returns", ticker: "SPY", source: "test", as_of: null } as unknown as AskCard;
    expect(fallbackWatch("It beat SPY.", [spy, quote("NVDA", null)], NOW)).toMatchObject({ ticker: "NVDA" });
  });

  it("does not remind about a report months away just because the answer mentions results", () => {
    expect(fallbackWatch("Its results were strong.", [quote("NVDA", "2027-02-20")], NOW)).toEqual({ kind: "daily_move", ticker: "NVDA", pct: 5 });
    expect(fallbackWatch("Its results are due soon.", [quote("NVDA", "2026-12-01")], NOW)).toEqual({ kind: "earnings_before", ticker: "NVDA", days: 3 });
  });

  it("takes the first stock a market answer names among its cards", () => {
    const brief = { card: "market_brief", movers: [{ ticker: "RKLB" }, { ticker: "QLYS" }, { ticker: "C" }], source: "test", as_of: null } as unknown as AskCard;
    expect(fallbackWatch("The S&P 500 fell. Qualys (QLYS) fell 13%, Rocket Lab (RKLB) rose.", [brief], NOW)).toMatchObject({ ticker: "QLYS" });
    // A one-letter ticker counts only in parentheses, never as a bare word.
    expect(fallbackWatch("A quiet day. C is a bank.", [brief], NOW)).toBeNull();
  });
  it("offers nothing when the answer names no stock, or only the index fund", () => {
    expect(fallbackWatch("Markets were mixed.", [], NOW)).toBeNull();
    const spy = { card: "returns", ticker: "SPY", source: "test", as_of: null } as unknown as AskCard;
    expect(fallbackWatch("SPY rose 12%.", [spy], NOW)).toBeNull();
  });
});

function tools(calls: string[]): ToolSet {
  return {
    get_stock: tool({
      inputSchema: z.object({ ticker: z.string() }),
      execute: async ({ ticker }) => {
        calls.push(`get_stock:${ticker}`);
        return quote(ticker, "2027-02-20");
      },
    }),
    suggest_watch: tool({
      inputSchema: z.object({ kind: z.string(), ticker: z.string().optional(), pct: z.number().optional(), days: z.number().optional(), level: z.number().optional() }),
      execute: async (input) => {
        calls.push(`suggest_watch:${input.kind}:${input.ticker ?? ""}`);
        if (!input.ticker) return { card: "error", message: "No stock." };
        return { card: "watch", status: "ready", request: input.level ? `Tell me when ${input.ticker} closes below ${input.level}` : `Tell me when ${input.ticker} moves ${input.pct ?? 5}% in a day`, preview: "p", href: `/agents?q=${input.ticker}`, existing: [], note: null, source: "s", as_of: null };
      },
    }),
  };
}

/** A model that first calls the given tool (if any), then writes the reply. */
function model(reply: string, first?: { toolName: string; input: unknown }) {
  let step = 0;
  return new MockLanguageModelV3({
    doStream: async () => {
      step += 1;
      const chunks: unknown[] =
        step === 1 && first
          ? [
              { type: "stream-start", warnings: [] },
              { type: "tool-call", toolCallId: "m1", toolName: first.toolName, input: JSON.stringify(first.input) },
              { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
            ]
          : [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "t" },
              { type: "text-delta", id: "t", delta: reply },
              { type: "text-end", id: "t" },
              { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
            ];
      return { stream: simulateReadableStream({ chunks: chunks as never }) };
    },
  });
}

async function run(llmModel: MockLanguageModelV3, calls: string[]): Promise<AskUIMessage> {
  const stream = askUIStream({
    messages: [{ id: "q", role: "user", parts: [{ type: "text", text: "What matters most for NVDA right now?" }] }],
    context: askContext("stock", { ticker: "NVDA" }),
    signedIn: false,
    isPro: false,
    llm: { model: llmModel, via: "openai" },
    tools: tools(calls),
    now: NOW,
  });
  let last: AskUIMessage | null = null;
  for await (const message of readUIMessageStream<AskUIMessage>({ stream })) last = message;
  return last!;
}

const watchParts = (message: AskUIMessage) =>
  message.parts.filter((part) => part.type === "tool-suggest_watch" && (part as { output?: { card?: string } }).output?.card === "watch");

describe("askUIStream", () => {
  it("adds a Watch this card when the model offered none on a stock answer", async () => {
    const calls: string[] = [];
    const message = await run(model("NVDA closed at 168.79."), calls);
    expect(calls).toEqual(["get_stock:NVDA", "suggest_watch:daily_move:NVDA"]);
    expect(watchParts(message)).toHaveLength(1);
    expect(message.parts.find((part) => part.type === "data-audit")).toMatchObject({ data: { untraced: [] } });
  });

  it("keeps the model's own suggestion and adds no second one", async () => {
    const calls: string[] = [];
    const message = await run(model("NVDA closed at 168.79.", { toolName: "suggest_watch", input: { kind: "earnings_before", ticker: "NVDA", days: 3 } }), calls);
    expect(calls.filter((call) => call.startsWith("suggest_watch"))).toEqual(["suggest_watch:earnings_before:NVDA"]);
    expect(watchParts(message)).toHaveLength(1);
  });

  it("counts a move size the answer repeats from its agent, but never a price level the model picked", async () => {
    const move = await run(model("NVDA closed at 168.79. An agent can tell you about a 7% move.", { toolName: "suggest_watch", input: { kind: "daily_move", ticker: "NVDA", pct: 7 } }), []);
    expect(move.parts.find((part) => part.type === "data-audit")).toMatchObject({ data: { untraced: [] } });
    const level = await run(model("NVDA closed at 168.79. Watch for a close below 150.", { toolName: "suggest_watch", input: { kind: "price_below", ticker: "NVDA", level: 150 } }), []);
    expect(level.parts.find((part) => part.type === "data-audit")).toMatchObject({ data: { untraced: ["150"] } });
  });

  it("hands the answer, with its added card, back to the model on the next question", async () => {
    const message = await run(model("NVDA closed at 168.79."), []);
    const history = await convertToModelMessages(
      [{ id: "q", role: "user", parts: [{ type: "text", text: "What matters most for NVDA right now?" }] }, message, { id: "q2", role: "user", parts: [{ type: "text", text: "And the risks?" }] }],
      { tools: tools([]) },
    );
    const calls = JSON.stringify(history).match(/"type":"tool-call"/g) ?? [];
    const results = JSON.stringify(history).match(/"type":"tool-result"/g) ?? [];
    expect(calls.length).toBe(results.length);
    expect(JSON.stringify(history)).toContain("suggest_watch");
  });

  it("fills one in when the model's suggestion was turned down", async () => {
    const calls: string[] = [];
    const message = await run(model("NVDA closed at 168.79.", { toolName: "suggest_watch", input: { kind: "daily_move" } }), calls);
    expect(calls.filter((call) => call.startsWith("suggest_watch"))).toEqual(["suggest_watch:daily_move:", "suggest_watch:daily_move:NVDA"]);
    expect(watchParts(message)).toHaveLength(1);
  });
});
