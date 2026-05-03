import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import { adminFirestore } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const secret = process.env.DODO_WEBHOOK_SECRET ?? "";

  // Verify signature when secret is configured
  if (secret) {
    const webhookId = req.headers.get("webhook-id") ?? "";
    const webhookTimestamp = req.headers.get("webhook-timestamp") ?? "";
    const webhookSignature = req.headers.get("webhook-signature") ?? "";

    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      console.warn("Dodo webhook: missing signature headers");
      return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });
    }

    try {
      const wh = new Webhook(secret);
      wh.verify(rawBody, {
        "webhook-id": webhookId,
        "webhook-timestamp": webhookTimestamp,
        "webhook-signature": webhookSignature,
      });
    } catch (err) {
      console.error("Dodo webhook: signature verification failed", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn("Dodo webhook: DODO_WEBHOOK_SECRET not set — skipping verification (dev only)");
  }

  let event: { type: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, data } = event;
  console.log("Dodo webhook event:", type);

  // Resolve user from metadata
  const metadata = (data.metadata ?? {}) as Record<string, string>;
  const uid: string | null = metadata.user_id ?? null;

  if (!uid) {
    // Try to find user by subscriptionId
    const subId = (data.subscription_id ?? data.id) as string | undefined;
    if (subId) {
      const snap = await adminFirestore
        .collection("users")
        .where("subscriptionId", "==", subId)
        .limit(1)
        .get();
      if (!snap.empty) {
        await handleEvent(snap.docs[0].id, type, data);
      }
    }
    return NextResponse.json({ received: true });
  }

  await handleEvent(uid, type, data);
  return NextResponse.json({ received: true });
}

async function handleEvent(
  uid: string,
  type: string,
  data: Record<string, unknown>,
) {
  const ref = adminFirestore.collection("users").doc(uid);
  const subId = (data.subscription_id ?? data.id) as string | undefined;
  const customerId = data.customer_id as string | undefined;
  const plan = ((data.metadata as Record<string, string> | undefined)?.plan ?? "monthly") as "monthly" | "yearly";

  // Dodo docs: track subscription lifecycle via `subscription.active` and
  // `payment.succeeded` (with a subscription) — do not grant Pro on
  // `subscription.created` alone, which can precede a successful charge.
  switch (type) {
    case "subscription.active":
    case "subscription.renewed": {
      await ref.set(
        {
          is_subscribed: true,
          subscriptionId: subId ?? null,
          dodoCustomerId: customerId ?? null,
          subscriptionStatus: "active",
          subscriptionPlan: plan,
          subscribedAt: new Date().toISOString(),
          cancelAtPeriodEnd: false,
        },
        { merge: true },
      );
      break;
    }

    case "payment.succeeded": {
      // Only subscription payments extend Pro — ignore unrelated one-off charges.
      const paymentSubId =
        (data.subscription_id as string | undefined) ??
        (data.subscriptionId as string | undefined);
      if (!paymentSubId) break;
      await ref.set(
        {
          is_subscribed: true,
          subscriptionId: paymentSubId,
          subscriptionStatus: "active",
          lastPaymentAt: new Date().toISOString(),
          cancelAtPeriodEnd: false,
        },
        { merge: true },
      );
      break;
    }

    case "payment.failed": {
      await ref.set(
        { subscriptionStatus: "payment_failed", lastPaymentFailedAt: new Date().toISOString() },
        { merge: true },
      );
      break;
    }

    case "subscription.on_hold": {
      await ref.set(
        { is_subscribed: false, subscriptionStatus: "on_hold" },
        { merge: true },
      );
      break;
    }

    case "subscription.cancelled":
    case "subscription.expired": {
      await ref.set(
        {
          is_subscribed: false,
          subscriptionStatus: type === "subscription.cancelled" ? "cancelled" : "expired",
          cancelledAt: new Date().toISOString(),
        },
        { merge: true },
      );
      break;
    }

    case "subscription.updated": {
      const cancelAtPeriodEnd = Boolean(data.cancel_at_next_billing_date);
      await ref.set({ cancelAtPeriodEnd }, { merge: true });
      break;
    }

    default:
      // Unhandled event type — log and move on
      console.log("Dodo webhook: unhandled event type", type);
  }
}

// Allow Dodo to ping OPTIONS for CORS pre-flight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, webhook-id, webhook-timestamp, webhook-signature",
    },
  });
}
