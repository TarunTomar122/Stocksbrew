import { getMarketSnapshot } from "@/lib/firestore";
import { listSectorContextDocs } from "@/lib/sector";
import { getThematicScreens, type ThematicScreensDoc } from "@/lib/screens";

const BASE_URL = "https://tikrr.com";

const STATIC_ROUTES = [
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

function urlEntry(path: string, priority: string, changefreq: string, lastmod?: string) {
  const lm = lastmod ?? new Date().toISOString().split("T")[0];
  return `  <url>
    <loc>${BASE_URL}${path}</loc>
    <lastmod>${lm}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export async function GET() {
  const entries: string[] = [];

  // Static routes
  for (const r of STATIC_ROUTES) {
    entries.push(urlEntry(r.path, r.priority, r.changefreq));
  }

  // Dynamic stock pages
  try {
    const usRows = await getMarketSnapshot("US");
    const seenIds = new Set<string>();
    for (const row of usRows) {
      const sym = String(row.symbol ?? "").toUpperCase();
      if (!sym || seenIds.has(sym)) continue;
      seenIds.add(sym);
      entries.push(urlEntry(`/stock/${encodeURIComponent(sym)}`, "0.8", "daily"));
    }
    // Also try IN market
    try {
      const inRows = await getMarketSnapshot("IN");
      for (const row of inRows) {
        const sym = String(row.symbol ?? "").toUpperCase();
        if (!sym || seenIds.has(sym)) continue;
        seenIds.add(sym);
        entries.push(urlEntry(`/stock/${encodeURIComponent(sym)}`, "0.8", "daily"));
      }
    } catch { /* IN market might not be active */ }
  } catch { /* stocks might not load */ }

  // Dynamic sector pages
  try {
    const sectorIds = new Set<string>();
    for (const market of ["US", "IN"] as const) {
      try {
        const docs = await listSectorContextDocs(market);
        for (const d of docs) {
          const id = String(d.sector_id ?? "").trim();
          if (!id || sectorIds.has(id)) continue;
          sectorIds.add(id);
          entries.push(urlEntry(`/sector/${encodeURIComponent(id)}`, "0.7", "daily"));
        }
      } catch { /* market might not exist */ }
    }
  } catch { /* sectors might not load */ }

  // Dynamic screen pages
  try {
    const screenIds = new Set<string>();
    for (const market of ["US", "IN"] as const) {
      try {
        let doc: ThematicScreensDoc | null = null;
        try {
          const { getThematicScreens } = await import("@/lib/screens");
          doc = await getThematicScreens(market);
        } catch { /* might not load */ }
        if (!doc) continue;
        for (const s of doc.screens) {
          if (!s.id || screenIds.has(s.id)) continue;
          screenIds.add(s.id);
          entries.push(urlEntry(`/screens/${encodeURIComponent(s.id)}`, "0.7", "daily"));
        }
      } catch { /* market might not exist */ }
    }
  } catch { /* screens might not load */ }

  // Learn/blog pages
  try {
    const { allLearnPosts } = await import("@/lib/learn-data");
    for (const post of allLearnPosts) {
      entries.push(urlEntry(`/learn/${post.slug}`, "0.6", "monthly"));
    }
  } catch { /* learn data might not exist yet */ }

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
