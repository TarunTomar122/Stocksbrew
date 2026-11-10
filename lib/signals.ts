import { unstable_cache } from "next/cache";

import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { adminFirestore } from "@/lib/firebase-admin";
import { getMarketSnapshot } from "@/lib/firestore";
import { getRedditCues } from "@/lib/reddit-cues";
import { hasRedditBrief } from "@/lib/reddit-cues-shared";
import {
  classifyMover,
  confirmedTickers,
  mentionVelocity,
  moveSince,
  normalizeStance,
  type Mover,
  type PolicyPost,
  type RedditName,
  type RedditPostLite,
} from "@/lib/signals-shared";

/**
 * Server loaders for `/signals`. Three streams, each from the pipeline that
 * already writes it:
 *
 * - Movers: `tm_daily_anomalies/US__latest`, re-priced against the live quote
 *   (`lib/daily-anomalies.ts` drops an explanation the price no longer fits).
 * - Reddit: `reddit_snapshots/US__latest` for what is being said, and the raw
 *   post cache (`reddit_post_cache`) to measure each name's posts per day
 *   against its own previous week.
 * - Policy: `trump_logic_snapshots/US__latest`. A ticker is kept on a post
 *   only when the company the post names matches the ticker's listed name;
 *   the stored tags include wrong ones, and those are dropped here.
 */

/* ── Movers ────────────────────────────────────────────────────────────── */

export type MoversData = {
  movers: Mover[];
  generatedAt: string | null;
  thresholdPct: number | null;
  /** The trading day the list belongs to. */
  day: string | null;
};

export async function loadMovers(): Promise<MoversData> {
  const feed = await getDailyAnomalies("US").catch(() => null);
  if (!feed) return { movers: [], generatedAt: null, thresholdPct: null, day: null };
  return {
    movers: (feed.anomalies ?? [])
      .filter((row) => row?.ticker && typeof row.day_change_pct === "number" && Number.isFinite(row.day_change_pct))
      .map((row) => classifyMover(row)),
    generatedAt: feed.enriched_at ?? feed.generated_at ?? null,
    thresholdPct: typeof feed.threshold_pct === "number" ? feed.threshold_pct : null,
    day: feed.date ?? null,
  };
}

/* ── Reddit ────────────────────────────────────────────────────────────── */

type RawCachePost = { id?: string; title?: string; selftext?: string; subreddit?: string; published?: string; url?: string };

