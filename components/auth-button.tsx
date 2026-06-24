"use client";

import Link from "next/link";
import { useState } from "react";

import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import { captureEvent } from "@/lib/posthog";

export function AuthButton() {
  const { user, loading, initialAuthed } = useUser();
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    captureEvent("auth_sign_in_clicked", { surface: "header" });
    setBusy(true);
    try {
      await signInWithGoogle({ surface: "header" });
      captureEvent("auth_sign_in_succeeded", { surface: "header" });
    } catch (err) {
      console.error("sign-in failed", err);
      captureEvent("auth_sign_in_failed", {
        surface: "header",
        error: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      setBusy(false);
    }
  }

  // Server already validated the session - show avatar placeholder while
  // Firebase client resolves on the client side. No flash of "Sign in".
  if (loading && !initialAuthed) {
    return (
      <div
        aria-hidden="true"
        className="h-9 w-24 animate-pulse bg-surface-container-high rounded-lg"
      />
    );
  }

  // initialAuthed is true but user hasn't resolved yet - show a stable avatar
  // placeholder instead of the "Sign in" button.
  if (!user && initialAuthed) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">
        ?
      </div>
    );
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={handleSignIn}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant px-3.5 py-2 font-mono text-[13px] font-medium text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60"
      >
        <span className="material-symbols-outlined text-[16px]">login</span>
        {busy ? "signing in…" : "sign in"}
      </button>
    );
  }

  return (
    <Link
      href="/profile"
      title={user.displayName || user.email || "Profile"}
      className="flex h-9 w-9 items-center justify-center rounded-full overflow-hidden ring-2 ring-transparent hover:ring-primary transition-all"
    >
      {user.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.photoURL} alt="" className="h-9 w-9 object-cover" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center bg-primary text-sm font-bold text-on-primary">
          {(user.displayName || user.email || "?").trim().charAt(0).toUpperCase()}
        </div>
      )}
    </Link>
  );
}
