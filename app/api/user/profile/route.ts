import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await adminFirestore.collection("users").doc(session.uid).get();
  if (!snap.exists) {
    return NextResponse.json({
      exists: false,
      onboarding_completed: false,
    });
  }

  const data = snap.data() || {};
  return NextResponse.json({
    exists: true,
    onboarding_completed: data.onboarding_completed === true,
  });
}
