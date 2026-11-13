import { createIpRateLimiter } from "@/lib/ip-rate-limit";

/**
 * Replays read a few years of history for up to about 28 companies, so one person may start at most this many in ten
 * minutes (the replay route, saving a new basket and saving an edit all count). In memory, per server: it stops one
 * person hammering the store, nothing more.
 */
export const REPLAYS_PER_WINDOW = 8;
const takeReplay = createIpRateLimiter({
  limit: REPLAYS_PER_WINDOW,
  windowMs: 10 * 60_000,
});

export function replayAllowed(
  uid: string,
  now: number = Date.now(),
): { ok: true } | { ok: false; retryAfterSec: number } {
  return takeReplay(`basket-replay:${uid}`, now);
}

export function tooManyReplays(retryAfterSec: number): {
  body: { error: string };
  init: ResponseInit;
} {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return {
    body: {
      error: `That's a lot of replays at once. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
    },
    init: { status: 429, headers: { "retry-after": String(retryAfterSec) } },
  };
}
