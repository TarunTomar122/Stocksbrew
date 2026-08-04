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
  const message = error instanceof Error ? error.message : "Stocksbrew could not complete this request.";
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
    description: "Stock research, Watchlist tracking and alert tools for Stocksbrew Pro members.",
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

  return server;
}
