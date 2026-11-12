"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { signInWithGoogle } from "@/lib/sign-in";

/** An inline "See your own mix." that opens Google sign-in and reloads the page with the person's own holdings. */
export function XraySignIn({ children }: { children: React.ReactNode }) {
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
      className="cursor-pointer font-medium text-oa-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] disabled:opacity-60"
    >
      {busy ? "Signing in" : children}
    </button>
  );
}
