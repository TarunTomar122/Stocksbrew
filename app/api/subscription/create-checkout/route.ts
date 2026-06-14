import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminFirestore } from "@/lib/firebase-admin";
import { getUserDoc } from "@/lib/watchlist";
import { isDodoConfigured, DODO_BASE, dodoHeaders, productIdFor } from "@/lib/dodo";
import { recordLifecycleEvent } from "@/lib/lifecycle-events";
import { isTrialEligible } from "@/lib/trial-eligibility";

export async function POST(req: NextRequest) {
  // 1. Verify Firebase ID token from Authorization header
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  let email: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // 2. Check Dodo is configured
  if (!isDodoConfigured()) {
    return NextResponse.json({ error: "Payments not configured", needsSetup: true }, { status: 400 });
  }

  // 3. Parse plan + market
  const body = await req.json().catch(() => ({}));
  const period: "monthly" | "yearly" = body.period === "yearly" ? "yearly" : "monthly";
  const market: "US" | "IN" = body.market === "IN" ? "IN" : "US";
  // India doesn't offer yearly — fall back to monthly silently
  const effectivePeriod: "monthly" | "yearly" = market === "IN" ? "monthly" : period;
  const productId = productIdFor(effectivePeriod, market);
  if (!productId) {
    return NextResponse.json({ error: "Product not configured" }, { status: 400 });
  }

  // 4. Don't create a new checkout if already subscribed
  const userDoc = await getUserDoc(uid);
  if (userDoc?.is_subscribed) {
    return NextResponse.json({ error: "Already subscribed" }, { status: 409 });
  }

  // 5. Rate-limit rapid duplicate clicks (not abandoned checkout retries)
  const CHECKOUT_COOLDOWN_MS = 12 * 1000;
  if (userDoc?.lastCheckoutCreatedAt) {
    const last = new Date(userDoc.lastCheckoutCreatedAt).getTime();
    const elapsed = Date.now() - last;
    if (elapsed < CHECKOUT_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((CHECKOUT_COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        {
          error: `Please wait ${retryAfterSeconds}s before trying again.`,
          retryAfterSeconds,
        },
        { status: 429 },
      );
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const trialEligible = effectivePeriod === "yearly" && isTrialEligible(userDoc);

  // 6. Create Dodo checkout session
  const dodoPayload: Record<string, unknown> = {
    billing: {
      city: null,
      country: market === "IN" ? "IN" : "US",
      state: null,
      street: null,
      zipcode: null,
    },
    customer: {
      email: email ?? "",
      name: userDoc?.display_name ?? email ?? uid,
      create_new_customer: false,
    },
    product_cart: [
      {
        product_id: productId,
        quantity: 1,
      },
    ],
    metadata: {
      user_id: uid,
      plan: effectivePeriod,
    },
    return_url: `${appUrl}/subscribe`,
  };
  // Dodo applies product-level trials unless overridden. Only yearly may trial.
  if (!trialEligible) {
    dodoPayload.subscription_data = { trial_period_days: 0 };
  }

  const dodoRes = await fetch(`${DODO_BASE}/checkouts`, {
    method: "POST",
    headers: dodoHeaders(),
    body: JSON.stringify(dodoPayload),
  });

  if (!dodoRes.ok) {
    const text = await dodoRes.text().catch(() => "");
    console.error("Dodo checkout error:", dodoRes.status, text);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 502 },
    );
  }

  const session = await dodoRes.json();
  const checkoutUrl: string = session.url ?? session.checkout_url ?? session.payment_link ?? "";
  if (!checkoutUrl) {
    return NextResponse.json({ error: "No checkout URL returned" }, { status: 502 });
  }

  // 7. Record checkout attempt in Firestore
  await adminFirestore
    .collection("users")
    .doc(uid)
    .set(
      {
        lastCheckoutSessionId: session.id ?? null,
        lastCheckoutCreatedAt: new Date().toISOString(),
        lastCheckoutPlan: effectivePeriod,
        lastCheckoutMarket: market,
      },
      { merge: true },
    );

  await recordLifecycleEvent({
    uid,
    email: email ?? null,
    type: "checkout_started",
    payload: {
      plan: effectivePeriod,
      checkout_session_id: session.id ?? null,
      trial_eligible: trialEligible,
    },
  }).catch(() => undefined);

  return NextResponse.json({ checkoutUrl });
}
