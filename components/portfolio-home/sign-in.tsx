"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { signInWithGoogle } from "@/lib/sign-in";

/** The overview's one sign-in action: opens Google sign-in, then reloads the page on the person's own holdings. */
export function HomeSignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await signInWithGoogle({ surface: "radar_page" });
          router.refresh();
        } catch {
          // the sign-in sheet reports its own errors
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex h-10 shrink-0 cursor-pointer items-center rounded border border-oa-primary bg-oa-primary px-4 text-[14px] font-medium text-oa-primary-fg outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] disabled:opacity-60 sm:h-9"
    >
      {busy ? "Signing in" : "Sign in to see yours"}
    </button>
  );
}
