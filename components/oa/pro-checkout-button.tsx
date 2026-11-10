"use client";

import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import { startDodoCheckout } from "@/lib/dodo-checkout-client";
import { trackCheckoutClicked, trackCheckoutFailed } from "@/lib/product-analytics";

/**
 * Signed-in users skip /subscribe entirely and go straight to Dodo checkout.
 * Signed-out users sign in first, then land on the same checkout URL.
 */
export function ProCheckoutButton({
  size = "md",
  className,
  children,
}: {
  size?: "sm" | "md";
  className?: string;
  children: React.ReactNode;
}) {
  const { user } = useUser();
  const [busy, setBusy] = React.useState(false);

  async function openCheckout() {
    if (busy) return;
    setBusy(true);
    trackCheckoutClicked({ period: "monthly", market: "US", signedIn: Boolean(user) });
    try {
      if (!user) await signInWithGoogle({ surface: "paywall" });
      const checkoutUrl = await startDodoCheckout();
      window.location.assign(checkoutUrl);
    } catch (err) {
      console.error("direct checkout failed", err);
      trackCheckoutFailed({ reason: err instanceof Error ? err.message : "unknown" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <OaButton size={size} className={className} onClick={() => void openCheckout()} loading={busy}>
      {children}
    </OaButton>
  );
}
