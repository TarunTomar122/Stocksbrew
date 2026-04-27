import { adminFirestore } from "@/lib/firebase-admin";

export type DivergenceDirection =
  | "bullish_news_price_down"
  | "bearish_news_price_up";

export type DivergenceArticle = {
  title: string;
  url: string;
  source_name?: string;
  published_at?: string;
  sentiment_score?: number;
};

export type DivergenceRow = {
  type: "price_news_divergence";
  instrument_id: string;
  ticker: string;
  name: string;
  sector?: string;
  industry?: string;
  price?: number | null;
  price_change_pct: number;
  sentiment_score: number;
  sentiment_label: "bullish" | "bearish" | "neutral" | string;
  direction: DivergenceDirection;
  headline: string;
  reason: string;
  article_count: number;
  source_count: number;
  confidence: number;
  articles: DivergenceArticle[];
};

export type DivergenceList = {
  market: "US" | "IN";
  ai_universe_id?: string;
  price_universe_id?: string;
  generated_at?: string;
  window_days: number;
  min_articles: number;
  min_abs_price_move: number;
  min_abs_sentiment: number;
  row_count: number;
  rows: DivergenceRow[];
};

export async function getDivergenceList(
  market: "US" | "IN" = "US",
): Promise<DivergenceList | null> {
  const doc = await adminFirestore.collection("tm_divergence").doc(market).get();
  if (!doc.exists) return null;
  const data = doc.data() as DivergenceList;
  return {
    ...data,
    rows: Array.isArray(data.rows) ? data.rows : [],
  };
}