function cleanRedditText(raw: string | undefined): string {
  return String(raw ?? "")
    .replace(/&#32;/g, " ")
    .replace(/submitted by\s+\/u\/\S+.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

type PostCache = { posts: RedditPostLite[]; subreddits: Array<{ name: string; updatedAt: string | null; posts: number }> };

async function loadPostCacheUncached(): Promise<PostCache> {
  try {
    const snap = await adminFirestore.collection("reddit_post_cache").where("market", "==", "US").get();
    const posts = new Map<string, RedditPostLite>();
    const subreddits: PostCache["subreddits"] = [];
    for (const doc of snap.docs) {
      const data = doc.data() as { subreddit?: string; updated_at?: string; posts?: RawCachePost[] };
      const rows = Array.isArray(data.posts) ? data.posts : [];
      subreddits.push({ name: String(data.subreddit ?? doc.id), updatedAt: data.updated_at ?? null, posts: rows.length });
      for (const row of rows) {
        const id = String(row.id ?? row.url ?? "");
        const title = String(row.title ?? "").trim();
        if (!id || !title || Number.isNaN(Date.parse(String(row.published ?? "")))) continue;
        posts.set(id, {
          id,
          title,
          text: cleanRedditText(row.selftext),
          subreddit: String(row.subreddit ?? data.subreddit ?? ""),
          published: String(row.published),
          url: String(row.url ?? ""),
        });
      }
    }
    return { posts: [...posts.values()], subreddits: subreddits.sort((a, b) => a.name.localeCompare(b.name)) };
  } catch (error) {
    console.warn("[signals] reddit post cache read failed:", error);
    return { posts: [], subreddits: [] };
  }
}

const loadPostCache = unstable_cache(loadPostCacheUncached, ["signals-reddit-posts-v1"], { revalidate: 600 });

export type RedditThread = { title: string; subreddit: string; url: string; published: string | null; tickers: string[] };

export type RedditData = {
  names: RedditName[];
  threads: RedditThread[];
  generatedAt: string | null;
  mood: string | null;
  postCount: number;
  windowHours: number;
  /** Subreddits in the scan and how many answered on the last run. */
  subreddits: string[];
  failedSubreddits: string[];
  /** Posts in the velocity cache and the span they cover. */
  cachePosts: number;
  cacheFrom: string | null;
};

export async function loadReddit(now: number = Date.now()): Promise<RedditData> {
  const [snapshot, cache, snapshotRows] = await Promise.all([
    getRedditCues("US").catch(() => null),
    loadPostCache(),
    getMarketSnapshot("US").catch(() => []),
  ]);
  if (!snapshot) {
    return {
      names: [],
      threads: [],
      generatedAt: null,
      mood: null,
      postCount: 0,
      windowHours: 0,
      subreddits: [],
      failedSubreddits: [],
      cachePosts: cache.posts.length,
      cacheFrom: null,
    };
  }
  const dayPct = new Map<string, number>();
  for (const row of snapshotRows) {
    const pct = row.price?.changePct;
    if (row.symbol && typeof pct === "number" && Number.isFinite(pct)) dayPct.set(row.symbol.toUpperCase(), pct);
  }
  const names: RedditName[] = snapshot.tickers.map((item) => {
    const read = hasRedditBrief(item);
    return {
      ticker: item.ticker,
      company: item.company_name ?? null,
      mentions: item.mention_count,
      stance: read ? normalizeStance(item.sentiment) : "neutral",
      stanceRead: read,
      summary: read && item.summary ? item.summary.trim() : null,
      catalysts: read ? item.catalysts.slice(0, 3) : [],
      latestPostAt: item.latest_post_at ?? null,
      subreddits: item.source_subreddits ?? [],
      velocity: mentionVelocity(cache.posts, item.ticker, now),
      dayPct: dayPct.get(item.ticker) ?? null,
    };
  });
  let cacheFrom = "";
  for (const post of cache.posts) if (!cacheFrom || post.published < cacheFrom) cacheFrom = post.published;
  return {
    names,
    threads: snapshot.top_posts
      .filter((post) => post.url)
      .map((post) => ({
        title: post.title,
        subreddit: post.subreddit,
        url: post.url as string,
        published: post.published ?? null,
        tickers: post.tickers,
      })),
    generatedAt: snapshot.generated_at || null,
    mood: snapshot.market_mood && snapshot.market_mood !== "neutral" ? snapshot.market_mood : null,
    postCount: snapshot.post_count,
    windowHours: snapshot.window_hours,
    subreddits: snapshot.subreddits,
    failedSubreddits: snapshot.fetch_failures.map((failure) => failure.subreddit),
    cachePosts: cache.posts.length,
    cacheFrom: cacheFrom || null,
  };
}

/* ── Policy ────────────────────────────────────────────────────────────── */

type RawMention = {
  post_id?: string;
  published_at?: string;
  said?: string;
  sentiment?: string;
  truth_url?: string;
  archive_url?: string;
  tickers?: unknown;
  company_names?: unknown;
};

type PolicyRaw = {
  generatedAt: string | null;
  lookbackDays: number | null;
  postsScanned: number;
  mentions: Array<{
    id: string;
    publishedAt: string;
    summary: string;
    sentiment: string;
    url: string;
    archiveUrl: string | null;
    tickers: string[];
    companyNames: string[];
  }>;
};

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];
}

async function loadPolicyRawUncached(): Promise<PolicyRaw> {
  const empty: PolicyRaw = { generatedAt: null, lookbackDays: null, postsScanned: 0, mentions: [] };
  try {
    const doc = await adminFirestore.collection("trump_logic_snapshots").doc("US__latest").get();
    if (!doc.exists) return empty;
    const data = doc.data() as {
      generated_at?: string;
      lookback_days?: number;
      posts_scanned?: number;
      posts_fetched?: number;
      mentions?: RawMention[];
    };
    const seen = new Set<string>();
    const mentions: PolicyRaw["mentions"] = [];
    for (const raw of Array.isArray(data.mentions) ? data.mentions : []) {
      const summary = String(raw.said ?? "").trim();
      const publishedAt = String(raw.published_at ?? "");
      const id = String(raw.post_id ?? raw.truth_url ?? "");
      if (!summary || !id || seen.has(id) || Number.isNaN(Date.parse(publishedAt))) continue;
      seen.add(id);
      mentions.push({
        id,
        publishedAt,
        summary,
        sentiment: String(raw.sentiment ?? ""),
        url: String(raw.truth_url ?? "").trim() || "https://truthsocial.com/@realDonaldTrump",
        archiveUrl: String(raw.archive_url ?? "").trim() || null,
        tickers: strings(raw.tickers).map((ticker) => ticker.toUpperCase()),
        companyNames: strings(raw.company_names),
      });
    }
    mentions.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
    return {
      generatedAt: data.generated_at ?? null,
      lookbackDays: typeof data.lookback_days === "number" ? data.lookback_days : null,
      postsScanned: typeof data.posts_scanned === "number" ? data.posts_scanned : (data.posts_fetched ?? 0),
      mentions,
    };
  } catch (error) {
    console.warn("[signals] policy snapshot read failed:", error);
    return empty;
  }
}

const loadPolicyRaw = unstable_cache(loadPolicyRawUncached, ["signals-policy-raw-v1"], { revalidate: 600 });

type Series = { dates: string[]; closes: number[] };

/** Recent daily closes for a handful of symbols. Only the last ~140 sessions are kept (the snapshot looks back 90 days). */
async function loadSeriesUncached(symbols: string[]): Promise<Record<string, Series>> {
  const out: Record<string, Series> = {};
  if (!symbols.length) return out;
  try {
    const refs = symbols.map((symbol) => adminFirestore.collection("tm_price_history_daily").doc(symbol));
    const snaps = await adminFirestore.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data() as { dates?: string[]; closes?: number[] };
      const dates = Array.isArray(data.dates) ? data.dates : [];
      const closes = Array.isArray(data.closes) ? data.closes : [];
      const size = Math.min(dates.length, closes.length);
      if (size < 2) continue;
      out[snap.id] = { dates: dates.slice(size - 140, size), closes: closes.slice(size - 140, size) };
    }
  } catch (error) {
    console.warn("[signals] price series read failed:", error);
  }
  return out;
}

