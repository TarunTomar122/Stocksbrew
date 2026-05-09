import { NextRequest, NextResponse } from "next/server";

import { adminFirestore } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!raw || !EMAIL_RE.test(raw) || raw.length > 320) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const session = await getSessionUser().catch(() => null);
    await adminFirestore.collection("heat_signups").doc(raw).set(
      {
        email: raw,
        uid: session?.uid ?? null,
        source: "heat_page",
        created_at: new Date().toISOString(),
        referer: req.headers.get("referer") ?? null,
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[heat-signup] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
