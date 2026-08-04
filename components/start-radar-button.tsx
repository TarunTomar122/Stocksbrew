"use client";

import { useState } from "react";

import { useUser } from "@/lib/auth-context";
import {
  type AuthSurface,
  trackLandingCtaClicked,
} from "@/lib/product-analytics";
import { signInWithGoogle } from "@/lib/sign-in";

type StartRadarButtonProps = {
  surface: AuthSurface;
  className: string;
  signedOutLabel?: string;
  signedInLabel?: string;
  busyLabel?: string;
};

export function StartRadarButton({
  surface,
  className,
  signedOutLabel = "Start your free Watchlist",
  signedInLabel = "Open your Watchlist",
  busyLabel = "Signing in…",
}: StartRadarButtonProps) {
  const { user, loading, initialAuthed } = useUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = Boolean(user || initialAuthed);

  async function openRadar() {
    if (busy || loading) return;
    setError(null);
    trackLandingCtaClicked({
      surface,
      signedIn,
      destination: "/watchlist",
    });

    if (signedIn) {
      window.location.assign("/watchlist");
      return;
    }

    setBusy(true);
    try {
      await signInWithGoogle({ surface });
      window.location.assign("/watchlist");
    } catch (err) {
      console.error("Watchlist sign-in failed", err);
      setError("Could not sign in. Please try again.");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-center gap-1.5">
      <button
        type="button"
        className={className}
        disabled={busy || loading}
        onClick={() => void openRadar()}
      >
        {busy ? busyLabel : signedIn ? signedInLabel : signedOutLabel}
        {!busy ? <span aria-hidden>→</span> : null}
      </button>
      {error ? <span className="text-[11px] font-medium text-[#ef4444]">{error}</span> : null}
    </span>
  );
}
