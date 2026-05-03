"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase-client";

type Props = {
  isSubscribed: boolean;
  /** False when Pro is from dev unlock or legacy data with no Dodo subscription id. */
  hasBillableSubscription?: boolean;
  subscriptionStatus?: string | null;
  subscriptionPlan?: string | null;
  cancelAtPeriodEnd?: boolean | null;
};

function planLabel(plan: string | null | undefined): string | null {
  if (!plan) return null;
  if (plan === "yearly") return "Yearly billing";
  if (plan === "monthly") return "Monthly billing";
  return plan;
}

export function ProfileSubscription({
  isSubscribed,
  hasBillableSubscription = true,
  subscriptionStatus,
  subscriptionPlan,
  cancelAtPeriodEnd,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    if (!confirm("Cancel Pro at the end of your current billing period?")) return;
    setError(null);
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("Not signed in");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/subscription/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not cancel subscription");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const statusLine = (() => {
    if (!isSubscribed) {
      if (subscriptionStatus === "payment_failed") {
        return "Last payment failed — update your payment method on the billing portal or resubscribe.";
      }
      return "Free — upgrade to unlock Pro features.";
    }
    if (cancelAtPeriodEnd) {
      return "Pro — scheduled to cancel at the end of this billing period.";
    }
    if (subscriptionStatus && subscriptionStatus !== "active") {
      return `Status: ${subscriptionStatus.replace(/_/g, " ")}`;
    }
    return "Pro — full access to Tikrr.";
  })();

  const plan = planLabel(subscriptionPlan ?? undefined);

  return (
    <div className="flex flex-col gap-3 border-t border-outline-variant/20 pt-4">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-on-surface-variant">
          Plan
        </span>
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className={`text-[15px] font-semibold ${isSubscribed ? "text-primary" : "text-on-surface"}`}
          >
            {isSubscribed ? "Pro" : "Free"}
          </span>
          {isSubscribed && plan && (
            <span className="text-[12px] text-on-surface-variant">· {plan}</span>
          )}
        </div>
        <p className="text-[12px] text-on-surface-variant leading-snug">{statusLine}</p>
      </div>

      {error && (
        <p className="text-[12px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!isSubscribed && (
          <Link
            href="/subscribe"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-on-primary hover:opacity-90"
          >
            Subscribe to Pro
          </Link>
        )}
        {isSubscribed && hasBillableSubscription && !cancelAtPeriodEnd && (
          <button
            type="button"
            disabled={loading}
            onClick={handleCancel}
            className="inline-flex items-center justify-center rounded-md border border-outline-variant px-4 py-2 text-[13px] font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-50"
          >
            {loading ? "Working…" : "Cancel subscription"}
          </button>
        )}
        {isSubscribed && cancelAtPeriodEnd && (
          <span className="text-[12px] text-on-surface-variant self-center">
            You’ll keep Pro until the period ends. No further action needed.
          </span>
        )}
      </div>
    </div>
  );
}
