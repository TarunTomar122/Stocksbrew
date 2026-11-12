/**
 * Addresses of the share images (Open Graph / Twitter cards).
 *
 * Every card is drawn by `app/api/og/[...card]/route.tsx` from a short path:
 * `/api/og/stock/NVDA`, `/api/og/compare/NVDA,AMD`, `/api/og/page/markets`.
 * The path only ever names something we look up (a ticker, a slug, a page
 * key); no title or number travels in the URL, so nobody can mint a
 * stocksbrew-branded card that says something we never said.
 *
 * Pure: no server imports, so page metadata, tests and the route share it.
 */

export const OG_SITE_URL = "https://www.stocksbrew.online";
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
/** Bump when the card design changes, so platforms that cache by URL fetch the new one. */
export const OG_VERSION = "4";

/** The read-style pages that get a card drawn from their own read. */
export const OG_PAGE_KEYS = [
  "briefing",
  "premarket",
  "explore",
  "news",
  "markets",
  "signals",
  "calendar",
  "screener",
  "follow",
  "insiders",
  "filings",
  "strategies",
  "themes",
  "agents",
  "pricing",
  "docs",
  "blog",
  "developers",
  "backtest",
  "practice",
  "ask",
  "compare",
  "about",
  "security",
  "glossary",
  "tools",
  "copy",
  "baskets",
] as const;

export type OgPageKey = (typeof OG_PAGE_KEYS)[number];

export function isOgPageKey(value: string): value is OgPageKey {
  return (OG_PAGE_KEYS as readonly string[]).includes(value);
}

/**
 * The portfolio tools, each drawn from the example portfolio a signed-out
 * visitor sees: `/api/og/portfolio/<tool>`. "home" is the /portfolio overview.
 */
export const PORTFOLIO_OG_TOOLS = ["home", "memo", "xray", "dividends", "stress", "earnings", "goal", "ideas"] as const;

export type PortfolioOgTool = (typeof PORTFOLIO_OG_TOOLS)[number];

/** New York calendar day, YYYY-MM-DD. */
export function ogDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function cleanSegment(segment: string): string {
  return encodeURIComponent(segment.trim()).replace(/%2C/gi, ",");
}

/**
 * Absolute URL of a card. `daily` adds the New York day, so a link shared
 * tomorrow points at tomorrow's card instead of whatever a platform cached
 * today (X, Slack and iMessage cache images by URL).
 */
export function ogImageUrl(path: string | readonly string[], options: { daily?: boolean; now?: Date } = {}): string {
  const segments = (typeof path === "string" ? path.split("/") : [...path]).map((part) => part.trim()).filter(Boolean);
  const tail = segments.map(cleanSegment).join("/");
  const params = new URLSearchParams({ v: OG_VERSION });
  if (options.daily) params.set("d", ogDay(options.now));
  return `${OG_SITE_URL}/api/og${tail ? `/${tail}` : ""}?${params.toString()}`;
}

export type OgImage = { url: string; width: number; height: number; alt: string; type: "image/png" };

/** The image descriptor Next's metadata takes for both `openGraph.images` and `twitter.images`. */
export function ogImage(path: string | readonly string[], alt: string, options: { daily?: boolean; now?: Date } = {}): OgImage {
  return { url: ogImageUrl(path, options), width: OG_WIDTH, height: OG_HEIGHT, alt: alt.trim() || "stocksbrew", type: "image/png" };
}

/**
 * `openGraph` and `twitter` blocks for a page, with the card on both. Use it
 * where a page has no share metadata of its own yet; pages that already set
 * their own blocks just add `images: [image]` to each.
 */
export function shareMetadata(input: {
  title: string;
  description: string;
  /** Path on the site, e.g. "/markets/etfs/spy". */
  path: string;
  image: OgImage;
  type?: "website" | "article";
}) {
  const url = `${OG_SITE_URL}${input.path.startsWith("/") ? input.path : `/${input.path}`}`;
  return {
    openGraph: {
      type: input.type ?? "website",
      siteName: "stocksbrew",
      title: input.title,
      description: input.description,
      url,
      images: [input.image],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: input.title,
      description: input.description,
      images: [input.image],
    },
  };
}
