import { unstable_cache } from "next/cache";

import type { MarketDailyEdition } from "@/lib/market-daily";

export type MarketDailyCoverImage = {
  url: string;
  alt: string;
  sourceUrl?: string;
  provider: "openverse";
  license: "cc0";
};

const OPENVERSE_IMAGES_URL = "https://api.openverse.org/v1/images/";

const COVER_TOPICS: Array<{ test: RegExp; topic: string; queries: string[] }> = [
  {
    test: /\b(ai|artificial intelligence|tech|technology|chip|semiconductor|data cent(?:er|re)|nvidia|software)\b/i,
    topic: "ai",
    queries: [
      "data center server rack",
      "semiconductor manufacturing clean room",
      "computer circuit board close up",
      "technology research laboratory",
      "microchip wafer",
    ],
  },
  {
    test: /\b(oil|energy|crude|refinery|gas)\b/i,
    topic: "energy",
    queries: ["oil refinery", "oil pumpjack", "crude oil tanker", "natural gas pipeline"],
  },
  {
    test: /\b(bank|rates?|treasury|fed|inflation|bond)\b/i,
    topic: "rates",
    queries: ["financial district skyline", "bank building", "US Treasury building", "bond certificate"],
  },
  {
    test: /\b(earnings|revenue|profit|guidance|quarter)\b/i,
    topic: "earnings",
    queries: ["modern office building", "corporate headquarters", "business meeting", "factory production line"],
  },
];

const DEFAULT_COVER_QUERIES = [
  "stock exchange trading floor",
  "wall street street sign",
  "new york financial district",
  "stock market display",
];

export function marketDailyCoverIndex(editionDate: string, query: string, resultCount: number): number {
  if (resultCount <= 0) return 0;
  let value = 0;
  for (const character of `${editionDate}:${query}`) {
    value = (Math.imul(value, 31) + character.charCodeAt(0)) >>> 0;
  }
  return value % resultCount;
}

export function marketDailyCoverQuery(headline: string, dek: string, editionDate = ""): string {
  const story = `${headline} ${dek}`;
  const match = COVER_TOPICS.find(({ test }) => test.test(story));
  if (match) {
    if (!editionDate) return match.queries[0];
    return match.queries[marketDailyCoverIndex(editionDate, match.topic, match.queries.length)];
  }
  if (!editionDate) return DEFAULT_COVER_QUERIES[0];
  return DEFAULT_COVER_QUERIES[
    marketDailyCoverIndex(editionDate, "market", DEFAULT_COVER_QUERIES.length)
  ];
}

const fetchCover = unstable_cache(
  async (editionDate: string, headline: string, dek: string): Promise<MarketDailyCoverImage | null> => {
    const response = await fetch(
      `${OPENVERSE_IMAGES_URL}?${new URLSearchParams({
        q: marketDailyCoverQuery(headline, dek, editionDate),
        license: "cc0",
        mature: "false",
        page_size: "20",
      })}`,
      {
        headers: { "User-Agent": "stocksbrew-market-daily/1.0" },
        next: { revalidate: 60 * 60 * 24 * 90, tags: [`market-daily-cover-${editionDate}`] },
      },
    ).catch(() => null);
    if (!response?.ok) return null;

    const payload = (await response.json().catch(() => null)) as {
      results?: Array<{ thumbnail?: string; title?: string; foreign_landing_url?: string; license?: string }>;
    } | null;
    const query = marketDailyCoverQuery(headline, dek, editionDate);
    const eligible = payload?.results?.filter(
      (result) => result.thumbnail && result.license === "cc0",
    ) ?? [];
    const image = eligible[marketDailyCoverIndex(editionDate, query, eligible.length)];
    if (!image?.thumbnail) return null;

    return {
      url: image.thumbnail,
      alt: image.title?.trim() || headline,
      sourceUrl: image.foreign_landing_url,
      provider: "openverse",
      license: "cc0",
    };
  },
  ["market-daily-cover-v2"],
  { revalidate: 60 * 60 * 24 * 90 },
);

export async function getMarketDailyEditionCover(
  edition: Pick<MarketDailyEdition, "edition_date" | "headline" | "dek" | "cover_image">,
): Promise<MarketDailyCoverImage | null> {
  return edition.cover_image ?? fetchCover(edition.edition_date, edition.headline, edition.dek);
}
