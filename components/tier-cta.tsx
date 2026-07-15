"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { proCtaClassName } from "@/components/pro-cta";
import { TrackButton } from "@/components/track-button";

type Props = {
  tier: "ai_launch" | "ai_personal" | "free";
  ticker: string;
  instrumentId: string;
  isSubscribed: boolean;
  isTracked: boolean;
};

export function TierCTA({
  tier,
  ticker,
  instrumentId,
  isSubscribed,
  isTracked,
}: Props) {
  const { user, loading } = useUser();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;

  if (tier === "ai_launch") {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl tint-bull px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="min-w-0 text-[13px] font-medium leading-relaxed text-[#10b981]">
          {isSubscribed
            ? "Pro is active. Track this stock for its detailed call, target, and alerts on Radar."
            : "Add this stock to Radar for free. Pro unlocks the detailed call, Stocksbrew target, and alerts."}
        </span>
        <div
          className={
            isTracked
              ? "shrink-0 self-end sm:self-auto"
              : "w-full shrink-0 sm:w-auto [&>div]:w-full sm:[&>div]:w-auto [&_button]:w-full sm:[&_button]:w-auto"
          }
        >
          <TrackButton
            ticker={ticker}
            instrumentId={instrumentId}
            tier={tier}
            isSubscribed={isSubscribed}
            isTracked={isTracked}
            trackedAsBadge={isTracked}
          />
        </div>
      </div>
    );
  }

  if (tier === "ai_personal") {
    return (
      <div className="flex flex-col items-start gap-2 rounded-2xl tint-info px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="pr-2 text-[13px] font-medium leading-relaxed text-[#3b82f6]">
          On your Radar. Pro keeps the call, target, and alert levels up to date.
        </span>
        <div className={isTracked ? "shrink-0 self-end sm:self-auto" : "self-end sm:self-auto"}>
          <TrackButton
            ticker={ticker}
            instrumentId={instrumentId}
            tier={tier}
            isSubscribed={isSubscribed}
            isTracked={isTracked}
            trackedAsBadge={isTracked}
          />
        </div>
      </div>
    );
  }

  // Free tier - bigger CTA card
  if (!user) {
    return (
      <CtaCard
        title={`Want the full read on ${ticker}?`}
        body="Sign in to add it to Radar. Pro unlocks detailed zones, drivers, risks, our target price, and alerts."
        primary={{
          label: "Sign in with Google",
          onClick: async () => {
            try {
              const auth = getFirebaseAuth();
              const provider = new GoogleAuthProvider();
              provider.setCustomParameters({ prompt: "select_account" });
              await signInWithPopup(auth, provider);
              router.refresh();
            } catch {
              setError("Sign-in cancelled or failed.");
            }
          },
        }}
        error={error}
      />
    );
  }

  if (!isSubscribed) {
    return (
      <CtaCard
        title={`Unlock the full ${ticker} setup`}
        body="Pro gives you the detailed call and zones, the Stocksbrew target price, and Radar alerts."
        primary={{
          label: "Get Pro",
          onClick: () => router.push("/subscribe"),
        }}
        primaryProStyle
        error={error}
      />
    );
  }

  if (isTracked) {
    return (
      <CtaCard
        title={`${ticker} is in your Radar`}
        body="Radar is tracking it. Open the call, target, and alerts whenever the setup changes."
        action={
          <TrackButton
            ticker={ticker}
            instrumentId={instrumentId}
            tier={tier}
            isSubscribed={isSubscribed}
            isTracked={isTracked}
          />
        }
        error={error}
      />
    );
  }

  return (
    <CtaCard
      title={`Add ${ticker} to Radar`}
      body="Choose Holding if you own it or Watching if you are waiting. Pro adds the detailed call, target, and alerts to both."
      action={
        <TrackButton
          ticker={ticker}
          instrumentId={instrumentId}
          tier={tier}
          isSubscribed={isSubscribed}
          isTracked={isTracked}
        />
      }
      error={error}
    />
  );
}

type CtaCardProps = {
  title: string;
  body: string;
  primary?: { label: string; onClick: () => void | Promise<void> };
  primaryProStyle?: boolean;
  action?: ReactNode;
  error?: string | null;
};

function CtaCard({ title, body, primary, primaryProStyle = false, action, error }: CtaCardProps) {
  return (
    <div className="rounded-2xl bg-surface px-5 py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-on-surface tracking-[-0.01em]">{title}</h3>
          <p className="mt-1 text-[13px] text-on-surface-variant leading-relaxed">{body}</p>
        </div>
        {action ? (
          action
        ) : primary ? (
          <button
            type="button"
            onClick={() => primary.onClick()}
            className={
              primaryProStyle
                ? proCtaClassName({ size: "sm", className: "h-[40px]" })
                : "shrink-0 inline-flex items-center justify-center h-[40px] rounded-full bg-on-surface px-5 text-[13px] font-semibold text-white hover:-translate-y-[1px] active:translate-y-0 transition-transform"
            }
          >
            {primary.label}
          </button>
        ) : null}
      </div>
      {error && <p className="mt-3 text-[12px] font-medium text-[#ef4444]">{error}</p>}
    </div>
  );
}
