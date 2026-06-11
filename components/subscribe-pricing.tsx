"use client";

import { useState } from "react";
import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { captureEvent } from "@/lib/posthog";
import {
  trackCheckoutClicked,
  trackCheckoutStarted,
  trackSubscribeSigninStarted,
  trackSubscribeSigninSucceeded,
} from "@/lib/product-analytics";

const SUBSCRIBE_BENEFITS = [
  {
    icon: "radar",
    title: "Unlimited Radar",
    body: "Track your full watchlist. Free stops at 3 stocks.",
  },
  {
    icon: "verified",
    title: "Clear calls",
    body: "Buy, hold, sell, or watch on every name, with the reasoning.",
  },
  {
    icon: "event_upcoming",
    title: "Pre-earnings setups",
    body: "Our read before the print, with a track record you can check.",
  },
  {
    icon: "hub",
    title: "Portfolio diagnosis",
    body: "Concentration, overlap, and the gaps you cannot see in your book.",
  },
  {
    icon: "bolt",
    title: "Live signal feed",
    body: "Anomalies, Reddit buzz, and email alerts when something moves.",
  },
  {
    icon: "cancel",
    title: "Cancel anytime",
    body: "One click. No questions asked.",
  },
];

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
  market = "US",
}: {
  isSubscribed: boolean;
  market?: "US" | "IN";
}) {
  const { user } = useUser();
  const plans = market === "IN" ? PLANS_IN : PLANS_US;
  const defaultPlan = plans.find((plan) => plan.badge) ?? plans[0];
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">(defaultPlan.id);
  const [loadingPlan, setLoadingPlan] = useState<"monthly" | "yearly" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isSubscribed) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#ecfdf5]">
          <span
            className="material-symbols-outlined text-[#10b981]"
            style={{ fontSize: 24, fontVariationSettings: "'wght' 600" }}
          >
            check_circle
          </span>
        </span>
        <p className="text-[16px] font-semibold text-[#111111]">You&apos;re already on Pro</p>
        <p className="text-[14px] text-[#6b7280]">All features are unlocked for your account.</p>
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
        const checkoutUrl = await startCheckout(period, market);
        trackCheckoutStarted({ period, market });
        window.location.href = checkoutUrl;
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
      const checkoutUrl = await startCheckout(period, market);
      trackCheckoutStarted({ period, market });
      window.location.href = checkoutUrl;
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
    <div className="flex w-full max-w-[920px] flex-col gap-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fef3c7] px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] uppercase text-[#92400e]">
          <span aria-hidden>★</span> stocksbrew Pro
        </span>
        <h1 className="max-w-[640px] text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#111111] md:text-[46px]">
          The call on every stock you own.
        </h1>
        <p className="max-w-lg text-[15px] leading-relaxed text-[#6b7280]">
          Pro reads the news, scores the setup, and tells you what to do every morning. Cheaper than a
          coffee. Cancel anytime.
        </p>
      </div>

      <section className="overflow-hidden rounded-[24px] border border-[#e5e7eb] bg-white shadow-[0_12px_40px_rgba(17,24,39,0.06)]">
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col gap-5 p-6 md:p-8 lg:p-10">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">
                What you get
              </p>
              <p className="text-[15px] text-[#374151]">
                Everything free covers the market feed. Pro points the same read at your stocks.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SUBSCRIBE_BENEFITS.map((benefit) => (
                <div key={benefit.title} className="flex gap-3 rounded-2xl bg-[#fafafa] px-4 py-3">
                  <span
                    aria-hidden
                    className="material-symbols-outlined mt-0.5 shrink-0 text-[#111111]"
                    style={{ fontSize: 20, fontVariationSettings: "'wght' 500" }}
                  >
                    {benefit.icon}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-semibold text-[#111111]">{benefit.title}</span>
                    <span className="text-[12px] leading-snug text-[#6b7280]">{benefit.body}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-5 bg-[#fafafa] p-6 md:p-8 lg:p-10">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">
                Pick your plan
              </p>
              <p className="text-[13px] text-[#6b7280]">Secure checkout via Dodo Payments.</p>
            </div>

            <div className="flex flex-col gap-2.5">
              {plans.map((plan) => {
                const selected = selectedPlan === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition-colors ${
                      selected
                        ? "border-[#111111] bg-white shadow-[0_8px_24px_rgba(17,24,39,0.06)]"
                        : "border-[#e5e7eb] bg-white/70 hover:border-[#d1d5db]"
                    }`}
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-semibold text-[#111111]">{plan.label}</span>
                        {"badge" in plan && plan.badge ? (
                          <span className="rounded-full bg-[#111111] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                            {plan.badge}
                          </span>
                        ) : null}
                        {plan.save ? (
                          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#10b981]">
                            {plan.save}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-[12px] text-[#9ca3af]">{plan.period}</span>
                    </div>
                    <div className="flex shrink-0 items-baseline gap-2">
                      <span className="text-[28px] font-semibold tracking-[-0.03em] text-[#111111]">
                        {plan.price}
                      </span>
                      {"strike" in plan && plan.strike ? (
                        <span className="text-[13px] font-medium text-[#9ca3af] line-through">
                          {plan.strike}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => void handleSubscribe(selectedPlan)}
                className="inline-flex h-[48px] w-full items-center justify-center rounded-full bg-[#111111] px-6 text-[14px] font-semibold tracking-tight text-white transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-wait disabled:opacity-60"
              >
                {isLoading
                  ? user
                    ? "Opening checkout…"
                    : "Signing you in…"
                  : user
                    ? `Subscribe for ${activePlan.price}`
                    : "Sign in and subscribe"}
              </button>
              <p className="text-center text-[11px] font-medium text-[#9ca3af]">
                Cancel anytime in one click
              </p>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <p className="text-center text-[13px] font-medium text-[#ef4444]">{error}</p>
      ) : null}
    </div>
  );
}
