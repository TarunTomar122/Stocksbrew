"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";

import { useUser } from "@/lib/auth-context";
import { addPicks, couldNotAddMessage, hasPendingPicks, savePendingPicks, takePendingPicks, type PendingPick } from "@/lib/pending-picks";
import { captureEvent } from "@/lib/posthog";
import { POST_SIGNUP_ONBOARDING_PENDING, POST_SIGNUP_ONBOARDING_SEEN } from "@/lib/sign-in";

// Mounted on every page (app/providers.tsx) but opened once, after sign-up, so the dialog (search, logos, the
// popular list) loads only when it is shown.
const OnboardingDialog = dynamic(() => import("@/components/onboarding-dialog").then((mod) => mod.OnboardingDialog), {
  ssr: false,
});

/** Where stocks picked before sign-in end up. */
const MY_STOCKS = "/portfolio";

/**
 * After sign-up: get a few stocks in, then go to My stocks, where each one has our call. Opens once, when
 * lib/sign-in.ts marks a brand-new account.
 *
 * Stocks picked on the landing before signing in (lib/pending-picks.ts) are added here instead, on the first page
 * that loads with a session, and the dialog stays shut: those people already chose. The landing itself ("/") is
 * skipped, because a fresh sign-in there is about to move on to My stocks and would cut the adds short. If none of
 * them could be added, the dialog opens on them with the failure said once, so one tap tries again; if only some
 * failed, those are tried again on the next page the person opens.
 */
export function PostSignupOnboarding() {
  const { user, initialAuthed } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [retry, setRetry] = useState<{ picks: PendingPick[]; message: string } | undefined>(undefined);
  const adding = useRef(false);

  useEffect(() => {
    if (!(user || initialAuthed)) return;
    // While picks from the landing are being added, the first-run dialog stays shut.
    if (adding.current) return;
    if (hasPendingPicks()) {
      if (pathname === "/") return;
      const taken = takePendingPicks();
      if (!taken) return;
      // Until the adds settle: a later run of this effect (Firebase restoring `user`, a client navigation) must not
      // open the dialog over the stocks being added or add them twice. addPicks marks the dialog seen once one is in.
      adding.current = true;
      void addPicks(taken.picks)
        .then(({ added, failed, signedOut }) => {
          captureEvent("landing_picks_added", { count: added, failed: failed.length });
          if (added === 0) {
            adding.current = false;
            // A lost session cannot be fixed from here: the person has to sign in again anyway.
            if (signedOut) return;
            setRetry({ picks: failed, message: couldNotAddMessage(failed) });
            setOpen(true);
            captureEvent("onboarding_viewed", { retry: true });
            return;
          }
          // A failure that may pass (a slow new profile, the network) is tried again on the next page the person
          // opens, a client navigation included (this component stays mounted and re-runs on the new path).
          if (failed.length && !signedOut) savePendingPicks(failed, taken.tries + 1);
          // Only the first try after sign-in moves on to My stocks; a retry on a page the person chose to open
          // leaves them there (the counts update through dispatchRadarTrackChanged in addPicks).
          if (pathname === MY_STOCKS || taken.tries > 0) {
            adding.current = false;
            router.refresh();
          } else {
            window.location.assign(MY_STOCKS);
          }
        })
        .catch(() => {
          adding.current = false;
        });
      return;
    }
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
  }, [user, initialAuthed, pathname, router]);

  if (!open) return null;
  return (
    <OnboardingDialog
      retry={retry}
      onClosed={() => {
        setOpen(false);
        setRetry(undefined);
      }}
    />
  );
}
