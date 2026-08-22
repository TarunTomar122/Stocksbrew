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
  trackSubscriptionConverted,
} from "@/lib/product-analytics";
import { ProBenefitsGrid } from "@/components/pro-benefits-grid";
import { ProWelcomePanel } from "@/components/pro-welcome-panel";
import { StartFreeButton } from "@/components/oa/start-free-button";
import { AnimatedIcon } from "@/components/animated-icon";
import { SUBSCRIBE_BENEFITS, PRO_POINTS } from "@/lib/subscribe-benefits";
import { US_PRO_MONTHLY_LABEL, US_PRO_YEARLY_LABEL, US_YEARLY_SAVE_PCT } from "@/lib/pricing";
import { startDodoCheckout } from "@/lib/dodo-checkout-client";

const DEV_FAKE_SUBSCRIBE = process.env.NODE_ENV === "development";

const PLANS_US = [
  {
    id: "monthly" as const,
    label: "Monthly",
    price: US_PRO_MONTHLY_LABEL,
    period: "/mo",
    save: null as string | null,
    trial: "3 days free",
  },
];

const PLANS_IN = [
  {
    id: "monthly" as const,
    label: "Monthly",
    price: "₹99",
    period: "/mo",
    strike: "₹149",
    save: "Save 33%",
    trial: null as string | null,
  },
];

const PRO_FEATURES = [
  "Unlimited tracked stocks",
  "Calls, price zones and targets",
  "Earnings and price-level alerts",
  "Use it inside your AI agent",
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
  const selectedPlan = "monthly" as const;
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
          const checkoutUrl = await startDodoCheckout(period, market);
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
        const checkoutUrl = await startDodoCheckout(period, market);
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
        <div className="mx-auto w-full max-w-[560px] rounded-[22px] border border-oa-border bg-oa-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.06)] md:p-10">
          <ProWelcomePanel variant="page" />
        </div>
      );
    }

    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 py-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-oa-accent">
            <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-6">
              <path d="m5 13 4 4L19 7" />
            </svg>
          </span>
          <p className="text-base font-medium text-oa-fg">You&apos;re on Pro</p>
          <p className="text-sm text-oa-muted-fg">Everything below is included with your plan.</p>
        </div>
        <ProBenefitsGrid benefits={SUBSCRIBE_BENEFITS.filter((b) => b.title !== "Cancel anytime")} />
      </div>
    );
  }

  const activePlan = plans.find((plan) => plan.id === selectedPlan) ?? plans[0];
  const isLoading = loadingPlan !== null;

  const ctaLabel = isLoading
    ? user
      ? DEV_FAKE_SUBSCRIBE
        ? "Activating Pro…"
        : "Opening checkout…"
      : "Signing you in…"
    : user
      ? DEV_FAKE_SUBSCRIBE
        ? `Activate Pro (dev)`
        : market === "US"
          ? "Start 3-day free trial"
          : `Subscribe for ${activePlan.price}`
      : DEV_FAKE_SUBSCRIBE
        ? "Sign in and activate Pro"
        : market === "US"
          ? "Start your 3-day free trial"
          : "Sign in and subscribe";

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-10">
      <header className="flex flex-col items-center gap-4 text-center">
        <p className="text-xs uppercase tracking-[0.12em] text-oa-muted-fg">Pricing</p>
        <h1 className="max-w-[560px] text-balance text-[26px] font-medium leading-tight tracking-tight text-oa-fg sm:text-3xl">
          Pro when you're ready to follow more names.
        </h1>
        {trackedCount > 0 ? (
          <p className="text-sm tabular-nums text-oa-muted-fg">
            You&apos;re tracking {trackedCount} {trackedCount === 1 ? "stock" : "stocks"} right now.
          </p>
        ) : null}
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Free plate */}
        <div className="flex flex-col gap-5 rounded-[22px] border border-oa-border bg-oa-bg p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-medium tracking-tight text-oa-fg">Free</h2>
            <p className="flex items-baseline gap-1.5">
              <span className="text-[28px] font-medium leading-none tracking-tight tabular-nums text-oa-fg">$0</span>
              <span className="text-sm text-oa-muted-fg">forever</span>
            </p>
          </div>
          <ul className="flex flex-col gap-2.5">
            {["Search any US stock", "Plain-English briefs", "Track 3 stocks"].map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-oa-fg/80">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 size-4 shrink-0 text-oa-muted-fg">
                  <path d="m5 13 4 4L19 7" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
          <StartFreeButton surface="pricing_free" variant="secondary" className="mt-auto w-full" />
        </div>

        {/* Pro plate */}
        <div className="flex flex-col gap-5 rounded-[22px] border border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-oa-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[17px] font-medium tracking-tight text-oa-fg">Pro</h2>
              {"save" in activePlan && activePlan.save ? (
                <span className="rounded-full bg-oa-accent px-2.5 py-0.5 text-xs font-medium text-oa-fg">{activePlan.save}</span>
              ) : null}
            </div>
            <p className="flex items-baseline gap-1.5">
              <span className="text-[28px] font-medium leading-none tracking-tight tabular-nums text-oa-fg">{activePlan.price}</span>
              <span className="text-sm text-oa-muted-fg">{activePlan.period}</span>
              {"strike" in activePlan && activePlan.strike ? (
                <span className="ml-1 text-sm text-oa-muted-fg line-through tabular-nums">{activePlan.strike}</span>
              ) : null}
            </p>
          </div>
          <ul className="flex flex-col gap-3.5">
            {PRO_POINTS.map((point) => (
              <li key={point.icon} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-oa-accent text-oa-fg/70 shadow-[0_1px_2px_rgba(0,0,0,0.06)] [&_svg]:size-4"
                >
                  <AnimatedIcon name={point.icon} size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-oa-fg">{point.title}</p>
                  <p className="mt-0.5 text-[13px] text-oa-muted-fg">{point.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void handleSubscribe(selectedPlan)}
            className="mt-auto inline-flex h-11 items-center justify-center rounded-full bg-oa-primary px-5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary)_88%,black)] active:translate-y-px active:scale-[0.98] disabled:opacity-50"
          >
            {ctaLabel}
          </button>
        </div>
      </section>

      <section className="flex flex-col items-center gap-1.5 text-center">
        <p className="text-[13px] leading-relaxed text-oa-muted-fg">
          {market === "US"
            ? `${activePlan.trial ?? "3 days free"}. Then ${activePlan.price}${activePlan.period}. Cancel anytime, keep access until the period ends.`
            : "Starts today. Cancel anytime."}
        </p>
        <p className="text-[13px] leading-relaxed text-oa-muted-fg">7-day refund · no questions asked.</p>
        {error ? <p className="mt-1 text-[13px] font-medium text-red-600">{error}</p> : null}
      </section>

      <section className="flex flex-col gap-5 rounded-[22px] border border-oa-border bg-oa-bg p-6 sm:p-8" aria-labelledby="pro-includes">
        <h2 id="pro-includes" className="text-[17px] font-medium tracking-tight text-oa-fg">
          What Pro includes
        </h2>
        <ProBenefitsGrid benefits={SUBSCRIBE_BENEFITS} />
      </section>
    </div>
  );
}
