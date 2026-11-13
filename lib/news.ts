import { unstable_cache } from "next/cache";

import { firmIsSubject } from "@/lib/analyst-firms";
import { adminFirestore } from "@/lib/firebase-admin";
import { getAiUniverse } from "@/lib/firestore";

// ─── Public news feed ────────────────────────────────────────────────────────
//
// Backs the /news page. Reads enriched articles from the current universe's
// news run - enrichments carry the sentiment + entity mentions we want to
// filter on, whereas the raw `articles` subcollection is just ingestion data.
//
// We cap rows per market so the server never ships a runaway payload - the
// page does client-side filtering, so the cap is the working set a single
// user can realistically scan at once. If we later need deeper archives we
// can swap this for a paginated or cursor-based loader.

const DEFAULT_LIMIT = 150;
const TICKER_NEWS_SCAN_LIMIT = 500;
const TICKER_NEWS_TARGET_LIMIT = 50;
const TICKER_NEWS_DEFAULT_LIMIT = 7;

export type NewsArticle = {
  id: string;
  market: "US" | "IN";
  title: string;
  url: string;
  source_name: string;
  source_kind?: string;
  published_at: string;
  summary: string;
  sentiment_label: "bullish" | "bearish" | "neutral" | "mixed" | string;
  sentiment_score: number;
  sector_tags: string[];
  tickers: string[];
  coverage_mode: string;
};

type RawEnrichedArticle = {
  id?: string;
  market?: string;
  title?: string;
  url?: string;
  source_name?: string;
  source_kind?: string;
  published_at?: string;
  summary?: string;
  sentiment_label?: string;
  sentiment_score?: number;
  sector_tags?: string[];
  stock_tickers?: string[];
  entity_mentions?: Array<{ ticker?: string; type?: string; mention_role?: string }>;
  coverage_mode?: string;
};

function normalizeSentimentLabel(raw: string | undefined): NewsArticle["sentiment_label"] {
  const v = (raw ?? "").toLowerCase();
  if (v === "bullish" || v === "bearish" || v === "neutral" || v === "mixed") return v;
  return "neutral";
}

