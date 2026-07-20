import { runAgentApiRequest } from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const market = new URL(request.url).searchParams.get("market") || "US";
  return runAgentApiRequest(request, "get_market_brief", { market });
}
