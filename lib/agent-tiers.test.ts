import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/** The Free and Pro line on the agent tools: which tools, how many calls a day, and what Free sees per stock. */

const store = vi.hoisted(() => ({ current: null as null | import("@/lib/test-utils/fake-store").FakeStore }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", async () => {
  const { createFakeStore } = await import("@/lib/test-utils/fake-store");
  store.current = createFakeStore();
  return { adminFirestore: store.current.firestore, adminAuth: {} };
});
vi.mock("@/lib/seo/stock-pages", () => ({ isFeaturedStockTicker: (ticker: string) => ticker === "AAPL" }));
vi.mock("@/lib/agent-feature-tools", () => ({
  getAgentStressTest: vi.fn(async () => ({ tool: "stress_test" })),
}));
vi.mock("@/lib/instrument-resolver", () => ({
  resolveInstrumentByTicker: async (ticker: string) => ({ ticker, instrument_id: `US_${ticker}`, name: ticker, market: "US" }),
  getInstrumentLabels: async () => new Map(),
}));
vi.mock("@/lib/on-demand-queue", () => ({ getOnDemandNewsStatus: async () => null }));
vi.mock("@/lib/extended-quotes-server", () => ({ getExtendedQuote: async () => null }));
vi.mock("@/lib/stock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stock")>()),
  getStockSummary: async (ticker: string) => ({ ticker, name: ticker, price: 180, captured_at: "2026-11-24T14:00:00Z" }),
  getInstrumentViewDoc: async () => null,
  getStockIntelPro: async () => null,
  getStockFacts: async () => null,
  getStockIntelligenceDoc: async () => ({
    headline: "Hold. The add zone is $165.20.",
    thesis: "The full reasoning.",
    directive_v2: { stance: "hold", action: { label: "Keep" }, zones: { accumulate_below: 165.2 } },
    generated_at: "2026-11-24T12:00:00Z",
  }),
}));

import {
  AGENT_DAILY_CALL_LIMIT,
  AGENT_FREE_DAILY_CALL_LIMIT,
  AGENT_MCP_SERVER_NAME,
  AGENT_MCP_SERVER_VERSION,
  AGENT_SCOPES,
  AGENT_USAGE_COLLECTION,
} from "@/lib/agent-access-config";
import type { AgentPrincipal } from "@/lib/agent-auth";
import { getAgentStressTest } from "@/lib/agent-feature-tools";
import { executeAgentTool, gateRadarForFree, withoutFullRead } from "@/lib/agent-intelligence";
import { AgentQuotaError, consumeAgentQuota } from "@/lib/agent-quota";
import { FREE_AGENT_TOOLS, agentDailyLimit, isFreeAgentTool, requireAgentPlan, stripLevelsDeep } from "@/lib/agent-tiers";
import { SCOPE_PRO_NOTE, TOOL_SCOPE } from "@/lib/docs/developers";

const UID = "tier-test-uid";

function principal(plan: AgentPrincipal["plan"]): AgentPrincipal {
  return { uid: UID, tokenId: "t", kind: "personal", scopes: [...AGENT_SCOPES], label: "test", clientId: null, plan };
}

beforeEach(() => {
  store.current!.docs.clear();
  vi.clearAllMocks();
});

describe("which tools each plan gets", () => {
  it("keeps Free to reads that run no model, plus the member's own watchlist", () => {
    for (const tool of FREE_AGENT_TOOLS) expect(TOOL_SCOPE[tool], tool).toBeDefined();
    for (const pro of ["get_stock_detail", "get_radar_changes", "create_alert", "delete_alert", "get_my_alerts", "what_you_own", "dividend_plan", "stress_test", "copy_test", "watch_in_plain_words", "list_baskets", "get_basket"]) {
      expect(isFreeAgentTool(pro), pro).toBe(false);
    }
    expect(agentDailyLimit("free")).toBe(AGENT_FREE_DAILY_CALL_LIMIT);
    expect(agentDailyLimit("pro")).toBe(AGENT_DAILY_CALL_LIMIT);
  });

  it("lets a free tool through on Free and refuses a Pro tool with pro_required and the upgrade link", () => {
    expect(() => requireAgentPlan("free", "get_market_brief")).not.toThrow();
    try {
      requireAgentPlan("free", "what_you_own");
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ name: "AgentPlanError", code: "pro_required", status: 403, upgradeUrl: expect.stringMatching(/\/pricing$/) });
      expect((error as Error).message).toContain("what_you_own is part of stocksbrew Pro");
    }
    for (const tool of Object.keys(TOOL_SCOPE)) expect(() => requireAgentPlan("pro", tool as never)).not.toThrow();
  });

  it("compares two stocks at a time on Free, as the Compare page does", () => {
    expect(() => requireAgentPlan("free", "compare_stocks", { tickers: ["MSFT", "msft ", "GOOGL"] })).not.toThrow();
    expect(() => requireAgentPlan("free", "compare_stocks", { tickers: ["MSFT", "GOOGL", "AMZN"] })).toThrow(/Free compares 2 stocks/);
    expect(() => requireAgentPlan("pro", "compare_stocks", { tickers: ["MSFT", "GOOGL", "AMZN"] })).not.toThrow();
  });
});

