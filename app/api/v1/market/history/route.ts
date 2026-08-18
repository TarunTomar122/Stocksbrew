import { runAgentApiRequest } from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  return runAgentApiRequest(request, "get_market_history", {
    market: query.get("market") || "US",
    days: Number(query.get("days")) || undefined,
  });
}
