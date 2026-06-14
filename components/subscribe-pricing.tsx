"use client";

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
import { SUBSCRIBE_BENEFITS } from "@/lib/subscribe-benefits";

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

async function devActivateSubscription(
  period: "monthly" | "yearly",
): Promise<string> {
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
}: {
  isSubscribed: boolean;
  /** True when returning from checkout or dev activation. */
  justSubscribed?: boolean;
  market?: "US" | "IN";
}) {
  const { user } = useUser();
  const plans = market === "IN" ? PLANS_IN : PLANS_US;
  const defaultPlan = plans.find((plan) => plan.badge) ?? plans[0];
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">(defaultPlan.id);
  const [loadingPlan, setLoadingPlan] = useState<"monthly" | "yearly" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isSubscribed) {
    if (justSubscribed) {
      return (
        <div className="w-full max-w-[760px] rounded-[24px] border border-[#e5e7eb] bg-white p-6 md:p-10 shadow-[0_12px_40px_rgba(17,24,39,0.06)]">
          <ProWelcomePanel variant="page" />
        </div>
      );
    }

    return (
      <div className="flex w-full max-w-[640px] flex-col gap-6 py-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#ecfdf5]">
            <span
              className="material-symbols-outlined text-[#10b981]"
              style={{ fontSize: 24, fontVariationSettings: "'wght' 600" }}
            >
              check_circle
            </span>
          </span>
          <p className="text-[16px] font-semibold text-[#111111]">You&apos;re on Pro</p>
          <p className="text-[14px] text-[#6b7280]">Everything below is included with your plan.</p>
        </div>
        <ProBenefitsGrid benefits={SUBSCRIBE_BENEFITS.filter((b) => b.title !== "Cancel anytime")} />
      </div>
    );
  }

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

  const activePlan = plans.find((plan) => plan.id === selectedPlan) ?? plans[0];
  const isLoading = loadingPlan !== null;

  return (
    <div className="flex w-full max-w-[760px] flex-col gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fef3c7] px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] uppercase text-[#92400e]">
          <span aria-hidden>★</span> stocksbrew Pro
        </span>
        <h1 className="max-w-[640px] text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#111111] md:text-[46px]">
          Know what to do with your stocks.
        </h1>
        <p className="max-w-lg text-[15px] leading-relaxed text-[#6b7280]">
          Clear calls, move explanations, Reddit/news reads, and portfolio diagnosis.
        </p>
      </div>

      <section className="flex flex-col gap-5 rounded-[28px] border border-[#e5e7eb] bg-white p-5 shadow-[0_18px_60px_rgba(17,24,39,0.06)] md:p-7">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {plans.map((plan) => {
            const selected = selectedPlan === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                className={`flex min-h-[132px] flex-col justify-between rounded-3xl border p-5 text-left transition-colors ${
                  selected
                    ? "border-[#111111] bg-white shadow-[0_14px_36px_rgba(17,24,39,0.08)]"
                    : "border-[#e5e7eb] bg-[#fafafa] hover:border-[#d1d5db]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[17px] font-semibold text-[#111111]">{plan.label}</span>
                  {"badge" in plan && plan.badge ? (
                    <span className="rounded-full bg-[#111111] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-white">
                      {plan.badge}
                    </span>
                  ) : null}
                  {plan.save ? (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#10b981]">
                      {plan.save}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-end justify-between gap-3">
                  <span className="text-[13px] text-[#9ca3af]">
                    {plan.period}
                    {"trial" in plan && plan.trial ? (
                      <span className="block pt-1 font-semibold text-[#10b981]">{plan.trial}</span>
                    ) : null}
                  </span>
                  <span className="flex items-baseline gap-2">
                    {"strike" in plan && plan.strike ? (
                      <span className="text-[13px] font-medium text-[#9ca3af] line-through">
                        {plan.strike}
                      </span>
                    ) : null}
                    <span className="text-[38px] font-semibold leading-none tracking-[-0.04em] text-[#111111]">
                      {plan.price}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
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
          <p className="text-center text-[12px] font-medium text-[#9ca3af]">
            {selectedPlan === "yearly" && market === "US"
              ? "Yearly includes 3 days free. Cancel anytime."
              : "Monthly starts today. Cancel anytime."}
          </p>
        </div>
      </section>

      {error ? (
        <p className="text-center text-[13px] font-medium text-[#ef4444]">{error}</p>
      ) : null}
    </div>
  );
}
