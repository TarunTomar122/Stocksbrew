"use client";

import Link from "next/link";
import { useState } from "react";

import { getFirebaseAuth } from "@/lib/firebase-client";
import { signInWithGoogle } from "@/lib/sign-in";

async function syncServerSession(): Promise<void> {
  const u = getFirebaseAuth().currentUser;
  if (!u) return;
  const idToken = await u.getIdToken();
  await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
}

export function LandingProPricingCta({
  isSignedIn,
  highlight,
  ctaLabel,
}: {
  isSignedIn: boolean;
  highlight?: boolean;
  ctaLabel: string;
}) {
  const [busy, setBusy] = useState(false);

  async function signInThenSubscribe() {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      setBusy(false);
      return;
    }
    try {
      await syncServerSession();
    } catch {
      // cookie may still be set by AuthProvider; continue to subscribe
    }
    window.location.assign("/subscribe");
  }

  const className = `inline-flex w-full items-center justify-center h-[48px] px-6 rounded-full text-[14px] font-semibold tracking-tight transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-wait disabled:hover:translate-y-0 ${
    highlight
      ? "bg-[#111111] text-white"
      : "bg-white text-[#111111] border border-[#111111]"
  }`;

  if (isSignedIn) {
    return (
      <Link href="/subscribe" className={className}>
        {ctaLabel}
        <span aria-hidden className="ml-1">
          →
        </span>
      </Link>
    );
  }

  return (
    <button type="button" disabled={busy} onClick={signInThenSubscribe} className={className}>
      {busy ? "Signing in…" : ctaLabel}
      {!busy && (
        <span aria-hidden className="ml-1">
          →
        </span>
      )}
    </button>
  );
}
