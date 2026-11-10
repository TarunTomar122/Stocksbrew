"use client";

import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { useUser } from "@/lib/auth-context";
import { startDodoCheckout } from "@/lib/dodo-checkout-client";
import { trackCheckoutClicked, trackCheckoutFailed } from "@/lib/product-analytics";
import { signInWithGoogle } from "@/lib/sign-in";

export type PricingPeriod = "monthly" | "yearly";

export type PlanPrice = {
  period: PricingPeriod;
  /** "$19" */
  price: string;
  /** "a month" */
  per: string;
  /** "Billed $190 once a year. Works out to $15.83 a month." */
  note?: string;
};

const OUTLINE_LINK =
  "flex h-10 w-full items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--oa-fg)_22%,transparent)] bg-oa-card text-[14px] font-medium text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/**
 * Both plans in one grid, the way the best pricing pages do it: the plan
 * heads (name, price, one button each) sit on top of the same columns as the
 * feature rows, so a reader compares straight down. The rows are rendered on
 * the server from the entitlements table and passed in as `children`
 * (`<tbody>` groups). Exactly one filled button: Pro's.
 */
export function PricingGrid({
  plan,
  market,
  prices,
  trialEligible,
  children,
}: {
  plan: "anon" | "free" | "pro";
  market: "US" | "IN";
  prices: PlanPrice[];
  /** Only promise a free trial to someone who can get one. */
  trialEligible: boolean;
  /** `<tbody>` groups, three cells per row: feature, Free, Pro. */
  children: React.ReactNode;
}) {
  const { user } = useUser();
  const [period, setPeriod] = React.useState<PricingPeriod>(
    prices[0]?.period ?? "monthly",
  );
  const [busy, setBusy] = React.useState<"free" | "pro" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // On a phone only the first group of rows shows until asked: the plan
  // differences that matter most, then everything on tap.
  const [allRows, setAllRows] = React.useState(false);
  const active = prices.find((price) => price.period === period) ?? prices[0];

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
    trackCheckoutClicked({
      period: active.period,
      market,
      signedIn: Boolean(user),
      surface: "pricing",
    });
    try {
      if (!user) await signInWithGoogle({ surface: "subscribe_pricing" });
      const url = await startDodoCheckout(active.period, market);
      window.location.assign(url);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      trackCheckoutFailed({ reason: message, surface: "pricing" });
    } finally {
      setBusy(null);
    }
  }

  const trial = trialEligible && market === "US";
  const proCta = trial ? "Try Pro free for 3 days" : "Get Pro";
  const periodSwitch =
    plan !== "pro" && prices.length > 1 ? (
      <div
        role="radiogroup"
        aria-label="Billing period"
        className="inline-flex rounded-md border border-oa-border bg-oa-bg p-0.5"
      >
        {prices.map((price) => (
          <button
            key={price.period}
            type="button"
            role="radio"
            aria-checked={price.period === period}
            onClick={() => setPeriod(price.period)}
            className={`h-8 rounded px-2.5 text-[14px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] sm:px-3 ${
              price.period === period
                ? "bg-oa-card text-oa-fg shadow-sm"
                : "text-oa-muted-fg hover:text-oa-fg"
            }`}
          >
            {price.period === "monthly" ? "Monthly" : "Yearly"}
          </button>
        ))}
      </div>
    ) : null;
  const planHead =
    "px-2 pb-5 pt-5 text-left align-top font-normal sm:px-5 sm:pt-6";

  return (
    <>
      {periodSwitch ? (
        <div className="mb-3 px-2 sm:hidden">{periodSwitch}</div>
      ) : null}
      <section className="oa-surface overflow-clip border border-oa-border bg-oa-card">
        <table className={`w-full table-fixed border-collapse ${allRows ? "" : "max-sm:[&>tbody:nth-of-type(n+2)]:hidden"}`}>
          <colgroup>
            <col />
            <col className="w-[7.25rem] sm:w-[14rem] lg:w-[17rem]" />
            <col className="w-[7.25rem] bg-[color-mix(in_srgb,var(--oa-primary)_4%,transparent)] sm:w-[14rem] lg:w-[17rem]" />
          </colgroup>
          <thead>
            <tr className="border-b border-oa-border">
              <td className="px-3 pb-5 pt-5 align-top sm:px-5 sm:pt-6">
                <span className="block text-[14px] leading-5 text-oa-muted-fg sm:hidden">
                  Both plans read every stock.
                </span>
                <span className="max-sm:hidden">{periodSwitch}</span>
                <p className="mt-3 max-w-[22rem] text-pretty text-[14px] leading-[22px] text-oa-muted-fg max-sm:hidden">
                  {active?.note ??
                    "Both plans read every stock. Pro covers every stock you own in full, not just five."}
                </p>
              </td>

              <th scope="col" className={planHead}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[17px] font-semibold leading-6 text-oa-fg">
                    Free
                  </span>
                  {plan === "free" ? (
                    <span className="text-[13px] text-oa-muted-fg max-sm:hidden">
                      Your plan
                    </span>
                  ) : null}
                </span>
                <span className="oa-mono mt-2 block text-[40px] font-semibold leading-[48px] tracking-[-0.02em] text-oa-fg sm:text-[52px] sm:leading-[60px]">
                  $0
                </span>
                <span className="block min-h-5 text-[14px] leading-5 text-oa-muted-fg">
                  forever
                </span>
                <span className="mt-4 block">
                  {plan === "anon" ? (
                    <OaButton
                      variant="outline"
                      className="h-10 w-full text-[14px]"
                      loading={busy === "free"}
                      onClick={() => void startFree()}
                    >
                      Start free
                    </OaButton>
                  ) : (
                    <a href="/watchlist" className={OUTLINE_LINK}>
                      <span className="sm:hidden">Portfolio</span>
                      <span className="max-sm:hidden">Open your portfolio</span>
                    </a>
                  )}
                </span>
              </th>

              <th scope="col" className={planHead}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[17px] font-semibold leading-6 text-oa-fg">
                    Pro
                  </span>
                  {plan === "pro" ? (
                    <span className="text-[13px] text-oa-muted-fg max-sm:hidden">
                      Your plan
                    </span>
                  ) : null}
                </span>
                <span className="oa-mono mt-2 block text-[40px] font-semibold leading-[48px] tracking-[-0.02em] text-oa-fg sm:text-[52px] sm:leading-[60px]">
                  {active?.price}
                </span>
                <span className="block min-h-5 text-[14px] leading-5 text-oa-muted-fg">
                  {active?.per}
                </span>
                <span className="mt-4 block">
                  {plan === "pro" ? (
                    <a href="/profile" className={OUTLINE_LINK}>
                      <span className="sm:hidden">Manage</span>
                      <span className="max-sm:hidden">Manage your plan</span>
                    </a>
                  ) : (
                    <OaButton
                      className="h-10 w-full text-[14px]"
                      loading={busy === "pro"}
                      onClick={() => void startPro()}
                    >
                      <span className="sm:hidden">
                        {trial ? "Try 3 days free" : "Get Pro"}
                      </span>
                      <span className="max-sm:hidden">{proCta}</span>
                    </OaButton>
                  )}
                </span>
                {plan !== "pro" ? (
                  <span className="mt-2 block text-pretty text-[13px] leading-[18px] text-oa-muted-fg">
                    {trial
                      ? `3 days free, then ${active?.price ?? ""} ${active?.per ?? ""}. Card needed.`.replace(/\s+/g, " ")
                      : "Cancel in one click. Refund in the first seven days."}
                  </span>
                ) : null}
                {error ? (
                  <span
                    role="alert"
                    className="mt-2 block text-[14px] text-signal-bearish"
                  >
                    {error}
                  </span>
                ) : null}
              </th>
            </tr>
          </thead>
          {children}
        </table>
        <button
          type="button"
          aria-expanded={allRows}
          onClick={() => setAllRows((value) => !value)}
          className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-oa-border text-[14px] font-medium text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent sm:hidden"
        >
          {allRows ? "Show less" : "Show everything both plans include"}
          <span aria-hidden="true" className={`text-oa-muted-fg transition-transform ${allRows ? "rotate-180" : ""}`}>
            ▾
          </span>
        </button>
        {plan !== "pro" || active?.note ? (
          <p className="border-t border-oa-border px-3 py-3 text-[14px] leading-5 text-oa-muted-fg sm:hidden">
            {[
              active?.note,
              plan !== "pro" && !trial ? "Cancel Pro in one click; refund in the first seven days." : null,
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
        ) : null}
      </section>
    </>
  );
}
