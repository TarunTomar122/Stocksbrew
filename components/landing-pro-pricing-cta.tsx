"use client";

import Link from "next/link";
import { useState } from "react";

import { getFirebaseAuth } from "@/lib/firebase-client";
import { signInWithGoogle } from "@/lib/sign-in";
import { proCtaClassName } from "@/components/pro-cta";
import { type AuthSurface, trackLandingCtaClicked } from "@/lib/product-analytics";

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

export function LandingProPricingCta({
  isSignedIn,
  highlight,
  ctaLabel,
  surface = "landing_pro_preview",
}: {
  isSignedIn: boolean;
  highlight?: boolean;
  ctaLabel: string;
  surface?: AuthSurface;
}) {
  const [busy, setBusy] = useState(false);

  async function signInThenSubscribe() {
    trackLandingCtaClicked({
      surface,
      signedIn: false,
      destination: "/subscribe",
    });
    setBusy(true);
    try {
      await signInWithGoogle({ surface });
    } catch {
      setBusy(false);
      return;
    }
    try {
      await syncServerSession();
    } catch {
      // cookie may still be set by AuthProvider; continue to subscribe
    }
    window.location.assign("/subscribe");
  }

  const className = proCtaClassName({
    size: "lg",
    fullWidth: true,
    variant: highlight ? "fill" : "outline",
  });

  if (isSignedIn) {
    return (
      <Link
        href="/subscribe"
        className={className}
        onClick={() =>
          trackLandingCtaClicked({
            surface,
            signedIn: true,
            destination: "/subscribe",
          })
        }
      >
        {ctaLabel}
        <span aria-hidden className="ml-1">
          →
        </span>
      </Link>
    );
  }

  return (
    <button type="button" disabled={busy} onClick={signInThenSubscribe} className={className}>
      {busy ? "Signing in…" : ctaLabel}
      {!busy && (
        <span aria-hidden className="ml-1">
          →
        </span>
      )}
    </button>
  );
}
