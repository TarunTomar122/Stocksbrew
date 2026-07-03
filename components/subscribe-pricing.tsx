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
import { SUBSCRIBE_BENEFITS, buildSubscribeContextLines } from "@/lib/subscribe-benefits";

const DEV_FAKE_SUBSCRIBE = process.env.NODE_ENV === "development";

const PLANS_US = [
  {
    id: "monthly" as const,
    label: "Monthly",
    price: "$12",
    period: "per month",
    save: null,
  },
  {
    id: "yearly" as const,
    label: "Yearly",
    price: "$99",
    period: "per year",
    save: "Save 31%",
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
  const defaultPlan = plans.find((plan) => plan.badge) ?? plans[0];
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

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-8">
      <header className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant tint-warn px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b45309]">
          <span aria-hidden>★</span> stocksbrew Pro
        </span>
        <h1 className="font-mono text-[28px] font-extrabold leading-tight tracking-tight text-on-surface md:text-[32px]">
          Choose your plan
        </h1>
      </header>

      <section
        className="flex w-full flex-col gap-5 rounded-2xl border border-outline-variant bg-surface p-5 md:p-6"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {plans.map((plan) => {
            const selected = selectedPlan === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                className={`flex min-h-[132px] flex-col justify-between rounded-xl border p-4 text-left transition-colors ${
                  selected
                    ? "border-on-surface bg-surface-container-low shadow-[0_10px_28px_rgba(17,24,39,0.06)]"
                    : "border-outline-variant bg-surface-container-low/40 hover:border-outline-variant/80"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] font-bold uppercase tracking-[0.04em] text-on-surface">
                    {plan.label}
                  </span>
                  {"badge" in plan && plan.badge ? (
                    <span className="rounded-full bg-on-surface px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-surface">
                      {plan.badge}
                    </span>
                  ) : null}
                  {plan.save ? (
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--signal-bullish)]">
                      {plan.save}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="font-mono text-[11px] text-on-surface-variant">
                    {plan.period}
                    {"trial" in plan && plan.trial ? (
                      <span className="mt-1 block font-semibold text-[var(--signal-bullish)]">{plan.trial}</span>
                    ) : null}
                  </div>
                  <span className="flex items-baseline gap-2">
                    {"strike" in plan && plan.strike ? (
                      <span className="font-mono text-[12px] text-on-surface-variant line-through">{plan.strike}</span>
                    ) : null}
                    <span className="font-mono text-[32px] font-extrabold leading-none tracking-tight text-on-surface">
                      {plan.price}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div
          className="rounded-xl border p-4"
          style={{
            borderColor: "color-mix(in srgb, var(--signal-bullish) 20%, var(--outline-variant))",
            background: "color-mix(in srgb, var(--signal-bullish) 5%, var(--surface-container-low))",
          }}
        >
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
            {trackedCount > 0 ? "What Pro unlocks for your account" : "What you get with Pro"}
          </p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {contextLines.map((line) => (
              <li key={line.text} className="flex items-start gap-2.5 text-[13px] leading-snug text-on-surface">
                <span className="mt-px shrink-0 text-[15px] leading-none" aria-hidden>
                  {line.emoji}
                </span>
                {line.text}
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
                  : `Subscribe for ${activePlan.price}`
                : DEV_FAKE_SUBSCRIBE
                  ? "Sign in and activate Pro"
                  : "Sign in and subscribe"}
          </ProCtaButton>
          <p className="text-center font-mono text-[11px] text-on-surface-variant">
            {selectedPlan === "yearly" && market === "US"
              ? "Yearly includes 3 days free · cancel anytime"
              : "Monthly starts today · cancel anytime"}
          </p>
        </div>

        {error ? <p className="text-center text-[13px] font-medium text-[#ef4444]">{error}</p> : null}
      </section>
    </div>
  );
}
