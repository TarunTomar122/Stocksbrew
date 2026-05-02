"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

type Variant = "pill" | "icon";

type Props = {
  ticker: string;
  instrumentId: string;
  isTracked: boolean;
  /** Optional — affects the button label only. When omitted we show a generic
   * "Track" label and let the API decide if the user can track this stock. */
  tier?: "ai_launch" | "ai_personal" | "free";
  isSubscribed?: boolean;
  variant?: Variant;
};

// Single source of truth for the track / sign-in / subscribe flow used by every
// "Track this stock" surface. Server pages compute tier + subscribed + isTracked
// once and pass them through; this component handles the click-time state.
export function TrackButton({
  ticker,
  instrumentId,
  tier,
  isSubscribed,
  isTracked,
  variant = "pill",
}: Props) {
  const { user, loading } = useUser();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [localTracked, setLocalTracked] = useState(isTracked);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);

    if (!user) {
      try {
        const auth = getFirebaseAuth();
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        await signInWithPopup(auth, provider);
        router.refresh();
      } catch {
        setError("Sign-in cancelled.");
      }
      return;
    }

    startTransition(async () => {
      const method = localTracked ? "DELETE" : "POST";
      const res = await fetch("/api/track", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument_id: instrumentId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          // Free user trying to track a non-launch stock — punt to /subscribe.
          router.push("/subscribe");
          return;
        }
        if (res.status === 409) {
          setError("Personal tier is full — untrack one first.");
        } else {
          setError(localTracked ? "Could not untrack." : "Could not track.");
        }
        return;
      }
      setLocalTracked((v) => !v);
      router.refresh();
    });
  }

  const canTrackOrUntrack =
    !!user && (tier === "ai_launch" || tier === "ai_personal" || isSubscribed);

  if (loading) {
    if (variant === "icon") {
      return <span className="inline-block h-5 w-5" aria-hidden />;
    }
    return null;
  }

  const label = !user
    ? "Sign in to track"
    : !canTrackOrUntrack
      ? "Subscribe to track"
      : pending
        ? localTracked
          ? "Removing…"
          : "Adding…"
        : localTracked
          ? "Tracking ✓"
          : `Track ${ticker}`;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-label={localTracked ? `Untrack ${ticker}` : `Track ${ticker}`}
        className={`shrink-0 transition-colors disabled:opacity-50 ${
          localTracked
            ? "text-[#0052ff]"
            : "text-[#9ca3af] hover:text-[#111111]"
        }`}
        title={label}
      >
        <svg
          width="18"
          height="20"
          viewBox="0 0 16 18"
          fill={localTracked ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M2 1.5h12v15l-6-4-6 4v-15z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={`inline-flex items-center justify-center h-[40px] px-4 rounded-full text-[13px] font-semibold tracking-tight transition-transform disabled:opacity-60 ${
          localTracked
            ? "bg-white text-[#111111] border border-[#111111] hover:-translate-y-[1px] active:translate-y-0"
            : "bg-[#111111] text-white hover:-translate-y-[1px] active:translate-y-0"
        }`}
      >
        {label}
      </button>
      {error && (
        <span className="text-[11px] font-medium text-[#ef4444]">{error}</span>
      )}
    </div>
  );
}
