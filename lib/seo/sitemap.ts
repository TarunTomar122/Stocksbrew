import { indexableBlogPosts } from "@/lib/blog-data";
import { CALENDAR_TYPES, todayET } from "@/lib/calendar-shared";
import { GUIDES, SECTIONS, guideHref } from "@/lib/docs";
import { LEGAL_DOCS } from "@/lib/docs/company";
import { DOC_COMPARISONS, docCompareHref } from "@/lib/docs/compare";
import { earningsDayHref } from "@/lib/earnings-day-shared";
import { adminFirestore } from "@/lib/firebase-admin";
import { getFollowSources } from "@/lib/follow";
import { INVESTMENT_THEMES } from "@/lib/investment-themes";
import { getMarketsData } from "@/lib/markets";
import { assetHref } from "@/lib/markets-shared";
import {
  MOVE_SITEMAP_DAYS,
  MOVERS_DAY_MIN_MOVES,
  dayMinus,
  insiderHref,
  insiderIsIndexable,
  moveHref,
  moversDayHref,
  pairHref,
  pairIsIndexable,
  sectorHref,
  sectorIsIndexable,
} from "@/lib/seo/families";
import { getCoverage, getInsiderCounts, getRecentMoves, indexableStockSymbols, sectorGroups, stockPairs } from "@/lib/seo/family-data";
import { listStrategies } from "@/lib/strategies";

export const SITE_BASE = "https://www.stocksbrew.online";

/**
 * The sitemap is split by kind of page so Search Console reports indexing per
 * family. /sitemap.xml is the index; each family is /sitemaps/<family>.xml.
 *
 * Two rules hold for every family:
 * - only addresses that render an indexable page themselves (no redirects, no noindex);
 * - `lastmod` only when we hold a real date for the content. No date is better than today's date.
 */
export const SITEMAP_FAMILIES = [
  "pages",
  "docs",
  "blog",
  "stocks",
  "compare",
  "movers",
  "sectors",
  "insiders",
  "earnings",
  "reports",
  "themes",
  "strategies",
  "funds",
  "congress",
  "markets",
  "best",
  "copy",
] as const;

export type SitemapFamily = (typeof SITEMAP_FAMILIES)[number];

export type SitemapEntry = { path: string; lastmod?: string };

export type SitemapReadOptions = {
  /**
   * Called when a read behind the family failed and the list is short of what
   * it should hold (a store or API outage), as opposed to genuinely empty. The
   * sitemap routes use it to avoid caching a partial family for a day.
   */
  onDegraded?: (reason: string) => void;
};

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isSitemapFamily(value: string): value is SitemapFamily {
  return (SITEMAP_FAMILIES as readonly string[]).includes(value);
}

/** The product surfaces. Tab and type views are listed where they carry their own title and canonical. */
const PAGES = [
  "/",
  "/briefing",
  "/explore",
  "/ask",
  "/news",
  "/calendar",
  ...CALENDAR_TYPES.map((type) => `/calendar?type=${type.id}`),
  "/signals",
  "/signals?tab=reddit",
  "/signals?tab=policy",
  "/screener",
  "/screener?tab=sectors",
  "/compare",
  "/filings",
  "/backtest",
  "/practice",
  "/insiders",
  "/portfolio",
  "/portfolio/xray",
  "/portfolio/dividends",
  "/portfolio/earnings",
  "/portfolio/goal",
  "/portfolio/ideas",
  "/portfolio/memo",
  "/baskets/new",
  "/agents",
  "/pricing",
  "/developers",
  "/security",
  "/about",
] as const;

const MARKET_CLASSES = ["indices", "etfs", "rates", "commodities", "fx", "crypto", "options", "predictions"] as const;

