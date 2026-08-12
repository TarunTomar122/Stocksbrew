import { indexableBlogPosts } from "@/lib/blog-data";
import { COMPARISON_PAGES } from "@/lib/compare-data";
import { USE_CASES } from "@/lib/use-cases-data";
import { FEATURED_STOCK_TICKERS, getSeoStockPage } from "@/lib/seo/stock-pages";
import { SEO_SECTOR_PAGES } from "@/lib/seo/sector-pages";

export const revalidate = 86400; // ISR once a day

const BASE = "https://www.stocksbrew.online";

function url(path: string, lastmod?: string) {
  const modified = lastmod ? `<lastmod>${lastmod}</lastmod>` : "";
  return `  <url><loc>${BASE}${path}</loc>${modified}</url>`;
}

export function GET() {
  const entries: string[] = [];

  // Public pages with substantial standalone content.
  for (const path of [
    "/",
    "/pulse",
    "/explore",
    "/premarket",
    "/market-daily",
    "/events",
    "/news",
    "/stocks",
    "/sectors",
    "/screens",
    "/resources",
    "/free-tools",
    "/blog",
    "/about",
    "/authors/tarun-tomar",
    "/editorial-policy",
    "/guides",
    "/compare",
    "/use-cases",
    "/should-i-buy",
    "/earnings",
    "/upcoming-events",
    "/earnings-intel",
    "/ipos",
    "/position-size-calculator",
    "/compare-stocks",
    "/developers",
    "/agents",
  ] as const) {
    entries.push(url(path));
  }

  for (const p of COMPARISON_PAGES) {
    entries.push(url(`/compare/${p.slug}`));
  }

  for (const u of USE_CASES) {
    entries.push(url(`/use-cases/${u.slug}`));
  }

  // Blog posts
  for (const p of indexableBlogPosts) {
    entries.push(url(`/blog/${p.slug}`, p.updated ?? p.date));
  }

  for (const ticker of FEATURED_STOCK_TICKERS) {
    const stock = getSeoStockPage(ticker);
    entries.push(url(`/stock/${ticker}`, stock?.updatedAt));
  }

  // Deterministic editorial sector slugs. Firestore-generated IDs can be stale
  // or market-specific and previously produced soft-404 sitemap entries.
  for (const sector of SEO_SECTOR_PAGES) {
    entries.push(url(`/sector/${encodeURIComponent(sector.slug)}`));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
