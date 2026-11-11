import { runAgentApiRequest } from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  return runAgentApiRequest(request, "copy_test", {
    slug: query.get("slug") || undefined,
    query: query.get("query") || undefined,
    kind: query.get("kind") || undefined,
    limit: Number(query.get("limit")) || undefined,
  });
}
