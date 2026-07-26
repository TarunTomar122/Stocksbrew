export type RedditTicker = {
  ticker: string;
  sentiment: "bullish" | "bearish" | "neutral" | string;
  summary: string;
  mention_count: number;
  catalysts: string[];
  company_name?: string;
  confidence?: number;
  latest_post_at?: string;
  source_subreddits?: string[];
  supporting_post_ids?: string[];
  window_hours?: number;
  source?: string;
  company?: string;
  price?: number;
  changePct?: number;
  volume?: number;
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
  published?: string;
  source_subreddits?: string[];
  duplicate_count?: number;
};

export type RedditSnapshot = {
  market: string;
  generated_at: string;
  post_count: number;
  raw_post_count: number;
  deduplicated_post_count: number;
  duplicate_post_count: number;
  window_hours: number;
  window_start?: string;
  window_end?: string;
  coverage_status: "complete" | "partial" | "stale" | string;
  fetch_failures: Array<{ subreddit: string; error?: string }>;
  subreddits: string[];
  market_mood: string;
  tickers: RedditTicker[];
  top_posts: RedditTopPost[];
  notable_discussions: string[];
};

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

const MENTION_ONLY_SUMMARY_RE = /^[A-Z0-9.-]+ mentioned in \d+ Reddit posts?\.?$/i;
const CHATTER_ONLY_SUMMARY_RE = /^[A-Z0-9.-]+ is active in Reddit chatter\.?$/i;
const RAW_DISCUSSION_SUMMARY_RE = /^Latest discussion:/i;

/** True when the ticker has a real narrative brief, not just a mention count stub. */
export function hasRedditBrief(item: RedditTicker): boolean {
  if (item.source === "heuristic") return false;
  const catalysts = (item.catalysts ?? []).map((c) => String(c).trim()).filter(Boolean);
  if (catalysts.length > 0) return true;

  const summary = String(item.summary || "").trim();
  if (!summary) return false;
  if (MENTION_ONLY_SUMMARY_RE.test(summary)) return false;
  if (CHATTER_ONLY_SUMMARY_RE.test(summary)) return false;
  if (RAW_DISCUSSION_SUMMARY_RE.test(summary)) return false;
  return true;
}

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
        "This name isn’t in stocksbrew’s library yet. Below is what Reddit discussed in our latest scan.",
      mention_count: top_posts.length,
      catalysts: [],
    },
    generated_at: snapshot.generated_at,
    post_count: snapshot.post_count,
    top_posts,
    notable_discussions: [],
  };
}
