"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ProCtaLink } from "@/components/pro-cta";
import { useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { profileStatusLine } from "@/lib/subscription-recovery-copy";
import { SubscriptionActivator } from "@/components/subscription-activator";

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
  subscriptionId,
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
      return "Pro - scheduled to cancel at the end of this billing period.";
    }
    if (subscriptionStatus && subscriptionStatus !== "active") {
      return `Status: ${subscriptionStatus.replace(/_/g, " ")}`;
    }
    return "Pro - full access to stocksbrew.";
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

      {!isSubscribed && (
        <p className="text-[13px] text-[#6b7280] leading-relaxed">
          Get a daily call on every stock you track, plus alerts and a read on your portfolio risk.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!isSubscribed && (
          <ProCtaLink href="/subscribe" size="sm" showStar>
            {subscriptionStatus === "payment_failed" || subscriptionStatus === "processing"
              ? "Try subscribing again"
              : "Get Pro"}
          </ProCtaLink>
        )}
        {isSubscribed && hasBillableSubscription && !cancelAtPeriodEnd && (
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setError(null);
              setCancelStep("feedback");
              setCopiedCode(false);
              setShowCancelFlow(true);
            }}
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

      {!isSubscribed && (
        <SubscriptionActivator
          subscriptionId={subscriptionId ?? null}
          isSubscribed={isSubscribed}
          compact
        />
      )}

      {showCancelFlow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-8">
          <div className="w-full max-w-[520px] rounded-[28px] border border-[#e5e7eb] bg-white p-5 shadow-[0_24px_80px_rgba(17,24,39,0.18)] md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
                  {cancelStep === "feedback" ? "Before you cancel" : "One last thing"}
                </p>
                <h2 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-[#111111]">
                  {cancelStep === "feedback" ? "What made Pro not worth it?" : "Want a free month first?"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCancelFlow(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]"
                aria-label="Close cancellation flow"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                  close
                </span>
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
                        className={`rounded-2xl border px-3.5 py-3 text-left text-[13px] font-semibold transition-colors ${
                          selected
                            ? "border-[#111111] bg-[#111111] text-white"
                            : "border-[#e5e7eb] bg-[#fafafa] text-[#374151] hover:border-[#d1d5db]"
                        }`}
                      >
                        {reason.label}
                      </button>
                    );
                  })}
                </div>

                <label className="mt-4 flex flex-col gap-2">
                  <span className="text-[12px] font-semibold text-[#374151]">Anything we should fix?</span>
                  <textarea
                    value={cancelFeedback}
                    onChange={(event) => setCancelFeedback(event.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Optional feedback"
                    className="resize-none rounded-2xl border border-[#e5e7eb] bg-white px-3.5 py-3 text-[13px] text-[#111111] outline-none focus:border-[#111111]"
                  />
                </label>
              </>
            ) : (
              <div className="mt-5 rounded-3xl border border-[#bbf7d0] bg-[#f0fdf4] p-5">
                <p className="text-[15px] font-semibold text-[#166534]">
                  Use this code for one free month before you decide.
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-[#3f7f54]">
                  You can keep Pro now and apply the code, or continue cancellation.
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <code className="flex-1 rounded-xl bg-white px-3 py-3 text-center text-[13px] font-bold tracking-[0.12em] text-[#111111]">
                    {RETENTION_CODE}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyRetentionCode()}
                    className="rounded-xl bg-[#111111] px-4 py-2 text-[12px] font-semibold text-white"
                  >
                    {copiedCode ? "Copied" : "Copy code"}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p className="mt-3 text-[12px] font-medium text-red-600" role="alert">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowCancelFlow(false)}
                disabled={loading}
                className="inline-flex h-11 items-center justify-center rounded-full border border-[#111111] px-5 text-[13px] font-semibold text-[#111111] disabled:opacity-50"
              >
                Keep Pro
              </button>
              {cancelStep === "feedback" ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!cancelReason) {
                      setError("Pick a reason before continuing.");
                      return;
                    }
                    setError(null);
                    setCancelStep("offer");
                  }}
                  disabled={!cancelReason}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-[#111111] px-5 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleCancel()}
                  disabled={loading || !cancelReason}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-[#111111] px-5 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  {loading ? "Cancelling…" : "Continue cancellation"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
