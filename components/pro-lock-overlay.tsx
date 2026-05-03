"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";

type Props = {
  title?: string;
  description?: string;
};

/**
 * Drop this inside any `relative overflow-hidden` container.
 * For signed-out users: fires Google sign-in then redirects to /subscribe.
 * For signed-in free users: goes straight to /subscribe.
 */
export function ProLockOverlay({
  title = "Pro only",
  description = "Subscribe for full access.",
}: Props) {
  const { user } = useUser();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleUnlock() {
    if (!user) {
      setBusy(true);
      try {
        await signInWithGoogle();
        router.push("/subscribe");
      } catch (err) {
        console.error("sign-in failed", err);
      } finally {
        setBusy(false);
      }
      return;
    }
    router.push("/subscribe");
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-white/70 backdrop-blur-[6px]">
      <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-2xl bg-white border border-[#e5e7eb] shadow-[0_8px_30px_rgba(17,24,39,0.08)] text-center max-w-[300px]">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#111111]">
          <span
            className="material-symbols-outlined text-white"
            style={{ fontSize: 20, fontVariationSettings: "'wght' 600" }}
            aria-hidden
          >
            lock
          </span>
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-[14px] font-semibold text-[#111111]">{title}</span>
          <span className="text-[12px] text-[#6b7280] leading-snug">{description}</span>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={handleUnlock}
          className="inline-flex items-center justify-center h-9 px-5 rounded-full bg-[#111111] text-white text-[13px] font-semibold tracking-tight hover:-translate-y-[1px] active:translate-y-0 transition-transform disabled:opacity-60 disabled:cursor-wait"
        >
          {busy ? "Signing you in…" : "Get Pro"}
        </button>
      </div>
    </div>
  );
}
