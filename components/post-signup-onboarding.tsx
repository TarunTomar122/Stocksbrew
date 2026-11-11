"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { useUser } from "@/lib/auth-context";
import { captureEvent } from "@/lib/posthog";
import { POST_SIGNUP_ONBOARDING_PENDING, POST_SIGNUP_ONBOARDING_SEEN } from "@/lib/sign-in";

// Mounted on every page (app/providers.tsx) but opened once, after sign-up, so the dialog (search, logos, the
// popular list) loads only when it is shown.
const OnboardingDialog = dynamic(() => import("@/components/onboarding-dialog").then((mod) => mod.OnboardingDialog), {
  ssr: false,
});

/**
 * After sign-up: get a few stocks in, then go to My stocks, where each one has our call. Opens once, when
 * lib/sign-in.ts marks a brand-new account.
 */
export function PostSignupOnboarding() {
  const { user, initialAuthed } = useUser();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!(user || initialAuthed)) return;
    let pending = false;
    let seen = false;
    try {
      pending = localStorage.getItem(POST_SIGNUP_ONBOARDING_PENDING) === "1";
      seen = localStorage.getItem(POST_SIGNUP_ONBOARDING_SEEN) === "1";
    } catch {
      return;
    }
    if (!pending || seen) return;
    setOpen(true);
    captureEvent("onboarding_viewed");
  }, [user, initialAuthed]);

  if (!open) return null;
  return <OnboardingDialog onClosed={() => setOpen(false)} />;
}
