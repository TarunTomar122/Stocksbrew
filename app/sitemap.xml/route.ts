import { SITEMAP_FAMILIES, sitemapEntries, sitemapIndexXml, type SitemapFamily } from "@/lib/seo/sitemap";

export const revalidate = 86400; // ISR once a day

/**
 * The sitemap index. Each family of pages has its own file under
 * /sitemaps/<family>.xml (see lib/seo/sitemap.ts). A family with nothing to
 * list right now is left out of the index rather than served empty.
 */
export async function GET() {
  const counts = await Promise.all(
    SITEMAP_FAMILIES.map(async (family) => [family, (await sitemapEntries(family).catch(() => [])).length] as const),
  );
  const families: SitemapFamily[] = counts.filter(([, count]) => count > 0).map(([family]) => family);

  return new Response(sitemapIndexXml(families), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
