import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";

function attributionSubmitted(data: Record<string, unknown>): boolean {
  return Boolean(
    data.heard_about_us || data.attribution_skipped || data.onboarding_completed,
  );
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await adminFirestore.collection("users").doc(session.uid).get();
  if (!snap.exists) {
    return NextResponse.json({
      exists: false,
      attribution_submitted: false,
    });
  }

  const data = snap.data() || {};
  return NextResponse.json({
    exists: true,
    attribution_submitted: attributionSubmitted(data),
    heard_about_us: typeof data.heard_about_us === "string" ? data.heard_about_us : null,
  });
}
