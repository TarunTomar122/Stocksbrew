import { runAgentApiRequest } from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The member's idea baskets with each one's latest check. Read only. */
export async function GET(request: Request) {
  return runAgentApiRequest(request, "list_baskets", {});
}
