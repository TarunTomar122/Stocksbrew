"use client";

import { AnimatedIcon } from "@/components/animated-icon";
import { useState } from "react";
import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { ProCtaButton } from "@/components/pro-cta";
import { captureEvent } from "@/lib/posthog";
import {
  trackCheckoutClicked,
  trackCheckoutStarted,
  trackSubscribeSigninStarted,
  trackSubscribeSigninSucceeded,
  trackSubscriptionConverted,
} from "@/lib/product-analytics";
import { ProBenefitsGrid } from "@/components/pro-benefits-grid";
import { ProWelcomePanel } from "@/components/pro-welcome-panel";
import { SUBSCRIBE_BENEFITS, SUBSCRIBE_TRUST_STRIP, buildSubscribeContextLines } from "@/lib/subscribe-benefits";
import { US_PRO_MONTHLY_LABEL, US_PRO_YEARLY_LABEL, US_YEARLY_SAVE_PCT } from "@/lib/pricing";

const DEV_FAKE_SUBSCRIBE = process.env.NODE_ENV === "development";

const PLANS_US = [
  {
    id: "monthly" as const,
    label: "Monthly",
    price: US_PRO_MONTHLY_LABEL,
    period: "per month",
    save: null,
    trial: "3 days free",
  },
  {
    id: "yearly" as const,
    label: "Yearly",
    price: US_PRO_YEARLY_LABEL,
    period: "per year",
    save: `Save ${US_YEARLY_SAVE_PCT}%`,
    badge: "Best value",
    trial: "3 days free",
  },
];

const PLANS_IN = [
  {
    id: "monthly" as const,
    label: "Monthly",
    price: "₹99",
    period: "per month",
    strike: "₹149",
    save: "Save 33%",
    badge: "Best value",
  },
];

async function devActivateSubscription(period: "monthly" | "yearly"): Promise<string> {
  const auth = getFirebaseAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Not signed in");

  const idToken = await currentUser.getIdToken();
  const res = await fetch("/api/subscription/dev-activate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ period }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Dev activation failed");
  if (!json.subscriptionId) throw new Error("No subscription id returned");

  return json.subscriptionId as string;
}

function redirectDevSubscribeSuccess(subscriptionId: string) {
  const params = new URLSearchParams({
    success: "1",
    status: "active",
    subscription_id: subscriptionId,
  });
  window.location.href = `/subscribe?${params.toString()}`;
}

async function startCheckout(period: "monthly" | "yearly", market: "US" | "IN"): Promise<string> {
  const auth = getFirebaseAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Not signed in");

  const idToken = await currentUser.getIdToken();
  const res = await fetch("/api/subscription/create-checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ period, market }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Checkout failed");
  if (!json.checkoutUrl) throw new Error("No checkout URL returned");

  return json.checkoutUrl;
}

