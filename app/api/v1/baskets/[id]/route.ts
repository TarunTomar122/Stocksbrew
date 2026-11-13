import { runAgentApiRequest } from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One of the member's idea baskets in full. Another account's id is not found. Read only. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return runAgentApiRequest(request, "get_basket", { basket_id: params.id });
}
