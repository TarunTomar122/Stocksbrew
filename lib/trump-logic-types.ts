export type TrumpLogicTickerMove = {
  ticker: string;
  change_since_pct: number | null;
  mention_price_date: string | null;
  current_price: number | null;
};

export type TrumpLogicMention = {
  post_id: string;
  published_at: string;
  truth_url: string;
  archive_url?: string;
  source: string;
  said: string;
  sentiment: string;
  tickers: string[];
  company_names: string[];
  ticker_moves?: TrumpLogicTickerMove[];
};

export type TrumpLogicTickerRow = {
  ticker: string;
  market: string;
  mention_count: number;
  bullish_count: number;
  bearish_count: number;
  latest_sentiment: string;
  latest_said: string;
  latest_published_at: string;
  mentions: TrumpLogicMention[];
  latest_change_since_pct?: number | null;
};

export type TrumpLogicSnapshot = {
  version?: number;
  market: string;
  generated_at: string;
  handle: string;
  posts_fetched: number;
  posts_scanned: number;
  posts_with_mentions: number;
  ticker_count: number;
  tickers: TrumpLogicTickerRow[];
  mentions: TrumpLogicMention[];
  lookback_days?: number;
  source_note?: string;
};
