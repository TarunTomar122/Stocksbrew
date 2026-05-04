import { NextRequest, NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";

export async function POST(req: NextRequest) {
  try {
    const { feedback } = await req.json();
    const trimmed = typeof feedback === "string" ? feedback.trim() : "";
    if (!trimmed || trimmed.length > 2000) {
      return NextResponse.json({ error: "Feedback must be 1-2000 characters" }, { status: 400 });
    }

    const session = await getSessionUser().catch(() => null);

    await adminFirestore.collection("feedback").add({
      feedback: trimmed,
      uid: session?.uid ?? null,
      email: session?.email ?? null,
      path: req.headers.get("referer") ?? null,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[feedback] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
