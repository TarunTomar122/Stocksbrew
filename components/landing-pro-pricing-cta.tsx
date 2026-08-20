"use client";

import { useState } from "react";

import { signInWithGoogle } from "@/lib/sign-in";
import { proCtaClassName } from "@/components/pro-cta";
import { type AuthSurface, trackLandingCtaClicked } from "@/lib/product-analytics";
import { startDodoCheckout } from "@/lib/dodo-checkout-client";

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
      destination: "dodo_checkout",
    });
    setBusy(true);
    try {
      await signInWithGoogle({ surface });
    } catch {
      setBusy(false);
      return;
    }
    try {
      window.location.assign(await startDodoCheckout());
    } catch {
      setBusy(false);
    }
  }

  const className = proCtaClassName({
    size: "lg",
    fullWidth: true,
    variant: highlight ? "fill" : "outline",
  });

  if (isSignedIn) {
    return (
      <button
        type="button"
        className={className}
        onClick={async () => {
          trackLandingCtaClicked({ surface, signedIn: true, destination: "dodo_checkout" });
          setBusy(true);
          try {
            window.location.assign(await startDodoCheckout());
          } catch {
            setBusy(false);
          }
        }}
        disabled={busy}
      >
        {busy ? "Opening checkout…" : ctaLabel}
        <span aria-hidden className="ml-1">
          →
        </span>
      </button>
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
