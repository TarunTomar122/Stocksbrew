import { NextResponse } from "next/server";

import { getConversation } from "@/lib/ask-data";
import { getSessionUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/** One saved conversation. Only its owner can read it. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  const conversation = await getConversation(session.uid, params.id);
  if (!conversation) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ conversation });
}
