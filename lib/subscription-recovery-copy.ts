export const SUPPORT_EMAIL = "tomartarun2001@gmail.com";

export type SyncReason =
  | "payment_failed"
  | "processing"
  | "pending"
  | "no_subscription_id"
  | "dodo_lookup_failed"
  | "on_hold"
  | "cancelled"
  | "expired"
  | "failed"
  | string;

export function syncReasonMessage(reason?: SyncReason): string {
  switch (reason) {
    case "processing":
    case "pending":
      return "Your payment is still processing. Wait a few minutes, then tap Refresh subscription status.";
    case "payment_failed":
    case "failed":
      return "The last payment did not go through. Subscribe again from stocksbrew.online (not localhost).";
    case "no_subscription_id":
      return "No active subscription found yet. If you just paid, wait a minute and tap Refresh. Otherwise subscribe again.";
    case "dodo_lookup_failed":
      return "We could not verify your subscription with the payment provider. Email support with your account email.";
    case "on_hold":
      return "Your subscription is on hold. Update your payment method in the billing portal, then refresh.";
    case "cancelled":
    case "expired":
      return "Your previous subscription ended. Subscribe again to restore Pro.";
    default:
      return "Pro is not active yet. Tap Refresh subscription status, or subscribe again if payment did not complete.";
  }
}

export function profileStatusLine(
  isSubscribed: boolean,
  subscriptionStatus?: string | null,
): string {
  if (isSubscribed) return "Pro - full access to stocksbrew.";
  if (subscriptionStatus === "processing") {
    return "Payment processing — Pro activates once the charge completes.";
  }
  if (subscriptionStatus === "payment_failed") {
    return "Last payment did not complete. Subscribe again on stocksbrew.online, then refresh.";
  }
  return "Free — upgrade to unlock Pro features.";
}
