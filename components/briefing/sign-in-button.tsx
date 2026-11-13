"use client";

import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { currentFirebaseUser, signedInNow, signInWithGoogle } from "@/lib/sign-in";

/** Signs in, then reloads so the server builds the page for this person. */
export function SignInButton({
  label = "Sign in",
  size = "sm",
  variant = "primary",
  className,
}: {
  label?: string;
  size?: "md" | "sm" | "xs";
  variant?: "primary" | "secondary" | "ghost";
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
          if (!(signedInNow() ?? Boolean(await currentFirebaseUser()))) await signInWithGoogle({ surface: "header" });
          window.location.reload();
        } catch {
          // The sign-in sheet reports its own errors.
          setLoading(false);
        }
      }}
    >
      {label}
    </OaButton>
  );
}
