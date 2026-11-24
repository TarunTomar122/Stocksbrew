import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  AGENT_DAILY_CALL_LIMIT,
  AGENT_FREE_DAILY_CALL_LIMIT,
  AGENT_MCP_SERVER_NAME,
  AGENT_MCP_SERVER_VERSION,
} from "@/lib/agent-access-config";
import type { AgentPrincipal } from "@/lib/agent-auth";
import { AgentPlanError } from "@/lib/agent-errors";
import { AgentQuotaError } from "@/lib/agent-quota";
import { FREE_AGENT_COMPARE_LIMIT, FREE_AGENT_TOOLS, isFreeAgentTool, type AgentPlan } from "@/lib/agent-tiers";
import { AgentDataError, executeAgentTool, type AgentToolName } from "@/lib/agent-intelligence";

function toolResult(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

function toolError(error: unknown): CallToolResult {
  const authError = error instanceof Error && error.name === "AgentAuthError";
  const known = authError || error instanceof AgentDataError || error instanceof AgentQuotaError;
  // Only our own errors carry a message meant for people; anything else stays in the server log.
  const message = known && error instanceof Error ? error.message : "Stocksbrew could not complete this request.";
  const code = authError && "code" in error && typeof error.code === "string"
    ? error.code
    : error instanceof AgentDataError
      ? error.code
      : error instanceof AgentQuotaError
        ? error.code
        : "internal_error";
  if (!known) console.error("agent_mcp_tool_failed", error);
  // A plan limit says where going Pro lifts it, so the model can pass the link on.
  const upgradeUrl = error instanceof AgentPlanError
    ? error.upgradeUrl
    : error instanceof AgentQuotaError
      ? error.upgradeUrl
      : null;
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify(upgradeUrl ? { error: code, message, upgrade_url: upgradeUrl } : { error: code, message }) }],
  };
}

/** What a Free account's tool list says beyond the tool's own description (lib/agent-tiers.ts). */
const FREE_NOTES: Partial<Record<AgentToolName, string>> = {
  get_stock_intelligence: "On Free, the price zones and the reasoning come only on stocks the member covers; full_report says which.",
  get_my_radar: "On Free, rows the member does not cover come without price zones; full_report says which.",
};

function describeFor(plan: AgentPlan, name: AgentToolName, description: string): string {
  if (plan === "pro") return description;
  if (!isFreeAgentTool(name)) return `Pro only: this account is on Free, so it returns pro_required with an upgrade link. ${description}`;
  return FREE_NOTES[name] ? `${description} ${FREE_NOTES[name]}` : description;
}

function instructionsFor(plan: AgentPlan): string {
  const base = "Stocksbrew stock research, market data and the member's own watchlist. It cannot trade. Quote as_of, and say not enough current evidence when a field is empty.";
  if (plan === "pro") return `${base} This account is on Pro: every tool, ${AGENT_DAILY_CALL_LIMIT} calls a day.`;
  return `${base} This account is on Free: ${FREE_AGENT_TOOLS.length} tools and ${AGENT_FREE_DAILY_CALL_LIMIT} calls a day. A tool marked Pro only returns pro_required. Tell the member what it would have done and share the upgrade_url; do not retry it.`;
}

function toolHandler(
  principal: AgentPrincipal,
  name: AgentToolName,
) {
  return async (args: unknown): Promise<CallToolResult> => {
    try {
      return toolResult(await executeAgentTool(principal, name, (args ?? {}) as unknown as Record<string, unknown>));
    } catch (error) {
      return toolError(error);
    }
  };
}

