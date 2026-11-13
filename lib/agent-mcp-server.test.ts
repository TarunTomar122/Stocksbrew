import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { vi } from "vitest";

vi.mock("@/lib/agent-intelligence", () => {
  class AgentDataError extends Error {}
  return {
    AgentDataError,
    executeAgentTool: vi.fn(async (_principal, tool, args) => ({
      schema_version: "test",
      tool,
      args,
      usage: { used: 1, remaining: 199, limit: 200, period: "day" },
    })),
  };
});

vi.mock("@/lib/agent-quota", () => ({
  AgentQuotaError: class AgentQuotaError extends Error {},
}));

import { createStocksbrewMcpServer } from "@/lib/agent-mcp-server";

const principal = {
  uid: "user-1",
  tokenId: "token-1",
  kind: "personal" as const,
  scopes: ["stocks:read", "market:read", "radar:read", "radar:write", "alerts:read", "alerts:write"] as const,
  label: "Test client",
  clientId: null,
};

describe("Stocksbrew MCP server", () => {
  it("negotiates MCP and advertises the complete research workflow", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createStocksbrewMcpServer({ ...principal, scopes: [...principal.scopes] });
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.listTools();
    expect(result.tools.map((tool) => tool.name)).toEqual([
      "search_stocks",
      "get_stock_intelligence",
      "get_stock_detail",
      "compare_stocks",
      "get_market_brief",
      "get_market_history",
      "get_explore",
      "get_screens",
      "get_my_radar",
      "get_radar_changes",
      "add_to_radar",
      "remove_from_radar",
      "get_my_alerts",
      "create_alert",
      "delete_alert",
      "what_you_own",
      "dividend_plan",
      "stress_test",
      "copy_test",
      "watch_in_plain_words",
      "get_filing_changes",
      "list_baskets",
      "get_basket",
    ]);
    for (const name of [
      "search_stocks",
      "get_stock_intelligence",
      "get_stock_detail",
      "compare_stocks",
      "get_market_brief",
      "get_market_history",
      "get_explore",
      "get_screens",
      "get_my_radar",
      "get_radar_changes",
      "get_my_alerts",
      "what_you_own",
      "dividend_plan",
      "stress_test",
      "copy_test",
      "watch_in_plain_words",
      "get_filing_changes",
      "list_baskets",
      "get_basket",
    ]) {
      const tool = result.tools.find((item) => item.name === name);
      expect(tool).toBeDefined();
      expect(tool?.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
    expect(result.tools.find((tool) => tool.name === "add_to_radar")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
    expect(result.tools.find((tool) => tool.name === "remove_from_radar")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
    expect(result.tools.find((tool) => tool.name === "create_alert")?.inputSchema).toMatchObject({
      properties: { kind: { default: "price_threshold" } },
    });
    expect(JSON.stringify(result.tools.find((tool) => tool.name === "create_alert")?.inputSchema)).not.toContain("rsi_extreme");

    await client.close();
    await server.close();
  });

  it("returns structured tool output through the protocol", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createStocksbrewMcpServer({ ...principal, scopes: [...principal.scopes] });
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({ name: "get_market_brief", arguments: { market: "US" } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      schema_version: "test",
      tool: "get_market_brief",
      args: { market: "US" },
    });

    await client.close();
    await server.close();
  });

  it("passes the new tools' arguments through, with defaults filled in", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createStocksbrewMcpServer({ ...principal, scopes: [...principal.scopes] });
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const stress = await client.callTool({ name: "stress_test", arguments: {} });
    expect(stress.structuredContent).toMatchObject({ tool: "stress_test", args: { holdings: false } });
    const copy = await client.callTool({ name: "copy_test", arguments: { query: "berkshire" } });
    expect(copy.structuredContent).toMatchObject({ tool: "copy_test", args: { query: "berkshire", limit: 10 } });
    const watch = await client.callTool({ name: "watch_in_plain_words", arguments: { text: "x".repeat(301) } });
    expect(watch.isError).toBe(true);
    const filings = await client.callTool({ name: "get_filing_changes", arguments: { ticker: "AMD" } });
    expect(filings.structuredContent).toMatchObject({ tool: "get_filing_changes", args: { ticker: "AMD" } });
    const one = await client.callTool({ name: "get_basket", arguments: { basket_id: "d237b01a117f" } });
    expect(one.structuredContent).toMatchObject({ tool: "get_basket", args: { basket_id: "d237b01a117f" } });
    // No uid or other account can be named: the schema has no such field, and the dispatcher uses the token's own.
    const list = await client.callTool({ name: "list_baskets", arguments: {} });
    expect(list.structuredContent).toMatchObject({ tool: "list_baskets", args: {} });
    expect((await client.callTool({ name: "get_basket", arguments: { basket_id: "" } })).isError).toBe(true);

    await client.close();
    await server.close();
  });
});
