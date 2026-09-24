import { describe, expect, it } from "vitest";

import { GET } from "@/app/sitemap.xml/route";
import { FEATURED_STOCK_TICKERS } from "@/lib/seo/stock-pages";

describe("public sitemap", () => {
  it("stays curated and includes only the ten flagship stock pages", async () => {
    const xml = await (await GET()).text();
    const locations = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
    const stockLocations = locations.filter((location) => location.includes("/stock/"));

    expect(locations.length).toBeLessThanOrEqual(150);
    expect(new Set(locations).size).toBe(locations.length);
    expect(stockLocations).toEqual(
      FEATURED_STOCK_TICKERS.map((ticker) => `https://www.stocksbrew.online/stock/${ticker}`),
    );
    expect(locations.some((location) => location.includes("/market-daily"))).toBe(false);
    expect(locations).toContain("https://www.stocksbrew.online/agents");
    expect(locations).not.toContain("https://www.stocksbrew.online/radar");
    expect(locations).not.toContain("https://www.stocksbrew.online/subscribe");
  });
});
