import { FREE_COVERED_STOCKS } from "@/lib/entitlements";

/**
 * How many stocks a Free account can track: no limit (lib/entitlements.ts:
 * tracked_stocks). It was 3 until 2026-11-09 and 5 until 2026-11-10. The
 * number that is limited now is coverage, FREE_COVERED_STOCKS, enforced in
 * lib/entitlements-coverage.ts. Kept as a constant so old callers compile;
 * anything that prints it must check Number.isFinite first.
 */
export const FREE_RADAR_TRACK_LIMIT = Number.POSITIVE_INFINITY;
/** Stocks the agent covers in full on Free. */
export const FREE_RADAR_COVERED_LIMIT = FREE_COVERED_STOCKS;
export const FREE_FEED_FULL_ITEM_LIMIT = 4;
export const ANONYMOUS_FEED_FULL_ITEM_LIMIT = FREE_FEED_FULL_ITEM_LIMIT;
export const SIGNED_IN_FREE_FEED_FULL_ITEM_LIMIT = 6;
export const FREE_REDDIT_BUZZ_VISIBLE_LIMIT = 3;
export const FREE_INTERESTING_STOCKS_VISIBLE_LIMIT = 3;
export const FREE_THEME_VISIBLE_LIMIT = 4;
export const FREE_HOMEPAGE_PREVIEW_LIMIT = ANONYMOUS_FEED_FULL_ITEM_LIMIT;
/** Shown on Pro lock cards instead of the real hidden count. */
export const PRO_LOCKED_FEED_TEASER = "10+";

export function getRadarTrackLimit(_isSubscribed: boolean): number {
  return FREE_RADAR_TRACK_LIMIT;
}

export function canTrackMore(
  isSubscribed: boolean,
  currentTrackedCount: number,
): boolean {
  return currentTrackedCount < getRadarTrackLimit(isSubscribed);
}

export function getFeedFullItemLimit({
  signedIn,
  isSubscribed,
}: {
  signedIn: boolean;
  isSubscribed: boolean;
}): number {
  if (isSubscribed) return Number.POSITIVE_INFINITY;
  return signedIn
    ? SIGNED_IN_FREE_FEED_FULL_ITEM_LIMIT
    : ANONYMOUS_FEED_FULL_ITEM_LIMIT;
}

export function getFeedPreviewLimit(
  isSubscribed: boolean,
  proLimit: number,
  signedIn = false,
): number {
  if (isSubscribed) return proLimit;
  return Math.min(proLimit, getFeedFullItemLimit({ signedIn, isSubscribed }));
}
