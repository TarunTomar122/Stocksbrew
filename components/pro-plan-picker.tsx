"use client";

import { AnimatedIcon } from "@/components/animated-icon";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { getFirebaseAuth } from "@/lib/firebase-client";
import { useUser } from "@/lib/auth-context";
import { trackLandingCtaClicked } from "@/lib/product-analytics";
import { US_PRO_MONTHLY, US_PRO_YEARLY, US_YEARLY_SAVE_PCT } from "@/lib/pricing";
import { signInWithGoogle } from "@/lib/sign-in";

const PLANS = {
  monthly: { price: US_PRO_MONTHLY, suffix: "/month", detail: "Billed monthly" },
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
  { label: "Buy, hold, sell, or watch calls", free: true, pro: true },
  { label: "Email alerts when setups shift", free: false, pro: true },
  { label: "Pre-earnings setups", free: false, pro: true },
  { label: "Portfolio crowding report", free: false, pro: true },
  { label: "Reddit & news reads on your book", free: "Preview", pro: true },
] as const;

const SOCIAL_AVATARS = [
  "https://randomuser.me/api/portraits/men/32.jpg",
  "https://randomuser.me/api/portraits/women/65.jpg",
  "https://randomuser.me/api/portraits/men/45.jpg",
  "https://randomuser.me/api/portraits/women/44.jpg",
  "https://randomuser.me/api/portraits/men/22.jpg",
];

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

async function syncServerSession(): Promise<void> {
  const u = getFirebaseAuth().currentUser;
  if (!u) return;
  const idToken = await u.getIdToken();
  await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
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
  const [plan, setPlan] = useState<"monthly" | "yearly">("yearly");
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
            {plan === "yearly" ? <span className="pro-plan-trial-pill">{PLANS.yearly.trial}</span> : null}
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
            {plan === "yearly" ? "Start 3-day free trial" : "Activate Pro"}
            <span aria-hidden>→</span>
          </Link>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-on-surface-variant">
            <AnimatedIcon name="lock" size={14} className="text-[14px]" />
            Secure checkout · cancel anytime
          </p>
        </div>
      </div>

      <div className="pro-compare-social mt-10">
        <div className="flex items-center justify-center">
          {SOCIAL_AVATARS.map((url) => (
            <div
              key={url}
              className="relative -ml-2.5 first:ml-0 h-9 w-9 overflow-hidden rounded-full border-2 border-background bg-surface-container"
            >
              <Image src={url} alt="" width={36} height={36} className="h-full w-full object-cover" unoptimized />
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-[13px] text-on-surface-variant">
          Used by traders who wanted a clearer call than another tab spiral
        </p>
      </div>
    </div>
  );
}
