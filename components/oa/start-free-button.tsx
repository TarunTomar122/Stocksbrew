"use client";

import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { signInWithGoogle } from "@/lib/sign-in";
import type { AuthSurface } from "@/lib/product-analytics";

export function StartFreeButton({
  surface,
  size = "md",
  variant = "primary",
  label = "Start free",
  className,
}: {
  surface: AuthSurface;
  size?: "md" | "sm" | "xs";
  variant?: "primary" | "secondary" | "ghost";
  label?: string;
  className?: string;
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
          // Already signed in? Skip the popup and show them the plans.
          if (!getFirebaseAuth().currentUser) {
            await signInWithGoogle({ surface });
          }
          window.location.href = "/subscribe";
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
