import { runAgentApiRequest } from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.clone().json();
  } catch {
    return Response.json({ error: "invalid_json", message: "A JSON body is required." }, { status: 400 });
  }
  return runAgentApiRequest(request, "compare_stocks", {
    tickers: Array.isArray(body.tickers) ? body.tickers : [],
  });
}
