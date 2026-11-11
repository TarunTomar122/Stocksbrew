"use client";

import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { useUser } from "@/lib/auth-context";
import { startDodoCheckout } from "@/lib/dodo-checkout-client";
import { trackCheckoutClicked, trackCheckoutFailed } from "@/lib/product-analytics";
import { signInWithGoogle } from "@/lib/sign-in";

export type PricingPeriod = "monthly" | "yearly";

/** "17" from the yearly note "... 17% less than paying monthly.", or null. */
function yearlySaving(note: string | undefined): string | null {
  return /(\d+)% less/.exec(note ?? "")?.[1] ?? null;
}

export type PlanPrice = {
  period: PricingPeriod;
  /** "$19" */
  price: string;
  /** "a month" */
  per: string;
  /** "Works out to $15.83 a month, 17% less than paying monthly." */
  note?: string;
};

const OUTLINE_LINK =
  "flex h-11 w-full items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--oa-fg)_22%,transparent)] bg-oa-card text-[15px] font-medium text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/** How many stocks get the full report, drawn: five dots on Free, a full row on Pro. */
function Coverage({ every }: { every: boolean }) {
  const dots = every ? 28 : 5;
  return (
    <div aria-hidden="true" className="mt-3 flex h-3 items-center gap-[5px] overflow-hidden">
      {Array.from({ length: dots }, (_, index) => (
        <span key={index} className={`block h-3 w-3 shrink-0 rounded-full bg-oa-primary`} />
      ))}
      {every ? null : (
        <>
          {Array.from({ length: 23 }, (_, index) => (
            <span key={`off-${index}`} className="block h-3 w-3 shrink-0 rounded-full border border-oa-muted-fg/40" />
          ))}
        </>
      )}
    </div>
  );
}

