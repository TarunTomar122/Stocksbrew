/** The sitemap's families and base address. Pure, so robots.txt can list them without loading the store. */
export const SITE_BASE = "https://www.stocksbrew.online";

export const SITEMAP_FAMILIES = [
  "pages",
  "docs",
  "blog",
  "stocks",
  "compare",
  "movers",
  "sectors",
  "insiders",
  "earnings",
  "reports",
  "themes",
  "strategies",
  "funds",
  "congress",
  "markets",
  "best",
  "copy",
] as const;

export type SitemapFamily = (typeof SITEMAP_FAMILIES)[number];
