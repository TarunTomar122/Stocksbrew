"use client";

import * as React from "react";

import { useUser } from "@/lib/auth-context";
import { trackFollowClicked, trackLimitHit } from "@/lib/product-analytics";
import { signInWithGoogle } from "@/lib/sign-in";
import Link from "next/link";

/**
 * Saves a source to the signed-in person's own list. Signed out, the same
 * button starts sign-in and then follows, so nobody has to click twice.
 */
export function FollowButton({
  slug,
  name,
  followed,
  onChange,
  onMessage,
  size = "sm",
}: {
  slug: string;
  name: string;
  followed: boolean;
  onChange?: (slug: string, followed: boolean) => void;
  /** Told when the server refuses for a reason worth reading (the plan's follow limit). */
  onMessage?: (message: string | null) => void;
  size?: "sm" | "md";
}) {
  const { user, initialAuthed } = useUser();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [local, setLocal] = React.useState(followed);
  React.useEffect(() => setLocal(followed), [followed]);

  async function save(
    next: boolean,
  ): Promise<{ ok: boolean; code: string; message: string }> {
    const response = await fetch("/api/follow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, follow: next }),
    });
    if (response.ok) return { ok: true, code: "", message: "" };
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    return { ok: false, code: body?.error ?? "", message: body?.message ?? "" };
  }

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setError(false);
    setNotice(null);
    onMessage?.(null);
    const next = !local;
    try {
      if (!user && !initialAuthed) {
        await signInWithGoogle({ surface: "header" });
      }
      let result = await save(next);
      if (!result.ok && result.code === "profile_not_ready") {
        // A brand-new account's profile doc can lag the session by a moment.
        await new Promise((resolve) => setTimeout(resolve, 1200));
        result = await save(next);
      }
      if (!result.ok && result.code === "plan_limit") {
        trackFollowClicked({ slug, followed: next, signed_in: Boolean(user || initialAuthed), outcome: "limit" });
        trackLimitHit({ feature: "followed_sources", code: "plan_limit" });
        const text =
          result.message ||
          "Your plan's follow limit is reached. Unfollow one to follow this one.";
        setNotice(text);
        onMessage?.(text);
        return;
      }
      if (!result.ok) throw new Error("follow failed");
      trackFollowClicked({ slug, followed: next, signed_in: Boolean(user || initialAuthed), outcome: "ok" });
      setLocal(next);
      onChange?.(slug, next);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const shape =
    size === "md" ? "h-10 px-4 text-[14px] sm:h-9" : "h-10 px-3 text-[13px] lg:h-7 lg:px-2.5 lg:text-[12px]";
  const tone = local
    ? "border-oa-primary/40 bg-[color-mix(in_srgb,var(--oa-primary)_12%,transparent)] text-oa-primary"
    : "border-oa-border bg-oa-card text-oa-fg hover:border-oa-fg/40";
  const button = (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-pressed={local}
      aria-label={local ? `Stop following ${name}` : `Follow ${name}`}
      title={notice ?? (error ? "That did not save. Try again." : undefined)}
      className={`inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] disabled:opacity-60 ${shape} ${tone}`}
    >
      {notice
        ? "Limit reached"
        : error
          ? "Try again"
          : local
            ? "Following"
            : "Follow"}
    </button>
  );
  // In a table row the page shows the reason once, above the table. On a profile it sits under the button.
  if (size !== "md" || !notice) return button;
  return (
    <span className="flex flex-col items-end gap-1">
      {button}
      <span
        role="status"
        className="max-w-[16rem] text-right text-[12px] leading-4 text-oa-muted-fg"
      >
        {notice}{" "}
        <Link prefetch={false}
          href="/pricing"
          className="underline decoration-oa-border underline-offset-[3px] hover:text-oa-fg"
        >
          See plans
        </Link>
      </span>
    </span>
  );
}
