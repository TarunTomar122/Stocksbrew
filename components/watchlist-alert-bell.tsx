"use client";

import { AnimatedIcon } from "@/components/animated-icon";

/**
 * One-tap watch: sets a "10% below" price alert, or removes it when one
 * already exists. The API call lives in the parent so the bell stays dumb.
 */
export function WatchlistAlertBell({
  ticker,
  existingAlertId,
  onCreate,
  onDelete,
}: {
  ticker: string;
  existingAlertId: string | null;
  onCreate: () => void;
  onDelete: () => void;
}) {
  const active = existingAlertId != null;
  return (
    <button
      type="button"
      onClick={active ? onDelete : onCreate}
      aria-label={
        active ? `Remove the alert for ${ticker}` : `Watch ${ticker} ten percent below the current price`
      }
      aria-pressed={active}
      title={active ? "Alert set, click to remove" : "Watch 10% below"}
      className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] active:translate-y-px ${
        active
          ? "border-transparent text-oa-primary-fg"
          : "border-oa-border text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
      }`}
      style={
        active
          ? { background: "var(--oa-primary)" }
          : undefined
      }
    >
      <AnimatedIcon name={active ? "notifications_active" : "notifications"} size={15} aria-hidden />
    </button>
  );
}