describe("the consent screen's Pro notes", () => {
  it("marks every scope that holds a Pro tool, as the whole scope only when no free tool uses it", () => {
    for (const scope of AGENT_SCOPES) {
      const tools = Object.entries(TOOL_SCOPE).filter(([, needed]) => needed === scope).map(([name]) => name);
      const pro = tools.filter((name) => !isFreeAgentTool(name));
      const note = SCOPE_PRO_NOTE[scope];
      if (pro.length === 0) expect(note, scope).toBeNull();
      else if (pro.length === tools.length) expect(note, scope).toBe("all");
      else expect(note && note !== "all", scope).toBe(true);
    }
  });
});

describe("the dispatcher", () => {
  it("refuses a Pro tool on Free before counting the call or reading anything", async () => {
    await expect(executeAgentTool(principal("free"), "stress_test", {})).rejects.toMatchObject({ code: "pro_required" });
    expect(getAgentStressTest).not.toHaveBeenCalled();
    expect(store.current!.docs.size).toBe(0);
    const out = await executeAgentTool(principal("pro"), "stress_test", {});
    expect(out).toMatchObject({ tool: "stress_test", usage: { used: 1, limit: AGENT_DAILY_CALL_LIMIT, plan: "pro" } });
  });

  it("still checks the scope first on either plan", async () => {
    await expect(executeAgentTool({ ...principal("free"), scopes: ["market:read"] }, "get_filing_changes", { ticker: "AMD" })).rejects.toMatchObject({ code: "insufficient_scope" });
  });
});

describe("the daily allowance", () => {
  const morning = new Date("2026-11-24T09:00:00Z");

  it("stops Free at its cap with daily_limit, Retry-After to midnight UTC and the upgrade link", async () => {
    store.current!.docs.set(`${AGENT_USAGE_COLLECTION}/${UID}_2026_11_24`, { calls: AGENT_FREE_DAILY_CALL_LIMIT - 1 });
    const last = await consumeAgentQuota(UID, "search_stocks", morning, "free");
    expect(last).toMatchObject({ used: AGENT_FREE_DAILY_CALL_LIMIT, remaining: 0, limit: AGENT_FREE_DAILY_CALL_LIMIT });
    const over = consumeAgentQuota(UID, "search_stocks", new Date("2026-11-24T09:05:00Z"), "free");
    await expect(over).rejects.toBeInstanceOf(AgentQuotaError);
    await expect(over).rejects.toMatchObject({ code: "daily_limit", retryAfterSeconds: 14 * 3600 + 55 * 60, upgradeUrl: expect.stringMatching(/\/pricing$/) });
  });

  it("keeps Pro going past the free cap, up to its own limit", async () => {
    store.current!.docs.set(`${AGENT_USAGE_COLLECTION}/${UID}_2026_11_24`, { calls: AGENT_FREE_DAILY_CALL_LIMIT });
    expect(await consumeAgentQuota(UID, "get_stock_detail", morning, "pro")).toMatchObject({ used: AGENT_FREE_DAILY_CALL_LIMIT + 1, limit: AGENT_DAILY_CALL_LIMIT });
    store.current!.docs.set(`${AGENT_USAGE_COLLECTION}/${UID}_2026_11_24`, { calls: AGENT_DAILY_CALL_LIMIT });
    await expect(consumeAgentQuota(UID, "get_stock_detail", new Date("2026-11-24T09:10:00Z"), "pro")).rejects.toMatchObject({ code: "daily_limit", upgradeUrl: null });
  });

  it("starts again at 00:00 UTC", async () => {
    store.current!.docs.set(`${AGENT_USAGE_COLLECTION}/${UID}_2026_11_24`, { calls: AGENT_FREE_DAILY_CALL_LIMIT });
    await expect(consumeAgentQuota(UID, "search_stocks", new Date("2026-11-24T23:59:59Z"), "free")).rejects.toMatchObject({ code: "daily_limit" });
    expect(await consumeAgentQuota(UID, "search_stocks", new Date("2026-11-25T00:00:00Z"), "free")).toMatchObject({ used: 1, limit: AGENT_FREE_DAILY_CALL_LIMIT });
  });
});

