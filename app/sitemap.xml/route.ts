import { allBlogPosts } from "@/lib/blog-data";
import { COMPARISON_PAGES } from "@/lib/compare-data";
import { listSectorContextDocs } from "@/lib/sector";
import { getThematicScreens } from "@/lib/screens";
import { allLearnPosts } from "@/lib/learn-data";
import { USE_CASES } from "@/lib/use-cases-data";

export const revalidate = 86400; // ISR once a day

const BASE = "https://www.stocksbrew.online";

function url(path: string, prio: string, freq: string, lastmod?: string) {
  const d = lastmod ?? new Date().toISOString().split("T")[0];
  return `  <url><loc>${BASE}${path}</loc><lastmod>${d}</lastmod><changefreq>${freq}</changefreq><priority>${prio}</priority></url>`;
}

export async function GET() {
  const entries: string[] = [];

  // Core pages (always included)
  for (const [path, prio, freq] of [
    ["/", "1.0", "hourly"],
    ["/heat", "0.9", "hourly"],
    ["/anomalies", "0.9", "hourly"],
    ["/reddit-buzz", "0.85", "hourly"],
    ["/premarket", "0.9", "hourly"],
    ["/events", "0.9", "hourly"],
    ["/news", "0.9", "hourly"],
    ["/screens", "0.9", "daily"],
    ["/blog", "0.7", "weekly"],
    ["/subscribe", "0.7", "weekly"],
    ["/about", "0.5", "monthly"],
    ["/learn", "0.8", "weekly"],
    ["/guides", "0.85", "weekly"],
    ["/compare", "0.85", "weekly"],
    ["/use-cases", "0.85", "weekly"],
    ["/legal/terms", "0.3", "yearly"],
    ["/legal/privacy", "0.3", "yearly"],
    ["/legal/cookies", "0.3", "yearly"],
    ["/legal/disclaimer", "0.3", "yearly"],
    ["/should-i-buy", "0.8", "weekly"],
    ["/earnings", "0.8", "weekly"],
    ["/earnings-intel", "0.8", "daily"],
    ["/ipos", "0.8", "weekly"],
    ["/portfolio", "0.8", "weekly"],
    ["/position-size-calculator", "0.8", "weekly"],
    ["/compare-stocks", "0.8", "weekly"],
    ["/trump-logic", "0.7", "daily"],
  ] as const) {
    entries.push(url(path, prio, freq));
  }

  for (const p of COMPARISON_PAGES) {
    entries.push(url(`/compare/${p.slug}`, "0.75", "monthly"));
  }

  for (const u of USE_CASES) {
    entries.push(url(`/use-cases/${u.slug}`, "0.75", "monthly"));
  }

  // Learn posts
  for (const p of allLearnPosts) {
    entries.push(url(`/learn/${p.slug}`, "0.6", "monthly"));
  }

  // Blog posts
  for (const p of allBlogPosts) {
    entries.push(url(`/blog/${p.slug}`, "0.6", "monthly", p.date));
  }

  // Stock pages are noindexed (thin content) — removed from sitemap

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
          entries.push(
            url(`/sector/${encodeURIComponent(id)}`, "0.7", "daily"),
          );
        }
      } catch {
        /* market may not exist */
      }
    }
  } catch {
    /* Firestore may be unreachable */
  }

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
          entries.push(
            url(`/screens/${encodeURIComponent(s.id)}`, "0.7", "daily"),
          );
        }
      } catch {
        /* market may not exist */
      }
    }
  } catch {
    /* Firestore may be unreachable */
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
