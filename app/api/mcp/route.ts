import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { AGENT_SCOPES, publicAppUrl } from "@/lib/agent-access-config";
import { AgentAuthError, requireAgentPrincipal } from "@/lib/agent-auth";
import { createStocksbrewMcpServer } from "@/lib/agent-mcp-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A plain-words parse (watch_in_plain_words) can take a model read of up to about 12s.
export const maxDuration = 30;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version, MCP-Session-Id, WWW-Authenticate, Retry-After",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function authErrorResponse(error: AgentAuthError): Response {
  const metadata = `${publicAppUrl()}/.well-known/oauth-protected-resource`;
  const requiredScope = AGENT_SCOPES.join(" ");
  const challenge = error.code === "insufficient_scope"
    ? `Bearer error="insufficient_scope", scope="${requiredScope}", resource_metadata="${metadata}"`
    : `Bearer resource_metadata="${metadata}", scope="${requiredScope}"`;
  return withCors(Response.json(
    { error: error.code, error_description: error.message },
    { status: error.status, headers: { "WWW-Authenticate": challenge } },
  ));
}

async function handle(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 1_048_576) {
    return withCors(Response.json({ error: "request_too_large" }, { status: 413 }));
  }
  let principal;
  try {
    principal = await requireAgentPrincipal(request);
  } catch (error) {
    if (error instanceof AgentAuthError) return authErrorResponse(error);
    console.error("agent_mcp_auth_failed", error);
    return authErrorResponse(new AgentAuthError("Authentication could not be completed."));
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createStocksbrewMcpServer(principal);
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  return withCors(response);
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}
