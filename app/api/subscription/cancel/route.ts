import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminFirestore } from "@/lib/firebase-admin";
import { DODO_BASE, dodoHeaders } from "@/lib/dodo";
import { recordLifecycleEvent } from "@/lib/lifecycle-events";

const CANCEL_REASONS = new Set([
  "too_expensive",
  "not_using_enough",
  "missing_stocks",
  "calls_not_helpful",
  "technical_issue",
  "other",
]);

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  let email: string | null = null;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    uid = decoded.uid;
    email = decoded.email ?? null;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const reason = CANCEL_REASONS.has(body.reason) ? body.reason : "other";
  const feedback = typeof body.feedback === "string" ? body.feedback.trim().slice(0, 1000) : "";
  const retentionCode = typeof body.retentionCode === "string" ? body.retentionCode.trim().slice(0, 64) : "";

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
    .set(
      {
        cancelAtPeriodEnd: true,
        cancellationSurvey: {
          reason,
          feedback,
          retentionCode,
          submittedAt: new Date().toISOString(),
        },
      },
      { merge: true },
    );

  await recordLifecycleEvent({
    uid,
    email,
    type: "subscription_cancel_scheduled",
    payload: {
      subscription_id: subscriptionId,
      reason,
      feedback,
      retention_code: retentionCode,
    },
  }).catch(() => undefined);

  return NextResponse.json({ cancelled: true });
}
