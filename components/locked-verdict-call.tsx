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

function VerdictUnlockCard({
  signedIn,
  onSignIn,
  onGetPro,
  error,
}: {
  signedIn: boolean;
  onSignIn: () => void;
  onGetPro: () => void;
  error: string | null;
}) {
  const cta = signedIn
    ? {
        label: `Unlock Pro · ${US_PRO_MONTHLY_MO}`,
        onClick: onGetPro,
      }
    : {
        label: "Sign in to view Pro",
        onClick: onSignIn,
      };

  return (
    <div className="border-t border-outline-variant pt-4">
      <div className="flex items-center gap-2">
        <LockIcon />
        <p className="text-[15px] font-bold tracking-[-0.015em] text-on-surface">
          Unlock Stocksbrew&apos;s call
        </p>
        <span className="font-mono text-[10px] font-semibold uppercase text-landing-brand">
          Pro
        </span>
      </div>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-on-surface-variant">
        See our current Add, Hold, or Trim call—plus price zones, target, drivers, risks, and Radar alerts.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => cta.onClick()}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-on-surface px-5 font-mono text-[12px] font-bold text-surface transition-opacity hover:opacity-85"
        >
          {cta.label}
        </button>
        <p className="text-[10.5px] text-on-surface-variant">
          {signedIn ? "Cancel anytime." : `${US_PRO_MONTHLY_MO} · Cancel anytime.`}
        </p>
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
}: {
  ticker: string;
  hist: Point[];
  returns?: StockReturns | null;
  currency: string;
  currentPrice: number;
  overviewHeadline?: string;
  fundamentalsScore?: number | null;
  preEarningsDays?: number | null;
}) {
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
    <div className="flex min-h-0 flex-col gap-4">
      <FreeShelf
        ticker={ticker}
        overviewHeadline={overviewHeadline}
        fundamentalsScore={fundamentalsScore}
        preEarningsDays={preEarningsDays}
      />
      <VerdictUnlockCard
        signedIn={signedIn}
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
