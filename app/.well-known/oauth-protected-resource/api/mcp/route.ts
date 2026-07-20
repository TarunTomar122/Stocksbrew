import { AGENT_SCOPES, publicAppUrl } from "@/lib/agent-access-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = publicAppUrl();
  return Response.json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: AGENT_SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: `${base}/developers`,
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}
