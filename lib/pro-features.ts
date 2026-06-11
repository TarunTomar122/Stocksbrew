export const FREE_RADAR_TRACK_LIMIT = 3;
export const FREE_HOMEPAGE_PREVIEW_LIMIT = 3;
/** Shown on Pro lock cards instead of the real hidden count. */
export const PRO_LOCKED_FEED_TEASER = "10+";

export function getRadarTrackLimit(isSubscribed: boolean): number {
  return isSubscribed ? Number.POSITIVE_INFINITY : FREE_RADAR_TRACK_LIMIT;
}

export function canTrackMore(isSubscribed: boolean, currentTrackedCount: number): boolean {
  return currentTrackedCount < getRadarTrackLimit(isSubscribed);
}

export function getFeedPreviewLimit(isSubscribed: boolean, proLimit: number): number {
  if (isSubscribed) return proLimit;
  return Math.min(proLimit, FREE_HOMEPAGE_PREVIEW_LIMIT);
}
