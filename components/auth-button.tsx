"use client";

import Link from "next/link";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useState } from "react";

import { useUser } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase-client";

export function AuthButton() {
  const { user, loading } = useUser();
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("sign-in failed", err);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div
        aria-hidden="true"
        className="h-9 w-24 animate-pulse bg-surface-container-high rounded-lg"
      />
    );
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={handleSignIn}
        disabled={busy}
        className="inline-flex items-center gap-2 bg-primary px-4 py-2 text-sm font-bold tracking-tight text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60 rounded-full"
      >
        <span className="material-symbols-outlined text-base">login</span>
        {busy ? "Signing in…" : "Sign in"}
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
