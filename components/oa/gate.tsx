"use client";

import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { useUser } from "@/lib/auth-context";
import { lockCopy, nextStep, type FeatureId, type Plan } from "@/lib/entitlements";
import { US_PRO_MONTHLY } from "@/lib/pricing";
import { trackLimitHit, trackPaywallShown, trackPaywallUnlockClicked } from "@/lib/product-analytics";
import { signInWithGoogle } from "@/lib/sign-in";
import { useProCheckout } from "@/lib/use-pro-checkout";
import Link from "next/link";

/**
 * The one lock in the product. Every limit a person can hit renders through
 * these, with words from lib/entitlements.ts, so a locked thing always says
 * what it is, what the free plan already includes, and what the next step is.
 *
 * Never pass locked data into these. The server sends a count at most.
 */

function LockGlyph({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

function useGate(feature: FeatureId, plan: Plan, ticker?: string) {
  const { user } = useUser();
  const { openCheckout, busy } = useProCheckout("paywall");
  const [signingIn, setSigningIn] = React.useState(false);
  const step = nextStep(feature, plan);

  React.useEffect(() => {
    if (step === null) return;
    trackPaywallShown({ surface: "entitlement", feature, ticker, signedIn: plan !== "anon", step });
  }, [feature, plan, ticker, step]);

  async function act() {
    trackPaywallUnlockClicked({ surface: "entitlement", feature, ticker, signedIn: Boolean(user), step: step ?? undefined });
    if (step === "sign_in" && !user) {
      setSigningIn(true);
      try {
        await signInWithGoogle({ surface: "paywall" });
        window.location.reload();
      } catch {
        // the sign-in sheet reports its own errors
      } finally {
        setSigningIn(false);
      }
      return;
    }
    await openCheckout({ feature });
  }

  return { step, act, busy: busy || signingIn };
}

/**
 * A signed-out lock's button says what signing in gets you here ("Read the full report"), never a second "Start free":
 * the shell's Start free (the sidebar, or the top bar on a phone) is the view's one (judges, ship 39). It still signs in.
 */
const SIGN_IN_ACTION: Partial<Record<FeatureId, string>> = {
  tracked_stocks: "Track this stock",
  covered_stocks: "Cover your stocks",
  stock_zones: "Read the full report",
  briefing_personal: "See your whole briefing",
  reason_watch: "Watch your reasons",
  portfolio_analytics: "See your analytics",
  practice_account: "Open a practice account",
  pre_earnings_read: "Open the pre-earnings read",
  saved_screens: "Save this screen",
  deep_research: "Run more research",
  ask: "Ask more questions",
  followed_sources: "Follow more investors",
  backtest: "Run more backtests",
  agents: "Run this agent",
  agent_events: "Run this agent",
  price_alerts: "Keep more alerts",
  email_market: "Get the market email",
  email_briefing: "Get the daily email",
};

function ctaLabel(feature: FeatureId, step: "sign_in" | "upgrade" | null, trialEligible: boolean): string {
  if (step === "sign_in") return SIGN_IN_ACTION[feature] ?? "Sign in to see it";
  return trialEligible ? "Try Pro free for 3 days" : `Get Pro for $${US_PRO_MONTHLY} a month`;
}

/** A whole feature or section that this plan does not include. */
export function LockCard({
  feature,
  plan,
  trialEligible = false,
  ticker,
  title,
  body,
  stacked = false,
  className = "",
  id,
}: {
  feature: FeatureId;
  plan: Plan;
  /** Keep the button under the text at every width, for narrow columns. */
  stacked?: boolean;
  /** Only say "3 days free" to someone who can actually get it. */
  trialEligible?: boolean;
  ticker?: string;
  /** Override the table's words when the context needs a name in it. */
  title?: React.ReactNode;
  body?: React.ReactNode;
  className?: string;
  /** An anchor a link can land on (Analysis's #crashes, which Free sees as this card). */
  id?: string;
}) {
  const { step, act, busy } = useGate(feature, plan, ticker);
  if (step === null) return null;
  const copy = lockCopy(feature);
  return (
    <div
      id={id}
      className={`oa-surface flex flex-col gap-3 border border-dashed border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_5%,var(--oa-card))] p-4 ${stacked ? "" : "sm:flex-row sm:items-center sm:justify-between"} ${className}`}
    >
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--oa-primary)_14%,transparent)] text-oa-primary">
          <LockGlyph />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-medium leading-5 text-oa-fg">{title ?? copy.title}</p>
          <p className="mt-1 max-w-xl text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{body ?? copy.body}</p>
        </div>
      </div>
      <div className={`flex shrink-0 flex-wrap items-center gap-3 pl-10 ${stacked ? "" : "sm:pl-0"}`}>
        {/* 44px tall on phones: this is the unlock tap target. */}
        <OaButton size="sm" loading={busy} onClick={act} className="max-sm:min-h-11 max-sm:px-4">
          {ctaLabel(feature, step, trialEligible)}
        </OaButton>
        {/* The trial is real but asks for a card: say so where the button promises it. */}
        {step === "upgrade" && trialEligible ? <span className="text-[13px] text-oa-muted-fg">The trial asks for a card.</span> : null}
        {step === "upgrade" ? (
          <Link prefetch={false}
            href={`/pricing#${feature}`}
            className="text-[13px] text-oa-muted-fg underline decoration-oa-border underline-offset-2 hover:text-oa-fg"
          >
            What is in Pro
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** The last row of a clipped list: says how many more there are, and nothing about them. */
export function MoreLocked({
  feature,
  plan,
  hidden,
  noun = "more",
  trialEligible = false,
  className = "",
}: {
  feature: FeatureId;
  plan: Plan;
  /** The real number of rows the server held back. */
  hidden: number;
  /** "more matches", "more holdings". */
  noun?: string;
  trialEligible?: boolean;
  className?: string;
}) {
  const { step, act, busy } = useGate(feature, plan);
  if (step === null || hidden <= 0) return null;
  const copy = lockCopy(feature);
  return (
    <div
      className={`flex flex-col gap-2 border-t border-oa-border bg-[color-mix(in_srgb,var(--oa-primary)_5%,var(--oa-card))] px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <p className="flex min-w-0 items-start gap-2 text-[13.5px] leading-5 text-oa-muted-fg">
        <LockGlyph className="mt-0.5 size-4 text-oa-primary" />
        <span>
          <span className="oa-mono font-medium text-oa-fg">{hidden.toLocaleString("en-US")}</span> {noun}.{" "}
          {copy.body}
        </span>
      </p>
      <OaButton size="xs" variant="secondary" loading={busy} onClick={act} className="shrink-0 self-start sm:self-auto">
        {ctaLabel(feature, step, trialEligible)}
      </OaButton>
    </div>
  );
}

/** "2 of 3 backtests left today". Shown before the limit, so it is never a surprise. */
export function MeterNote({
  used,
  limit,
  unit,
  per = "day",
  className = "",
}: {
  used: number;
  limit: number;
  unit: string;
  per?: "day" | "month";
  className?: string;
}) {
  if (!Number.isFinite(limit)) return null;
  const left = Math.max(0, limit - used);
  return (
    <p className={`oa-mono text-[11.5px] leading-4 text-oa-muted-fg ${className}`}>
      {left} of {limit} {unit} left {per === "day" ? "today" : "this month"}
    </p>
  );
}

/** A small inline "Pro" marker for a control that opens a lock. */
export function ProMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`oa-mono inline-flex h-[18px] items-center gap-1 rounded border border-[color-mix(in_srgb,var(--oa-primary)_40%,transparent)] px-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-oa-primary ${className}`}
    >
      <LockGlyph className="size-3" />
      Pro
    </span>
  );
}

/**
 * Cover one tracked stock from wherever its levels are locked. The server
 * (POST /api/coverage) decides: a free slot and a pick or this week's swap
 * left, or it says why not and when the next swap opens. Nothing is spent on
 * a refusal.
 */
export function CoverButton({ instrumentId, ticker, className = "" }: { instrumentId: string; ticker: string; className?: string }) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  async function cover() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument_id: instrumentId, covered: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (res.ok) {
        window.location.reload();
        return;
      }
      if (data.error === "over_limit" || data.error === "swap_used") trackLimitHit({ feature: "covered_stocks", plan: "free", code: data.error });
      setMessage(data.message || `Could not cover ${ticker}. Try again.`);
    } catch {
      setMessage("That did not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      <OaButton size="sm" variant="secondary" loading={busy} onClick={cover} className="self-start max-sm:min-h-11 max-sm:px-4">
        Cover {ticker}
      </OaButton>
      {message ? (
        <span role="status" className="text-[12.5px] leading-[18px] text-oa-muted-fg">
          {message}
        </span>
      ) : null}
    </span>
  );
}
