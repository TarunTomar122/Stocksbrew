import type { Metadata } from "next";

import { OG_SITE_URL, ogImage, shareMetadata } from "@/lib/og/url";

/**
 * Search and share metadata for one page in a single call: title,
 * description, canonical, robots, and the same share card on Open Graph and
 * Twitter. Next replaces a parent's whole `openGraph` block when a page sets
 * its own, so a page that sets none would inherit the home page's URL and
 * card; this keeps every page's block complete. Pure.
 */
export function pageMetadata(input: {
  /** Without the brand: the root layout's template adds " · stocksbrew". */
  title: string;
  description: string;
  /** The canonical path, e.g. "/portfolio/xray". */
  path: string;
  /** The share card's path under /api/og, e.g. ["portfolio", "xray"]. */
  card: string[];
  /** What the card shows, for screen readers and platforms that read alt text. */
  alt: string;
  /** Redraw the card each New York day (cards built from daily data). */
  daily?: boolean;
  /** Leave out of search: personal pages and pages built from someone's request. */
  noindex?: boolean;
  /** Where search should send people when this address duplicates another page. */
  canonical?: string;
  keywords?: string[];
}): Metadata {
  const image = ogImage(input.card, input.alt, { daily: input.daily });
  const share = shareMetadata({ title: `${input.title} · stocksbrew`, description: input.description, path: input.path, image });
  return {
    title: input.title,
    description: input.description,
    ...(input.keywords?.length ? { keywords: input.keywords } : {}),
    alternates: { canonical: input.canonical ?? input.path },
    ...(input.noindex ? { robots: { index: false, follow: true } } : {}),
    ...share,
  };
}

/**
 * JSON-LD for an app page: the WebPage itself, inside the site, and its
 * breadcrumb trail. Only what is true of every visit: no ratings, no
 * prices, no FAQ the page does not show.
 */
export function pageLd(input: { name: string; description: string; path: string; crumbs: Array<{ name: string; path: string }> }): Record<string, unknown>[] {
  const url = `${OG_SITE_URL}${input.path}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": url,
      url,
      name: input.name,
      description: input.description,
      inLanguage: "en-US",
      // The WebSite node the root layout declares.
      isPartOf: { "@id": `${OG_SITE_URL}/#website` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      // Home first, as the marketing pages' trail does (components/seo/marketing-schema.tsx).
      itemListElement: [{ name: "Home", path: "" }, ...input.crumbs].map((crumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
        item: `${OG_SITE_URL}${crumb.path}`,
      })),
    },
  ];
}
