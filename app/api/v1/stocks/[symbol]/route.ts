import { runAgentApiRequest } from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { symbol: string } }) {
  const query = new URL(request.url).searchParams;
  return runAgentApiRequest(request, "get_stock_intelligence", {
    ticker: params.symbol,
    market: query.get("market") || "US",
  });
}
