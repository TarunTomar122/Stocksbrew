"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { VerdictCallChart } from "@/components/verdict-call-chart";
import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import { trackPaywallShown, trackPaywallUnlockClicked } from "@/lib/product-analytics";
import type { StockReturns } from "@/lib/chart-range";
import { US_PRO_MONTHLY_MO } from "@/lib/pricing";

const KICK = "font-mono text-[11px] uppercase tracking-[0.13em] text-on-surface-variant";

type Point = { date: string; close: number };

function LockIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-on-surface-variant"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/** A redacted row: real label, value hidden behind a bar. Shows the shape of the
 *  answer without fabricating one. */
function MaskedRow({ label, width = "3.5rem" }: { label: string; width?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-on-surface-variant">{label}</span>
      <span
        className="h-[15px] rounded-[3px] bg-[repeating-linear-gradient(-45deg,var(--surface-container-high),var(--surface-container-high)_5px,var(--surface-container)_5px,var(--surface-container)_10px)]"
        style={{ width }}
        aria-hidden
      />
    </div>
  );
}

/** The masked "call" — mirrors the real Pro call's structure (stance, conviction,
 *  levels, drivers) so a free user sees exactly what's behind the lock. */
function MaskedCall() {
  return (
    <div className="relative select-none" aria-hidden>
      <div className="flex items-center gap-2">
        <span className={KICK} style={{ color: "color-mix(in srgb, var(--primary) 55%, var(--on-surface-variant))" }}>
          our call
        </span>
        <LockIcon />
      </div>
      <div className="mt-2 flex items-end gap-3">
        <span className="h-[2.1rem] w-[8.5rem] rounded-md bg-[repeating-linear-gradient(-45deg,var(--surface-container-high),var(--surface-container-high)_6px,var(--surface-container)_6px,var(--surface-container)_12px)]" />
        <span className="mb-1 flex gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-surface-container-high" />
          ))}
        </span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-4">
        <MaskedRow label="entry zone" width="4.5rem" />
        <MaskedRow label="target" width="3.5rem" />
        <MaskedRow label="risk / stop" width="3.5rem" />
      </div>
      <div className="mt-5 space-y-2">
        <span className="block h-[11px] w-full max-w-md rounded-[3px] bg-surface-container" />
        <span className="block h-[11px] w-[82%] max-w-md rounded-[3px] bg-surface-container" />
      </div>
    </div>
  );
}

function VerdictUnlockCard({
  signedIn,
  hasTrial,
  onSignIn,
  onGetPro,
  error,
}: {
  signedIn: boolean;
  hasTrial: boolean;
  onSignIn: () => void;
  onGetPro: () => void;
  error: string | null;
}) {
  const onClick = signedIn ? onGetPro : onSignIn;
  const label = hasTrial
    ? "Start your 3-day free trial"
    : signedIn
      ? `Unlock Pro · ${US_PRO_MONTHLY_MO}`
      : "Sign in to unlock the call";
  const subtext = hasTrial
    ? `Free for 3 days, then ${US_PRO_MONTHLY_MO}. Cancel anytime.`
    : signedIn
      ? "Cancel anytime."
      : `${US_PRO_MONTHLY_MO} · Cancel anytime.`;

  return (
    <div className="border-t border-outline-variant pt-4">
      <div className="flex items-center gap-2">
        <p className="text-[15px] font-bold tracking-[-0.015em] text-on-surface">
          The call, conviction, and levels are Pro
        </p>
      </div>
      <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-on-surface-variant">
        Unlock our current Add, Hold, or Trim stance—plus entry zones, target, drivers, risks, and Radar alerts.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => onClick()}
          className="inline-flex min-h-14 items-center justify-center rounded-lg bg-primary px-5 py-3 text-[13px] font-bold leading-none text-on-primary transition-opacity hover:opacity-90"
        >
          {label}
        </button>
        <p className="text-[10.5px] text-on-surface-variant">{subtext}</p>
      </div>
      {error ? (
        <p className="mt-2 text-[12px] font-medium text-[#ef4444]">{error}</p>
      ) : null}
    </div>
  );
}

function FreeShelf({
  ticker,
  overviewHeadline,
  fundamentalsScore,
  preEarningsDays,
}: {
  ticker: string;
  overviewHeadline?: string;
  fundamentalsScore?: number | null;
  preEarningsDays?: number | null;
}) {
  const hasScore = typeof fundamentalsScore === "number" && Number.isFinite(fundamentalsScore);
  const score = hasScore ? Math.round(fundamentalsScore!) : null;
  const earningsSoon =
    typeof preEarningsDays === "number" && preEarningsDays >= 0 && preEarningsDays <= 14;

  if (!hasScore && !overviewHeadline && !earningsSoon) return null;

  return (
    <div className="space-y-2.5">
      {hasScore ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className={KICK}>fundamentals</span>
          <span className="font-mono text-[13px] font-bold tabular-nums text-on-surface">
            {score}
            <span className="font-normal text-on-surface-variant"> /100 vs peers</span>
          </span>
        </div>
      ) : null}

      {overviewHeadline ? (
        <div>
          <p className={KICK}>why it matters</p>
          <p className="mt-1 text-[14px] font-semibold leading-snug tracking-[-0.01em] text-on-surface">
            {overviewHeadline}
          </p>
        </div>
      ) : null}

      {earningsSoon && !overviewHeadline ? (
        <p className="text-[13px] leading-relaxed text-on-surface-variant">
          Earnings in {preEarningsDays}d on {ticker} — Pro unlocks our setup and levels to watch.
        </p>
      ) : null}
    </div>
  );
}

export function LockedVerdictCall({
  ticker,
  hist,
  returns,
  currency,
  currentPrice,
  overviewHeadline,
  fundamentalsScore,
  preEarningsDays,
  market = "US",
}: {
  ticker: string;
  hist: Point[];
  returns?: StockReturns | null;
  currency: string;
  currentPrice: number;
  overviewHeadline?: string;
  fundamentalsScore?: number | null;
  preEarningsDays?: number | null;
  market?: "US" | "IN";
}) {
  const hasTrial = market === "US";
  const { user, loading } = useUser();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    trackPaywallShown({ surface: "locked_verdict_call", ticker, signedIn: Boolean(user) });
  }, [loading, user, ticker]);

  if (loading) return null;

  const signedIn = Boolean(user);

  async function handleSignIn() {
    trackPaywallUnlockClicked({ surface: "locked_verdict_call", ticker, signedIn: false });
    try {
      await signInWithGoogle({ surface: "locked_verdict_call" });
      router.push("/subscribe");
    } catch {
      setError("Sign-in cancelled or failed.");
    }
  }

  function handleGetPro() {
    trackPaywallUnlockClicked({ surface: "locked_verdict_call", ticker, signedIn: true });
    router.push("/subscribe");
  }

  const callSlot = (
    <div className="flex min-h-0 flex-col gap-5">
      <MaskedCall />
      <FreeShelf
        ticker={ticker}
        overviewHeadline={overviewHeadline}
        fundamentalsScore={fundamentalsScore}
        preEarningsDays={preEarningsDays}
      />
      <VerdictUnlockCard
        signedIn={signedIn}
        hasTrial={hasTrial}
        onSignIn={handleSignIn}
        onGetPro={handleGetPro}
        error={error}
      />
    </div>
  );

  return (
    <VerdictCallChart
      callSlot={callSlot}
      hist={hist}
      returns={returns}
      currency={currency}
      zones={[]}
      lineColor="var(--on-surface-variant)"
      currentPrice={currentPrice}
    />
  );
}
