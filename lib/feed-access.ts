import { getFeedFullItemLimit } from "@/lib/pro-features";

export type FeedAccess = {
  signedIn: boolean;
  isSubscribed: boolean;
  fullItemLimit: number;
};

export function resolveFeedAccess({
  signedIn,
  isSubscribed,
}: {
  signedIn: boolean;
  isSubscribed: boolean;
}): FeedAccess {
  return {
    signedIn,
    isSubscribed,
    fullItemLimit: getFeedFullItemLimit({ signedIn, isSubscribed }),
  };
}

type RedactableFeedItem = {
  changePct: number;
  tag?: string;
  buzz?: string;
  headline?: string;
  whyItMatters?: string;
  confidence?: string;
};

export function redactScannerItemsAfterLimit<T extends RedactableFeedItem>(
  items: T[],
  fullItemLimit: number,
  options?: { preservePreview?: boolean },
): T[] {
  if (!Number.isFinite(fullItemLimit)) return items;

  const seenBySide = { up: 0, down: 0 };
  return items.map((item) => {
    const side = item.changePct >= 0 ? "up" : "down";
    const index = seenBySide[side]++;
    if (index < fullItemLimit) return item;

    if (options?.preservePreview) return item;

    return {
      ...item,
      tag: "",
      buzz: undefined,
      headline: undefined,
      whyItMatters: undefined,
      confidence: undefined,
    };
  });
}
