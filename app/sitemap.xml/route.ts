import { SITEMAP_FAMILIES, sitemapEntries, sitemapIndexXml, type SitemapFamily } from "@/lib/seo/sitemap";

// Rendered on request and cached at the CDN for a day (see Cache-Control).
// Building it at deploy time reads every family from the store and times out.
export const dynamic = "force-dynamic";

const CACHE_GOOD = "public, max-age=86400, s-maxage=86400";
/** When a family could not be read, the index is rebuilt within minutes instead of carrying the gap for a day. */
const CACHE_AFTER_FAILURE = "public, max-age=300, s-maxage=300";

type FamilyRead = { family: SitemapFamily; count: number; problems: string[] };

async function readFamily(family: SitemapFamily): Promise<FamilyRead> {
  const problems: string[] = [];
  try {
    const entries = await sitemapEntries(family, undefined, { onDegraded: (reason) => problems.push(reason) });
    return { family, count: entries.length, problems };
  } catch (error) {
    return { family, count: 0, problems: [error instanceof Error ? error.message : String(error)] };
  }
}

/**
 * The sitemap index. Each family of pages has its own file under
 * /sitemaps/<family>.xml (see lib/seo/sitemap.ts). A family with nothing to
 * list right now is left out of the index rather than served empty.
 *
 * A family whose read failed is a different case: it stays in the index (its
 * own file answers an uncached 500 until the read works, so crawlers come back),
 * the failure is logged, and the index is cached for minutes, not a day.
 */
export async function GET() {
  const reads = await Promise.all(SITEMAP_FAMILIES.map(readFamily));
  const failed = reads.filter((read) => read.problems.length > 0);
  for (const read of failed) {
    console.error(`[sitemap] family "${read.family}" could not be read in full; kept in the index, cached 5 minutes: ${read.problems.join("; ")}`);
  }
  const families = reads.filter((read) => read.count > 0 || read.problems.length > 0).map((read) => read.family);

  return new Response(sitemapIndexXml(families), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": failed.length ? CACHE_AFTER_FAILURE : CACHE_GOOD,
    },
  });
}
