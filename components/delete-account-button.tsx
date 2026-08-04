"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import { signOut } from "firebase/auth";
import { useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase-client";

export function DeleteAccountButton({
  hasBillableSubscription,
}: {
  hasBillableSubscription: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const warning = hasBillableSubscription
      ? "This permanently deletes your stocksbrew account, Watchlist and preferences. Your Pro subscription will be scheduled to cancel at the end of the current billing period. This cannot be undone."
      : "This permanently deletes your stocksbrew account, Watchlist and preferences. This cannot be undone.";

    if (!window.confirm(`${warning}\n\nDelete your account?`)) return;

    setError(null);
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("Not signed in");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/user/account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Could not delete account");
      }
      await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
      await signOut(auth).catch(() => undefined);
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-signal-bearish border border-signal-bearish/30 hover:bg-signal-bearish/10 transition-colors rounded-full disabled:opacity-60"
      >
        <AnimatedIcon name="delete_forever" size={16} className="text-base" />
        {busy ? "Deleting…" : "Delete account"}
      </button>
      {error && (
        <p className="text-[12px] text-red-600 dark:text-red-400 text-right max-w-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
