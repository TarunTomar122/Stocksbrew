import { BLOCKED_ROBOTS_NAMES } from "@/lib/crawler-guard";
import { SITEMAP_FAMILIES, SITE_BASE } from "@/lib/seo/sitemap";

// Filter views (/news?ticker=..&topic=.., /calendar?day=..) are endless combinations of the same pages: crawlers stay
// on the pages themselves, plus the filter views with a page of their own (lib/crawler-guard.ts LISTED_FILTER_VIEWS).
// middleware.ts enforces the same for crawlers that ignore this file, and rate-limits the rest (Nov 14 outage: GPTBot
// and PerplexityBot). /icon.svg is served as /icon.svg?<hash>: allowed so search results keep the favicon.
// Each family file too, not only the index: by Nov 26 Google had read just 6 of the 17 through it.
const FAMILY_SITEMAPS = SITEMAP_FAMILIES.map((family) => `Sitemap: ${SITE_BASE}/sitemaps/${family}.xml`).join("\n");

const rules = `Allow: /
Allow: /calendar?type=earnings$
Allow: /calendar?type=economic$
Allow: /calendar?type=ipo$
Allow: /calendar?type=dividend$
Allow: /screener?tab=sectors$
Allow: /screener?preset=
Allow: /screener?sector=
Allow: /icon.svg
Allow: /apple-icon
Allow: /api/v1/openapi.json
Allow: /api/og
Disallow: /*?
Disallow: /api/
Disallow: /profile
Disallow: /watchlist
Disallow: /dev/
Disallow: /admin`;

export function GET() {
  const body = `# Search and answer engines that can cite Stocksbrew pages.
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Googlebot
User-agent: bingbot
${rules}

# SEO tools: nothing here for them.
${BLOCKED_ROBOTS_NAMES.map((name) => `User-agent: ${name}`).join("\n")}
Disallow: /

User-agent: *
${rules}

Sitemap: https://www.stocksbrew.online/sitemap.xml
${FAMILY_SITEMAPS}
# Plain-text site guide: https://www.stocksbrew.online/llms.txt
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
