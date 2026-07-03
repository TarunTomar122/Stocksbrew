export const FREE_RADAR_TRACK_LIMIT = 3;
export const FREE_FEED_FULL_ITEM_LIMIT = 4;
export const ANONYMOUS_FEED_FULL_ITEM_LIMIT = FREE_FEED_FULL_ITEM_LIMIT;
export const SIGNED_IN_FREE_FEED_FULL_ITEM_LIMIT = FREE_FEED_FULL_ITEM_LIMIT;
export const FREE_REDDIT_BUZZ_VISIBLE_LIMIT = 3;
export const FREE_INTERESTING_STOCKS_VISIBLE_LIMIT = 3;
export const FREE_HOMEPAGE_PREVIEW_LIMIT = ANONYMOUS_FEED_FULL_ITEM_LIMIT;
/** Shown on Pro lock cards instead of the real hidden count. */
export const PRO_LOCKED_FEED_TEASER = "10+";

export function getRadarTrackLimit(isSubscribed: boolean): number {
  return isSubscribed ? Number.POSITIVE_INFINITY : FREE_RADAR_TRACK_LIMIT;
}

export function canTrackMore(isSubscribed: boolean, currentTrackedCount: number): boolean {
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
  return signedIn ? SIGNED_IN_FREE_FEED_FULL_ITEM_LIMIT : ANONYMOUS_FEED_FULL_ITEM_LIMIT;
}

export function getFeedPreviewLimit(isSubscribed: boolean, proLimit: number, signedIn = false): number {
  if (isSubscribed) return proLimit;
  return Math.min(proLimit, getFeedFullItemLimit({ signedIn, isSubscribed }));
}
