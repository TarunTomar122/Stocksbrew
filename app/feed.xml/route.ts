import { indexableBlogPosts } from "@/lib/blog-data";

export const revalidate = 86400;

const BASE = "https://www.stocksbrew.online";

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function GET() {
  const items = indexableBlogPosts
    .map((post) => {
      const link = `${BASE}/blog/${post.slug}`;
      return `  <item>
    <title>${xml(post.title)}</title>
    <link>${link}</link>
    <guid isPermaLink="true">${link}</guid>
    <description>${xml(post.description)}</description>
    <pubDate>${new Date(`${post.date}T12:00:00Z`).toUTCString()}</pubDate>
    <category>${xml(post.category)}</category>
  </item>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>stocksbrew Blog</title>
  <link>${BASE}/blog</link>
  <description>Evidence-first stock research workflows, watchlist monitoring, and tool comparisons.</description>
  <language>en-us</language>
${items}
</channel>
</rss>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
