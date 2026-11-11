"use client";

import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { useUser } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { signInWithGoogle } from "@/lib/sign-in";
import Link from "next/link";

/** Follows a plain-English basket through /api/baskets/follow. The server freezes today's members and prices. */
export function FollowBasketButton({ slug, initialFollowed }: { slug: string; initialFollowed: boolean }) {
  const { user, initialAuthed } = useUser();
  const [followed, setFollowed] = React.useState(initialFollowed);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ text: string; pro: boolean } | null>(null);
  const signedIn = Boolean(user) || initialAuthed;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!signedIn && !getFirebaseAuth().currentUser) await signInWithGoogle({ surface: "unknown" });
      const next = !followed;
      const response = await fetch("/api/baskets/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, followed: next }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string; followed?: boolean };
      if (!response.ok) {
        if (response.status === 401) throw new Error("Sign in to follow a basket.");
        if (body.error === "plan_limit") {
          setError({ text: body.message ?? "Your plan's basket limit is reached.", pro: true });
          return;
        }
        if (body.error === "profile_not_ready") throw new Error("Your account is still being set up. Try again in a few seconds.");
        throw new Error(body.message ?? "That did not save. Try again.");
      }
      setFollowed(body.followed ?? next);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      // Closing the sign-in popup is not an error worth showing.
      if (message && !/popup|cancel/i.test(message)) setError({ text: message, pro: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex max-w-[22rem] flex-col gap-1">
      <OaButton variant={followed ? "secondary" : "primary"} size="md" loading={busy} onClick={toggle} aria-pressed={followed}>
        {followed ? "Following ✓" : "Follow this basket"}
      </OaButton>
      {error ? (
        <span role="alert" className="text-[12.5px] leading-[18px] text-oa-muted-fg">
          {error.text}{" "}
          {error.pro ? (
            <Link prefetch={false} href="/pricing" className="text-oa-primary underline underline-offset-2">
              See Pro
            </Link>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
