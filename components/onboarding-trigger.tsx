"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth-context";

const STORAGE_KEY = "tikrr_onboarded";

export function OnboardingTrigger() {
  const { user, initialAuthed } = useUser();
  const router = useRouter();
  const prevUserId = useRef<string | null>(null);

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
      return;
    }
    // User was already set on mount — not a fresh sign-in
    if (prevUserId.current === user.uid) return;
    prevUserId.current = user.uid;

    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {}

    const t = setTimeout(() => router.push("/onboarding"), 600);
    return () => clearTimeout(t);
  }, [user, router]);

  return null;
}
