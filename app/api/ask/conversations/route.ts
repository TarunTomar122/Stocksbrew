import { NextRequest, NextResponse } from "next/server";
import type { UIMessage } from "ai";

import { ASK_CONVERSATION_ID_RE, listConversations, saveConversation } from "@/lib/ask-data";
import { getSessionUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_500_000;

/** The signed-in person's saved conversations, newest first. */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ conversations: [] });
  return NextResponse.json({ conversations: await listConversations(session.uid) });
}

/**
 * Save one conversation for the signed-in person. The page calls this after
 * each answer. It writes only to that person's own documents: the uid comes
 * from the session, and the conversation id is checked before it becomes part
 * of a document path.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let body: { id?: unknown; messages?: unknown } | null = null;
  try {
    body = JSON.parse(raw) as { id?: unknown; messages?: unknown };
  } catch {
    body = null;
  }
  const id = typeof body?.id === "string" && ASK_CONVERSATION_ID_RE.test(body.id) ? body.id : null;
  const messages = Array.isArray(body?.messages) ? (body!.messages as unknown[]) : null;
  if (!id || !messages || messages.length === 0 || messages.length > 400) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const clean = messages.filter(
    (item): item is UIMessage =>
      Boolean(item) && typeof item === "object" && ((item as UIMessage).role === "user" || (item as UIMessage).role === "assistant") && Array.isArray((item as UIMessage).parts),
  );
  const saved = await saveConversation({ uid: session.uid, id, messages: clean });
  if (!saved) return NextResponse.json({ error: "not_saved" }, { status: 503 });
  return NextResponse.json({ ok: true, conversations: await listConversations(session.uid) });
}
