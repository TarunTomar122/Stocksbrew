import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import { adminFirestore } from "@/lib/firebase-admin";
import { recordLifecycleEvent } from "@/lib/lifecycle-events";
import { trialConsumedPatch } from "@/lib/trial-eligibility";
import { captureServerEvent } from "@/lib/posthog-server-capture";

type WebhookLogLevel = "info" | "warn" | "error";

function dodoWebhookLog(
  deliveryId: string,
  level: WebhookLogLevel,
  msg: string,
  meta?: Record<string, unknown>,
) {
  const payload = {
    svc: "dodo-webhook",
    delivery_id: deliveryId,
    msg,
    ...meta,
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export async function POST(req: NextRequest) {
  const deliveryId = req.headers.get("webhook-id")?.trim() || randomUUID();
  const rawBody = await req.text();
  const secret = process.env.DODO_WEBHOOK_SECRET ?? "";

  dodoWebhookLog(deliveryId, "info", "request_received", {
    body_bytes: rawBody.length,
    verify_mode: secret ? "signed" : "unsigned_dev",
  });

  // Verify signature when secret is configured
  if (secret) {
    const webhookId = req.headers.get("webhook-id") ?? "";
    const webhookTimestamp = req.headers.get("webhook-timestamp") ?? "";
    const webhookSignature = req.headers.get("webhook-signature") ?? "";

    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      dodoWebhookLog(deliveryId, "warn", "missing_signature_headers", {});
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
      dodoWebhookLog(deliveryId, "error", "signature_verification_failed", {
        error: String(err),
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    dodoWebhookLog(deliveryId, "warn", "secret_not_set_skipping_verify", {});
  }

  let event: { type: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    dodoWebhookLog(deliveryId, "error", "invalid_json_body", { error: String(err) });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, data } = event;
  dodoWebhookLog(deliveryId, "info", "event_parsed", {
    type,
    subscription_id: (data.subscription_id ?? data.id) as string | undefined,
  });

  // Resolve user from metadata
  const metadata = (data.metadata ?? {}) as Record<string, string>;
  const uid: string | null = metadata.user_id ?? null;

  try {
    if (!uid) {
      // Try to find user by subscriptionId
      const subId = (data.subscription_id ?? data.id) as string | undefined;
      if (subId) {
        dodoWebhookLog(deliveryId, "info", "resolve_user_by_subscription_lookup", {
          subscription_id: subId,
        });
        const snap = await adminFirestore
          .collection("users")
          .where("subscriptionId", "==", subId)
          .limit(1)
          .get();
        if (!snap.empty) {
          const resolvedUid = snap.docs[0].id;
          await handleEvent(resolvedUid, type, data, deliveryId);
          dodoWebhookLog(deliveryId, "info", "handler_complete_lookup_path", {
            uid: resolvedUid,
            type,
          });
        } else {
          dodoWebhookLog(deliveryId, "warn", "no_user_for_subscription", {
            subscription_id: subId,
            type,
          });
        }
      } else {
        dodoWebhookLog(deliveryId, "warn", "no_uid_and_no_subscription_id", { type });
      }
      return NextResponse.json({ received: true });
    }

    await handleEvent(uid, type, data, deliveryId);
    dodoWebhookLog(deliveryId, "info", "handler_complete", { uid, type });
  } catch (err) {
    dodoWebhookLog(deliveryId, "error", "handler_threw", {
      uid: uid ?? undefined,
      type,
      error: String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(
  uid: string,
  type: string,
  data: Record<string, unknown>,
  deliveryId: string,
) {
  const ref = adminFirestore.collection("users").doc(uid);
  const subId = (data.subscription_id ?? data.id) as string | undefined;
  const customerId = data.customer_id as string | undefined;
  const plan = ((data.metadata as Record<string, string> | undefined)?.plan ?? "monthly") as "monthly" | "yearly";

  // Dodo docs: track subscription lifecycle via `subscription.active` and
  // `payment.succeeded` (with a subscription) - do not grant Pro on
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
          ...trialConsumedPatch(),
        },
        { merge: true },
      );
      const conversionEvent = type === "subscription.active" ? "subscription_converted" : "subscription_renewed";
      await recordLifecycleEvent({
        uid,
        type: conversionEvent,
        payload: { source_event: type, plan },
      }).catch(() => undefined);
      await captureServerEvent(uid, conversionEvent, {
        source_event: type,
        plan,
        subscription_id: subId ?? null,
        $insert_id: `dodo:${deliveryId}:${type}`,
      }).catch(() => undefined);
      dodoWebhookLog(deliveryId, "info", "firestore_user_updated", { uid, type, subscription_id: subId });
      break;
    }

    case "payment.succeeded": {
      // Only subscription payments extend Pro - ignore unrelated one-off charges.
      const paymentSubId =
        (data.subscription_id as string | undefined) ??
        (data.subscriptionId as string | undefined);
      if (!paymentSubId) {
        dodoWebhookLog(deliveryId, "info", "payment_succeeded_no_subscription_skipped", { uid });
        break;
      }
      await ref.set(
        {
          is_subscribed: true,
          subscriptionId: paymentSubId,
          subscriptionStatus: "active",
          lastPaymentAt: new Date().toISOString(),
          cancelAtPeriodEnd: false,
          ...trialConsumedPatch(),
        },
        { merge: true },
      );
      await recordLifecycleEvent({
        uid,
        type: "subscription_payment_succeeded",
        payload: { source_event: type, plan },
      }).catch(() => undefined);
      await captureServerEvent(uid, "subscription_payment_succeeded", {
        source_event: type,
        plan,
        subscription_id: paymentSubId,
        $insert_id: `dodo:${deliveryId}:${type}`,
      }).catch(() => undefined);
      dodoWebhookLog(deliveryId, "info", "firestore_user_updated", { uid, type, subscription_id: paymentSubId });
      break;
    }

    case "payment.failed": {
      await ref.set(
        {
          is_subscribed: false,
          subscriptionStatus: "payment_failed",
          lastPaymentFailedAt: new Date().toISOString(),
          ...trialConsumedPatch(),
        },
        { merge: true },
      );
      dodoWebhookLog(deliveryId, "info", "firestore_user_updated", { uid, type });
      break;
    }

    case "subscription.on_hold": {
      await ref.set(
        { is_subscribed: false, subscriptionStatus: "on_hold" },
        { merge: true },
      );
      dodoWebhookLog(deliveryId, "info", "firestore_user_updated", { uid, type });
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
      dodoWebhookLog(deliveryId, "info", "firestore_user_updated", { uid, type });
      break;
    }

    case "subscription.updated": {
      const cancelAtPeriodEnd = Boolean(data.cancel_at_next_billing_date);
      await ref.set({ cancelAtPeriodEnd }, { merge: true });
      dodoWebhookLog(deliveryId, "info", "firestore_user_updated", { uid, type, cancelAtPeriodEnd });
      break;
    }

    default:
      dodoWebhookLog(deliveryId, "info", "unhandled_event_type", { type, uid });
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
