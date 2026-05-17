"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 4000;
const MAX_POLLS = 4; // give up after ~16 s — if it hasn't resolved by then it won't

/**
 * Shown briefly after batch-tracking new stocks while the watchlist rebuild
 * runs in the background. Polls via router.refresh() up to MAX_POLLS times,
 * then hides itself — so a rebuild failure or a permanent data gap (stock with
 * no price data) doesn't leave the banner stuck on screen forever.
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
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (forceVisible) return;
    if (hidden) return;
    const id = setInterval(() => {
      polls.current += 1;
      if (polls.current >= MAX_POLLS) {
        clearInterval(id);
        setHidden(true);
        return;
      }
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [router, hidden, forceVisible]);

  if (!forceVisible && hidden) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#fcd34d] bg-[#fffbeb] px-4 py-3.5 text-[12.5px] text-[#92400e] shadow-[0_0_0_3px_rgba(251,191,36,0.12)]">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f59e0b] opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
      </span>
      <span className="font-medium">
        Radar is updating —{" "}
        {pendingCount} new {pendingCount === 1 ? "stock" : "stocks"} being processed.
        {forceVisible
          ? " Test mode is on so this banner stays visible."
          : " Hang tight, this usually takes a few seconds."}
      </span>
    </div>
  );
}
