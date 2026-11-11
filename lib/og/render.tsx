import { ImageResponse } from "next/server";

import { OgCardView } from "@/lib/og/cards";
import { loadOgFonts } from "@/lib/og/fonts";
import type { OgCard } from "@/lib/og/types";
import { OG_HEIGHT, OG_WIDTH } from "@/lib/og/url";

/**
 * Cache policy. Data cards change through the day, so browsers keep them ten
 * minutes and the CDN an hour, serving the old one while it redraws. Cards
 * with words only change on a deploy.
 */
export const OG_CACHE = {
  data: "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
  words: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  /** A stand-in drawn because its data was slow or missing: kept a few minutes, then drawn again. */
  transient: "public, max-age=60, s-maxage=300",
} as const;

export function cacheFor(card: OgCard): string {
  if (card.transient) return OG_CACHE.transient;
  if (card.kind === "text") return OG_CACHE.words;
  if (card.kind === "landing" && !card.row) return OG_CACHE.words;
  return OG_CACHE.data;
}

export async function renderOgCard(card: OgCard, options: { cacheControl?: string } = {}): Promise<Response> {
  const fonts = await loadOgFonts();
  return new ImageResponse(<OgCardView card={card} />, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts,
    headers: {
      "cache-control": options.cacheControl ?? cacheFor(card),
      "x-robots-tag": "noindex",
    },
  });
}
