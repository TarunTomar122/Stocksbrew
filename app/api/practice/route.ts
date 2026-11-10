import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { getPracticePayload } from "@/lib/practice-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const payload = await getPracticePayload(session.uid);
  if (!payload) return NextResponse.json({ error: "prices_unavailable" }, { status: 503 });
  return NextResponse.json(payload);
}
