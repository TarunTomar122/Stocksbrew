"use client";

import { useState } from "react";

import { useUser } from "@/lib/auth-context";
import { startDodoCheckout } from "@/lib/dodo-checkout-client";
import { signInWithGoogle } from "@/lib/sign-in";
import { trackCheckoutClicked, trackCheckoutStarted } from "@/lib/product-analytics";
import type { AuthSurface } from "@/lib/product-analytics";

/**
 * Shared "click a Pro CTA" behavior: signed-in users skip straight to Dodo
 * checkout; signed-out users sign in first, then land on the same checkout
 * URL. Use this instead of linking/pushing to /subscribe.
 */
export function useProCheckout(surface: AuthSurface = "paywall") {
  const { user } = useUser();
  const [busy, setBusy] = useState(false);

  async function openCheckout() {
    if (busy) return;
    setBusy(true);
    trackCheckoutClicked({ period: "monthly", market: "US", signedIn: Boolean(user) });
    try {
      if (!user) await signInWithGoogle({ surface });
      const checkoutUrl = await startDodoCheckout();
      trackCheckoutStarted({ period: "monthly", market: "US" });
      window.location.assign(checkoutUrl);
    } catch (err) {
      console.error("direct checkout failed", err);
    } finally {
      setBusy(false);
    }
  }

  return { openCheckout, busy };
}
