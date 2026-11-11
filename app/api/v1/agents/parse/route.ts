import { runAgentApiRequest } from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A request the rules cannot read goes to the model, like POST /api/agents/parse.
export const maxDuration = 30;

export async function POST(request: Request) {
  const parsed: unknown = await request.json().catch(() => null);
  // A body of null, a number or an array is treated as empty, never thrown on.
  const body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  return runAgentApiRequest(request, "watch_in_plain_words", { text: typeof body.text === "string" ? body.text : "" });
}
