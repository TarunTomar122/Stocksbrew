"use client";

import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { useUser } from "@/lib/auth-context";
import { currentFirebaseUser, signedInNow, signInWithGoogle } from "@/lib/sign-in";
import Link from "next/link";

/** Saves the strategy to the signed-in user's own list through /api/strategies/track. */
export function TrackStrategyButton({
  slug,
  initialTracked,
  canFollow,
}: {
  slug: string;
  initialTracked: boolean;
  /** False below Pro: show the way to Pro instead of a button that can only fail. */
  canFollow: boolean;
}) {
  const { user, initialAuthed } = useUser();
  const [tracked, setTracked] = React.useState(initialTracked);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const signedIn = Boolean(user) || initialAuthed;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!signedIn && !(signedInNow() ?? Boolean(await currentFirebaseUser()))) await signInWithGoogle({ surface: "unknown" });
      const next = !tracked;
      const response = await fetch("/api/strategies/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, tracked: next }),
      });
      if (!response.ok) {
        throw new Error(
          response.status === 401 ? "Sign in to track a strategy." : response.status === 403 ? "Following a strategy is part of Pro." : "That did not save. Try again.",
        );
      }
      setTracked(next);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      // Closing the sign-in popup is not an error worth showing.
      if (message && !/popup|cancel/i.test(message)) setError(message);
    } finally {
      setBusy(false);
    }
  };

  // Below Pro, a strategy not already followed gets a link to Pro. Someone who followed one before can still stop.
  if (!canFollow && !tracked) {
    return (
      <Link prefetch={false}
        href="/pricing"
        className="inline-flex h-9 items-center rounded-lg bg-oa-primary px-3 text-sm font-medium text-oa-primary-fg outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]"
      >
        Track with Pro
      </Link>
    );
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <OaButton variant={tracked ? "secondary" : "primary"} size="md" loading={busy} onClick={toggle} aria-pressed={tracked}>
        {tracked ? "Tracking ✓" : "Track this"}
      </OaButton>
      {error ? (
        <span role="alert" className="text-[12px] text-signal-bearish">
          {error}
        </span>
      ) : null}
    </span>
  );
}
