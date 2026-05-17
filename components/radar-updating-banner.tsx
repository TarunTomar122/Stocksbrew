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
    <div className="flex items-center gap-3 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3.5 text-[12.5px] text-[#1e3a8a] shadow-[0_1px_0_rgba(30,64,175,0.08)]">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-[#1d4ed8]">
        <span className="h-3.5 w-3.5 rounded-full border-2 border-[#93c5fd] border-t-[#1d4ed8] animate-spin" />
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
