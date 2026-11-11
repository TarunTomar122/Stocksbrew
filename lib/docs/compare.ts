import { COMPARISON_PAGES, PRICE_CHECKS, getComparisonPage, type ComparisonPage } from "@/lib/compare-data";

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

/**
 * The day each comparison's prices for the other product were last read off
 * that product's own pricing page (PRICE_CHECKS in lib/compare-data.ts, which
 * also holds the address), or "not checked" when the page could not be read.
 */
export const COMPARISON_RECHECKED: Record<string, string> = Object.fromEntries(
  COMPARISON_PAGES.map((page) => [page.slug, PRICE_CHECKS[page.slug]?.checked ?? "not checked"]),
);
