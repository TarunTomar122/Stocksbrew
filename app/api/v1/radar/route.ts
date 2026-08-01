import { runAgentApiRequest } from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  return runAgentApiRequest(request, "get_my_radar", {
    limit: Number(query.get("limit")) || undefined,
    offset: Number(query.get("offset")) || undefined,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return runAgentApiRequest(request, "add_to_radar", body);
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  return runAgentApiRequest(request, "remove_from_radar", body);
}
