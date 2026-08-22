"use client";

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
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-red-700 outline-none transition-all hover:bg-[color-mix(in_srgb,var(--signal-bearish)_8%,transparent)] focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] active:translate-y-px active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 dark:text-red-400"
      >
        {busy ? "Deleting…" : "Delete account"}
      </button>
      {error && (
        <p className="max-w-xs text-xs leading-5 text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
