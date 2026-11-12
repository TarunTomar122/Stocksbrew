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
      // A text link on a phone, so the findings start higher; a button from sm up.
      className="inline-flex min-h-8 shrink-0 cursor-pointer items-center rounded text-[14px] font-medium text-oa-primary outline-none transition-[filter] hover:underline focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] disabled:opacity-60 sm:h-9 sm:border sm:border-oa-primary sm:bg-oa-primary sm:px-4 sm:text-oa-primary-fg sm:hover:no-underline sm:hover:brightness-110"
    >
      {busy ? "Signing in" : "Start free"}
    </button>
  );
}
