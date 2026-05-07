import { NextRequest, NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";

const ALLOWED_KEYS = new Set(["email_alerts_enabled", "email_digest_enabled"]);

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (typeof value !== "boolean") continue;
    updates[key] = value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  await adminFirestore.collection("users").doc(session.uid).set(updates, { merge: true });
  return NextResponse.json({ ok: true, updated: updates });
}
