import { isSitemapFamily, sitemapEntries, urlsetXml } from "@/lib/seo/sitemap";

export const revalidate = 86400; // ISR once a day

/** One family of the sitemap, at /sitemaps/<family>.xml. The index is /sitemap.xml. */
export async function GET(_request: Request, { params }: { params: { family: string } }) {
  const family = params.family.replace(/\.xml$/, "");
  if (!params.family.endsWith(".xml") || !isSitemapFamily(family)) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const entries = await sitemapEntries(family);
  return new Response(urlsetXml(entries), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
