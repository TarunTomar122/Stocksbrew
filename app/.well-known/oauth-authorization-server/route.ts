import { AGENT_SCOPES, publicAppUrl } from "@/lib/agent-access-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = publicAppUrl();
  return Response.json({
    issuer: base,
    authorization_endpoint: `${base}/mcp/authorize`,
    token_endpoint: `${base}/api/mcp/oauth/token`,
    registration_endpoint: `${base}/api/mcp/oauth/register`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: AGENT_SCOPES,
    service_documentation: `${base}/developers`,
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}
