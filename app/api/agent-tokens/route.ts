import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import {
  AgentAuthError,
  issuePersonalAgentToken,
  listPersonalAgentTokens,
  revokePersonalAgentToken,
} from "@/lib/agent-auth";
import { getAgentUsage } from "@/lib/agent-quota";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireProSession() {
  const session = await getSessionUser();
  if (!session) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const user = await getUserDoc(session.uid).catch(() => null);
  if (!resolveIsSubscribed(user)) {
    return { error: NextResponse.json({ error: "pro_required" }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const auth = await requireProSession();
  if (auth.error) return auth.error;
  const [tokens, usage] = await Promise.all([
    listPersonalAgentTokens(auth.session.uid),
    getAgentUsage(auth.session.uid),
  ]);
  return NextResponse.json({ tokens, usage });
}

export async function POST(request: NextRequest) {
  const auth = await requireProSession();
  if (auth.error) return auth.error;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const label = String(body.label || "My agent").trim().slice(0, 80);
  try {
    const issued = await issuePersonalAgentToken(auth.session.uid, label);
    return NextResponse.json({
      token: issued.token,
      token_record: {
        id: issued.id,
        label: label || "My agent",
        prefix: `${issued.prefix}.${issued.id.slice(0, 6)}…`,
        created_at: new Date().toISOString(),
        last_used_at: null,
        revoked_at: null,
        calls_total: 0,
      },
      warning: "Copy this token now. Stocksbrew stores only its hash and cannot show it again.",
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AgentAuthError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    console.error("agent_token_create_failed", error);
    return NextResponse.json({ error: "token_create_failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireProSession();
  if (auth.error) return auth.error;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[A-Za-z0-9_-]{12,32}$/.test(id)) {
    return NextResponse.json({ error: "invalid_token_id" }, { status: 400 });
  }
  const revoked = await revokePersonalAgentToken(auth.session.uid, id);
  if (!revoked) return NextResponse.json({ error: "token_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
