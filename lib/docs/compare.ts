import { COMPARISON_PAGES, getComparisonPage, type ComparisonPage } from "@/lib/compare-data";

/**
 * The product comparisons (stocksbrew next to another research tool) moved
 * from /compare/[slug] to /docs/compare/[slug] when /compare became the
 * side-by-side stock comparison. The content still lives in lib/compare-data.ts.
 */

export type { ComparisonPage };

export const DOC_COMPARISONS: ComparisonPage[] = COMPARISON_PAGES;

export function getDocComparison(slug: string): ComparisonPage | null {
  return getComparisonPage(slug) ?? null;
}

export function docCompareHref(slug: string): string {
  return `/docs/compare/${slug}`;
}

/** Old links such as /compare/stocksbrew-vs-finviz, pointed at the new address. */
export function movedCompareHref(href: string): string {
  const match = /^\/compare\/(stocksbrew-vs-[a-z0-9-]+)(.*)$/.exec(href);
  return match ? `/docs/compare/${match[1]}${match[2]}` : href;
}

/** The date each comparison's facts about the other product were last rechecked against its official pages. */
export const COMPARISON_RECHECKED: Record<string, string> = {
  "stocksbrew-vs-finviz": "2026-07-16",
  "stocksbrew-vs-tradingview": "2026-07-16",
  "stocksbrew-vs-seeking-alpha": "2026-07-16",
};
