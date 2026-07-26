import { unstable_cache } from "next/cache";
import { adminFirestore } from "@/lib/firebase-admin";
import type {
  RedditSnapshot,
  RedditTicker,
  RedditTickerContext,
  RedditTopPost,
} from "@/lib/reddit-cues-shared";

export type {
  RedditSnapshot,
  RedditTicker,
  RedditTickerContext,
  RedditTopPost,
} from "@/lib/reddit-cues-shared";
export {
  getRedditTickerContext,
  hasRedditBrief,
  resolveRedditContextForSymbol,
} from "@/lib/reddit-cues-shared";

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
    company_name: typeof item.company_name === "string" ? item.company_name : undefined,
    confidence: typeof item.confidence === "number" ? item.confidence : undefined,
    latest_post_at: typeof item.latest_post_at === "string" ? item.latest_post_at : undefined,
    source_subreddits: Array.isArray(item.source_subreddits)
      ? item.source_subreddits.filter((value): value is string => typeof value === "string")
      : [],
    supporting_post_ids: Array.isArray(item.supporting_post_ids)
      ? item.supporting_post_ids.filter((value): value is string => typeof value === "string")
      : [],
    window_hours: typeof item.window_hours === "number" ? item.window_hours : undefined,
    source: typeof item.source === "string" ? item.source : undefined,
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
    published: typeof item.published === "string" ? item.published : undefined,
    source_subreddits: Array.isArray(item.source_subreddits)
      ? item.source_subreddits.filter((value): value is string => typeof value === "string")
      : [],
    duplicate_count: typeof item.duplicate_count === "number" ? item.duplicate_count : 0,
  };
}

function normalizeSnapshot(raw: Record<string, unknown>, market: "US" | "IN"): RedditSnapshot {
  const rawTickers = raw.tickers;
  const tickers: RedditTicker[] = Array.isArray(rawTickers)
    ? rawTickers
        .map((item) => normalizeTicker(item))
        .filter((item): item is RedditTicker => Boolean(item && item.mention_count > 0))
    : rawTickers && typeof rawTickers === "object"
    ? Object.entries(rawTickers)
        .map(([ticker, value]) => normalizeTicker(value, ticker))
        .filter((item): item is RedditTicker => Boolean(item && item.mention_count > 0))
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
    raw_post_count: typeof raw.raw_post_count === "number" ? raw.raw_post_count : 0,
    deduplicated_post_count:
      typeof raw.deduplicated_post_count === "number"
        ? raw.deduplicated_post_count
        : typeof raw.post_count === "number"
        ? raw.post_count
        : 0,
    duplicate_post_count:
      typeof raw.duplicate_post_count === "number" ? raw.duplicate_post_count : 0,
    window_hours:
      typeof raw.window_hours === "number"
        ? raw.window_hours
        : typeof raw.cache_hours === "number"
        ? raw.cache_hours
        : 120,
    window_start: typeof raw.window_start === "string" ? raw.window_start : undefined,
    window_end: typeof raw.window_end === "string" ? raw.window_end : undefined,
    coverage_status:
      typeof raw.coverage_status === "string" ? raw.coverage_status : "partial",
    fetch_failures: Array.isArray(raw.fetch_failures)
      ? raw.fetch_failures
          .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"))
          .map((value) => ({
            subreddit: String(value.subreddit || ""),
            error: value.error ? String(value.error) : undefined,
          }))
          .filter((value) => value.subreddit)
      : [],
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

type RedditTickerContextDoc = {
  market?: string;
  ticker?: string;
  generated_at?: string;
  post_count?: number;
  cue?: Record<string, unknown>;
  top_posts?: unknown[];
  notable_discussions?: unknown[];
};

async function getRedditContextForTickerUncached(
  market: "US" | "IN" = "US",
  ticker: string,
): Promise<RedditTickerContext | null> {
  const upper = ticker.trim().toUpperCase();
  if (!upper) return null;
  const doc = await adminFirestore
    .collection("reddit_ticker_contexts")
    .doc(`${market}__${upper}`)
    .get();
  if (!doc.exists) return null;
  const data = doc.data() as RedditTickerContextDoc;
  const cue = normalizeTicker(data.cue, upper);
  if (!cue) return null;
  return {
    cue,
    generated_at: typeof data.generated_at === "string" ? data.generated_at : "",
    post_count: typeof data.post_count === "number" ? data.post_count : 0,
    top_posts: Array.isArray(data.top_posts)
      ? data.top_posts
          .map((row) => normalizeTopPost(row))
          .filter((row): row is RedditTopPost => Boolean(row))
      : [],
    notable_discussions: Array.isArray(data.notable_discussions)
      ? data.notable_discussions.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      : [],
  };
}

export const getRedditContextForTicker = unstable_cache(
  getRedditContextForTickerUncached,
  ["reddit-context-for-ticker"],
  { revalidate: 300 },
);
