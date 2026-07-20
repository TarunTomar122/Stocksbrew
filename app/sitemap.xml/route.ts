import { indexableBlogPosts } from "@/lib/blog-data";
import { COMPARISON_PAGES } from "@/lib/compare-data";
import { getThematicScreens } from "@/lib/screens";
import { USE_CASES } from "@/lib/use-cases-data";
import stockUniverse from "@/backend/config/stock_universe.json";

export const revalidate = 86400; // ISR once a day

const BASE = "https://www.stocksbrew.online";

function url(path: string, lastmod?: string) {
  const modified = lastmod ? `<lastmod>${lastmod}</lastmod>` : "";
  return `  <url><loc>${BASE}${path}</loc>${modified}</url>`;
}

export async function GET() {
  const entries: string[] = [];

  // Core pages (always included)
  for (const path of [
    "/",
    "/radar",
    "/pulse",
    "/heat",
    "/premarket",
    "/events",
    "/news",
    "/screens",
    "/resources",
    "/free-tools",
    "/blog",
    "/subscribe",
    "/about",
    "/authors/tarun-tomar",
    "/editorial-policy",
    "/guides",
    "/compare",
    "/use-cases",
    "/legal/terms",
    "/legal/privacy",
    "/legal/cookies",
    "/legal/disclaimer",
    "/should-i-buy",
    "/earnings",
    "/upcoming-events",
    "/earnings-intel",
    "/ipos",
    "/portfolio",
    "/position-size-calculator",
    "/compare-stocks",
    "/developers",
    "/agents",
    "/trump-logic",
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

  // Stock pages are noindexed (thin content) — removed from sitemap

  // Only deterministic US sector slugs. Firestore-generated sector IDs can be
  // stale or market-specific and previously produced soft-404 sitemap entries.
  const usRows = (
    stockUniverse as {
      markets?: Record<string, Array<{ sector_tags?: string[] }>>;
    }
  ).markets?.US ?? [];
  const sectorSlugs = new Set(usRows.flatMap((row) => row.sector_tags ?? []));
  for (const slug of [...sectorSlugs].filter(Boolean).sort()) {
    entries.push(url(`/sector/${encodeURIComponent(slug)}`));
  }

  // Screen pages
  try {
    const scrSeen = new Set<string>();
    for (const market of ["US", "IN"] as const) {
      try {
        const doc = await getThematicScreens(market);
        if (!doc) continue;
        for (const s of doc.screens) {
          if (!s.id || scrSeen.has(s.id)) continue;
          scrSeen.add(s.id);
          entries.push(
            url(`/screens/${encodeURIComponent(s.id)}`),
          );
        }
      } catch {
        /* market may not exist */
      }
    }
  } catch {
    /* Firestore may be unreachable */
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
