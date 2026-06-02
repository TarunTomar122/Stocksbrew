import { NextRequest, NextResponse } from "next/server";

import { adminAuth } from "@/lib/firebase-admin";
import { getUserDoc } from "@/lib/watchlist";
import { syncUserSubscription } from "@/lib/subscription-sync";

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

  const body = await req.json().catch(() => ({}));
  const subscriptionId =
    typeof body.subscriptionId === "string" ? body.subscriptionId : undefined;
  const checkoutSessionId =
    typeof body.checkoutSessionId === "string" ? body.checkoutSessionId : undefined;

  const userDoc = await getUserDoc(uid);
  const rawPlan = userDoc?.lastCheckoutPlan ?? userDoc?.subscriptionPlan;
  const lastCheckoutPlan: "monthly" | "yearly" =
    rawPlan === "yearly" ? "yearly" : "monthly";

  const result = await syncUserSubscription(uid, {
    subscriptionId,
    checkoutSessionId,
    lastCheckoutPlan,
  });

  return NextResponse.json(result);
}
