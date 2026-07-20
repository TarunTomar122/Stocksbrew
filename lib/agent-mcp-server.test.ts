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
      usage: { used: 1, remaining: 499, limit: 500 },
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
  scopes: ["stocks:read", "market:read", "radar:read"] as const,
  label: "Test client",
  clientId: null,
};

describe("Stocksbrew MCP server", () => {
  it("negotiates MCP and advertises the complete read-only tool surface", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createStocksbrewMcpServer({ ...principal, scopes: [...principal.scopes] });
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.listTools();
    expect(result.tools.map((tool) => tool.name)).toEqual([
      "search_stocks",
      "get_stock_intelligence",
      "compare_stocks",
      "get_market_brief",
      "get_my_radar",
      "get_radar_changes",
    ]);
    for (const tool of result.tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }

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
});
