import { getMarketSnapshot } from "@/lib/firestore";
import { listSectorContextDocs } from "@/lib/sector";
import { getThematicScreens } from "@/lib/screens";
import { allLearnPosts } from "@/lib/learn-data";

export const revalidate = 86400; // ISR once a day

const BASE = "https://www.tikrr.online";

function url(path: string, prio: string, freq: string) {
  const d = new Date().toISOString().split("T")[0];
  return `  <url><loc>${BASE}${path}</loc><lastmod>${d}</lastmod><changefreq>${freq}</changefreq><priority>${prio}</priority></url>`;
}

export async function GET() {
  const entries: string[] = [];

  // Core pages (always included)
  for (const [path, prio, freq] of [
    ["/", "1.0", "hourly"],
    ["/heat", "0.9", "hourly"],
    ["/news", "0.9", "hourly"],
    ["/screens", "0.9", "daily"],
    ["/watchlist", "0.7", "daily"],
    ["/subscribe", "0.7", "weekly"],
    ["/about", "0.5", "monthly"],
    ["/learn", "0.8", "weekly"],
    ["/legal/terms", "0.3", "yearly"],
    ["/legal/privacy", "0.3", "yearly"],
    ["/legal/cookies", "0.3", "yearly"],
    ["/legal/disclaimer", "0.3", "yearly"],
    ["/should-i-buy", "0.8", "weekly"],
    ["/earnings", "0.8", "weekly"],
    ["/ipos", "0.8", "weekly"],
    ["/portfolio", "0.8", "weekly"],
  ] as const) {
    entries.push(url(path, prio, freq));
  }

  // Learn posts
  for (const p of allLearnPosts) {
    entries.push(url(`/learn/${p.slug}`, "0.6", "monthly"));
  }

  // Stock pages from price universe (safe - no universe key needed)
  try {
    const seen = new Set<string>();
    for (const market of ["US", "IN"] as const) {
      try {
        const rows = await getMarketSnapshot(market);
        for (const r of rows) {
          const sym = String(r.symbol ?? "").toUpperCase();
          if (!sym || seen.has(sym)) continue;
          seen.add(sym);
          entries.push(url(`/stock/${encodeURIComponent(sym)}`, "0.8", "daily"));
        }
      } catch { /* market may not exist */ }
    }
  } catch { /* Firestore may be unreachable */ }

  // Sector pages
  try {
    const secSeen = new Set<string>();
    for (const market of ["US", "IN"] as const) {
      try {
        const docs = await listSectorContextDocs(market);
        for (const d of docs) {
          const id = String(d.sector_id ?? "").trim();
          if (!id || secSeen.has(id)) continue;
          secSeen.add(id);
          entries.push(url(`/sector/${encodeURIComponent(id)}`, "0.7", "daily"));
        }
      } catch { /* market may not exist */ }
    }
  } catch { /* Firestore may be unreachable */ }

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
          entries.push(url(`/screens/${encodeURIComponent(s.id)}`, "0.7", "daily"));
        }
      } catch { /* market may not exist */ }
    }
  } catch { /* Firestore may be unreachable */ }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