// Some Google News / RSS summaries arrive as raw HTML fragments (e.g.
// `<font color="#6f6f6f">Business Today</font>`), and occasionally carry
// long unbreakable tokens (base64-ish blobs from tracking URLs) that wreck
// the layout. Strip tags, collapse whitespace, and drop runs of 40+
// non-space characters that aren't a real URL - those never add value.
function cleanSummary(raw: string | undefined): string {
  if (!raw) return "";
  let s = String(raw);
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
  s = s.replace(/\b[A-Za-z0-9+/=_-]{40,}\b/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function normalizeArticle(raw: RawEnrichedArticle, marketFallback: "US" | "IN"): NewsArticle | null {
  const title = String(raw.title ?? "").trim();
  const url = String(raw.url ?? "").trim();
  if (!title || !url) return null;

  // Prefer explicit stock_tickers; fall back to non-incidental entity_mentions
  // so articles that only carry entity_mentions still surface their tickers
  // on the chip row.
  const fromMentions = Array.isArray(raw.entity_mentions)
    ? raw.entity_mentions
        .filter((m) => String(m.type ?? "").toLowerCase() === "stock")
        .filter((m) => String(m.mention_role ?? "secondary").toLowerCase() !== "incidental")
        .map((m) => String(m.ticker ?? "").toUpperCase())
        .filter(Boolean)
    : [];
  const tickers = Array.from(
    new Set([...(raw.stock_tickers ?? []).map((t) => String(t).toUpperCase()), ...fromMentions]),
  ).filter(Boolean);

  return {
    id: String(raw.id ?? url),
    market: (String(raw.market ?? marketFallback).toUpperCase() === "IN" ? "IN" : "US"),
    title,
    url,
    source_name: String(raw.source_name ?? "").trim(),
    source_kind: String(raw.source_kind ?? "").trim() || undefined,
    published_at: String(raw.published_at ?? ""),
    summary: cleanSummary(raw.summary),
    sentiment_label: normalizeSentimentLabel(raw.sentiment_label),
    sentiment_score: typeof raw.sentiment_score === "number" ? raw.sentiment_score : 0,
    sector_tags: (raw.sector_tags ?? []).map((t) => String(t)).filter(Boolean),
    tickers,
    coverage_mode: String(raw.coverage_mode ?? "").trim(),
  };
}

// ─── Fresh headlines (tm_agent_news) ─────────────────────────────────────────
//
// `backend/agentdata/news_feed.py` writes publisher and official RSS headlines
// with the same field names as the pipeline's articles. They carry no
// sentiment (nothing here is model-written), so the label stays empty and the
// UI shows no tone for them. Both sources are merged newest first.

function normalizeAgentArticle(raw: RawEnrichedArticle, marketFallback: "US" | "IN"): NewsArticle | null {
  const article = normalizeArticle(raw, marketFallback);
  if (!article) return null;
  return { ...article, sentiment_label: "", sentiment_score: 0, coverage_mode: "headline_feed" };
}

async function loadAgentNewsFeed(market: "US" | "IN", limit: number): Promise<NewsArticle[]> {
  if (market !== "US") return [];
  try {
    const snap = await adminFirestore
      .collection("tm_agent_news")
      .orderBy("published_at", "desc")
      .limit(limit)
      .get();
    return snap.docs
      .map((doc) => normalizeAgentArticle(doc.data() as RawEnrichedArticle, market))
      .filter((article): article is NewsArticle => article !== null);
  } catch (err) {
    console.warn("[news] tm_agent_news feed read failed:", err);
    return [];
  }
}

async function loadAgentNewsForTicker(market: "US" | "IN", ticker: string, strict = false): Promise<NewsArticle[]> {
  if (market !== "US") return [];
  try {
    const scoped = adminFirestore.collection("tm_agent_news").where("stock_tickers", "array-contains", ticker);
    let snap;
    try {
      // Newest first, so the cap keeps the recent headlines as the collection grows.
      snap = await scoped.orderBy("published_at", "desc").limit(TICKER_NEWS_TARGET_LIMIT).get();
    } catch (err) {
      if (strict) throw err;
      snap = await scoped.limit(TICKER_NEWS_TARGET_LIMIT).get();
    }
    return snap.docs
      .map((doc) => normalizeAgentArticle(doc.data() as RawEnrichedArticle, market))
      .filter((article): article is NewsArticle => article !== null);
  } catch (err) {
    if (strict) throw err;
    console.warn("[news] tm_agent_news ticker read failed:", err);
    return [];
  }
}

function mergeNewestFirst(groups: NewsArticle[][], limit: number): NewsArticle[] {
  const seen = new Set<string>();
  const out: NewsArticle[] = [];
  for (const article of groups.flat().sort((a, b) => (a.published_at < b.published_at ? 1 : -1))) {
    const key = article.url.trim().toLowerCase() || article.title.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(article);
  }
  return out.slice(0, limit);
}

async function getNewsFeedUncached(
  market: "US" | "IN",
  limit: number = DEFAULT_LIMIT,
): Promise<NewsArticle[]> {
  const [pipeline, fresh] = await Promise.all([
    getPipelineNewsFeed(market, limit),
    loadAgentNewsFeed(market, limit),
  ]);
  return mergeNewestFirst([fresh, pipeline], limit);
}

async function getPipelineNewsFeed(
  market: "US" | "IN",
  limit: number = DEFAULT_LIMIT,
): Promise<NewsArticle[]> {
  const universe = await getAiUniverse(market);
  const ns = `${market}__${universe}`;
  const namespaceDoc = await adminFirestore.collection("tm_news_runs").doc(ns).get();
  if (namespaceDoc.exists) {
    const data = namespaceDoc.data() as {
      home_feed_enrichments?: RawEnrichedArticle[];
      home_feed_articles?: RawEnrichedArticle[];
    };
    const materialized = data.home_feed_enrichments?.length
      ? data.home_feed_enrichments
      : data.home_feed_articles;
    if (materialized?.length) {
      return materialized
        .map((row) => normalizeArticle(row, market))
        .filter((article): article is NewsArticle => article !== null)
        .sort((a, b) => (a.published_at < b.published_at ? 1 : -1))
        .slice(0, limit);
    }
  }
  // Enrichments carry sentiment + entity_mentions; articles are raw ingest.
  // We read enrichments first, fall back to raw if the enrichment step hasn't
  // run yet for this universe.
  const tryCollections = ["enrichments", "articles"];
  for (const name of tryCollections) {
    const collection = adminFirestore
      .collection("tm_news_runs")
      .doc(ns)
      .collection(name);
    let snap;
    try {
      snap = await collection
        .orderBy("published_at", "desc")
        .limit(limit)
        .get();
    } catch (err) {
      console.warn(`[news] ordered ${name} query failed, falling back to limited scan:`, err);
      snap = await collection.limit(limit).get();
    }
    if (snap.empty) continue;
    const rows = snap.docs
      .map((d) => normalizeArticle(d.data() as RawEnrichedArticle, market))
      .filter((a): a is NewsArticle => a !== null)
      .sort((a, b) => (a.published_at < b.published_at ? 1 : -1));
    return rows.slice(0, limit);
  }
  return [];
}

const getNewsFeedCached = unstable_cache(
  getNewsFeedUncached,
  ["news-feed-v2"],
  { revalidate: 120 },
);

export async function getNewsFeed(
  market: "US" | "IN",
  limit: number = DEFAULT_LIMIT,
): Promise<NewsArticle[]> {
  return getNewsFeedCached(market, limit);
}


/** Ticker pages need a deep scan — not the 30-row home feed snapshot. */
async function loadEnrichedArticlesForTicker(
  market: "US" | "IN",
  ticker: string,
  limit: number,
  strict = false,
): Promise<RawEnrichedArticle[]> {
  const universe = await getAiUniverse(market);
  const ns = `${market}__${universe}`;

  for (const name of ["enrichments", "articles"] as const) {
    const collection = adminFirestore.collection("tm_news_runs").doc(ns).collection(name);
    try {
      const snap = await collection
        .where("stock_tickers", "array-contains", ticker)
        .limit(TICKER_NEWS_TARGET_LIMIT)
        .get();
      if (!snap.empty) {
        return snap.docs
          .map((doc) => doc.data() as RawEnrichedArticle)
          .sort((a, b) => String(b.published_at ?? "").localeCompare(String(a.published_at ?? "")));
      }
    } catch (err) {
      if (strict) throw err;
      console.warn(`[news] targeted ${name} query failed, falling back to limited scan:`, err);
      break;
    }
  }

  for (const name of ["enrichments", "articles"] as const) {
    const collection = adminFirestore.collection("tm_news_runs").doc(ns).collection(name);
    let snap;
    try {
      snap = await collection.orderBy("published_at", "desc").limit(limit).get();
    } catch (err) {
      if (strict) throw err;
      console.warn(`[news] ordered ${name} query failed, falling back to limited scan:`, err);
      snap = await collection.limit(limit).get();
    }
    if (!snap.empty) {
      return snap.docs.map((doc) => doc.data() as RawEnrichedArticle);
    }
  }
  return [];
}

function dedupeTickerNews(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  const out: NewsArticle[] = [];
  for (const article of articles) {
    const key = article.url.trim().toLowerCase() || article.title.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(article);
  }
  return out;
}

function filterTickerNews(
  rows: RawEnrichedArticle[],
  market: "US" | "IN",
  upper: string,
  cutoffMs: number,
  limit: number,
): NewsArticle[] {
  const filtered = rows
    .map((row) => normalizeArticle(row, market))
    .filter((article): article is NewsArticle => article !== null)
    .filter((article) => article.tickers.includes(upper))
    .filter((article) => {
      const publishedMs = new Date(article.published_at).getTime();
      return Number.isFinite(publishedMs) && publishedMs >= cutoffMs;
    })
    .sort((a, b) => (a.published_at < b.published_at ? 1 : -1));

  return dedupeTickerNews(filtered).slice(0, limit);
}

async function getNewsForTickerUncached(
  market: "US" | "IN",
  ticker: string,
  days: number = 7,
  limit: number = TICKER_NEWS_DEFAULT_LIMIT,
  strict = false,
): Promise<NewsArticle[]> {
  const upper = ticker.toUpperCase();
  const cutoffMs = Date.now() - days * 86_400_000;
  const [rows, fresh] = await Promise.all([
    loadEnrichedArticlesForTicker(market, upper, TICKER_NEWS_SCAN_LIMIT, strict),
    loadAgentNewsForTicker(market, upper, strict),
  ]);
  const freshInWindow = fresh.filter((article) => {
    const publishedMs = new Date(article.published_at).getTime();
    return Number.isFinite(publishedMs) && publishedMs >= cutoffMs;
  });
  // A bank quoted as the analyst ("JPMorgan says Strategy could face...") is not the story's subject.
  // The feeds now tag these correctly; this keeps rows stored before that off the bank's page.
  const aboutIt = (article: NewsArticle) => firmIsSubject(upper, article.title, article.tickers.some((other) => other !== upper));
  return mergeNewestFirst([freshInWindow.filter(aboutIt), filterTickerNews(rows, market, upper, cutoffMs, limit * 2).filter(aboutIt)], limit);
}

/**
 * The same answer as getNewsForTicker, read now and uncached, and throwing when a read fails instead of answering
 * with fewer headlines: the stock page's serving doc (lib/serve) must never store a failure as "no news".
 */
export function readNewsForTickerStrict(market: "US" | "IN", ticker: string, days: number, limit: number): Promise<NewsArticle[]> {
  return getNewsForTickerUncached(market, ticker.toUpperCase(), days, limit, true);
}

const getNewsForTickerCached = unstable_cache(
  (market: "US" | "IN", ticker: string, days?: number, limit?: number) => getNewsForTickerUncached(market, ticker, days, limit),
  ["news-for-ticker-v4"],
  { revalidate: 120 },
);

export async function getNewsForTicker(
  market: "US" | "IN",
  ticker: string,
  options?: { days?: number; limit?: number },
): Promise<NewsArticle[]> {
  return getNewsForTickerCached(market, ticker.toUpperCase(), options?.days ?? 7, options?.limit ?? TICKER_NEWS_DEFAULT_LIMIT);
}
