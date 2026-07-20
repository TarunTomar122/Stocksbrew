import { runAgentApiRequest } from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return runAgentApiRequest(request, "search_stocks", {
    query: params.get("q") || "",
    market: params.get("market") || "US",
    limit: Number(params.get("limit") || 10),
  });
}
