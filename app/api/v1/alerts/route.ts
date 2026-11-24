import { runAgentApiRequest } from "@/lib/agent-api";
import { readJsonObject } from "@/lib/request-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  return runAgentApiRequest(request, "get_my_alerts", {
    ticker: query.get("ticker") || undefined,
    market: query.get("market") || "US",
    kind: query.get("kind") || undefined,
    limit: Number(query.get("limit")) || undefined,
  });
}

export async function POST(request: Request) {
  return runAgentApiRequest(request, "create_alert", (await readJsonObject(request)) ?? {});
}

export async function DELETE(request: Request) {
  return runAgentApiRequest(request, "delete_alert", (await readJsonObject(request)) ?? {});
}
