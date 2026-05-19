"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { flushWatchlistRebuild } from "@/lib/radar-client-refresh";

/**
 * Invisible client component that kicks off a watchlist rebuild and polls
 * router.refresh() every 5s so the BuildingState screen auto-advances once
 * the radar view is ready.
 */
export function BuildingStateRefresher() {
  const router = useRouter();

  useEffect(() => {
    flushWatchlistRebuild(router, 250);
    const id = setInterval(() => {
      router.refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [router]);

  return (
    <p className="text-[12px] text-[#9ca3af]">
      Checking automatically. No need to refresh.
    </p>
  );
}
