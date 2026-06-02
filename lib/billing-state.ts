export type BillingBucket =
  | "active_paid"
  | "paid_cancel_scheduled"
  | "complimentary_pro"
  | "churned_billing"
  | "payment_issue"
  | "free";

const TERMINAL_STATUSES = new Set([
  "cancelled",
  "expired",
  "on_hold",
  "failed",
  "payment_failed",
]);

const ACTIVE_STATUSES = new Set(["active", "trialing", "on_trial"]);

export type BillingClassification = {
  bucket: BillingBucket;
  label: string;
  hasSubscriptionId: boolean;
  isSubscribed: boolean;
  subscriptionStatus: string;
  cancelAtPeriodEnd: boolean;
};

export function classifyBilling(data: Record<string, unknown>): BillingClassification {
  const isSubscribed = Boolean(data.is_subscribed);
  const subscriptionId = String(data.subscriptionId ?? "").trim();
  const subscriptionStatus = String(data.subscriptionStatus ?? "").trim().toLowerCase();
  const cancelAtPeriodEnd = Boolean(data.cancelAtPeriodEnd);
  const hasSubscriptionId = subscriptionId.length > 0;

  const base = {
    hasSubscriptionId,
    isSubscribed,
    subscriptionStatus,
    cancelAtPeriodEnd,
  };

  if (!isSubscribed) {
    if (hasSubscriptionId) {
      if (subscriptionStatus === "processing") {
        return { ...base, bucket: "payment_issue", label: "Payment processing" };
      }
      if (subscriptionStatus === "payment_failed" || subscriptionStatus === "failed") {
        return { ...base, bucket: "payment_issue", label: "Payment failed" };
      }
      return { ...base, bucket: "churned_billing", label: "Cancelled · was Pro" };
    }
    if (subscriptionStatus === "payment_failed" || subscriptionStatus === "failed") {
      return { ...base, bucket: "payment_issue", label: "Payment failed" };
    }
    if (subscriptionStatus === "processing") {
      return { ...base, bucket: "payment_issue", label: "Payment processing" };
    }
    return { ...base, bucket: "free", label: "Free" };
  }

  // is_subscribed = true
  if (!hasSubscriptionId) {
    return { ...base, bucket: "complimentary_pro", label: "Pro · complimentary" };
  }

  if (TERMINAL_STATUSES.has(subscriptionStatus)) {
    return { ...base, bucket: "churned_billing", label: `Pro flag · ${subscriptionStatus}` };
  }

  if (cancelAtPeriodEnd) {
    return { ...base, bucket: "paid_cancel_scheduled", label: "Pro · cancel scheduled" };
  }

  if (ACTIVE_STATUSES.has(subscriptionStatus) || subscriptionStatus === "") {
    return { ...base, bucket: "active_paid", label: "Pro · paid active" };
  }

  return { ...base, bucket: "active_paid", label: `Pro · paid (${subscriptionStatus || "unknown"})` };
}

/** Users with a live Dodo subscription id who still have Pro access. */
export function isBillingBackedPro(classification: BillingClassification): boolean {
  return (
    classification.bucket === "active_paid" || classification.bucket === "paid_cancel_scheduled"
  );
}

/** Users actively paying — not scheduled to cancel. */
export function isActivePaidPro(classification: BillingClassification): boolean {
  return classification.bucket === "active_paid";
}
