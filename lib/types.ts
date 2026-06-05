export type Market = "US" | "IN";

export type MacroCard = {
  id: string;
  label: string;
  value: number;
  day_change_pct: number;
  series: number[];
};

export type MarketTileDoc = {
  id: string;
  type: "index" | "macro" | "sector";
  label: string;
  sublabel?: string;
  value: number;
  change_pct: number;
  series: number[];
};

export type StockIntelSignal = "green" | "yellow" | "red" | "na";

export type StockIntelMetric = {
  label: string;
  value: number | null;
  benchmark: number | null;
  benchmark_label: string;
  signal: StockIntelSignal;
  summary: string;
  score: number | null;
};

export type StockIntelPillar = {
  score: number;
  verdict: "strong" | "solid" | "mixed" | "weak";
  weight: number;
  metrics: StockIntelMetric[];
};

export type StockIntelCatalyst = {
  kind: string;
  title: string;
  urgency: "high" | "med" | "low";
  date?: string;
};

export type StockIntelPro = {
  instrument_id: string;
  ticker: string;
  sector_slug: string;
  sector_label: string;
  industry_label: string;
  pillars: {
    valuation: StockIntelPillar;
    growth: StockIntelPillar;
    quality: StockIntelPillar;
    momentum: StockIntelPillar;
  };
  overall: { score: number; verdict: string; stance: string };
  catalysts: StockIntelCatalyst[];
  snapshot_date: string;
  generated_at: string;
};

export type DashboardRow = {
  instrument_id: string;
  ticker: string;
  name: string;
  price: number;
  day_change_pct: number;
  ai_sentiment_score: number;
  news_count: number;
  source_count: number;
  volume?: number;
};

export type SectorFlow = {
  sector: string;
  flow_pct: number;
  direction: "up" | "flat" | "down";
};

export type MarketSentiment = {
  label: string;
  score: number;
};

export type HeroBrief = {
  title: string;
  body: string;
  verified_source_count: number;
  updated_at: string;
};

export type MarketContextBlock = {
  today_score?: number;
  today_label?: string;
  today_brief?: string;
  today_key_points?: string[];
  week_score?: number;
  week_label?: string;
  week_brief?: string;
  week_key_points?: string[];
  leading_sectors?: string[];
  lagging_sectors?: string[];
  top_sectors?: string[];
  article_count?: number;
  visual_summary?: {
    what_changed?: string;
    what_to_watch?: string;
    why_it_matters?: string;
  };
  generated_at?: string;
};

export type DashboardView = {
  market: Market;
  generated_at: string;
  universe_id: string;
  macro_cards: MacroCard[];
  market_tiles?: MarketTileDoc[];
  market_sentiment: MarketSentiment;
  hero_brief: HeroBrief;
  sector_flows: SectorFlow[];
  watchlist_rows: DashboardRow[];
  gainers: DashboardRow[];
  losers: DashboardRow[];
  market_context?: MarketContextBlock;
};

export type LatestPrice = {
  instrument_id: string;
  ticker: string;
  market: Market;
  currency?: string;
  captured_at: string;
  updated_at?: string;
  session_phase?: string;
  quote: {
    current: number;
    open?: number;
    high?: number;
    low?: number;
    previous_close?: number;
    volume?: number;
    day_change_abs?: number;
    day_change_pct?: number;
  };
  fundamentals?: {
    market_cap?: number;
    pe_ttm?: number;
    dividend_yield?: number;
    annual_dividend?: number;
    week_52_high?: number;
    week_52_low?: number;
  };
  analyst_consensus?: {
    label?: string;
    target_price?: number;
    buy?: number;
    hold?: number;
    sell?: number;
  };
  provider_metadata?: {
    yahoo_symbol?: string;
    exchange?: string;
    name?: string;
  };
  history_window?: Array<{
    captured_at?: string;
    quote?: { current?: number };
  }>;
};

export type SnapshotRow = {
  instrumentId: string;
  market: Market;
  symbol: string;
  name: string;
  sectorId?: string;
  lastUpdated?: string;
  price: {
    current: number;
    change?: number;
    changePct?: number;
    previousClose?: number;
    volume?: number;
  };
};

export type MarketMoversDoc = {
  market: Market;
  generated_at?: string;
  updated_at?: string;
  universe_id?: string;
  scope?: string;
  row_count?: number;
  priority_instrument_ids?: string[];
  gainers: DashboardRow[];
  losers: DashboardRow[];
};

export type Instrument = {
  instrument_id: string;
  market: Market;
  ticker: string;
  name: string;
  sector?: string;
  industry?: string;
  exchange?: string;
  currency?: string;
  country?: string;
  logo_url?: string;
  index_memberships?: string[];
  peer_ids?: string[];
  description?: string;
};

export type StockIntelligence = {
  instrument_id: string;
  ticker: string;
  overall_score?: number;
  news_count?: number;
  source_count?: number;
  [key: string]: unknown;
};
