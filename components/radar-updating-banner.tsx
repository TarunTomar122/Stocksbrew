"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { scheduleWatchlistRebuild } from "@/lib/radar-client-refresh";

const POLL_MS = 4000;
const MAX_POLLS = 22; // ~88s — then stop polling; badge clears when rebuild lands on next navigation

/**
 * Shown while the materialized watchlist view is behind the user's profile version.
 * Triggers a rebuild on mount and polls router.refresh() until the server page
 * unmounts this banner (versions caught up) or MAX_POLLS is reached.
 */
export function RadarUpdatingBanner({
  pendingCount,
  forceVisible = false,
}: {
  pendingCount: number;
  forceVisible?: boolean;
}) {
  const router = useRouter();
  const polls = useRef(0);

  useEffect(() => {
    if (forceVisible) return;

    scheduleWatchlistRebuild(0);
    router.refresh();

    const id = setInterval(() => {
      polls.current += 1;
      if (polls.current >= MAX_POLLS) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, POLL_MS);

    return () => clearInterval(id);
  }, [router, forceVisible]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#fcd34d] bg-[#fffbeb] px-4 py-3.5 text-[12.5px] text-[#92400e] shadow-[0_0_0_3px_rgba(251,191,36,0.12)]">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f59e0b] opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
      </span>
      <span className="font-medium">
        Radar is updating.{" "}
        {pendingCount > 0
          ? `${pendingCount} new ${pendingCount === 1 ? "stock" : "stocks"} being processed.`
          : "Refreshing your analysis."}{" "}
        {forceVisible
          ? "Test mode is on so this banner stays visible."
          : "Hang tight, this usually takes a few seconds."}
      </span>
    </div>
  );
}
