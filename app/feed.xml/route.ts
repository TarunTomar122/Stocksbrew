import { indexableBlogPosts } from "@/lib/blog-data";

export const revalidate = 300;

const BASE = "https://www.stocksbrew.online";

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type FeedItem = {
  title: string;
  link: string;
  description: string;
  publishedAt: string;
  category: string;
};

export async function GET() {
  const feedItems: FeedItem[] = [
    ...indexableBlogPosts.map((post) => ({
      title: post.title,
      link: `${BASE}/blog/${post.slug}`,
      description: post.description,
      publishedAt: `${post.date}T12:00:00Z`,
      category: post.category,
    })),
  ].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  const items = feedItems
    .map((item) => {
      return `  <item>
    <title>${xml(item.title)}</title>
    <link>${item.link}</link>
    <guid isPermaLink="true">${item.link}</guid>
    <description>${xml(item.description)}</description>
    <pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>
    <category>${xml(item.category)}</category>
  </item>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>stocksbrew research</title>
  <link>${BASE}</link>
  <description>Stock research and evidence-first investing guides.</description>
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
