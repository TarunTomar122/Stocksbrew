"use client";

import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { currentFirebaseUser, signedInNow, signInWithGoogle } from "@/lib/sign-in";
import type { AuthSurface } from "@/lib/product-analytics";

/**
 * Sign in with Google, then go to My stocks. A brand-new account gets the first-run dialog there
 * (components/post-signup-onboarding.tsx: add the stocks you own, pick popular ones or import a screenshot), so
 * the first thing a new person sees is their own stocks with our calls, not a price list. Pro offers use
 * ProCheckoutButton, which goes to checkout.
 */
export function StartFreeButton({
  surface,
  size = "md",
  variant = "primary",
  label = "Start free",
  className,
  next = "/portfolio",
}: {
  surface: AuthSurface;
  size?: "md" | "sm" | "xs";
  variant?: "primary" | "outline" | "secondary" | "ghost";
  label?: string;
  className?: string;
  /** Where to go once signed in (My stocks unless the page says otherwise). */
  next?: string;
}) {
  const [loading, setLoading] = React.useState(false);

  return (
    <OaButton
      size={size}
      variant={variant}
      loading={loading}
      className={className}
      onClick={async () => {
        setLoading(true);
        try {
          // Already signed in? Skip the popup.
          if (!(signedInNow() ?? Boolean(await currentFirebaseUser()))) {
            await signInWithGoogle({ surface });
          }
          window.location.href = next;
        } catch {
          // the sign-in sheet reports its own errors; nothing to add here
        } finally {
          setLoading(false);
        }
      }}
    >
      {label}
    </OaButton>
  );
}
