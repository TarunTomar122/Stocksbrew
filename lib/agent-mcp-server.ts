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
    description: "Read-only stock, market, and personal Radar intelligence for stocksbrew Pro members.",
  });

  const readOnly = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
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
    description: "Get the current Stocksbrew call, zones, target context, drivers, risks, fundamentals, technical setup, and freshness for one stock.",
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
    title: "Get my Radar",
    description: "Get the authorized Pro member's tracked stocks, current calls, target room, portfolio context, and Radar summary.",
    inputSchema: {},
    annotations: readOnly,
  }, toolHandler(principal, "get_my_radar"));

  server.registerTool("get_radar_changes", {
    title: "Get Radar changes",
    description: "Get fresh, quality-passed changes and upcoming events across the authorized member's Radar.",
    inputSchema: {},
    annotations: readOnly,
  }, toolHandler(principal, "get_radar_changes"));

  return server;
}
