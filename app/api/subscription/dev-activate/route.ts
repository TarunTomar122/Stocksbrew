import { NextRequest, NextResponse } from "next/server";

import { adminAuth } from "@/lib/firebase-admin";
import { recordLifecycleEvent } from "@/lib/lifecycle-events";
import { grantProSubscription } from "@/lib/subscription-sync";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  const body = await req.json().catch(() => ({}));
  const plan = body.period === "yearly" ? "yearly" : "monthly";
  const subscriptionId = `dev_${uid}_${Date.now()}`;

  await grantProSubscription(uid, {
    subscriptionId,
    plan,
    customerId: `dev_customer_${uid}`,
  });

  await recordLifecycleEvent({
    uid,
    type: "subscription_converted",
    payload: { source_event: "dev_activate", plan },
  }).catch(() => undefined);

  return NextResponse.json({ subscribed: true, subscriptionId });
}
