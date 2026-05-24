import { adminFirestore } from "@/lib/firebase-admin";
import { DODO_BASE, dodoHeaders } from "@/lib/dodo";

type DodoSubscription = {
  subscription_id?: string;
  status?: string;
  customer_id?: string | null;
  metadata?: Record<string, string>;
};

type DodoCheckout = {
  id?: string;
  payment_status?: string | null;
  payment_id?: string | null;
  subscription_id?: string | null;
};

export async function fetchDodoSubscription(
  subscriptionId: string,
): Promise<DodoSubscription | null> {
  const res = await fetch(`${DODO_BASE}/subscriptions/${subscriptionId}`, {
    headers: dodoHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as DodoSubscription;
}

export async function fetchDodoCheckout(checkoutId: string): Promise<DodoCheckout | null> {
  const res = await fetch(`${DODO_BASE}/checkouts/${checkoutId}`, {
    headers: dodoHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as DodoCheckout;
}

function planFromMetadata(metadata?: Record<string, string>): "monthly" | "yearly" {
  return metadata?.plan === "yearly" ? "yearly" : "monthly";
}

export async function grantProSubscription(
  uid: string,
  opts: {
    subscriptionId: string;
    plan?: "monthly" | "yearly";
    customerId?: string | null;
  },
): Promise<void> {
  await adminFirestore
    .collection("users")
    .doc(uid)
    .set(
      {
        is_subscribed: true,
        subscriptionId: opts.subscriptionId,
        subscriptionStatus: "active",
        subscriptionPlan: opts.plan ?? "monthly",
        dodoCustomerId: opts.customerId ?? null,
        subscribedAt: new Date().toISOString(),
        cancelAtPeriodEnd: false,
        lastPaymentFailedAt: null,
      },
      { merge: true },
    );
}

export async function syncUserSubscription(
  uid: string,
  opts: {
    subscriptionId?: string | null;
    checkoutSessionId?: string | null;
    lastCheckoutPlan?: "monthly" | "yearly" | null;
  },
): Promise<{ subscribed: boolean; subscriptionId?: string; reason?: string }> {
  let subscriptionId = opts.subscriptionId?.trim() || null;

  const userSnap = await adminFirestore.collection("users").doc(uid).get();
  const user = userSnap.data() ?? {};

  if (!subscriptionId && typeof user.subscriptionId === "string" && user.subscriptionId) {
    subscriptionId = user.subscriptionId;
  }

  const checkoutId =
    opts.checkoutSessionId?.trim() ||
    (typeof user.lastCheckoutSessionId === "string" ? user.lastCheckoutSessionId : null);

  if (!subscriptionId && checkoutId) {
    const checkout = await fetchDodoCheckout(checkoutId);
    const checkoutStatus = String(checkout?.payment_status ?? "").toLowerCase();
    if (checkoutStatus === "failed") {
      return { subscribed: false, reason: "payment_failed" };
    }
    if (
      checkoutStatus === "processing" ||
      checkoutStatus === "pending" ||
      checkoutStatus === "initiated"
    ) {
      await adminFirestore
        .collection("users")
        .doc(uid)
        .set({ subscriptionStatus: "processing" }, { merge: true });
      return { subscribed: false, reason: "processing" };
    }
    if (typeof checkout?.subscription_id === "string" && checkout.subscription_id) {
      subscriptionId = checkout.subscription_id;
    }
  }

  if (!subscriptionId) {
    return { subscribed: Boolean(user.is_subscribed), reason: "no_subscription_id" };
  }

  const sub = await fetchDodoSubscription(subscriptionId);
  if (!sub) {
    return { subscribed: Boolean(user.is_subscribed), subscriptionId, reason: "dodo_lookup_failed" };
  }

  const status = String(sub.status ?? "").toLowerCase();
  if (status === "active") {
    const plan =
      sub.metadata?.plan === "yearly"
        ? "yearly"
        : opts.lastCheckoutPlan === "yearly"
          ? "yearly"
          : "monthly";
    await grantProSubscription(uid, {
      subscriptionId,
      plan,
      customerId: sub.customer_id ?? null,
    });
    return { subscribed: true, subscriptionId };
  }

  if (status === "on_hold" || status === "failed" || status === "cancelled" || status === "expired") {
    await adminFirestore
      .collection("users")
      .doc(uid)
      .set(
        {
          is_subscribed: false,
          subscriptionStatus: status === "failed" ? "payment_failed" : status,
        },
        { merge: true },
      );
    return { subscribed: false, subscriptionId, reason: status };
  }

  if (status === "pending" || status === "created" || status === "processing") {
    await adminFirestore
      .collection("users")
      .doc(uid)
      .set({ subscriptionStatus: "processing" }, { merge: true });
    return { subscribed: false, subscriptionId, reason: "processing" };
  }

  return { subscribed: Boolean(user.is_subscribed), subscriptionId, reason: status || "pending" };
}
