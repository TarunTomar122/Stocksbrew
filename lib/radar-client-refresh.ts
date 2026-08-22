"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

/** Queue a server-side watchlist view rebuild (debounced for rapid mutations). */
export function scheduleWatchlistRebuild(debounceMs = 400): void {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    void fetch("/api/watchlist/refresh", { method: "POST" }).catch(() => undefined);
  }, debounceMs);
}

/** Run rebuild immediately — use after batch track calls finish. */
export function flushWatchlistRebuild(
  router?: AppRouterInstance,
  refreshDelayMs = 300,
): Promise<void> {
  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
    rebuildTimer = null;
  }
  // Profile writes are already complete when this helper runs. Refresh once
  // now so position changes appear immediately; refresh again after the
  // materialized view rebuild finishes for the rest of the page data.
  if (router) router.refresh();
  return fetch("/api/watchlist/refresh", { method: "POST" })
    .catch(() => undefined)
    .finally(() => {
      if (router) setTimeout(() => router.refresh(), refreshDelayMs);
    })
    .then(() => undefined);
}

/** Kick off rebuild + re-fetch the current RSC page after a track mutation. */
export function triggerRadarBackgroundRefresh(router: AppRouterInstance, delayMs = 250): void {
  scheduleWatchlistRebuild();
  setTimeout(() => router.refresh(), delayMs);
}
