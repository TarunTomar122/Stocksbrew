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

const COVER_TOPICS: Array<{ test: RegExp; query: string }> = [
  { test: /\b(ai|artificial intelligence|chip|semiconductor|data cent(?:er|re)|nvidia|software)\b/i, query: "data center server rack" },
  { test: /\b(oil|energy|crude|refinery|gas)\b/i, query: "oil refinery" },
  { test: /\b(bank|rates?|treasury|fed|inflation|bond)\b/i, query: "financial district skyline" },
  { test: /\b(earnings|revenue|profit|guidance|quarter)\b/i, query: "modern office building" },
];

export function marketDailyCoverQuery(headline: string, dek: string): string {
  const story = `${headline} ${dek}`;
  return COVER_TOPICS.find(({ test }) => test.test(story))?.query ?? "stock exchange trading floor";
}

const fetchCover = unstable_cache(
  async (editionDate: string, headline: string, dek: string): Promise<MarketDailyCoverImage | null> => {
    const response = await fetch(
      `${OPENVERSE_IMAGES_URL}?${new URLSearchParams({
        q: marketDailyCoverQuery(headline, dek),
        license: "cc0",
        mature: "false",
        page_size: "1",
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
    const image = payload?.results?.find((result) => result.thumbnail && result.license === "cc0");
    if (!image?.thumbnail) return null;

    return {
      url: image.thumbnail,
      alt: image.title?.trim() || headline,
      sourceUrl: image.foreign_landing_url,
      provider: "openverse",
      license: "cc0",
    };
  },
  ["market-daily-cover"],
  { revalidate: 60 * 60 * 24 * 90 },
);

export async function getMarketDailyEditionCover(
  edition: Pick<MarketDailyEdition, "edition_date" | "headline" | "dek" | "cover_image">,
): Promise<MarketDailyCoverImage | null> {
  return edition.cover_image ?? fetchCover(edition.edition_date, edition.headline, edition.dek);
}
