"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth-context";

const STORAGE_KEY = "tikrr_onboarded";
const PROFILE_TIMEOUT_MS = 8000;
const PROFILE_RETRY_DELAY_MS = 350;
const PROFILE_MAX_ATTEMPTS = 3;

export function OnboardingTrigger() {
  const { user, initialAuthed } = useUser();
  const router = useRouter();
  const prevUserId = useRef<string | null>(null);
  const [booting, setBooting] = useState(false);
  const [showNetworkHelp, setShowNetworkHelp] = useState(false);

  // On mount: if user was already signed in, mark them as seen so we never trigger
  useEffect(() => {
    if (initialAuthed && user) {
      prevUserId.current = user.uid;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) {
      prevUserId.current = null;
      setBooting(false);
      setShowNetworkHelp(false);
      return;
    }
    // User was already set on mount — not a fresh sign-in
    if (prevUserId.current === user.uid) return;
    prevUserId.current = user.uid;

    let cancelled = false;
    setBooting(true);
    setShowNetworkHelp(false);

    // Non-blocking warm-up for home payload while profile check runs.
    router.prefetch("/");

    const timeout = setTimeout(() => {
      if (!cancelled) setShowNetworkHelp(true);
    }, PROFILE_TIMEOUT_MS);

    void (async () => {
      let payload: { exists?: boolean; onboarding_completed?: boolean } | null = null;
      for (let attempt = 1; attempt <= PROFILE_MAX_ATTEMPTS; attempt += 1) {
        try {
          const res = await fetch("/api/user/profile", { cache: "no-store" });
          if (res.ok) {
            payload = (await res.json()) as { exists?: boolean; onboarding_completed?: boolean };
            break;
          }
        } catch {
          // Keep splash + connectivity helper behavior.
        }
        if (attempt < PROFILE_MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, PROFILE_RETRY_DELAY_MS));
        }
      }

      if (cancelled) return;

      if (!payload) {
        // Could not get authoritative profile after retries; avoid false onboarding.
        setBooting(false);
        setShowNetworkHelp(false);
        return;
      }

      if (payload.exists && payload.onboarding_completed) {
        try {
          localStorage.setItem(STORAGE_KEY, "1");
        } catch {
          // best effort
        }
        setBooting(false);
        setShowNetworkHelp(false);
        return;
      }

      setBooting(false);
      setShowNetworkHelp(false);
      router.push("/onboarding");
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [user, router]);

  if (!booting) return null;

  return (
    <div className="fixed inset-0 z-[140] bg-white">
      <div className="flex h-full w-full items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#111111]" />
            <p className="text-[14px] font-medium text-[#111111]">
              Syncing your profile…
            </p>
          </div>
          {showNetworkHelp && (
            <div className="mt-4 rounded-xl border border-[#fee2e2] bg-[#fef2f2] p-3">
              <p className="text-[13px] text-[#991b1b]">
                This is taking longer than expected. Check your internet connection and try again.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-[#111111] px-3 text-[12px] font-semibold text-white hover:bg-black"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
