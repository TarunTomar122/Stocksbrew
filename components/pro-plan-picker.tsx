"use client";

import { AnimatedIcon } from "@/components/animated-icon";
import Link from "next/link";
import { useState } from "react";

import { useUser } from "@/lib/auth-context";
import { trackLandingCtaClicked } from "@/lib/product-analytics";
import { US_PRO_MONTHLY, US_PRO_YEARLY, US_YEARLY_SAVE_PCT } from "@/lib/pricing";
import { signInWithGoogle, syncServerSession } from "@/lib/sign-in";

const PLANS = {
  monthly: {
    price: US_PRO_MONTHLY,
    suffix: "/month",
    detail: "Billed monthly",
    trial: "3 days free",
  },
  yearly: {
    price: US_PRO_YEARLY,
    suffix: "/year",
    detail: `$${(US_PRO_YEARLY / 12).toFixed(2)}/mo billed annually`,
    trial: "3 days free",
    save: `Save ${US_YEARLY_SAVE_PCT}%`,
  },
} as const;

const COMPARE_ROWS = [
  { label: "Track stocks on Radar", free: "Up to 3 names", pro: "Unlimited" },
  { label: "Detailed calls, zones, drivers, and risks", free: "Preview", pro: true },
  { label: "Stocksbrew target price", free: false, pro: true },
  { label: "Automatic earnings and zone alerts", free: false, pro: true },
  { label: "Manual price alerts", free: false, pro: true },
  { label: "Current stock context for your AI", free: false, pro: true },
] as const;

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="shrink-0 text-landing-brand">
      <path
        fill="currentColor"
        d="M6.5 11.5 3.5 8.5l1-1 2 2 5-5 1 1-6 6z"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="shrink-0 text-on-surface-variant/45">
      <path
        fill="currentColor"
        d="M4.5 4.5 8 8l3.5-3.5 1 1L9 9l3.5 3.5-1 1L8 10l-3.5 3.5-1-1L7 9 3.5 5.5z"
      />
    </svg>
  );
}

function FeatureRow({ label, value }: { label: string; value: boolean | string }) {
  const included = value !== false;
  return (
    <li className={`pro-compare-feature ${included ? "" : "pro-compare-feature-muted"}`}>
      {included ? <CheckIcon /> : <XIcon />}
      <span>
        {label}
        {typeof value === "string" ? (
          <span className="text-on-surface-variant"> · {value}</span>
        ) : null}
      </span>
    </li>
  );
}

function FreeRadarCta() {
  const { user } = useUser();
  const [busy, setBusy] = useState(false);

  async function signInThenRadar() {
    trackLandingCtaClicked({
      surface: "landing_pro_preview",
      signedIn: false,
      destination: "/watchlist",
    });
    setBusy(true);
    try {
      await signInWithGoogle({ surface: "landing_pro_preview" });
    } catch {
      setBusy(false);
      return;
    }
    try {
      await syncServerSession();
    } catch {
      // AuthProvider may still set cookie; continue to Radar
    }
    window.location.assign("/watchlist");
  }

  if (user) {
    return (
      <Link
        href="/watchlist"
        className="pro-compare-secondary-cta"
        onClick={() =>
          trackLandingCtaClicked({
            surface: "landing_pro_preview",
            signedIn: true,
            destination: "/watchlist",
          })
        }
      >
        Start on Radar
        <span aria-hidden>→</span>
      </Link>
    );
  }

  return (
    <button type="button" disabled={busy} onClick={() => void signInThenRadar()} className="pro-compare-secondary-cta">
      {busy ? "Signing in…" : "Sign in & start on Radar"}
      {!busy ? <span aria-hidden>→</span> : null}
    </button>
  );
}

export function ProPlanPicker() {
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");
  const active = PLANS[plan];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
        <div className="pro-billing-toggle" role="group" aria-label="Billing period">
          <button
            type="button"
            aria-pressed={plan === "monthly"}
            onClick={() => setPlan("monthly")}
            className={plan === "monthly" ? "pro-billing-toggle-active" : ""}
          >
            Monthly
          </button>
          <button
            type="button"
            aria-pressed={plan === "yearly"}
            onClick={() => setPlan("yearly")}
            className={plan === "yearly" ? "pro-billing-toggle-active" : ""}
          >
            Yearly
          </button>
        </div>
        {plan === "yearly" ? (
          <span className="pro-billing-save-note">≈ 2 months free</span>
        ) : (
          <span className="pro-billing-save-note pro-billing-save-note-muted">Switch to yearly to save {US_YEARLY_SAVE_PCT}%</span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="pro-compare-card">
          <p className="pro-compare-tier">Free</p>
          <p className="pro-compare-price">
            $0
            <span className="pro-compare-price-suffix">/forever</span>
          </p>
          <p className="pro-compare-detail">No card required</p>

          <ul className="pro-compare-features">
            {COMPARE_ROWS.map((row) => (
              <FeatureRow key={row.label} label={row.label} value={row.free} />
            ))}
          </ul>

          <FreeRadarCta />
        </div>

        <div className="pro-compare-card pro-compare-card-highlight">
          <div className="flex items-center gap-2">
            <p className="pro-compare-tier">Pro</p>
            <span className="pro-plan-trial-pill">{active.trial}</span>
          </div>
          <p className="pro-compare-price">
            ${active.price}
            <span className="pro-compare-price-suffix">{active.suffix}</span>
          </p>
          <p className="pro-compare-detail">
            {active.detail}
            {plan === "yearly" ? (
              <span className="ml-1.5 font-semibold text-landing-brand">{PLANS.yearly.save}</span>
            ) : null}
          </p>

          <ul className="pro-compare-features">
            {COMPARE_ROWS.map((row) => (
              <FeatureRow key={row.label} label={row.label} value={row.pro} />
            ))}
          </ul>

          <Link href={`/subscribe?plan=${plan}`} className="pro-plan-cta">
            Start 3-day free trial
            <span aria-hidden>→</span>
          </Link>
          <div className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-on-surface-variant">
            <AnimatedIcon name="lock" size={14} className="text-[14px]" />
            Secure checkout · cancel anytime
          </div>
        </div>
      </div>

      <div className="pro-compare-social mx-auto mt-10 max-w-2xl rounded-2xl border border-outline-variant bg-surface-container-low px-5 py-4 text-center">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-landing-brand">
          One Pro workflow
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">
          Read the call and target, add the stock to Radar, then let alerts bring you back when the setup changes.
        </p>
      </div>
    </div>
  );
}