const loadSeries = unstable_cache(loadSeriesUncached, ["signals-price-series-v1"], { revalidate: 1800 });

export type PolicyData = {
  posts: PolicyPost[];
  generatedAt: string | null;
  lookbackDays: number | null;
  postsScanned: number;
  /** Stored ticker tags that were dropped because the post names a different entity. */
  droppedTags: number;
  /** Last date in the price series the "since" moves run to. */
  pricesTo: string | null;
};

const MARKET_SYMBOL = "SPY";

export async function loadPolicy(): Promise<PolicyData> {
  const [raw, snapshotRows] = await Promise.all([loadPolicyRaw(), getMarketSnapshot("US").catch(() => [])]);
  const listed = new Map<string, string>();
  for (const row of snapshotRows) if (row.symbol && row.name) listed.set(row.symbol.toUpperCase(), row.name);

  let droppedTags = 0;
  const confirmed = raw.mentions.map((mention) => {
    const tickers = confirmedTickers(mention.tickers, mention.companyNames, listed);
    droppedTags += mention.tickers.length - tickers.length;
    return tickers;
  });
  const symbols = [...new Set(confirmed.flat())].sort();
  const series = await loadSeries([MARKET_SYMBOL, ...symbols]);
  const market = series[MARKET_SYMBOL];

  const posts: PolicyPost[] = raw.mentions.map((mention, index) => ({
    id: mention.id,
    publishedAt: mention.publishedAt,
    summary: mention.summary,
    stance: normalizeStance(mention.sentiment),
    url: mention.url,
    archiveUrl: mention.archiveUrl,
    names: (confirmed[index] ?? []).map((ticker) => {
      const prices = series[ticker];
      return {
        ticker,
        company: listed.get(ticker) ?? ticker,
        since: prices ? moveSince(prices.dates, prices.closes, mention.publishedAt) : null,
      };
    }),
    market: market ? moveSince(market.dates, market.closes, mention.publishedAt) : null,
  }));

  return {
    posts,
    generatedAt: raw.generatedAt,
    lookbackDays: raw.lookbackDays,
    postsScanned: raw.postsScanned,
    droppedTags,
    pricesTo: market?.dates[market.dates.length - 1] ?? null,
  };
}
