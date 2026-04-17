import { buildMarketSnapshot } from "@/lib/service";

import { loadFixture } from "./helpers";

const FIXTURE_MAP = new Map<string, string>([
  ["https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml", loadFixture("nse-announcements.xml")],
  ["https://nsearchives.nseindia.com/content/RSS/Circulars.xml", loadFixture("bse-notices.xml")],
  ["https://www.bseindia.com/data/xml/notices.xml", loadFixture("bse-notices.xml")],
  ["https://www.bseindia.com/data/xml/announcements.xml", loadFixture("nse-announcements.xml")],
  ["https://www.livemint.com/rss/markets", loadFixture("livemint-markets.xml")],
  ["https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms", loadFixture("economic-times-markets.xml")],
]);

function mockFetch(url: string | URL | Request) {
  const key = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
  const body = FIXTURE_MAP.get(key);

  if (!body) {
    return Promise.resolve(new Response("", { status: 404 }));
  }

  return Promise.resolve(
    new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/xml",
      },
    }),
  );
}

describe("market snapshot service", () => {
  it("builds an Indian market snapshot from active sources", async () => {
    const snapshot = await buildMarketSnapshot({
      market: "IN",
      fetchImpl: mockFetch as typeof fetch,
    });

    expect(snapshot.market).toBe("IN");
    expect(snapshot.stats.liveSourceCount).toBe(4);
    expect(snapshot.buckets.length).toBeGreaterThan(0);
    expect(snapshot.overview).toContain("tikrr");
  });

  it("can opt into review-required feeds", async () => {
    const snapshot = await buildMarketSnapshot({
      market: "IN",
      includeReviewSources: true,
      fetchImpl: mockFetch as typeof fetch,
    });

    expect(snapshot.stats.liveSourceCount).toBe(6);
    expect(snapshot.topics?.some((topic) => topic.name.includes("IPO"))).toBe(true);
  });
});
