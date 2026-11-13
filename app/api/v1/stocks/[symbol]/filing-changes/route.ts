import { runAgentApiRequest } from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What a US company added to, dropped from or reworded in its newest 10-K or 10-Q's risk factors. */
export async function GET(request: Request, { params }: { params: { symbol: string } }) {
  return runAgentApiRequest(request, "get_filing_changes", { ticker: params.symbol });
}
