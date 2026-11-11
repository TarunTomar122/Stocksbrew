import { isSitemapFamily, sitemapEntries, urlsetXml } from "@/lib/seo/sitemap";

export const revalidate = 86400;

/**
 * One family of the sitemap, at /sitemaps/<family>.xml. The index is /sitemap.xml.
 *
 * Only a full read is cached (by the CDN, for a day, from Cache-Control). A
 * family whose read failed (the store or an API was down) throws instead of
 * answering with a short list: the crawler gets an uncached 500 and comes back,
 * where a short list would have dropped real pages from the sitemap for a day.
 */
export async function GET(_request: Request, { params }: { params: { family: string } }) {
  const family = params.family.replace(/\.xml$/, "");
  if (!params.family.endsWith(".xml") || !isSitemapFamily(family)) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const problems: string[] = [];
  let entries;
  try {
    entries = await sitemapEntries(family, undefined, { onDegraded: (reason) => problems.push(reason) });
  } catch (error) {
    console.error(`[sitemap] family "${family}" failed; not caching it: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
  if (problems.length) {
    console.error(`[sitemap] family "${family}" is short (${problems.join("; ")}); not caching it`);
    throw new Error(`sitemap_family_degraded:${family}`);
  }
  return new Response(urlsetXml(entries), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
