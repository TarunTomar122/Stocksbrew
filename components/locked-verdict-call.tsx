"use client";

import { useEffect, useState } from "react";

import { VerdictCallChart } from "@/components/verdict-call-chart";
import { useUser } from "@/lib/auth-context";
import { useProCheckout } from "@/lib/use-pro-checkout";
import { trackPaywallShown, trackPaywallUnlockClicked } from "@/lib/product-analytics";
import type { StockReturns } from "@/lib/chart-range";
import { US_PRO_MONTHLY_MO } from "@/lib/pricing";
import type { StockTechnicalLevels } from "@/lib/technicals";

const KICK = "text-xs uppercase tracking-[0.12em] text-oa-muted-fg";

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
      <span className={KICK}>{label}</span>
      <span
        className="h-[15px] rounded-[3px] bg-[repeating-linear-gradient(-45deg,var(--oa-secondary),var(--oa-secondary)_5px,var(--oa-bg)_5px,var(--oa-bg)_10px)]"
        style={{ width }}
        aria-hidden
      />
    </div>
  );
}

/** The masked "call" mirrors the real Pro call's structure (stance, conviction,
 *  levels, drivers) so a free user sees exactly what's behind the lock. */
function MaskedCall() {
  return (
    <div className="relative select-none" aria-hidden>
      <div className="flex items-center gap-2">
        <span className={KICK} style={{ color: "var(--oa-primary)" }}>
          Our call
        </span>
        <LockIcon />
      </div>
      <div className="mt-2 flex items-end gap-3">
        <span className="h-[2.1rem] w-[8.5rem] rounded-md bg-[repeating-linear-gradient(-45deg,var(--oa-secondary),var(--oa-secondary)_6px,var(--oa-bg)_6px,var(--oa-bg)_12px)]" />
        <span className="mb-1 flex gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-oa-secondary" />
          ))}
        </span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-4">
        <MaskedRow label="Add zone" width="4.5rem" />
        <MaskedRow label="Target" width="3.5rem" />
        <MaskedRow label="Trim zone" width="3.5rem" />
      </div>
      <div className="mt-5 space-y-2">
        <span className="block h-[11px] w-full max-w-md rounded-[3px] bg-oa-secondary" />
        <span className="block h-[11px] w-[82%] max-w-md rounded-[3px] bg-oa-secondary" />
      </div>
    </div>
  );
}

function VerdictUnlockCard({
  ticker,
  signedIn,
  hasTrial,
  onSignIn,
  onGetPro,
  error,
}: {
  ticker: string;
  signedIn: boolean;
  hasTrial: boolean;
  onSignIn: () => void;
  onGetPro: () => void;
  error: string | null;
}) {
  const onClick = signedIn ? onGetPro : onSignIn;
  const label = signedIn ? "Unlock full research" : "See the full research";
  const subtext = hasTrial
    ? `Free for 3 days, then ${US_PRO_MONTHLY_MO}. Cancel anytime.`
    : signedIn
      ? "Cancel anytime."
      : `${US_PRO_MONTHLY_MO} · Cancel anytime.`;

  return (
    <div className="mx-auto w-full max-w-[24rem] text-left">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-full border border-oa-border bg-oa-bg"><LockIcon /></span>
        <p className="text-[17px] font-medium tracking-tight text-oa-fg">See the full {ticker} research</p>
      </div>
      <ul className="mt-4 space-y-2 text-sm leading-6 text-oa-muted-fg">
        {["Buy, hold or avoid view", "Entry, target and exit prices", "News, earnings and price alerts"].map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-[9px] size-1.5 shrink-0 rounded-full" style={{ background: "var(--signal-bullish)" }} aria-hidden />
            {item}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onClick()}
        className="mt-4 inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--oa-primary)_80%,#3a3480)] bg-[color-mix(in_srgb,var(--oa-primary)_90%,#3a3480)] px-5 py-2.5 text-sm font-medium text-oa-primary-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(58,52,128,0.30)] transition-all hover:bg-oa-primary active:translate-y-px active:scale-[0.98] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] disabled:pointer-events-none disabled:opacity-50"
      >
        {label}
      </button>
      <p className="mt-2 text-center text-xs text-oa-muted-fg">{subtext}</p>
      {error ? (
        <p className="mt-2 text-center text-sm font-medium text-[#ef4444]">{error}</p>
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
          <span className={KICK}>Fundamentals</span>
          <span className="oa-mono text-[13px] font-medium tabular-nums text-oa-fg">
            {score}
            <span className="font-normal text-oa-muted-fg"> /100 vs peers</span>
          </span>
        </div>
      ) : null}

      {overviewHeadline ? (
        <div>
          <p className={KICK}>Why it matters</p>
          <p className="mt-1 text-[15px] font-medium leading-snug text-oa-fg">
            {overviewHeadline}
          </p>
        </div>
      ) : null}

      {earningsSoon && !overviewHeadline ? (
        <p className="text-sm leading-6 text-oa-muted-fg">
          Earnings in {preEarningsDays}d on {ticker}. Pro unlocks our setup and levels to watch.
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
  technicalLevels,
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
  technicalLevels?: StockTechnicalLevels | null;
  overviewHeadline?: string;
  fundamentalsScore?: number | null;
  preEarningsDays?: number | null;
  market?: "US" | "IN";
}) {
  const hasTrial = market === "US";
  const { user, loading } = useUser();
  const [error, setError] = useState<string | null>(null);
  const { openCheckout } = useProCheckout("locked_verdict_call");

  useEffect(() => {
    if (loading) return;
    trackPaywallShown({ surface: "locked_verdict_call", ticker, signedIn: Boolean(user) });
  }, [loading, user, ticker]);

  if (loading) return null;

  const signedIn = Boolean(user);

  async function handleSignIn() {
    trackPaywallUnlockClicked({ surface: "locked_verdict_call", ticker, signedIn: false });
    try {
      await openCheckout();
    } catch {
      setError("Sign-in cancelled or failed.");
    }
  }

  async function handleGetPro() {
    trackPaywallUnlockClicked({ surface: "locked_verdict_call", ticker, signedIn: true });
    await openCheckout();
  }

  const callSlot = (
    <div className="flex min-h-0 flex-col gap-5">
      <FreeShelf
        ticker={ticker}
        overviewHeadline={overviewHeadline}
        fundamentalsScore={fundamentalsScore}
        preEarningsDays={preEarningsDays}
      />
      <div className="relative min-h-[250px] overflow-hidden rounded-[22px] border border-oa-border bg-oa-bg sm:rounded-[44px] sm:[--card-clip-radius:17px]">
        <div className="pointer-events-none p-5 opacity-80 blur-[4px]" aria-hidden>
          <MaskedCall />
        </div>
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--oa-bg)_86%,transparent)_0%,color-mix(in_srgb,var(--oa-bg)_68%,transparent)_58%,color-mix(in_srgb,var(--oa-bg)_42%,transparent)_100%)] p-5">
          <VerdictUnlockCard
            ticker={ticker}
            signedIn={signedIn}
            hasTrial={hasTrial}
            onSignIn={handleSignIn}
            onGetPro={handleGetPro}
            error={error}
          />
        </div>
      </div>
    </div>
  );

  return (
    <VerdictCallChart
      callSlot={callSlot}
      hist={hist}
      returns={returns}
      currency={currency}
      zones={[]}
      lineColor="var(--oa-muted-fg)"
      currentPrice={currentPrice}
      technicalLevels={technicalLevels}
    />
  );
}
