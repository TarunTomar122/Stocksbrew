import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { AGENT_SCOPES } from "@/lib/agent-access-config";
import type { AgentToolName } from "@/lib/agent-intelligence";
import { createStocksbrewMcpServer } from "@/lib/agent-mcp-server";
import { TOOL_REST, TOOL_SCOPE } from "@/lib/docs/developers";

/**
 * The tool reference, read from the MCP server itself. We start the real
 * server in memory, connect a client to it and ask for its tool list, which
 * is exactly what an agent sees. Names, descriptions, arguments and limits on
 * the page therefore cannot drift from the code. No tool is called and no
 * data is read. Server only: it imports the agent stack.
 */

export type ToolParam = {
  name: string;
  type: string;
  required: boolean;
  description: string | null;
  /** "default 10", "1 to 20", "US or IN": the constraints in one line. */
  constraints: string | null;
};

export type ToolReference = {
  name: AgentToolName;
  title: string;
  description: string;
  params: ToolParam[];
  readOnly: boolean;
  destructive: boolean;
};

type JsonSchema = {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  format?: string;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

function typeLabel(schema: JsonSchema): string {
  if (schema.const !== undefined) return "string";
  const type = Array.isArray(schema.type) ? schema.type.join(" or ") : schema.type ?? "any";
  if (type === "array") return `${schema.items ? typeLabel(schema.items) : "any"}[]`;
  if (type === "integer") return "integer";
  return type;
}

function constraintLabel(schema: JsonSchema): string | null {
  const parts: string[] = [];
  if (schema.const !== undefined) parts.push(`always ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum)) parts.push(schema.enum.map(String).join(" | "));
  if (schema.minimum != null && schema.maximum != null) parts.push(`${schema.minimum} to ${schema.maximum}`);
  else if (schema.minimum != null) parts.push(`${schema.minimum} or more`);
  else if (schema.maximum != null) parts.push(`${schema.maximum} or less`);
  if (schema.exclusiveMinimum != null) parts.push(`above ${schema.exclusiveMinimum}`);
  if (schema.minItems != null && schema.maxItems != null) parts.push(`${schema.minItems} to ${schema.maxItems} items`);
  if (schema.maxLength != null && schema.type === "string" && !schema.enum) parts.push(`up to ${schema.maxLength} characters`);
  if (schema.format === "date-time") parts.push("ISO 8601 time");
  if (schema.default !== undefined && schema.const === undefined) parts.push(`default ${JSON.stringify(schema.default)}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

function paramsOf(schema: JsonSchema | undefined): ToolParam[] {
  const required = new Set(schema?.required ?? []);
  return Object.entries(schema?.properties ?? {}).map(([name, property]) => ({
    name,
    type: typeLabel(property),
    // A field with a default is filled in by the server, so a caller may leave it out.
    required: required.has(name) && property.default === undefined,
    description: property.description ?? null,
    constraints: constraintLabel(property),
  }));
}

export async function loadToolReference(): Promise<ToolReference[]> {
  const server = createStocksbrewMcpServer({
    uid: "docs",
    tokenId: "docs",
    kind: "personal",
    scopes: [...AGENT_SCOPES],
    label: "docs",
    clientId: null,
  });
  const client = new Client({ name: "stocksbrew-docs", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    return tools
      .filter((tool): tool is typeof tool & { name: AgentToolName } => tool.name in TOOL_SCOPE && tool.name in TOOL_REST)
      .map((tool) => ({
        name: tool.name,
        title: tool.title ?? tool.annotations?.title ?? tool.name,
        description: tool.description ?? "",
        params: paramsOf(tool.inputSchema as JsonSchema),
        readOnly: tool.annotations?.readOnlyHint === true,
        destructive: tool.annotations?.destructiveHint === true,
      }));
  } finally {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}
