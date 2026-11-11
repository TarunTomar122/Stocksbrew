import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  AGENT_MCP_SERVER_NAME,
  AGENT_MCP_SERVER_VERSION,
} from "@/lib/agent-access-config";
import type { AgentPrincipal } from "@/lib/agent-auth";
import { AgentQuotaError } from "@/lib/agent-quota";
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
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify({ error: code, message }) }],
  };
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
    description: "Full stock detail, Explore, curated screens, Watchlist tracking, alert tools, portfolio x-ray, dividends, stress tests, copy tests and plain-English agent reading for Stocksbrew Pro members.",
  });

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

  server.registerTool("search_stocks", {
    title: "Search stocks",
    description: "Find stocksbrew instruments by ticker or company name. Use this before requesting intelligence when the ticker is ambiguous.",
    inputSchema: {
      query: z.string().min(1).max(100).describe("Ticker or company name"),
      market: z.enum(["US", "IN"]).default("US").describe("Listing market"),
      limit: z.number().int().min(1).max(20).default(10),
    },
    annotations: readOnly,
  }, toolHandler(principal, "search_stocks"));

  server.registerTool("get_stock_intelligence", {
    title: "Get stock intelligence",
    description: "Get the current Stocksbrew call, zones, target context, drivers, risks, fundamentals, technical setup, freshness and research status for one stock. If a brief is missing, follow coverage.next_action and ask before adding the stock to Watchlist.",
    inputSchema: {
      ticker: z.string().min(1).max(20).describe("Ticker symbol or stocksbrew instrument ID"),
      market: z.enum(["US", "IN"]).default("US"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_stock_intelligence"));

  server.registerTool("get_stock_detail", {
    title: "Get full stock detail",
    description: "Get the complete materialized stock-page data for one stock: facts, financial history, valuation, balance sheet, dividends, business mix, institutions, price history, technicals, the five business questions, earnings, recent news, Reddit context and anomalies. Missing fields remain null or empty; say not enough current evidence instead of inferring them.",
    inputSchema: {
      ticker: z.string().min(1).max(20).describe("Ticker symbol or stocksbrew instrument ID"),
      market: z.enum(["US", "IN"]).default("US"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_stock_detail"));

  server.registerTool("compare_stocks", {
    title: "Compare stocks",
    description: "Compare 2 to 5 stocks across valuation, growth, quality, momentum, targets, returns, and technical context.",
    inputSchema: {
      tickers: z.array(z.string().min(1).max(20)).min(2).max(5),
    },
    annotations: readOnly,
  }, toolHandler(principal, "compare_stocks"));

  server.registerTool("get_market_brief", {
    title: "Get market brief",
    description: "Get Stocksbrew's current market read, sentiment, macro cards, sector flows, and leading movers with freshness metadata.",
    inputSchema: {
      market: z.enum(["US", "IN"]).default("US"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_market_brief"));

  server.registerTool("get_market_history", {
    title: "Get Market Daily history",
    description: "Read archived US Market Daily editions. Publication is paused, so do not use this history as current market context. Use days to request up to 30 editions.",
    inputSchema: {
      market: z.enum(["US", "IN"]).default("US"),
      days: z.number().int().min(1).max(30).default(7).describe("Number of published editions to return"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_market_history"));

  server.registerTool("get_explore", {
    title: "Get Explore data",
    description: "Get the current Explore page sections: trending names, hot and momentum setups, news spikes, catalyst and dip setups, 52-week highs and lows, Reddit buzz and recent Trump mentions.",
    inputSchema: {
      market: z.enum(["US", "IN"]).default("US"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_explore"));

  server.registerTool("get_screens", {
    title: "Get stock screens",
    description: "Get Stocksbrew's curated thematic screen catalog, coverage metadata and every current match with the fields used by the Screens page.",
    inputSchema: {
      market: z.enum(["US", "IN"]).default("US"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_screens"));

  server.registerTool("get_my_radar", {
    title: "Get my Watchlist",
    description: "Get the authorized Pro member's tracked stocks, current calls, target room, portfolio context and Watchlist summary.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_my_radar"));

  server.registerTool("get_radar_changes", {
    title: "Get Watchlist changes",
    description: "Get new changes and upcoming events across the authorized member's Watchlist.",
    inputSchema: {
      since: z.string().datetime().optional().describe("Only return attention items after this ISO timestamp. Use the returned cursor on the next poll."),
    },
    annotations: readOnly,
  }, toolHandler(principal, "get_radar_changes"));

  server.registerTool("add_to_radar", {
    title: "Add stock to Watchlist",
    description: "Add a stock to the member's Watchlist and queue missing research. This changes the member's account. Ask for confirmation before calling it.",
    inputSchema: {
      ticker: z.string().min(1).max(20),
      market: z.enum(["US", "IN"]).default("US"),
      position_type: z.enum(["watchlist", "holding"]).default("watchlist"),
    },
    annotations: write,
  }, toolHandler(principal, "add_to_radar"));

  server.registerTool("remove_from_radar", {
    title: "Remove stock from Watchlist",
    description: "Remove a stock and its holding context from the member's Watchlist. Ask for confirmation before calling it.",
    inputSchema: {
      ticker: z.string().min(1).max(20),
      market: z.enum(["US", "IN"]).default("US"),
    },
    annotations: { ...write, destructiveHint: true, idempotentHint: true },
  }, toolHandler(principal, "remove_from_radar"));

  server.registerTool("get_my_alerts", {
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

  server.registerTool("create_alert", {
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

  server.registerTool("delete_alert", {
    title: "Delete stock alert",
    description: "Deactivate one alert owned by the member. Ask for confirmation before calling it.",
    inputSchema: { alert_id: z.string().min(1).max(200) },
    annotations: { ...write, destructiveHint: true, idempotentHint: true },
  }, toolHandler(principal, "delete_alert"));

  server.registerTool("what_you_own", {
    title: "What you really own",
    description: "Open up the member's funds and add what is inside them to the stocks they bought: their real stake in each company (direct vs through funds), sectors against the S&P 500, how much their funds overlap, and the read the page shows. Fund holdings come from each fund's SEC N-PORT filing. Read data_status first: no_holdings, no_values and no_funds mean there is little or nothing to show.",
    inputSchema: {
      limit: z.number().int().min(1).max(50).default(15).describe("How many companies to return, biggest first"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "what_you_own"));

  server.registerTool("dividend_plan", {
    title: "Dividend plan",
    description: "What the member's holdings should pay over the next twelve months, month by month and per stock, with announced dividends kept apart from estimates based on each stock's last year of payments. Holdings without a share count are listed in missing_shares and add nothing to the totals.",
    inputSchema: {
      payments: z.boolean().default(false).describe("Include every planned payment for each stock, not only the next one"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "dividend_plan"));

  server.registerTool("stress_test", {
    title: "Stress test",
    description: "How the member's holdings, at today's weights, did in eight real market shocks and rallies of the last decade, each next to the S&P 500, from their own daily closes. It is history, not a forecast. Each episode names the holding that did the most; ask for holdings to get every holding's move.",
    inputSchema: {
      holdings: z.boolean().default(false).describe("Include every holding's move in each episode"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "stress_test"));

  server.registerTool("copy_test", {
    title: "Copy test",
    description: "What copying a 13F fund's filings or a House member's reported trades would have made against the S&P 500, traded the first close after each disclosure became public. With slug or query: one record (a query that matches several returns their slugs to pick from). With neither: the ranking of every fund and member. Pretend money, before costs and taxes.",
    inputSchema: {
      slug: z.string().min(1).max(100).optional().describe("A record's slug, such as berkshire-hathaway"),
      query: z.string().min(1).max(100).optional().describe("Fund, manager or House member name to search"),
      kind: z.enum(["fund", "congress"]).optional().describe("Only funds or only House members"),
      limit: z.number().int().min(1).max(50).default(10).describe("Ranked rows to return per kind, when listing"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "copy_test"));

  server.registerTool("watch_in_plain_words", {
    title: "Read a watch request",
    description: "Read a plain-English request such as \"tell me if NVDA closes below 150 or a fund sells it\" into the stocksbrew agents it would make, with the sentences the Agents page shows and anything it cannot watch. This only reads the request; nothing is saved. To switch the agents on, the member types the request on the Agents page.",
    inputSchema: {
      text: z.string().min(1).max(300).describe("What to watch, in the member's own words"),
    },
    annotations: readOnly,
  }, toolHandler(principal, "watch_in_plain_words"));

  return server;
}
