import { MarketCode } from "@/lib/types";

export type DashboardRow = {
  instrument_id: string;
  ticker: string;
  name: string;
  sector: string;
  price: number;
  day_change_pct: number;
  ai_sentiment_score: number;
  news_count: number;
  source_count: number;
  sector_score: number;
  sector_brief: string;
};

export type MacroCard = {
  id: string;
  label: string;
  value: number;
  day_change_pct: number;
  series: number[];
};

export type DashboardView = {
  market: MarketCode;
  generated_at: string;
  universe_id: string;
  macro_cards: MacroCard[];
  market_sentiment: {
    label: string;
    score: number;
  };
  hero_brief: {
    title: string;
    body: string;
    verified_source_count: number;
    updated_at: string;
  };
  market_context?: {
    today_brief: string;
    week_brief: string;
    today_score: number;
    week_score: number;
    today_label: string;
    week_label: string;
    top_sectors: string[];
  };
  sector_context?: Array<{
    sector_id: string;
    sector_label: string;
    today_brief: string;
    week_brief: string;
    today_score: number;
    week_score: number;
    article_count: number;
  }>;
  sector_flows: Array<{
    sector: string;
    flow_pct: number;
    direction: "up" | "flat" | "down";
  }>;
  watchlist_rows: DashboardRow[];
  gainers: DashboardRow[];
  losers: DashboardRow[];
};

export type InstrumentView = {
  instrument_id: string;
  market: MarketCode;
  generated_at: string;
  instrument: {
    ticker: string;
    name: string;
    exchange: string;
    sector: string;
    industry?: string;
    logo_url?: string;
    index_memberships: string[];
  };
  price_snapshot: {
    current: number;
    day_change_abs?: number;
    day_change_pct: number;
    captured_at: string;
  };
  fundamentals: {
    market_cap: number;
    pe_ttm: number;
    dividend_yield: number;
    annual_dividend?: number;
    week_52_low: number;
    week_52_high: number;
  };
  intelligence_summary: {
    headline: string;
    body: string;
    catalyst: string;
    risk: string;
    key_points: string[];
  };
  market_context?: {
    today_brief: string;
    week_brief: string;
    today_score?: number;
    week_score?: number;
  };
  sector_context?: {
    sector_id?: string;
    today_brief: string;
    week_brief: string;
    today_score?: number;
    week_score?: number;
  };
  sentiment_breakdown: {
    overall_label: string;
    overall_score: number;
    lanes: Array<{
      label: string;
      positive_pct: number;
    }>;
  };
  analyst_consensus?: {
    label: string;
    target_price: number;
    buy: number;
    hold: number;
    sell: number;
  };
  trend_convergence: {
    range: "1D" | "1W" | "1M" | "3M" | "1Y";
    price_series: number[];
    mention_volume_series: number[];
  };
  momentum_signal: {
    label: string;
    rsi_14: number;
    score: number;
  };
  related_tickers: Array<{
    instrument_id: string;
    ticker: string;
    name: string;
    price: number;
    day_change_pct: number;
  }>;
  timeline: Array<{
    timestamp: string;
    title: string;
    summary: string;
    sentiment_label: string;
    source_name: string;
    article_url: string;
  }>;
};
