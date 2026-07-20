import { AGENT_SCOPES, publicAppUrl } from "@/lib/agent-access-config";
import { AgentAuthError, requireAgentPrincipal } from "@/lib/agent-auth";
import { AgentDataError, executeAgentTool, type AgentToolName } from "@/lib/agent-intelligence";
import { AgentQuotaError } from "@/lib/agent-quota";

function noStore(body: Record<string, unknown>, status: number, extraHeaders?: Record<string, string>): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...extraHeaders },
  });
}

export async function runAgentApiRequest(
  request: Request,
  tool: AgentToolName,
  args: Record<string, unknown>,
): Promise<Response> {
  try {
    const principal = await requireAgentPrincipal(request);
    const result = await executeAgentTool(principal, tool, args);
    return noStore(result, 200);
  } catch (error) {
    if (error instanceof AgentAuthError) {
      const metadata = `${publicAppUrl()}/.well-known/oauth-protected-resource`;
      const scope = AGENT_SCOPES.join(" ");
      return noStore(
        { error: error.code, message: error.message },
        error.status,
        { "WWW-Authenticate": `Bearer resource_metadata="${metadata}", scope="${scope}"` },
      );
    }
    if (error instanceof AgentQuotaError) {
      return noStore(
        { error: error.code, message: error.message },
        429,
        { "Retry-After": String(error.retryAfterSeconds) },
      );
    }
    if (error instanceof AgentDataError) {
      return noStore({ error: error.code, message: error.message }, error.status);
    }
    console.error("agent_api_request_failed", { tool, error });
    return noStore({ error: "internal_error", message: "Stocksbrew could not complete this request." }, 500);
  }
}
