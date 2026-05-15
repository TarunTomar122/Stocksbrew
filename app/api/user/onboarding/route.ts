import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await adminFirestore.collection("users").doc(session.uid).get();
  const completed = snap.exists && snap.data()?.onboarding_completed === true;
  return NextResponse.json({ completed });
}

export async function POST() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await adminFirestore.collection("users").doc(session.uid).set(
    {
      onboarding_completed: true,
      onboarding_completed_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return NextResponse.json({ ok: true });
}