function Points({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 space-y-2 text-[14.5px] leading-[21px] text-oa-fg">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-[3px] size-4 shrink-0 text-oa-primary">
            <path d="m3 8.5 3.2 3L13 4.5" />
          </svg>
          <span className="text-pretty">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The plan choice, as two cards side by side (stacked on a phone): what each
 * costs, how many stocks get the full report (drawn as dots), the few things
 * that come with it, and one button. Exactly one filled button: Pro's. The
 * yearly switch sits on the Pro card, since only Pro has a price to switch.
 */
export function PlanCards({
  plan,
  market,
  prices,
  trialEligible,
  freePoints,
  proPoints,
}: {
  plan: "anon" | "free" | "pro";
  market: "US" | "IN";
  prices: PlanPrice[];
  /** Only promise a free trial to someone who can get one. */
  trialEligible: boolean;
  freePoints: string[];
  proPoints: string[];
}) {
  const { user } = useUser();
  const [period, setPeriod] = React.useState<PricingPeriod>(prices[0]?.period ?? "monthly");
  const [busy, setBusy] = React.useState<"free" | "pro" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const active = prices.find((price) => price.period === period) ?? prices[0];
  const yearly = prices.find((price) => price.period === "yearly");

  async function startFree() {
    setError(null);
    setBusy("free");
    try {
      if (!user) await signInWithGoogle({ surface: "subscribe_pricing" });
      window.location.href = "/watchlist";
    } catch {
      // the sign-in sheet reports its own errors
    } finally {
      setBusy(null);
    }
  }

  async function startPro() {
    if (!active) return;
    setError(null);
    setBusy("pro");
    trackCheckoutClicked({ period: active.period, market, signedIn: Boolean(user), surface: "pricing" });
    try {
      if (!user) await signInWithGoogle({ surface: "subscribe_pricing" });
      const url = await startDodoCheckout(active.period, market);
      window.location.assign(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      trackCheckoutFailed({ reason: message, surface: "pricing" });
    } finally {
      setBusy(null);
    }
  }

  const trial = trialEligible && market === "US";
  const terms = trial
    ? `Free for 3 days, then ${active?.price ?? ""} ${active?.per ?? ""}. Card needed.`.replace(/\s+/g, " ")
    : "Cancel in one click. Refund in the first seven days.";
  const periodSwitch =
    plan !== "pro" && prices.length > 1 ? (
      <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-md border border-oa-border bg-oa-bg p-0.5">
        {prices.map((price) => (
          <button
            key={price.period}
            type="button"
            role="radio"
            aria-checked={price.period === period}
            onClick={() => setPeriod(price.period)}
            className={`h-8 rounded px-2.5 text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] ${
              price.period === period ? "bg-oa-card text-oa-fg shadow-sm" : "text-oa-muted-fg hover:text-oa-fg"
            }`}
          >
            {price.period === "monthly" ? (
              "Monthly"
            ) : (
              <>
                Yearly
                {yearlySaving(price.note) ? <span className="ml-1 text-oa-primary">save {yearlySaving(price.note)}%</span> : null}
              </>
            )}
          </button>
        ))}
      </div>
    ) : null;

  const card = "oa-surface flex h-full min-w-0 flex-col border bg-oa-card p-5 sm:p-6";
  return (
    <div className="oa-card-grid grid grid-cols-1 gap-3 md:grid-cols-2">
      <section className={`${card} border-oa-border`} aria-labelledby="plan-free">
        <div className="flex min-h-9 items-center justify-between gap-2">
          <h2 id="plan-free" className="text-[17px] font-semibold leading-6 text-oa-fg">
            Free
          </h2>
          {plan === "free" ? <span className="text-[13px] text-oa-muted-fg">Your plan</span> : null}
        </div>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="oa-mono text-[44px] font-semibold leading-[52px] tracking-[-0.02em] text-oa-fg">$0</span>
          <span className="text-[14px] text-oa-muted-fg">forever</span>
        </p>
        <p className="mt-3 text-[16px] font-medium leading-6 text-oa-fg">The full report on 5 stocks you choose</p>
        <Coverage every={false} />
        <Points items={freePoints} />
        <div className="mt-auto pt-6">
          {plan === "anon" ? (
            <OaButton variant="outline" className="h-11 w-full text-[15px]" loading={busy === "free"} onClick={() => void startFree()}>
              Start free
            </OaButton>
          ) : (
            <a href="/watchlist" className={OUTLINE_LINK}>
              Open your stocks
            </a>
          )}
          <p className="mt-2 text-[13px] leading-[18px] text-oa-muted-fg">No card. Swap one of your five stocks each week.</p>
        </div>
      </section>

      <section className={`${card} border-[color-mix(in_srgb,var(--oa-primary)_55%,var(--oa-border))]`} aria-labelledby="plan-pro">
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
          <h2 id="plan-pro" className="text-[17px] font-semibold leading-6 text-oa-fg">
            Pro
          </h2>
          {plan === "pro" ? <span className="text-[13px] text-oa-muted-fg">Your plan</span> : periodSwitch}
        </div>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="oa-mono text-[44px] font-semibold leading-[52px] tracking-[-0.02em] text-oa-fg">{active?.price}</span>
          <span className="text-[14px] text-oa-muted-fg">{active?.per}</span>
        </p>
        {active?.period === "yearly" && active.note ? (
          <p className="text-[13px] leading-[18px] text-oa-muted-fg">{active.note}</p>
        ) : yearly && plan !== "pro" ? (
          <p className="text-[13px] leading-[18px] text-oa-muted-fg">
            Or {yearly.price} {yearly.per} if you pay yearly.
          </p>
        ) : null}
        <p className="mt-3 text-[16px] font-medium leading-6 text-oa-fg">The full report on every stock</p>
        <Coverage every />
        <Points items={proPoints} />
        <div className="mt-auto pt-6">
          {plan === "pro" ? (
            <a href="/profile" className={OUTLINE_LINK}>
              Manage your plan
            </a>
          ) : (
            <OaButton className="h-11 w-full text-[15px]" loading={busy === "pro"} onClick={() => void startPro()}>
              {trial ? "Try Pro free for 3 days" : "Get Pro"}
            </OaButton>
          )}
          {plan !== "pro" ? <p className="mt-2 text-pretty text-[13px] leading-[18px] text-oa-muted-fg">{terms}</p> : null}
          {error ? (
            <p role="alert" className="mt-2 text-[14px] text-signal-bearish">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
