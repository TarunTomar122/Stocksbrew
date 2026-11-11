"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import { ProCtaLink } from "@/components/pro-cta";
import { FREE_RADAR_TRACK_LIMIT } from "@/lib/pro-features";
import { captureEvent } from "@/lib/posthog";

export function RadarFreeLimitModal({
  open,
  onClose,
  limit = FREE_RADAR_TRACK_LIMIT,
}: {
  open: boolean;
  onClose: () => void;
  limit?: number;
}) {
  useEffect(() => {
    if (!open) return;
    captureEvent("radar_free_limit_modal_shown", { limit });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, limit]);

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="radar-free-limit-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-on-surface/50 backdrop-blur-sm"
      />
      <div className="relative z-[1] w-full max-w-[440px] rounded-3xl border border-outline-variant bg-surface p-6 shadow-[0_24px_70px_rgba(17,24,39,0.18)]">
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-outline-variant tint-warn px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b45309]">
            Free · {limit}/{limit} stocks
          </span>
          <h2 id="radar-free-limit-title" className="text-[20px] font-semibold tracking-[-0.02em] text-on-surface">
            You&apos;ve hit the free Watchlist limit
          </h2>
          <p className="text-[14px] leading-relaxed text-on-surface-variant">
            Free follows up to {limit} stocks and swaps one a week. Remove one to make room, or go Pro and follow every stock you own.
          </p>
        </div>

        <ul className="mt-4 space-y-2 text-[13px] text-on-surface">
          {[
            "Unlimited stocks in Watchlist",
            "Daily buy / hold / sell call on each name",
            "Whole-book diagnosis and alerts",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <span className="mt-[0.35rem] font-mono text-[12px] text-[var(--signal-bullish)]" aria-hidden>
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[40px] items-center justify-center rounded-full border border-outline-variant bg-surface px-4 text-[13px] font-semibold text-on-surface transition-colors hover:border-on-surface"
          >
            Not now
          </button>
          <ProCtaLink
            href="/subscribe?from=radar_limit"
            size="sm"
            showStar
            className="h-[40px] px-5"
            onClick={() => captureEvent("radar_free_limit_upgrade_clicked", { limit })}
          >
            Get Pro
          </ProCtaLink>
        </div>

        <p className="mt-4 text-center text-[11px] text-on-surface-variant">
          Or{" "}
          <Link href="/portfolio?tab=holdings" className="font-semibold text-on-surface underline-offset-2 hover:underline">
            manage your Watchlist
          </Link>{" "}
          to remove a stock first.
        </p>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
