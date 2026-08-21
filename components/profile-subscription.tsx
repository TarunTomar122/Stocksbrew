"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { getFirebaseAuth } from "@/lib/firebase-client";
import { profileStatusLine } from "@/lib/subscription-recovery-copy";
import { SubscriptionActivator } from "@/components/subscription-activator";
import { OaButton } from "@/components/oa/button";
import { SquircleSurface } from "@/components/oa/squircle";
import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import {
  trackCheckoutClicked,
  trackCheckoutStarted,
} from "@/lib/product-analytics";
import { startDodoCheckout } from "@/lib/dodo-checkout-client";

const RETENTION_CODE = "XWDPFXVBZHV0UHEY";

const CANCEL_REASONS = [
  { id: "too_expensive", label: "Too expensive" },
  { id: "not_using_enough", label: "Not using it enough" },
  { id: "missing_stocks", label: "Missing stocks I need" },
  { id: "calls_not_helpful", label: "Calls are not helpful yet" },
  { id: "technical_issue", label: "Something broke" },
  { id: "other", label: "Other" },
] as const;

type Props = {
  isSubscribed: boolean;
  /** False when Pro is from dev unlock or legacy data with no Dodo subscription id. */
  hasBillableSubscription?: boolean;
  subscriptionStatus?: string | null;
  subscriptionPlan?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  subscriptionId?: string | null;
  /** When true, omit outer section chrome (used inside profile cards). */
  embedded?: boolean;
};

function planLabel(plan: string | null | undefined): string | null {
  if (!plan) return null;
  if (plan === "yearly") return "Yearly billing";
  if (plan === "monthly") return "Monthly billing";
  return plan;
}

const PRO_FEATURES = [
  "Unlimited stocks in Watchlist",
  "Add · hold · trim on every name",
  "Smart alerts & morning digest",
  "Pre-earnings setups before the print",
  "Portfolio crowding & gap read",
  "Reddit buzz + news on your book",
  "Current Stocksbrew context for your AI",
] as const;

