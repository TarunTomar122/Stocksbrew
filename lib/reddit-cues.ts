import { unstable_cache } from "next/cache";
import { adminFirestore } from "@/lib/firebase-admin";

export type RedditTicker = {
  ticker: string;
  sentiment: "bullish" | "bearish" | "neutral" | string;
  summary: string;
  mention_count: number;
  catalysts: string[];
};

/** One hot / analyzed thread from the Reddit scan (body text is optional). */
export type RedditTopPost = {
  title: string;
  subreddit: string;
  summary: string;
  tickers: string[];
  url?: string;
  permalink?: string;
  body?: string;
};

export type RedditSnapshot = {
  market: string;
  generated_at: string;
  post_count: number;
  subreddits: string[];
  market_mood: string;
  tickers: RedditTicker[];
  top_posts: RedditTopPost[];
  notable_discussions: string[];
};

function normalizeTicker(raw: unknown, fallbackTicker = ""): RedditTicker | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const ticker =
    typeof item.ticker === "string" && item.ticker.trim()
      ? item.ticker.trim().toUpperCase()
      : fallbackTicker.trim().toUpperCase();
  if (!ticker) return null;
  return {
    ticker,
    sentiment: typeof item.sentiment === "string" ? item.sentiment : "neutral",
    summary: typeof item.context === "string" ? item.context : typeof item.summary === "string" ? item.summary : "",
    mention_count:
      typeof item.mention_count === "number"
        ? item.mention_count
        : typeof item.mentions === "number"
        ? item.mentions
        : 0,
    catalysts: Array.isArray(item.catalysts)
      ? (item.catalysts as unknown[]).filter((c): c is string => typeof c === "string")
      : [],
  };
}

function normalizeTopPost(raw: unknown): RedditTopPost | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const title = typeof item.title === "string" ? item.title.trim() : "";
  if (!title) return null;
  const tickersRaw = item.tickers;
  const tickers = Array.isArray(tickersRaw)
    ? tickersRaw
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
    : [];
  const url =
    typeof item.url === "string" && item.url.trim()
      ? item.url.trim()
      : typeof item.link === "string" && item.link.trim()
      ? item.link.trim()
      : undefined;
  const permalink =
    typeof item.permalink === "string" && item.permalink.trim()
      ? item.permalink.trim()
      : undefined;
  const body =
    typeof item.body === "string" && item.body.trim()
      ? item.body.trim()
      : typeof item.selftext === "string" && item.selftext.trim()
      ? item.selftext.trim()
      : undefined;
  return {
    title,
    subreddit:
      typeof item.subreddit === "string"
        ? item.subreddit.replace(/^r\//i, "").trim()
        : "",
    summary: typeof item.summary === "string" ? item.summary : "",
    tickers,
    url,
    permalink,
    body,
  };
}

function normalizeSnapshot(raw: Record<string, unknown>, market: "US" | "IN"): RedditSnapshot {
  const rawTickers = raw.tickers;
  const tickers: RedditTicker[] = Array.isArray(rawTickers)
    ? rawTickers
        .map((item) => normalizeTicker(item))
        .filter((item): item is RedditTicker => Boolean(item))
    : rawTickers && typeof rawTickers === "object"
    ? Object.entries(rawTickers)
        .map(([ticker, value]) => normalizeTicker(value, ticker))
        .filter((item): item is RedditTicker => Boolean(item))
    : [];

  return {
    market: typeof raw.market === "string" ? raw.market : market,
    generated_at:
      typeof raw.generated_at === "string"
        ? raw.generated_at
        : typeof raw.date === "string"
        ? raw.date
        : typeof raw.timestamp === "string"
        ? raw.timestamp
        : "",
    post_count:
      typeof raw.post_count === "number"
        ? raw.post_count
        : typeof raw.posts_scanned === "number"
        ? raw.posts_scanned
        : 0,
    subreddits: Array.isArray(raw.subreddits)
      ? raw.subreddits.filter((v): v is string => typeof v === "string")
      : Array.isArray(raw.subreddits_scanned)
      ? raw.subreddits_scanned.filter((v): v is string => typeof v === "string")
      : [],
    market_mood: typeof raw.market_mood === "string" ? raw.market_mood : "neutral",
    tickers,
    top_posts: Array.isArray(raw.top_posts)
      ? raw.top_posts
          .map((row) => normalizeTopPost(row))
          .filter((row): row is RedditTopPost => Boolean(row))
      : [],
    notable_discussions: Array.isArray(raw.notable_discussions)
      ? raw.notable_discussions.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      : [],
  };
}

async function getRedditCuesUncached(
  market: "US" | "IN" = "US",
): Promise<RedditSnapshot | null> {
  const doc = await adminFirestore
    .collection("reddit_snapshots")
    .doc(`${market}__latest`)
    .get();
  if (!doc.exists) return null;
  const payload = doc.data();
  if (!payload || typeof payload !== "object") return null;
  return normalizeSnapshot(payload as Record<string, unknown>, market);
}

export const getRedditCues = unstable_cache(
  getRedditCuesUncached,
  ["reddit-cues"],
  { revalidate: 300 },
);

/** Latest scan context for a single ticker (if present in the snapshot). */
export type RedditTickerContext = {
  cue: RedditTicker;
  generated_at: string;
  post_count: number;
  /** Threads in this scan that explicitly tag this ticker. */
  top_posts: RedditTopPost[];
  /** Cross-cutting themes called out by the scan (whole-market). */
  notable_discussions: string[];
};

export function getRedditTickerContext(
  snapshot: RedditSnapshot | null | undefined,
  ticker: string,
): RedditTickerContext | null {
  if (!snapshot?.tickers?.length) return null;
  const upper = ticker.trim().toUpperCase();
  const cue = snapshot.tickers.find((t) => t.ticker === upper);
  if (!cue) return null;
  const top_posts = (snapshot.top_posts ?? []).filter((p) => p.tickers.includes(upper));
  return {
    cue,
    generated_at: snapshot.generated_at,
    post_count: snapshot.post_count,
    top_posts,
    notable_discussions: snapshot.notable_discussions ?? [],
  };
}

/**
 * Same as getRedditTickerContext, but if the ticker is missing from `tickers`
 * yet still appears on `top_posts`, build a synthetic cue so discovery pages
 * can render thread-level context.
 */
export function resolveRedditContextForSymbol(
  snapshot: RedditSnapshot | null | undefined,
  ticker: string,
): RedditTickerContext | null {
  const mapped = getRedditTickerContext(snapshot, ticker);
  if (mapped) return mapped;
  if (!snapshot) return null;
  const upper = ticker.trim().toUpperCase();
  const top_posts = (snapshot.top_posts ?? []).filter((p) => p.tickers.includes(upper));
  if (top_posts.length === 0) return null;
  return {
    cue: {
      ticker: upper,
      sentiment: "neutral",
      summary:
        "This name isn’t in Tikrr’s library yet. Below is what Reddit discussed in our latest scan.",
      mention_count: top_posts.length,
      catalysts: [],
    },
    generated_at: snapshot.generated_at,
    post_count: snapshot.post_count,
    top_posts,
    notable_discussions: [],
  };
}