export function createStocksbrewMcpServer(principal: AgentPrincipal): McpServer {
  const server = new McpServer({
    name: AGENT_MCP_SERVER_NAME,
    version: AGENT_MCP_SERVER_VERSION,
    title: "Stocksbrew for Agents",
    description: "Stock research for your own agent: the call on a stock, compare, filing risk changes, the market brief, Explore, screens and your watchlist on Free. Pro adds full stock detail, alerts, portfolio x-ray, dividends, stress and copy tests, idea baskets and plain-English watch requests.",
  }, { instructions: instructionsFor(principal.plan) });

  // Every tool is listed on both plans; on Free the Pro ones say so up front, and calling one costs nothing.
  const registerTool = server.registerTool.bind(server) as (name: string, config: unknown, handler: unknown) => unknown;
  const register = ((name: AgentToolName, config: { description: string }, handler: unknown) =>
    registerTool(name, { ...config, description: describeFor(principal.plan, name, config.description) }, handler)
  ) as unknown as typeof server.registerTool;

  const readOnly = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  } as const;
  const write = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  } as const;

  register("search_stocks", {
    title: "Search stocks",
    description: "Find stocksbrew instruments by ticker or company name. Use this before requesting intelligence when the ticker is ambiguous.",
    inputSchema: {
      query: z.string().min(1).max(100).describe("Ticker or company name"),
      market: z.enum(["US", "IN"]).default("US").describe("Listing market"),
      limit: z.number().int().min(1).max(20).default(10),
    },
    annotations: readOnly,
  }, toolHandler(principal, "search_stocks"));

  register("get_stock_intelligence", {
    title: "Get stock intelligence",
    description: "Get the current Stocksbrew call, zones, target context, drivers, risks, fundamentals, technical setup, freshness and research status for one stock. If a brief is missing, follow coverage.next_action and ask before adding the stock to Watchlist.",
    inputSchema: {
      ticker: z.string().min(1).max(20).describe("Ticker symbol or stocksbrew instrument ID"),
      market: z.enum(["US", "IN"]).default("US"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_stock_intelligence"));

  register("get_stock_detail", {
    title: "Get full stock detail",
    description: "Get the complete materialized stock-page data for one stock: facts, financial history, valuation, balance sheet, dividends, business mix, institutions, price history, technicals, the five business questions, earnings, recent news, Reddit context and anomalies. Missing fields remain null or empty; say not enough current evidence instead of inferring them.",
    inputSchema: {
      ticker: z.string().min(1).max(20).describe("Ticker symbol or stocksbrew instrument ID"),
      market: z.enum(["US", "IN"]).default("US"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_stock_detail"));

  register("compare_stocks", {
    title: "Compare stocks",
    description: `Compare stocks across valuation, growth, quality, momentum, targets, returns, and technical context: ${FREE_AGENT_COMPARE_LIMIT} at a time on Free, up to 5 on Pro.`,
    inputSchema: {
      tickers: z.array(z.string().min(1).max(20)).min(2).max(5).describe("Tickers to compare"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "compare_stocks"));

  register("get_market_brief", {
    title: "Get market brief",
    description: "Get Stocksbrew's current market read, sentiment, macro cards, sector flows, and leading movers with freshness metadata.",
    inputSchema: {
      market: z.enum(["US", "IN"]).default("US"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_market_brief"));

  register("get_market_history", {
    title: "Get Market Daily history",
    description: "Read archived US Market Daily editions. Publication is paused, so do not use this history as current market context. Use days to request up to 30 editions.",
    inputSchema: {
      market: z.enum(["US", "IN"]).default("US"),
      days: z.number().int().min(1).max(30).default(7).describe("Number of published editions to return"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_market_history"));

  register("get_explore", {
    title: "Get Explore data",
    description: "Get the current Explore page sections: trending names, hot and momentum setups, news spikes, catalyst and dip setups, 52-week highs and lows, Reddit buzz and recent Trump mentions.",
    inputSchema: {
      market: z.enum(["US", "IN"]).default("US"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_explore"));

  register("get_screens", {
    title: "Get stock screens",
    description: "Get Stocksbrew's curated thematic screen catalog, coverage metadata and every current match with the fields used by the Screens page.",
    inputSchema: {
      market: z.enum(["US", "IN"]).default("US"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_screens"));

  register("get_my_radar", {
    title: "Get my Watchlist",
    description: "Get the authorized member's tracked stocks, current calls, target room, portfolio context and Watchlist summary.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_my_radar"));

  register("get_radar_changes", {
    title: "Get Watchlist changes",
    description: "Get new changes and upcoming events across the authorized member's Watchlist.",
    inputSchema: {
      since: z.string().datetime().optional().describe("Only return attention items after this ISO timestamp. Use the returned cursor on the next poll."),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_radar_changes"));

  register("add_to_radar", {
    title: "Add stock to Watchlist",
    description: "Add a stock to the member's Watchlist and queue missing research. This changes the member's account. Ask for confirmation before calling it.",
    inputSchema: {
      ticker: z.string().min(1).max(20),
      market: z.enum(["US", "IN"]).default("US"),
      position_type: z.enum(["watchlist", "holding"]).default("watchlist"),
    },
    annotations: write,
  }, toolHandler(principal, "add_to_radar"));

  register("remove_from_radar", {
    title: "Remove stock from Watchlist",
    description: "Remove a stock and its holding context from the member's Watchlist. Ask for confirmation before calling it.",
    inputSchema: {
      ticker: z.string().min(1).max(20),
      market: z.enum(["US", "IN"]).default("US"),
    },
    annotations: { ...write, destructiveHint: true, idempotentHint: true },
  }, toolHandler(principal, "remove_from_radar"));

  register("get_my_alerts", {
    title: "Get my alerts",
    description: "List active Stocksbrew alerts, optionally filtered to one stock or alert kind.",
    inputSchema: {
      ticker: z.string().min(1).max(20).optional(),
      market: z.enum(["US", "IN"]).default("US"),
      kind: z.enum(["price_threshold", "anomaly", "rsi_extreme", "earnings_24h", "directive_change", "news_velocity"]).optional(),
      limit: z.number().int().min(1).max(100).default(50),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_my_alerts"));

  register("create_alert", {
    title: "Create stock alert",
    description: "Create a price threshold email alert. Ask for confirmation before calling it. Use get_radar_changes for earnings, RSI, call, anomaly, and news updates.",
    inputSchema: {
      ticker: z.string().min(1).max(20),
      market: z.enum(["US", "IN"]).default("US"),
      kind: z.literal("price_threshold").default("price_threshold"),
      condition: z.enum(["below", "above"]).optional(),
      target_price: z.number().positive().optional(),
      note: z.string().max(240).optional(),
    },
    annotations: write,
  }, toolHandler(principal, "create_alert"));

  register("delete_alert", {
    title: "Delete stock alert",
    description: "Deactivate one alert owned by the member. Ask for confirmation before calling it.",
    inputSchema: { alert_id: z.string().min(1).max(200) },
    annotations: { ...write, destructiveHint: true, idempotentHint: true },
  }, toolHandler(principal, "delete_alert"));

  register("what_you_own", {
    title: "What you really own",
    description: "Open up the member's funds and add what is inside them to the stocks they bought: their real stake in each company (direct vs through funds), sectors against the S&P 500, how much their funds overlap, and the read the page shows. Fund holdings come from each fund's SEC N-PORT filing. Read data_status first: no_holdings, no_values and no_funds mean there is little or nothing to show.",
    inputSchema: {
      limit: z.number().int().min(1).max(50).default(15).describe("How many companies to return, biggest first"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "what_you_own"));

  register("dividend_plan", {
    title: "Dividend plan",
    description: "What the member's holdings should pay over the next twelve months, month by month and per stock, with announced dividends kept apart from estimates based on each stock's last year of payments. Holdings without a share count are listed in missing_shares and add nothing to the totals.",
    inputSchema: {
      payments: z.boolean().default(false).describe("Include every planned payment for each stock, not only the next one"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "dividend_plan"));

  register("stress_test", {
    title: "Stress test",
    description: "How the member's holdings, at today's weights, did in eight real market shocks and rallies of the last decade, each next to the S&P 500, from their own daily closes. It is history, not a forecast. Each episode names the holding that did the most; ask for holdings to get every holding's move.",
    inputSchema: {
      holdings: z.boolean().default(false).describe("Include every holding's move in each episode"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "stress_test"));

  register("copy_test", {
    title: "Copy test",
    description: "What copying a 13F fund's filings or a House member's reported trades would have made against the S&P 500, traded the first close after each disclosure became public. With slug or query: one record (a query that matches several returns their slugs to pick from). With neither: the ranking of every fund and member. A historical test on paper, before costs and taxes; the future can differ.",
    inputSchema: {
      slug: z.string().min(1).max(100).optional().describe("A record's slug, such as berkshire-hathaway"),
      query: z.string().min(1).max(100).optional().describe("Fund, manager or House member name to search"),
      kind: z.enum(["fund", "congress"]).optional().describe("Only funds or only House members"),
      limit: z.number().int().min(1).max(50).default(10).describe("Ranked rows to return per kind, when listing"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "copy_test"));

  register("watch_in_plain_words", {
    title: "Read a watch request",
    description: "Read a plain-English request such as \"tell me if NVDA closes below 150 or a fund sells it\" into the stocksbrew agents it would make, with the sentences the Agents page shows and anything it cannot watch. This only reads the request; nothing is saved. To switch the agents on, the member types the request on the Agents page.",
    inputSchema: {
      text: z.string().min(1).max(300).describe("What to watch, in the member's own words"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "watch_in_plain_words"));

  register("get_filing_changes", {
    title: "What changed in a company's risks",
    description: "What one US company added to, dropped from or reworded in the risk factors of its newest 10-K or 10-Q, against the filing before it, with both filings' dates and SEC links. Every risk is the company's own heading, copied from the filing. Read data_status first: no_comparison and unreadable mean there is nothing to report, so say that and do not guess.",
    inputSchema: {
      ticker: z.string().min(1).max(20).describe("US ticker symbol, such as AMD"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_filing_changes"));

  register("list_baskets", {
    title: "List my idea baskets",
    description: "The member's idea baskets: ideas an agent checks after every close. For each, its companies with the latest check's verdict on each reason (holds, weaker, broken, played out, not checked) and the fact behind it, and what that check decided. Read only: baskets are created, switched on and changed in the app.",
    inputSchema: {},
    annotations: readOnly,
  }, toolHandler(principal, "list_baskets"));

  register("get_basket", {
    title: "Get one idea basket",
    description: "One of the member's idea baskets in full: every company's reason and verdict, what the latest check decided and the changes it proposes, the checks before it, and the four-week replay it ran before it started. Use an id from list_baskets. Read only.",
    inputSchema: {
      basket_id: z.string().min(1).max(24).describe("A basket id from list_baskets"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_basket"));

  return server;
}
