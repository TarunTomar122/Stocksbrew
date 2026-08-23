"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

import { proCtaClassName } from "@/components/pro-cta";
import { useUser } from "@/lib/auth-context";
import {
  type PaywallSurface,
  trackCheckoutClicked,
  trackCheckoutStarted,
  trackPaywallShown,
  trackPaywallUnlockClicked,
} from "@/lib/product-analytics";
import { captureEvent } from "@/lib/posthog";
import { signInWithGoogle } from "@/lib/sign-in";
import { startDodoCheckout } from "@/lib/dodo-checkout-client";

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
  if (variant === "mover") return [];
  const pool = REDDIT_LINES;
  const i = hashTicker(ticker) % pool.length;
  const primary = pool[i](ticker);
  const secondary = "Catalyst theme · mention velocity";
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
        // "Sign in for more" must deliver the free signed-in view instead of
        // dumping a new account straight into checkout. Refreshing preserves
        // the page and lets the server reveal the additional free rows.
        captureEvent("free_feed_unlocked", { surface });
        router.refresh();
      } catch {
        /* cancelled */
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    trackCheckoutClicked({ period: "monthly", market: "US", signedIn: true });
    try {
      const checkoutUrl = await startDodoCheckout();
      trackCheckoutStarted({ period: "monthly", market: "US" });
      window.location.assign(checkoutUrl);
    } catch (err) {
      console.error("direct checkout failed", err);
      setBusy(false);
    }
  }

  return { user, busy, handleUnlock };
}

/** One sign-in / unlock CTA for a whole feed section. */
export function FeedUnlockBar({
  surface,
  className = "",
  buttonClassName = "",
  description,
  compact = false,
  signedOutLabel = "Start your 3-day free trial",
  signedInLabel = "Unlock Pro",
}: {
  surface: PaywallSurface;
  className?: string;
  buttonClassName?: string;
  description?: string;
  compact?: boolean;
  signedOutLabel?: string;
  signedInLabel?: string;
}) {
  const { user, busy, handleUnlock } = useFeedUnlockCta(surface);
  const label = busy ? "Signing in…" : user ? signedInLabel : signedOutLabel;

  return (
    <div
      className={`flex items-center justify-center gap-3 px-4 ${
        compact ? "py-4" : "py-6"
      } ${className}`}
    >
      {description ? <p className="text-center text-[13px] text-on-surface-variant">{description}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={handleUnlock}
        className={proCtaClassName({
          size: compact ? "sm" : "md",
          className: `${compact ? "!py-1.5 !px-4 !text-[12px]" : ""} ${buttonClassName}`,
        })}
      >
        {label}
      </button>
    </div>
  );
}

/** A single in-panel gate for all rows hidden below a free preview. */
export function FeedLockedSection({
  surface,
  count,
  noun,
  signedOutLabel = "Start your 3-day free trial",
  signedInLabel = "Unlock Pro",
}: {
  surface: PaywallSurface;
  count: number;
  noun: string;
  signedOutLabel?: string;
  signedInLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant bg-surface-container px-4 py-4 sm:px-5">
      <div>
        <p className="text-[13px] font-semibold text-on-surface">{count} more {noun}</p>
        <p className="mt-0.5 text-[11.5px] text-on-surface-variant">Research details are available with Pro.</p>
      </div>
      <FeedUnlockBar
        surface={surface}
        compact
        className="!justify-start !p-0"
        signedOutLabel={signedOutLabel}
        signedInLabel={signedInLabel}
      />
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
  signedOutLabel = "Start your 3-day free trial",
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
