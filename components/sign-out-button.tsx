"use client";

import { signOut } from "firebase/auth";
import { useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase-client";

const GHOST_PILL =
  "inline-flex h-8 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-lg px-3 text-sm font-medium outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] active:translate-y-px active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/session", { method: "DELETE" });
      if (!res.ok) console.warn("sign-out: session cookie clear failed", res.status);
      await signOut(getFirebaseAuth());
      window.location.assign("/");
    } catch (err) {
      console.error("sign-out failed", err);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      className={`${GHOST_PILL} shrink-0 text-oa-muted-fg hover:text-oa-fg`}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