describe("what Free sees on a stock it does not cover", () => {
  const read = {
    instrument: { instrument_id: "US_NVDA", ticker: "NVDA" },
    market_data: { price: 180 },
    stocksbrew_intelligence: {
      headline: "Hold NVDA. The add zone is $165.20. Demand is strong.",
      thesis: "Data centre demand carries it.",
      setup_state: "steady",
      call: {
        stance: "hold",
        action: { label: "Keep", summary: "Keep it. Buy more below $165.20." },
        zones: { accumulate_below: 165.2, trim_above: 210 },
        stability: { since: "2026-11-02", what_would_change: "A miss on data centre revenue.", levels_set_on: "2026-11-02" },
      },
      target_price: 210,
      target_upside_pct: 16.7,
      drivers: [{ title: "AI capex" }],
      catalysts: [{ title: "Earnings" }],
      risks: [{ title: "Export rules" }],
      what_changed: "x",
      why_it_matters: "y",
      what_to_watch: "z",
      key_points: ["k"],
      evidence_count: 4,
      confidence: "fresh",
    },
    scores: { overall: 72 },
  } as unknown as Parameters<typeof withoutFullRead>[0];

  it("keeps the call, its headline without levels and the scores, and drops the reasoning and every level", () => {
    const out = withoutFullRead(read);
    const intel = out.stocksbrew_intelligence as Record<string, unknown>;
    expect(intel.headline).toBe("Hold NVDA. Demand is strong.");
    expect(intel.thesis).toBeNull();
    expect(intel.drivers).toEqual([]);
    expect(intel.risks).toEqual([]);
    expect(intel.key_points).toEqual([]);
    expect(intel.call).toEqual({
      stance: "hold",
      action: { label: "Keep", summary: "Keep it." },
      stability: { since: "2026-11-02", what_would_change: "A miss on data centre revenue." },
    });
    expect(JSON.stringify(out)).not.toContain("165.2");
    expect(out.scores).toEqual({ overall: 72 });
    expect(out.full_report).toMatchObject({ included: false });
  });

  it("strips level fields at any depth and leaves numbers that are not levels", () => {
    expect(stripLevelsDeep({ a: { add_on: { trigger_value: "150" }, price: 3 }, list: [{ zones: { trim_above: 1 } }] })).toEqual({ a: { price: 3 }, list: [{}] });
  });

  it("gates watchlist rows one by one: covered and showcase stocks in full, the rest without levels", () => {
    const levels = (id: string, ticker: string) => id === "US_MSFT" || ticker === "AAPL";
    const out = gateRadarForFree({
      rows: [
        { instrument_id: "US_MSFT", ticker: "MSFT", call: { zones: { accumulate_below: 400 } } },
        { instrument_id: "US_AAPL", ticker: "AAPL", call: { zones: { accumulate_below: 200 } } },
        { instrument_id: "US_NVDA", ticker: "NVDA", call: { zones: { accumulate_below: 165 } }, summary: "Near the $165.00 add zone." },
      ],
      brief: { narrative: "NVDA is near its add zone at $165.00. MSFT reports Tuesday." },
    }, levels);
    expect(out.rows).toEqual([
      { instrument_id: "US_MSFT", ticker: "MSFT", call: { zones: { accumulate_below: 400 } }, full_report: true },
      { instrument_id: "US_AAPL", ticker: "AAPL", call: { zones: { accumulate_below: 200 } }, full_report: true },
      { instrument_id: "US_NVDA", ticker: "NVDA", call: {}, summary: null, full_report: false },
    ]);
    expect(out.brief).toEqual({ narrative: "MSFT reports Tuesday." });
  });

  it("reads coverage from the member's own doc: a covered stock in full on Free, an uncovered one without levels", async () => {
    store.current!.docs.set(`users/${UID}`, { tracked_stocks: ["US_MSFT", "US_NVDA"], covered_stocks: ["US_MSFT"] });
    const covered = await executeAgentTool(principal("free"), "get_stock_intelligence", { ticker: "MSFT" });
    expect(covered).toMatchObject({ full_report: { included: true }, stocksbrew_intelligence: { thesis: "The full reasoning." } });
    expect(JSON.stringify(covered)).toContain("accumulate_below");
    const uncovered = await executeAgentTool(principal("free"), "get_stock_intelligence", { ticker: "NVDA" });
    expect(uncovered).toMatchObject({ full_report: { included: false }, stocksbrew_intelligence: { thesis: null, call: { stance: "hold" } } });
    expect(JSON.stringify(uncovered)).not.toContain("accumulate_below");
    // Pro sees every stock in full, with no full_report note at all.
    const pro = await executeAgentTool(principal("pro"), "get_stock_intelligence", { ticker: "NVDA" });
    expect(pro).not.toHaveProperty("full_report");
    expect(JSON.stringify(pro)).toContain("accumulate_below");
  });
});

describe("what the registry and the README say", () => {
  it("names the live server and the real free tier", () => {
    const server = JSON.parse(readFileSync(resolve(process.cwd(), "server.json"), "utf8"));
    expect(server.name).toBe(`online.stocksbrew/${AGENT_MCP_SERVER_NAME}`);
    expect(server.version).toBe(AGENT_MCP_SERVER_VERSION);
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.remotes).toEqual([{ type: "streamable-http", url: "https://www.stocksbrew.online/api/mcp" }]);
    const readme = readFileSync(resolve(process.cwd(), "README.md"), "utf8");
    expect(readme).toContain(`Free gets ${FREE_AGENT_TOOLS.length} tools`);
    expect(readme).toContain(`and ${AGENT_FREE_DAILY_CALL_LIMIT} calls a day; Pro gets every tool and ${AGENT_DAILY_CALL_LIMIT} calls a day`);
  });
});
