import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent-intelligence", () => {
  class AgentDataError extends Error {}
  return { AgentDataError, executeAgentTool: vi.fn() };
});
vi.mock("@/lib/agent-quota", () => ({ AgentQuotaError: class AgentQuotaError extends Error {} }));

import { AGENT_SCOPES } from "@/lib/agent-access-config";
import { loadToolReference } from "@/lib/docs/developer-tools";
import { API_ERRORS, SCOPE_INFO, TOOL_GROUPS, TOOL_REST, TOOL_SCOPE } from "@/lib/docs/developers";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("developer docs", () => {
  it("documents every tool the MCP server advertises, and no others", async () => {
    const tools = await loadToolReference();
    const live = tools.map((tool) => tool.name).sort();
    expect(live).toEqual(Object.keys(TOOL_SCOPE).sort());
    expect(live).toEqual(Object.keys(TOOL_REST).sort());
    expect(TOOL_GROUPS.flatMap((group) => group.tools).sort()).toEqual(live);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(20);
      // A tool that changes the account must not be advertised as read-only.
      expect(tool.readOnly).toBe(!SCOPE_INFO[TOOL_SCOPE[tool.name]].writes);
    }
    const search = tools.find((tool) => tool.name === "search_stocks");
    expect(search?.params.map((param) => param.name)).toEqual(["query", "market", "limit"]);
    expect(search?.params.find((param) => param.name === "query")?.required).toBe(true);
    expect(search?.params.find((param) => param.name === "limit")?.constraints).toContain("1 to 20");
  });

  it("states the scope the dispatcher really checks for each tool", () => {
    const code = source("lib/agent-intelligence.ts");
    const start = code.indexOf("function requiredScopeForTool");
    const body = code.slice(start, code.indexOf("\n}", start));
    const fromCode: Record<string, string> = {};
    for (const match of body.matchAll(/if \(([^)]+)\) return "([a-z]+:[a-z]+)";/g)) {
      for (const tool of match[1].matchAll(/tool === "([a-z_]+)"/g)) fromCode[tool[1]] = match[2];
    }
    const fallback = /return "([a-z]+:[a-z]+)";\s*$/.exec(body.trim())?.[1];
    expect(fallback).toBe("stocks:read");
    for (const [tool, scope] of Object.entries(TOOL_SCOPE)) {
      expect(fromCode[tool] ?? fallback, tool).toBe(scope);
    }
    expect(Object.keys(SCOPE_INFO).sort()).toEqual([...AGENT_SCOPES].sort());
  });

  it("points every tool at a REST route that exists", () => {
    for (const [tool, route] of Object.entries(TOOL_REST)) {
      const file = `app/api/v1${route.path.replace("{symbol}", "[symbol]")}/route.ts`;
      const code = source(file);
      expect(code, `${tool} in ${file}`).toContain(`"${tool}"`);
      expect(code, `${tool} ${route.method}`).toContain(`export async function ${route.method}(`);
    }
  });

  it("lists the auth and quota error codes the code throws", () => {
    const codes = new Set(API_ERRORS.map((error) => error.code));
    const auth = source("lib/agent-auth.ts");
    const quota = source("lib/agent-quota.ts");
    for (const code of ["pro_required", "insufficient_scope"]) {
      expect(auth).toContain(`"${code}"`);
      expect(codes.has(code)).toBe(true);
    }
    for (const code of ["minute_limit", "daily_limit"]) {
      expect(quota).toContain(`"${code}"`);
      expect(codes.has(code)).toBe(true);
    }
    expect(codes.has("invalid_token")).toBe(true);
  });
});