export function SubscribePricing({
  isSubscribed,
  justSubscribed = false,
  market = "US",
  trackedCount = 0,
}: {
  isSubscribed: boolean;
  justSubscribed?: boolean;
  market?: "US" | "IN";
  trackedCount?: number;
}) {
  const { user } = useUser();
  const plans = market === "IN" ? PLANS_IN : PLANS_US;
  const defaultPlan = plans.find((plan) => plan.id === "monthly") ?? plans[0];
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">(defaultPlan.id);
  const [loadingPlan, setLoadingPlan] = useState<"monthly" | "yearly" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe(period: "monthly" | "yearly" = selectedPlan) {
    setError(null);
    trackCheckoutClicked({ period, market, signedIn: Boolean(user) });

    if (!user) {
      setLoadingPlan(period);
      try {
        trackSubscribeSigninStarted({ period, market });
        await signInWithGoogle({ surface: "subscribe_pricing" });
        trackSubscribeSigninSucceeded({ period, market });
        if (DEV_FAKE_SUBSCRIBE) {
          const subscriptionId = await devActivateSubscription(period);
          trackCheckoutStarted({ period, market });
          trackSubscriptionConverted({
            subscription_id: subscriptionId,
            source: "dev_activate",
          });
          redirectDevSubscribeSuccess(subscriptionId);
        } else {
          const checkoutUrl = await startCheckout(period, market);
          trackCheckoutStarted({ period, market });
          window.location.href = checkoutUrl;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setError(msg);
        captureEvent("subscribe_signin_failed", {
          period,
          market,
          error: err instanceof Error ? err.message : "unknown",
        });
      } finally {
        setLoadingPlan(null);
      }
      return;
    }

    setLoadingPlan(period);
    try {
      if (DEV_FAKE_SUBSCRIBE) {
        const subscriptionId = await devActivateSubscription(period);
        trackCheckoutStarted({ period, market });
        trackSubscriptionConverted({
          subscription_id: subscriptionId,
          source: "dev_activate",
        });
        redirectDevSubscribeSuccess(subscriptionId);
      } else {
        const checkoutUrl = await startCheckout(period, market);
        trackCheckoutStarted({ period, market });
        window.location.href = checkoutUrl;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      captureEvent("checkout_failed", {
        period,
        market,
        error: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      setLoadingPlan(null);
    }
  }

  if (isSubscribed) {
    if (justSubscribed) {
      return (
        <div
          className="mx-auto w-full max-w-[560px] rounded-2xl border border-outline-variant bg-surface p-6 md:p-10"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <ProWelcomePanel variant="page" />
        </div>
      );
    }

    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 py-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full tint-bull">
            <AnimatedIcon name="check_circle" size={24} className="text-[var(--signal-bullish)]" aria-hidden />
          </span>
          <p className="text-[16px] font-semibold text-on-surface">You&apos;re on Pro</p>
          <p className="text-[14px] text-on-surface-variant">Everything below is included with your plan.</p>
        </div>
        <ProBenefitsGrid benefits={SUBSCRIBE_BENEFITS.filter((b) => b.title !== "Cancel anytime")} />
      </div>
    );
  }

  const activePlan = plans.find((plan) => plan.id === selectedPlan) ?? plans[0];
  const isLoading = loadingPlan !== null;
  const contextLines = buildSubscribeContextLines(trackedCount);
  const trialNote = market === "US" ? "3 days free · " : "";

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-5 md:gap-6">
      <header className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-low px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
          <AnimatedIcon name="shield" size={14} className="text-[var(--signal-neutral)]" aria-hidden />
          stocksbrew Pro
        </span>
        <h1 className="font-mono text-[26px] font-extrabold leading-tight tracking-tight text-on-surface md:text-[30px]">
          Choose your plan
        </h1>
        <p className="max-w-md text-[13px] leading-relaxed text-on-surface-variant">
          Detailed calls and zones, the Stocksbrew target price, and Radar alerts that tell you when to look again.
        </p>
      </header>

      <section
        className="flex w-full flex-col gap-4 rounded-2xl border border-outline-variant bg-surface p-4 md:gap-5 md:p-5"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className={`grid gap-2.5 ${plans.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {plans.map((plan) => {
            const selected = selectedPlan === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                className={`flex flex-col rounded-xl border p-3 text-left transition-colors ${
                  selected
                    ? "border-on-surface bg-surface-container-low shadow-[0_8px_20px_rgba(17,24,39,0.05)]"
                    : "border-outline-variant bg-surface-container-low/40 hover:border-outline-variant/80"
                }`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[12px] font-bold uppercase tracking-[0.04em] text-on-surface">
                    {plan.label}
                  </span>
                  {"badge" in plan && plan.badge ? (
                    <span className="rounded-full bg-on-surface px-1.5 py-px font-mono text-[8px] font-semibold uppercase tracking-[0.06em] text-surface">
                      {plan.badge}
                    </span>
                  ) : null}
                  {plan.save ? (
                    <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.04em] text-[var(--signal-bullish)]">
                      {plan.save}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div className="font-mono text-[10px] leading-tight text-on-surface-variant">
                    {plan.period}
                    {"trial" in plan && plan.trial ? (
                      <span className="mt-0.5 block font-semibold text-[var(--signal-bullish)]">{plan.trial}</span>
                    ) : null}
                  </div>
                  <span className="flex items-baseline gap-1.5">
                    {"strike" in plan && plan.strike ? (
                      <span className="font-mono text-[11px] text-on-surface-variant line-through">{plan.strike}</span>
                    ) : null}
                    <span className="font-mono text-[28px] font-extrabold leading-none tracking-tight text-on-surface">
                      {plan.price}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3.5">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
            {trackedCount > 0 ? "What Pro unlocks for you" : "What you get with Pro"}
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-x-4">
            {contextLines.map((line) => (
              <li key={line.text} className="flex items-start gap-2.5">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-outline-variant bg-surface shadow-sm">
                  <AnimatedIcon name={line.icon} size={14} className="text-on-surface" aria-hidden />
                </span>
                <span className="pt-0.5 text-[12.5px] leading-snug text-on-surface">{line.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <ProCtaButton
            type="button"
            disabled={isLoading}
            onClick={() => void handleSubscribe(selectedPlan)}
            size="lg"
            fullWidth
            showStar
          >
            {isLoading
              ? user
                ? DEV_FAKE_SUBSCRIBE
                  ? "Activating Pro…"
                  : "Opening checkout…"
                : "Signing you in…"
              : user
                ? DEV_FAKE_SUBSCRIBE
                  ? `Activate Pro (dev) · ${activePlan.price}`
                  : market === "US"
                    ? "Start 3-day free trial"
                    : `Subscribe for ${activePlan.price}`
                : DEV_FAKE_SUBSCRIBE
                  ? "Sign in and activate Pro"
                  : market === "US"
                    ? "Sign in to start free trial"
                    : "Sign in and subscribe"}
          </ProCtaButton>
          <p className="text-center font-mono text-[10px] leading-relaxed text-on-surface-variant">
            {trialNote}
            {market === "US"
              ? `${activePlan.price} after trial · cancel anytime`
              : "Starts today · cancel anytime · 7-day refund"}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5 pt-0.5">
            {SUBSCRIBE_TRUST_STRIP.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-1 font-mono text-[10px] text-on-surface-variant">
                <AnimatedIcon name={item.icon} size={13} aria-hidden />
                {item.href ? (
                  <a href={item.href} className="hover:text-accent-terminal hover:underline">
                    {item.label}
                  </a>
                ) : (
                  item.label
                )}
              </span>
            ))}
          </div>
        </div>

        {error ? <p className="text-center text-[13px] font-medium text-[#ef4444]">{error}</p> : null}
      </section>
    </div>
  );
}
