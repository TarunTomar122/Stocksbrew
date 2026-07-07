"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

import { proCtaClassName } from "@/components/pro-cta";
import { useUser } from "@/lib/auth-context";
import {
  type PaywallSurface,
  trackPaywallShown,
  trackPaywallUnlockClicked,
} from "@/lib/product-analytics";
import { signInWithGoogle } from "@/lib/sign-in";

const MOVER_LINES = [
  (ticker: string) =>
    `${ticker} surges on analyst upgrade as AI demand outlook strengthens across the group.`,
  () => `Shares jump after earnings beat and raised guidance surprise the street.`,
  (ticker: string) =>
    `${ticker} rallies on sector tailwinds and fresh institutional buying interest.`,
  () => `Move tied to product catalyst chatter and upward estimate revisions this week.`,
];

const REDDIT_LINES = [
  (ticker: string) =>
    `Retail crowd leans bullish on ${ticker} after fresh product hype and momentum posts.`,
  () => `Thread heat building around earnings setup and whether the move can hold.`,
  () => `Debate centers on valuation vs growth — mentions spiking across r/stocks today.`,
];

function hashTicker(ticker: string): number {
  let h = 0;
  for (let i = 0; i < ticker.length; i++) h = (h + ticker.charCodeAt(i) * (i + 1)) % 9973;
  return h;
}

function placeholderLines(ticker: string, variant: "mover" | "reddit"): string[] {
  const pool = variant === "mover" ? MOVER_LINES : REDDIT_LINES;
  const i = hashTicker(ticker) % pool.length;
  const primary = pool[i](ticker);
  const secondary =
    variant === "mover"
      ? "Setup context, confidence, and what to watch next."
      : "Catalyst theme · mention velocity";
  return [primary, secondary];
}

/** Blurred placeholder only — no per-row CTA. Pair with {@link FeedUnlockBar}. */
export function FeedRowLockedBlur({
  variant,
  ticker,
  previewLines,
  size = "inline",
  dense = false,
  className = "",
}: {
  variant: "mover" | "reddit";
  ticker: string;
  previewLines?: string[];
  size?: "block" | "inline";
  dense?: boolean;
  className?: string;
}) {
  const lines = previewLines?.length ? previewLines : placeholderLines(ticker, variant);
  const primary = lines[0] ?? "";
  const secondary = lines[1];

  if (size === "inline") {
    return (
      <p
        aria-hidden
        className={`pointer-events-none select-none leading-snug text-on-surface-variant blur-[5px] ${
          dense ? "text-[12px]" : "text-[13px]"
        } ${className}`}
      >
        {primary}
      </p>
    );
  }

  return (
    <div aria-hidden className={`pointer-events-none select-none space-y-1.5 blur-[6px] ${className}`}>
      <p
        className={
          dense
            ? "text-[12px] leading-relaxed text-[#374151]"
            : "text-[15px] font-semibold leading-snug text-on-surface"
        }
      >
        {primary}
      </p>
      {secondary ? (
        <p
          className={
            dense
              ? "text-[11px] leading-relaxed text-[#6b7280]"
              : "text-[13px] leading-relaxed text-on-surface-variant"
          }
        >
          {secondary}
        </p>
      ) : null}
      {variant === "reddit" ? (
        <span
          className={`inline-block rounded-md bg-[#ecfdf5] px-2 py-0.5 font-semibold text-[#10b981] ${
            dense ? "text-[10px]" : "text-[11px]"
          }`}
        >
          Catalyst theme
        </span>
      ) : null}
    </div>
  );
}

function useFeedUnlockCta(surface: PaywallSurface) {
  const { user } = useUser();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    trackPaywallShown({ surface, signedIn: Boolean(user) });
  }, [surface, user]);

  async function handleUnlock(e?: MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    trackPaywallUnlockClicked({ surface, signedIn: Boolean(user) });
    if (!user) {
      setBusy(true);
      try {
        await signInWithGoogle({ surface: "paywall" });
        router.push("/subscribe");
      } catch {
        /* cancelled */
      } finally {
        setBusy(false);
      }
      return;
    }
    router.push("/subscribe");
  }

  return { user, busy, handleUnlock };
}

/** One sign-in / unlock CTA for a whole feed section. */
export function FeedUnlockBar({
  surface,
  className = "",
  compact = false,
  signedOutLabel = "Sign in free",
  signedInLabel = "Unlock Pro",
}: {
  surface: PaywallSurface;
  className?: string;
  compact?: boolean;
  signedOutLabel?: string;
  signedInLabel?: string;
}) {
  const { user, busy, handleUnlock } = useFeedUnlockCta(surface);
  const label = busy ? "Signing in…" : user ? signedInLabel : signedOutLabel;

  return (
    <div
      className={`flex items-center justify-center border-t border-outline-variant bg-surface-container-lowest px-4 py-3.5 ${
        compact ? "py-3" : "py-4"
      } ${className}`}
    >
      <button
        type="button"
        disabled={busy}
        onClick={handleUnlock}
        className={proCtaClassName({
          size: compact ? "sm" : "md",
          className: compact ? "!py-1.5 !px-4 !text-[12px]" : "",
        })}
      >
        {label}
      </button>
    </div>
  );
}

/**
 * Sticky unlock banner that pins to viewport bottom on mobile.
 * Wrap your locked feed section with this — it shows a fixed CTA
 * when the inline FeedUnlockBar scrolls out of view.
 */
export function FeedStickyUnlock({
  surface,
  signedOutLabel = "Sign in free",
  signedInLabel = "Unlock Pro",
}: {
  surface: PaywallSurface;
  signedOutLabel?: string;
  signedInLabel?: string;
}) {
  const { user, busy, handleUnlock } = useFeedUnlockCta(surface);
  const [show, setShow] = useState(false);
  const sentinelRef = { current: null as HTMLDivElement | null };

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShow(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const label = busy ? "Signing in…" : user ? signedInLabel : signedOutLabel;

  return (
    <>
      {/* Sentinel: invisible div at the inline unlock bar position */}
      <div ref={sentinelRef} aria-hidden className="h-0" />
      {/* Sticky banner — only visible when sentinel is off-screen */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center border-t border-outline-variant bg-surface p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] transition-transform duration-200 sm:hidden ${
          show ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <button
          type="button"
          disabled={busy}
          onClick={handleUnlock}
          className={proCtaClassName({ size: "md", className: "w-full" })}
        >
          {label}
        </button>
      </div>
    </>
  );
}

/** @deprecated Use FeedRowLockedBlur + FeedUnlockBar */
export const FeedRowLockTeaser = FeedRowLockedBlur;