function PlanFeatureList({ subscribed }: { subscribed: boolean }) {
  return (
    <div className="rounded-[18px] border border-oa-border bg-oa-bg p-4">
      <p className="text-xs text-oa-muted-fg">
        {subscribed ? "Included in your plan" : "Unlock with Pro"}
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 sm:gap-x-4">
        {PRO_FEATURES.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm leading-6 text-oa-fg/80">
            <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-oa-primary" />
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Checkout button in the OA system: sign in if needed, then straight to Dodo. */
function GetProButton() {
  const { user } = useUser();
  const [busy, setBusy] = useState(false);

  async function openCheckout() {
    if (busy) return;
    setBusy(true);
    trackCheckoutClicked({ period: "monthly", market: "US", signedIn: Boolean(user) });
    try {
      if (!user) await signInWithGoogle({ surface: "paywall" });
      const checkoutUrl = await startDodoCheckout();
      trackCheckoutStarted({ period: "monthly", market: "US" });
      window.location.assign(checkoutUrl);
    } catch (err) {
      console.error("direct checkout failed", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <OaButton onClick={() => void openCheckout()} loading={busy} size="sm">
      Get Pro
    </OaButton>
  );
}

export function ProfileSubscription({
  isSubscribed,
  hasBillableSubscription = true,
  subscriptionStatus,
  subscriptionPlan,
  cancelAtPeriodEnd,
  subscriptionId,
  embedded = false,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelFlow, setShowCancelFlow] = useState(false);
  const [cancelStep, setCancelStep] = useState<"feedback" | "offer">("feedback");
  const [cancelReason, setCancelReason] = useState<(typeof CANCEL_REASONS)[number]["id"] | null>(null);
  const [cancelFeedback, setCancelFeedback] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  async function handleCancel() {
    if (!cancelReason) {
      setError("Pick a reason before cancelling.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("Not signed in");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/subscription/cancel", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: cancelReason,
          feedback: cancelFeedback,
          retentionCode: RETENTION_CODE,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not cancel subscription");
      setShowCancelFlow(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function copyRetentionCode() {
    try {
      await navigator.clipboard.writeText(RETENTION_CODE);
      setCopiedCode(true);
    } catch {
      setCopiedCode(false);
    }
  }

  const statusLine = (() => {
    if (!isSubscribed) {
      return profileStatusLine(isSubscribed, subscriptionStatus);
    }
    if (cancelAtPeriodEnd) {
      return "Scheduled to cancel at the end of this billing period.";
    }
    if (subscriptionStatus && subscriptionStatus !== "active") {
      return `Status: ${subscriptionStatus.replace(/_/g, " ")}`;
    }
    return "Full access to stocksbrew.";
  })();

  const plan = planLabel(subscriptionPlan ?? undefined);

  return (
    <div className={`flex flex-col gap-4 ${embedded ? "" : "border-t border-oa-border pt-4"}`}>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-2xl font-medium tracking-tight text-oa-fg">
            {isSubscribed ? "Pro" : "Free"}
          </span>
          {isSubscribed && plan ? (
            <span className="text-xs text-oa-muted-fg">{plan}</span>
          ) : null}
        </div>
        <p className="text-sm leading-6 text-oa-muted-fg">{statusLine}</p>
      </div>

      <PlanFeatureList subscribed={isSubscribed} />

      {error && (
        <p className="text-xs leading-5 text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!isSubscribed && <GetProButton />}
        {isSubscribed && hasBillableSubscription && !cancelAtPeriodEnd && (
          <OaButton
            variant="secondary"
            size="sm"
            loading={loading}
            onClick={() => {
              setError(null);
              setCancelStep("feedback");
              setCopiedCode(false);
              setShowCancelFlow(true);
            }}
          >
            Cancel subscription
          </OaButton>
        )}
        {isSubscribed && cancelAtPeriodEnd && (
          <span className="text-sm leading-6 text-oa-muted-fg">
            You&rsquo;ll keep Pro until the period ends. No further action needed.
          </span>
        )}
      </div>

      {!isSubscribed && (
        <SubscriptionActivator
          subscriptionId={subscriptionId ?? null}
          isSubscribed={isSubscribed}
          compact
        />
      )}

      {showCancelFlow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/35 px-4 py-8">
          <SquircleSurface className="my-auto w-full max-w-[520px] border border-oa-border p-5 shadow-[0_24px_60px_rgba(0,0,0,0.14),0_8px_20px_rgba(0,0,0,0.08)] md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-balance font-medium tracking-tight text-oa-fg text-xl leading-tight sm:text-2xl">
                  {cancelStep === "feedback"
                    ? "What made Pro not worth it?"
                    : "Want a free month first?"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-oa-muted-fg">
                  {cancelStep === "feedback"
                    ? "It helps us fix the product."
                    : "Yours to use before you decide."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCancelFlow(false)}
                className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-oa-muted-fg outline-none transition-colors hover:bg-oa-accent hover:text-oa-fg focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
                aria-label="Close cancellation flow"
              >
                ×
              </button>
            </div>

            {cancelStep === "feedback" ? (
              <>
                <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {CANCEL_REASONS.map((reason) => {
                    const selected = cancelReason === reason.id;
                    return (
                      <button
                        key={reason.id}
                        type="button"
                        onClick={() => {
                          setCancelReason(reason.id);
                          setError(null);
                        }}
                        className={`cursor-pointer rounded-lg border px-3.5 py-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] ${
                          selected
                            ? "border-transparent bg-oa-secondary font-medium text-oa-fg"
                            : "border-oa-border bg-oa-bg text-oa-fg/80 hover:bg-oa-accent"
                        }`}
                      >
                        {reason.label}
                      </button>
                    );
                  })}
                </div>

                <label className="mt-4 flex flex-col gap-2">
                  <span className="text-sm font-medium text-oa-fg">Anything we should fix?</span>
                  <textarea
                    value={cancelFeedback}
                    onChange={(event) => setCancelFeedback(event.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Optional feedback"
                    className="resize-none rounded-2xl border border-oa-border bg-oa-bg px-3.5 py-3 text-sm leading-6 text-oa-fg outline-none transition-colors placeholder:text-oa-muted-fg/70 focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
                  />
                </label>
              </>
            ) : (
              <div className="mt-5 rounded-[18px] border border-oa-border bg-oa-bg p-5">
                <p className="font-medium text-emerald-700 dark:text-emerald-400">
                  Use this code for one free month before you decide.
                </p>
                <p className="mt-1 text-sm leading-6 text-oa-muted-fg">
                  You can keep Pro now and apply the code, or continue cancellation.
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <code className="oa-mono flex-1 rounded-lg border border-oa-border bg-oa-card px-3 py-2.5 text-center text-sm tracking-[0.12em] text-oa-fg">
                    {RETENTION_CODE}
                  </code>
                  <OaButton variant="secondary" size="sm" onClick={() => void copyRetentionCode()}>
                    {copiedCode ? "Copied" : "Copy code"}
                  </OaButton>
                </div>
              </div>
            )}

            {error && (
              <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <OaButton
                variant="secondary"
                size="sm"
                disabled={loading}
                onClick={() => setShowCancelFlow(false)}
              >
                Keep Pro
              </OaButton>
              {cancelStep === "feedback" ? (
                <OaButton
                  size="sm"
                  disabled={!cancelReason}
                  onClick={() => {
                    if (!cancelReason) {
                      setError("Pick a reason before continuing.");
                      return;
                    }
                    setError(null);
                    setCancelStep("offer");
                  }}
                >
                  Continue
                </OaButton>
              ) : (
                <OaButton
                  size="sm"
                  loading={loading}
                  disabled={!cancelReason}
                  onClick={() => void handleCancel()}
                >
                  {loading ? "Cancelling…" : "Continue cancellation"}
                </OaButton>
              )}
            </div>
          </SquircleSurface>
        </div>
      )}
    </div>
  );
}
