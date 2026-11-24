import { AGENT_SCOPES, publicAppUrl } from "@/lib/agent-access-config";
import { AgentAuthError, requireAgentPrincipal } from "@/lib/agent-auth";
import { AgentDataError, executeAgentTool, type AgentToolName } from "@/lib/agent-intelligence";
import { AgentPlanError } from "@/lib/agent-errors";
import { AgentQuotaError } from "@/lib/agent-quota";

function noStore(body: Record<string, unknown>, status: number, extraHeaders?: Record<string, string>): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...extraHeaders },
  });
}

function authError(error: AgentAuthError): Response {
  const metadata = `${publicAppUrl()}/.well-known/oauth-protected-resource`;
  const scope = AGENT_SCOPES.join(" ");
  return noStore(
    { error: error.code, message: error.message },
    error.status,
    { "WWW-Authenticate": `Bearer resource_metadata="${metadata}", scope="${scope}"` },
  );
}

export async function runAgentApiRequest(
  request: Request,
  tool: AgentToolName,
  args: Record<string, unknown>,
): Promise<Response> {
  let principal;
  try {
    principal = await requireAgentPrincipal(request);
  } catch (error) {
    if (!(error instanceof AgentAuthError)) {
      // The token or the account could not be read (a store blip): 503 and retry, as /api/mcp answers. Never a 500
      // that reads as our bug, and never a 401 that sends the client to make a new token.
      console.error("agent_api_auth_failed", { tool, error });
      return noStore(
        { error: "temporarily_unavailable", message: "Authentication could not be completed. Retry in a moment." },
        503,
        { "Retry-After": "30" },
      );
    }
    return authError(error);
  }
  try {
    const result = await executeAgentTool(principal, tool, args);
    return noStore(result, 200);
  } catch (error) {
    if (error instanceof AgentAuthError) return authError(error);
    if (error instanceof AgentQuotaError) {
      return noStore(
        { error: error.code, message: error.message, ...(error.upgradeUrl ? { upgrade_url: error.upgradeUrl } : {}) },
        429,
        { "Retry-After": String(error.retryAfterSeconds) },
      );
    }
    if (error instanceof AgentPlanError) {
      return noStore({ error: error.code, message: error.message, upgrade_url: error.upgradeUrl }, error.status);
    }
    if (error instanceof AgentDataError) {
      return noStore({ error: error.code, message: error.message }, error.status);
    }
    console.error("agent_api_request_failed", { tool, error });
    return noStore({ error: "internal_error", message: "Stocksbrew could not complete this request." }, 500);
  }
}
