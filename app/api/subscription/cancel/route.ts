import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminFirestore } from "@/lib/firebase-admin";
import { DODO_BASE, dodoHeaders } from "@/lib/dodo";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const snap = await adminFirestore.collection("users").doc(uid).get();
  const userDoc = snap.data();
  const subscriptionId = userDoc?.subscriptionId as string | undefined;

  if (!subscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
  }

  const dodoRes = await fetch(`${DODO_BASE}/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    headers: dodoHeaders(),
    body: JSON.stringify({ cancel_at_next_billing_date: true }),
  });

  if (!dodoRes.ok) {
    const text = await dodoRes.text().catch(() => "");
    console.error("Dodo cancel error:", dodoRes.status, text);
    return NextResponse.json({ error: "Failed to cancel subscription" }, { status: 502 });
  }

  // Optimistic Firestore update
  await adminFirestore
    .collection("users")
    .doc(uid)
    .set({ cancelAtPeriodEnd: true }, { merge: true });

  return NextResponse.json({ cancelled: true });
}
