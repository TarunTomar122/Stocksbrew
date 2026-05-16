"use client";

import { useState } from "react";
import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { posthog } from "@/lib/posthog";

const PRO_BULLETS = [
  "Unlimited stocks on your Radar (free is capped at 3)",
  "Per-stock AI verdict — buy / hold / sell, fundamentals scorecard, news-backed brief",
  "Portfolio diagnosis — concentration risks, clusters, opportunities, daily activity",
  "Market anomalies & email alerts — RSI extremes, earnings, breakouts when they fire",
  "Cancel anytime · one click · no questions asked",
];

const PLANS = [
  {
    id: "monthly" as const,
    tag: "Monthly",
    price: "$9",
    period: "/ month",
    strike: "$12",
    save: "Save 25%",
    highlight: false,
  },
  {
    id: "yearly" as const,
    tag: "Yearly",
    price: "$99",
    period: "/ year",
    strike: "$144",
    save: "Save 31%",
    highlight: true,
  },
];

async function startCheckout(period: "monthly" | "yearly"): Promise<string> {
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
    body: JSON.stringify({ period }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Checkout failed");
  if (!json.checkoutUrl) throw new Error("No checkout URL returned");

  return json.checkoutUrl;
}

export function SubscribePricing({ isSubscribed }: { isSubscribed: boolean }) {
  const { user } = useUser();
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
        <p className="text-[16px] font-semibold text-[#111111]">You're already on Pro 🎉</p>
        <p className="text-[14px] text-[#6b7280]">All features are unlocked for your account.</p>
      </div>
    );
  }

  async function handlePlanClick(period: "monthly" | "yearly") {
    setError(null);

    // Not signed in - sign in first, then retry
    if (!user) {
      setLoadingPlan(period);
      try {
        await signInWithGoogle();
        posthog.capture("subscribe_signin_started", { period });
        // Auth state is now updated; Firebase currentUser is available
        const checkoutUrl = await startCheckout(period);
        posthog.capture("checkout_started", { period });
        window.location.href = checkoutUrl;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setError(msg);
      } finally {
        setLoadingPlan(null);
      }
      return;
    }

    setLoadingPlan(period);
    try {
      const checkoutUrl = await startCheckout(period);
      posthog.capture("checkout_started", { period });
      window.location.href = checkoutUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
    } finally {
      setLoadingPlan(null);
    }
  }

  const anyLoading = loadingPlan !== null;

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Headline */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fef3c7] px-3 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase text-[#92400e]">
          <span aria-hidden>🚀</span> Launch-week pricing
        </span>
        <h1 className="text-[36px] md:text-[48px] font-semibold tracking-[-0.03em] text-[#111111] leading-[1.05]">
          Cheaper than a coffee.
        </h1>
        <p className="text-[15px] text-[#6b7280] max-w-md leading-relaxed">
          One plan, full access. Cancel anytime with one click - no questions asked.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-[780px] mx-auto">
        {PLANS.map((plan) => {
          const isLoading = loadingPlan === plan.id;
          return (
            <article
              key={plan.id}
              className={`relative flex flex-col gap-5 rounded-[28px] border bg-white p-7 md:p-8 shadow-[0_18px_50px_rgba(17,24,39,0.04)] ${
                plan.highlight
                  ? "border-[#111111] shadow-[0_24px_70px_rgba(17,24,39,0.10)]"
                  : "border-[#e5e7eb]"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-[#111111] px-3 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase text-white">
                  Best value
                </span>
              )}

              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">
                  {plan.tag}
                </span>
                <span className="text-[10px] font-semibold tracking-[0.06em] uppercase text-[#10b981]">
                  {plan.save}
                </span>
              </div>

              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-[48px] md:text-[56px] font-semibold tracking-[-0.03em] text-[#111111] leading-none">
                  {plan.price}
                </span>
                <span className="text-[16px] font-medium text-[#6b7280]">{plan.period}</span>
                <span className="text-[15px] font-medium text-[#9ca3af] line-through tabular-nums">
                  {plan.strike}
                </span>
              </div>

              <ul className="flex flex-col gap-2">
                {PRO_BULLETS.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-[13px] text-[#374151]">
                    <span
                      aria-hidden
                      className="material-symbols-outlined text-[#10b981] mt-0.5"
                      style={{ fontSize: 18, fontVariationSettings: "'wght' 600" }}
                    >
                      check_circle
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-2 pt-2 border-t border-[#f3f4f6] mt-auto">
                <button
                  type="button"
                  disabled={anyLoading}
                  onClick={() => handlePlanClick(plan.id)}
                  className={`inline-flex w-full items-center justify-center h-[48px] px-6 rounded-full text-[14px] font-semibold tracking-tight transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-wait ${
                    plan.highlight
                      ? "bg-[#111111] text-white"
                      : "bg-white text-[#111111] border border-[#111111]"
                  }`}
                >
                  {isLoading
                    ? (user ? "Opening checkout…" : "Signing you in…")
                    : user
                      ? "Subscribe now →"
                      : "Sign in & subscribe →"}
                </button>
                <span className="text-[11px] font-medium text-[#9ca3af] text-center">
                  Cancel anytime · one click
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {error && (
        <p className="text-center text-[13px] text-[#ef4444] font-medium">{error}</p>
      )}
    </div>
  );
}
