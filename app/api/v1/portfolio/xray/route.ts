import { runAgentApiRequest } from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  return runAgentApiRequest(request, "what_you_own", { limit: Number(query.get("limit")) || undefined });
}
