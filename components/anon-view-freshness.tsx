"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** By default a cached copy older than this is refreshed once it is on screen. */
const DEFAULT_MAX_AGE_MINUTES = 5;
/** When to ask again: the CDN rebuilds the copy in the background after serving the stale one. */
const REFRESH_AFTER_MS = [2_000, 7_000];


/**
 * The cached logged-out pages (lib/anon-view.ts) are rebuilt at most once a
 * minute, and only when someone asks for them: the first visitor after a quiet
 * night gets last night's copy while the new one is built. This swaps in the
 * fresh copy once it is ready (two tries, then it gives up). It draws nothing.
 */
export function AnonViewFreshness({
  renderedAt,
  maxAgeMinutes = DEFAULT_MAX_AGE_MINUTES,
}: {
  renderedAt: string;
  /** Set it well above the page's rebuild interval, or a fresh-enough copy gets refreshed for nothing. */
  maxAgeMinutes?: number;
}) {
  const router = useRouter();
  const isStale = (iso: string) => Date.now() - Date.parse(iso) > maxAgeMinutes * 60_000;
  // The latest copy's time: a refresh that brought a fresh copy cancels the next try.
  const latest = useRef(renderedAt);
  latest.current = renderedAt;

  useEffect(() => {
    if (!isStale(latest.current)) return;
    const timers = REFRESH_AFTER_MS.map((delay) =>
      window.setTimeout(() => {
        if (isStale(latest.current)) router.refresh();
      }, delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // Once per page: another stock mounts its own copy of this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
