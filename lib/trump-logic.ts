import { unstable_cache } from "next/cache";
import { adminFirestore } from "@/lib/firebase-admin";
import { attachSinceMentionMoves } from "@/lib/trump-logic-prices";
import type {
  TrumpLogicMention,
  TrumpLogicSnapshot,
  TrumpLogicTickerRow,
} from "@/lib/trump-logic-types";

export type {
  TrumpLogicMention,
  TrumpLogicSnapshot,
  TrumpLogicTickerRow,
  TrumpLogicTickerMove,
} from "@/lib/trump-logic-types";

function normalizeMention(raw: unknown): TrumpLogicMention | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const post_id = typeof item.post_id === "string" ? item.post_id.trim() : "";
  const said = (
    typeof item.said === "string"
      ? item.said
      : typeof item.highlight === "string"
      ? item.highlight
      : typeof item.headline === "string"
      ? item.headline
      : ""
  ).trim();
  const truth_url =
    typeof item.truth_url === "string" && item.truth_url.trim()
      ? item.truth_url.trim()
      : "https://truthsocial.com/@realDonaldTrump";
  if (!post_id && !said) return null;

  return {
    post_id: post_id || truth_url,
    published_at: typeof item.published_at === "string" ? item.published_at : "",
    truth_url,
    archive_url:
      typeof item.archive_url === "string" && item.archive_url.trim()
        ? item.archive_url.trim()
        : undefined,
    source: typeof item.source === "string" ? item.source : "truth_social",
    said: said || "Market-related mention.",
    sentiment: typeof item.sentiment === "string" ? item.sentiment : "neutral",
    tickers: Array.isArray(item.tickers)
      ? item.tickers.filter((t): t is string => typeof t === "string").map((t) => t.toUpperCase())
      : [],
    company_names: Array.isArray(item.company_names)
      ? item.company_names.filter((n): n is string => typeof n === "string")
      : [],
  };
}

function normalizeTickerRow(raw: unknown, market: "US" | "IN"): TrumpLogicTickerRow | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const ticker = typeof item.ticker === "string" ? item.ticker.trim().toUpperCase() : "";
  if (!ticker) return null;
  const mentions = Array.isArray(item.mentions)
    ? item.mentions
        .map((row) => normalizeMention(row))
        .filter((row): row is TrumpLogicMention => Boolean(row))
    : [];

  const latestSaid =
    typeof item.latest_said === "string" && item.latest_said.trim()
      ? item.latest_said.trim()
      : mentions[0]?.said ?? "";

  return {
    ticker,
    market: typeof item.market === "string" ? item.market : market,
    mention_count:
      typeof item.mention_count === "number" ? item.mention_count : mentions.length,
    bullish_count: typeof item.bullish_count === "number" ? item.bullish_count : 0,
    bearish_count: typeof item.bearish_count === "number" ? item.bearish_count : 0,
    latest_sentiment:
      typeof item.latest_sentiment === "string" ? item.latest_sentiment : "neutral",
    latest_said: latestSaid,
    latest_published_at:
      typeof item.latest_published_at === "string"
        ? item.latest_published_at
        : mentions[0]?.published_at ?? "",
    mentions,
  };
}

function buildTickerIndexFromMentions(
  mentions: TrumpLogicMention[],
  market: "US" | "IN",
): TrumpLogicTickerRow[] {
  const grouped = new Map<string, TrumpLogicMention[]>();
  for (const mention of mentions) {
    for (const ticker of mention.tickers) {
      const bucket = grouped.get(ticker) ?? [];
      bucket.push(mention);
      grouped.set(ticker, bucket);
    }
  }

  const rows: TrumpLogicTickerRow[] = [];
  for (const [ticker, items] of grouped.entries()) {
    const sorted = [...items].sort((a, b) =>
      (a.published_at < b.published_at ? 1 : -1),
    );
    const latest = sorted[0];
    rows.push({
      ticker,
      market,
      mention_count: sorted.length,
      bullish_count: sorted.filter((m) => m.sentiment === "bullish").length,
      bearish_count: sorted.filter((m) => m.sentiment === "bearish").length,
      latest_sentiment: latest?.sentiment ?? "neutral",
      latest_said: latest?.said ?? "",
      latest_published_at: latest?.published_at ?? "",
      mentions: sorted,
    });
  }

  return rows.sort((a, b) => {
    if (b.mention_count !== a.mention_count) return b.mention_count - a.mention_count;
    return a.latest_published_at < b.latest_published_at ? 1 : -1;
  });
}

function normalizeSnapshot(
  raw: Record<string, unknown>,
  market: "US" | "IN",
): TrumpLogicSnapshot {
  const mentions = Array.isArray(raw.mentions)
    ? raw.mentions
        .map((row) => normalizeMention(row))
        .filter((row): row is TrumpLogicMention => Boolean(row))
    : Array.isArray(raw.posts)
    ? raw.posts
        .map((row) => normalizeMention(row))
        .filter((row): row is TrumpLogicMention => Boolean(row))
    : [];

  const tickers = Array.isArray(raw.tickers)
    ? raw.tickers
        .map((row) => normalizeTickerRow(row, market))
        .filter((row): row is TrumpLogicTickerRow => Boolean(row))
    : buildTickerIndexFromMentions(mentions, market);

  return {
    version: typeof raw.version === "number" ? raw.version : 1,
    market: typeof raw.market === "string" ? raw.market : market,
    generated_at: typeof raw.generated_at === "string" ? raw.generated_at : "",
    handle: typeof raw.handle === "string" ? raw.handle : "realDonaldTrump",
    posts_fetched: typeof raw.posts_fetched === "number" ? raw.posts_fetched : 0,
    posts_scanned:
      typeof raw.posts_scanned === "number"
        ? raw.posts_scanned
        : typeof raw.posts_fetched === "number"
        ? raw.posts_fetched
        : 0,
    posts_with_mentions:
      typeof raw.posts_with_mentions === "number"
        ? raw.posts_with_mentions
        : mentions.length,
    ticker_count:
      typeof raw.ticker_count === "number" ? raw.ticker_count : tickers.length,
    tickers,
    mentions,
    lookback_days: typeof raw.lookback_days === "number" ? raw.lookback_days : undefined,
    source_note: typeof raw.source_note === "string" ? raw.source_note : undefined,
  };
}

async function getTrumpLogicSnapshotUncached(
  market: "US" | "IN" = "US",
): Promise<TrumpLogicSnapshot | null> {
  const doc = await adminFirestore
    .collection("trump_logic_snapshots")
    .doc(`${market}__latest`)
    .get();
  if (!doc.exists) return null;
  const payload = doc.data();
  if (!payload || typeof payload !== "object") return null;
  return normalizeSnapshot(payload as Record<string, unknown>, market);
}

const getTrumpLogicSnapshot = unstable_cache(
  async (market: "US" | "IN") => getTrumpLogicSnapshotUncached(market),
  ["trump-logic-snapshot-v2"],
  { revalidate: 300 },
);

export async function getTrumpLogic(
  market: "US" | "IN" = "US",
): Promise<TrumpLogicSnapshot | null> {
  const snapshot = await getTrumpLogicSnapshot(market);
  if (!snapshot) return null;
  if (snapshot.tickers.length === 0) return snapshot;

  try {
    return await attachSinceMentionMoves(snapshot);
  } catch (err) {
    console.error("[trump-logic] price enrichment failed:", err);
    return snapshot;
  }
}
