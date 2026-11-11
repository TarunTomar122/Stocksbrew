"use client";

import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { signInWithGoogle } from "@/lib/sign-in";

/** "Sign in to get your own": signs in where the visitor is, then reloads so the page shows their inbox. */
export function InboxSignIn() {
  const [busy, setBusy] = React.useState(false);
  return (
    <OaButton
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await signInWithGoogle({ surface: "inbox" });
          window.location.reload();
        } catch {
          // The sign-in sheet reports its own errors.
          setBusy(false);
        }
      }}
    >
      Sign in to get your own
    </OaButton>
  );
}
