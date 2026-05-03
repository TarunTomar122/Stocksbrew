"use client";

import { signOut } from "firebase/auth";
import { useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase-client";

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
      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-signal-bearish border border-signal-bearish/30 hover:bg-signal-bearish/10 transition-colors rounded-full disabled:opacity-60"
    >
      <span className="material-symbols-outlined text-base">logout</span>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
