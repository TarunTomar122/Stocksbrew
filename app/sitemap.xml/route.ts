import { allLearnPosts } from "@/lib/learn-data";

const BASE_URL = "https://tikrr.com";

const PAGES = [
  { path: "/", priority: "1.0", changefreq: "hourly" },
  { path: "/heat", priority: "0.9", changefreq: "hourly" },
  { path: "/news", priority: "0.9", changefreq: "hourly" },
  { path: "/screens", priority: "0.9", changefreq: "daily" },
  { path: "/watchlist", priority: "0.7", changefreq: "daily" },
  { path: "/subscribe", priority: "0.7", changefreq: "weekly" },
  { path: "/about", priority: "0.5", changefreq: "monthly" },
  { path: "/learn", priority: "0.8", changefreq: "weekly" },
  { path: "/legal/terms", priority: "0.3", changefreq: "yearly" },
  { path: "/legal/privacy", priority: "0.3", changefreq: "yearly" },
  { path: "/legal/cookies", priority: "0.3", changefreq: "yearly" },
  { path: "/legal/disclaimer", priority: "0.3", changefreq: "yearly" },
];

function url(path: string, priority: string, changefreq: string) {
  const lastmod = new Date().toISOString().split("T")[0];
  return `  <url>
    <loc>${BASE_URL}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export const revalidate = 3600; // ISR once per hour — Firestore calls happen server-side

export async function GET() {
  const entries: string[] = [];

  // Core pages
  for (const p of PAGES) {
    entries.push(url(p.path, p.priority, p.changefreq));
  }

  // Learn posts
  for (const post of allLearnPosts) {
    entries.push(url(`/learn/${post.slug}`, "0.6", "monthly"));
  }

  // Dynamic pages: we skip Firestore calls in the sitemap to keep it fast.
  // Google discovers stock/sector/screen pages via internal links and the
  // <urlset> sitemap index pattern. The sitemap must respond in under ~30s
  // for GSC to accept it, and Firestore calls on Vercel can be slow on cold
  // starts. The tradeoff is worth it — faster sitemap > exhaustive sitemap.

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
