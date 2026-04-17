import { MarketCode, SourceDefinition } from "@/lib/types";

export const SOURCE_REGISTRY: SourceDefinition[] = [
  {
    id: "nse-announcements",
    name: "NSE Corporate Announcements",
    kind: "exchange",
    marketCodes: ["IN"],
    homepageUrl: "https://www.nseindia.com/",
    feedUrl: "https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml",
    verificationUrl: "https://www.nseindia.com/static/rss-feed",
    verifiedAt: "2026-03-23",
    usageStatus: "enabled",
    enabledByDefault: true,
    usageNotes: "Official NSE RSS feed discovered on the NSE RSS feed page.",
    tags: ["equities", "disclosures", "corporate"],
  },
  {
    id: "nse-circulars",
    name: "NSE Circulars",
    kind: "exchange",
    marketCodes: ["IN"],
    homepageUrl: "https://www.nseindia.com/",
    feedUrl: "https://nsearchives.nseindia.com/content/RSS/Circulars.xml",
    verificationUrl: "https://www.nseindia.com/static/rss-feed",
    verifiedAt: "2026-03-23",
    usageStatus: "enabled",
    enabledByDefault: true,
    usageNotes: "Official NSE circular feed published on the NSE RSS directory.",
    tags: ["exchange", "compliance", "operations"],
  },
  {
    id: "bse-notices",
    name: "BSE Notices",
    kind: "exchange",
    marketCodes: ["IN"],
    homepageUrl: "https://www.bseindia.com/",
    feedUrl: "https://www.bseindia.com/data/xml/notices.xml",
    verificationUrl: "https://www.bseindia.com/rss-feed.html",
    verifiedAt: "2026-03-23",
    usageStatus: "enabled",
    enabledByDefault: true,
    usageNotes: "Official BSE notices feed listed on the BSE RSS feed page.",
    tags: ["exchange", "notices", "market-structure"],
  },
  {
    id: "bse-announcements",
    name: "BSE Corporate Announcements",
    kind: "exchange",
    marketCodes: ["IN"],
    homepageUrl: "https://www.bseindia.com/",
    feedUrl: "https://www.bseindia.com/data/xml/announcements.xml",
    verificationUrl: "https://www.bseindia.com/rss-feed.html",
    verifiedAt: "2026-03-23",
    usageStatus: "enabled",
    enabledByDefault: true,
    usageNotes: "Official BSE corporate announcement feed listed on the BSE RSS feed page.",
    tags: ["corporate", "exchange", "filings"],
  },
  {
    id: "livemint-markets",
    name: "Mint Markets",
    kind: "publisher",
    marketCodes: ["IN"],
    homepageUrl: "https://www.livemint.com/market",
    feedUrl: "https://www.livemint.com/rss/markets",
    verificationUrl: "https://www.livemint.com/rss/markets",
    verifiedAt: "2026-03-23",
    usageStatus: "review_required",
    enabledByDefault: false,
    usageNotes: "Feed is live and parseable, but publisher usage terms should be reviewed before commercial rollout.",
    tags: ["publisher", "markets", "editorial"],
  },
  {
    id: "economic-times-markets",
    name: "Economic Times Markets",
    kind: "publisher",
    marketCodes: ["IN"],
    homepageUrl: "https://economictimes.indiatimes.com/markets",
    feedUrl: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    verificationUrl: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    verifiedAt: "2026-03-23",
    usageStatus: "review_required",
    enabledByDefault: false,
    usageNotes: "Feed is live and parseable, but publisher usage terms should be reviewed before commercial rollout.",
    tags: ["publisher", "markets", "editorial"],
  },
  {
    id: "sec-press-releases",
    name: "SEC Press Releases",
    kind: "regulator",
    marketCodes: ["US"],
    homepageUrl: "https://www.sec.gov/news/pressreleases",
    feedUrl: "https://www.sec.gov/news/pressreleases.rss",
    verificationUrl: "https://www.sec.gov/news/pressreleases",
    verifiedAt: "2026-03-23",
    usageStatus: "planned",
    enabledByDefault: false,
    usageNotes: "Reserved for the future US market rollout.",
    tags: ["regulator", "us", "planned"],
  },
];

export function listSourcesForMarket(market: MarketCode, includeReviewSources = false): SourceDefinition[] {
  return SOURCE_REGISTRY.filter((source) => {
    if (!source.marketCodes.includes(market)) {
      return false;
    }
    if (source.usageStatus === "planned") {
      return false;
    }
    if (source.usageStatus === "review_required" && !includeReviewSources) {
      return false;
    }
    return source.enabledByDefault || includeReviewSources;
  });
}

export function listTrackedSourcesForMarket(market: MarketCode): SourceDefinition[] {
  return SOURCE_REGISTRY.filter((source) => source.marketCodes.includes(market));
}