/** A day (YYYY-MM-DD) from a stored timestamp, or nothing when it is not a usable date. */
function day(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

/** When each indexed stock page was last rebuilt from the store. Empty when the store cannot be read. */
async function stockBuiltDates(): Promise<Map<string, string>> {
  const dates = new Map<string, string>();
  try {
    // The page documents are large; read only two fields. The LocalDB adapter
    // (lib/local-firestore.ts) takes the field list as one array, unlike
    // Firebase's spread arguments. On a Firebase rollback this throws, the catch
    // below runs and stock pages are listed without dates.
    const query = adminFirestore.collection("tm_stock_page_views").where("market", "==", "US") as unknown as {
      select(fields: string[]): { get(): Promise<{ docs: Array<{ data(): unknown }> }> };
    };
    const snap = await query.select(["ticker", "built_at"]).get();
    for (const doc of snap.docs) {
      const data = doc.data() as { ticker?: unknown; built_at?: unknown };
      const built = day(data.built_at);
      if (typeof data.ticker === "string" && built) dates.set(data.ticker.toUpperCase(), built);
    }
  } catch (error) {
    // No dates is fine: the addresses are still listed. (On a Firebase rollback this read always fails.)
    console.warn(`[sitemap] stock page dates unavailable: ${reason(error)}`);
  }
  return dates;
}

/** Indexable stocks with an earnings report still ahead. Those are the per-ticker earnings pages that are indexable for certain. */
async function upcomingEarningsTickers(indexable: readonly string[], options: SitemapReadOptions = {}): Promise<string[]> {
  const today = todayET();
  const until = new Date(`${today}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + 120);
  const upcoming = new Set<string>();
  try {
    // Loaded here, not at the top: the calendar reader only works inside a server render.
    const { loadCalendarRange } = await import("@/lib/calendar");
    const range = await loadCalendarRange(today, until.toISOString().slice(0, 10), today);
    for (const item of range.items) {
      if (item.kind === "earnings" && item.epsActual === null) upcoming.add(item.ticker.toUpperCase());
    }
  } catch (error) {
    // No calendar, no earnings pages listed for this build, and the caller is told so.
    options.onDegraded?.(`earnings calendar: ${reason(error)}`);
  }
  return indexable.filter((ticker) => upcoming.has(ticker));
}

export async function sitemapEntries(family: SitemapFamily, today: string = todayET(), options: SitemapReadOptions = {}): Promise<SitemapEntry[]> {
  /** A catch handler: tell the caller this family is short, then fall back to what the old code listed. */
  const degraded =
    <T,>(what: string, fallback: T) =>
    (error: unknown): T => {
      options.onDegraded?.(`${what}: ${reason(error)}`);
      return fallback;
    };
  const entries: SitemapEntry[] = [];
  switch (family) {
    case "pages":
      for (const path of PAGES) entries.push({ path });
      for (const doc of LEGAL_DOCS) entries.push({ path: `/legal/${doc.slug}`, lastmod: day(doc.updated) });
      break;
    case "docs":
      entries.push({ path: "/docs" }, { path: "/docs/glossary" }, { path: "/docs/compare" });
      for (const section of SECTIONS) entries.push({ path: `/docs/${section.id}` });
      for (const guide of GUIDES) entries.push({ path: guideHref(guide), lastmod: day(guide.updated) });
      for (const comparison of DOC_COMPARISONS) entries.push({ path: docCompareHref(comparison.slug) });
      break;
    case "blog":
      entries.push({ path: "/blog" });
      for (const post of indexableBlogPosts) entries.push({ path: `/blog/${post.slug}`, lastmod: day(post.updated ?? post.date) });
      break;
    case "stocks": {
      // The same rule as the page's robots tag: stockHasCurrentRead (lib/seo/stock-pages.ts) on the same snapshot row.
      const [coverage, built] = await Promise.all([getCoverage(), stockBuiltDates()]);
      for (const ticker of indexableStockSymbols(coverage, today)) entries.push({ path: `/stock/${ticker}`, lastmod: built.get(ticker) });
      break;
    }
    case "compare": {
      const coverage = await getCoverage();
      for (const pair of stockPairs(coverage)) {
        const first = coverage.bySymbol.get(pair.a);
        const second = coverage.bySymbol.get(pair.b);
        if (!pairIsIndexable(first, second, today)) continue;
        // The written part of the page is the two calls; it last changed with the later of them.
        const dates = [day(first?.call_at), day(second?.call_at)].filter((value): value is string => Boolean(value)).sort();
        entries.push({ path: pairHref(pair.a, pair.b), lastmod: dates[dates.length - 1] });
      }
      break;
    }
    case "movers": {
      // Archived days only, so a listed page never disappears when the live feed rolls over.
      const [coverage, moves] = await Promise.all([getCoverage(), getRecentMoves(today, { archivedOnly: true, onError: degraded("recent moves", undefined) })]);
      const indexable = new Set(indexableStockSymbols(coverage, today));
      const since = dayMinus(today, MOVE_SITEMAP_DAYS);
      const recent = moves.filter((move) => move.day >= since);
      const perDay = new Map<string, typeof recent>();
      for (const move of recent) perDay.set(move.day, [...(perDay.get(move.day) ?? []), move]);
      for (const [moveDay, list] of [...perDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
        if (list.length < MOVERS_DAY_MIN_MOVES) continue;
        const researched = list.map((move) => day(move.researchedAt) ?? move.day).sort();
        entries.push({ path: moversDayHref(moveDay), lastmod: researched[researched.length - 1] });
      }
      for (const move of recent) {
        if (!indexable.has(move.ticker)) continue;
        entries.push({ path: moveHref(move.ticker, move.day), lastmod: day(move.researchedAt) ?? move.day });
      }
      break;
    }
    case "sectors": {
      const coverage = await getCoverage();
      const groups = sectorGroups(coverage);
      if (groups.length) entries.push({ path: "/sectors", lastmod: day(coverage.priceDay) });
      for (const group of groups) {
        if (sectorIsIndexable(group.rows.length)) entries.push({ path: sectorHref(group.slug), lastmod: day(coverage.priceDay) });
      }
      break;
    }
    case "insiders": {
      const [coverage, counts] = await Promise.all([getCoverage(), getInsiderCounts(today, degraded("insider counts", undefined))]);
      for (const count of counts) {
        if (!coverage.bySymbol.has(count.symbol) || !insiderIsIndexable(count.trades)) continue;
        entries.push({ path: insiderHref(count.symbol), lastmod: count.lastFiled });
      }
      break;
    }
    case "earnings": {
      const coverage = await getCoverage();
      for (const ticker of await upcomingEarningsTickers(indexableStockSymbols(coverage, today), options)) entries.push({ path: `/calendar/earnings/${ticker}` });
      break;
    }
    case "reports": {
      // One page per company report, once the release is read (lib/earnings-day-shared.ts isIndexable).
      try {
        const { sitemapReports } = await import("@/lib/earnings-day");
        return (await sitemapReports(today)).map((row) => ({ path: earningsDayHref(row.ticker, row.day), ...(row.lastmod ? { lastmod: row.lastmod } : {}) }));
      } catch (error) {
        return degraded("earnings reports", [])(error);
      }
    }
    case "themes":
      entries.push({ path: "/themes" });
      for (const theme of INVESTMENT_THEMES) entries.push({ path: `/themes/${theme.slug}` });
      break;
    case "strategies": {
      entries.push({ path: "/strategies" });
      // If the store cannot be read, leave the detail pages out for this build rather than fail the sitemap.
      const strategies = await listStrategies().catch(degraded("strategies", []));
      for (const strategy of strategies) entries.push({ path: `/strategies/${strategy.slug}` });
      break;
    }
    case "funds":
    case "congress": {
      if (family === "funds") entries.push({ path: "/follow" });
      const kind = family === "funds" ? "fund" : "congress";
      const sources = await getFollowSources().catch(degraded("follow sources", []));
      for (const source of sources) {
        if (source.kind !== kind) continue;
        // A lawmaker with no reported trades has an empty page: leave it out.
        if (kind === "congress" && !(source.stats && source.stats.trades > 0)) continue;
        entries.push({ path: `/follow/${source.slug}`, lastmod: day(source.latest_date) });
      }
      break;
    }
    case "copy": {
      // "What if you had copied them?" (/follow/<slug>/copy), by the same index rule as the pages (copyIsIndexable).
      const { getCopyHub, copyHref, copyRowIsIndexable, COPY_HUB_PATH } = await import("@/lib/copy-trades");
      const hub = await getCopyHub().catch(degraded("copy hub", null));
      if (!hub) break;
      const lastmod = day(hub.price_as_of);
      entries.push({ path: COPY_HUB_PATH, lastmod });
      for (const row of hub.rows) if (copyRowIsIndexable(row)) entries.push({ path: copyHref(row.slug), lastmod: day(row.end_date) ?? lastmod });
      break;
    }
    case "best": {
      // The "best stocks for X" lists (lib/best-stocks.ts), by the same index rule as their pages.
      // Their filing reads fail soft on purpose (lib/best-stocks-data.ts): a short list is noindexed
      // on its page too, so leaving it out here matches the page.
      // The list content is rebuilt from each close, so the close is its last change.
      const { getAllBestLists } = await import("@/lib/best-stocks-data");
      const { bestListHref } = await import("@/lib/best-stocks");
      const { input, lists } = await getAllBestLists(today);
      const lastmod = day(input.priceDay);
      entries.push({ path: "/best", lastmod });
      for (const item of lists) if (item.indexable) entries.push({ path: bestListHref(item.built.list.slug), lastmod });
      break;
    }
    case "markets": {
      entries.push({ path: "/markets" });
      for (const slug of MARKET_CLASSES) entries.push({ path: `/markets/${slug}` });
      const data = await getMarketsData().catch(degraded("markets", null));
      for (const asset of data?.assets ?? []) entries.push({ path: assetHref(asset), lastmod: day(asset.as_of) });
      break;
    }
  }
  // Never list an address twice.
  const seen = new Set<string>();
  return entries.filter((entry) => (seen.has(entry.path) ? false : (seen.add(entry.path), true)));
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function urlsetXml(entries: SitemapEntry[]): string {
  const rows = entries.map((entry) => {
    const modified = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : "";
    return `  <url><loc>${escapeXml(`${SITE_BASE}${entry.path}`)}</loc>${modified}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>`;
}

export function sitemapIndexXml(families: readonly SitemapFamily[]): string {
  const rows = families.map((family) => `  <sitemap><loc>${SITE_BASE}/sitemaps/${family}.xml</loc></sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</sitemapindex>`;
}
