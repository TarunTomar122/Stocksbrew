import { unstable_cache } from "next/cache";
import { adminFirestore } from "@/lib/firebase-admin";

export type RedditTicker = {
  ticker: string;
  sentiment: "bullish" | "bearish" | "neutral" | string;
  summary: string;
  mention_count: number;
};

export type RedditSnapshot = {
  market: string;
  generated_at: string;
  post_count: number;
  subreddits: string[];
  market_mood: string;
  tickers: RedditTicker[];
};

async function getRedditCuesUncached(
  market: "US" | "IN" = "US",
): Promise<RedditSnapshot | null> {
  const doc = await adminFirestore
    .collection("reddit_snapshots")
    .doc(`${market}__latest`)
    .get();
  if (!doc.exists) return null;
  return doc.data() as RedditSnapshot;
}

export const getRedditCues = unstable_cache(
  getRedditCuesUncached,
  ["reddit-cues"],
  { revalidate: 300 },
);
