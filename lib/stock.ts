import { adminFirestore } from "@/lib/firebase-admin";
import { getAiUniverse, getPriceUniverse } from "@/lib/firestore";
import type { Instrument, LatestPrice, StockIntelPro } from "@/lib/types";

export type DataQuality = {
  confidence_score?: number;
  freshness_status?: "fresh" | "aging" | "stale" | "missing" | string;
  freshness_hours?: number;
  evidence_count?: number;
  source_tier_mix?: {
    broad?: number;
    core?: number;
    promoted?: number;
  };
};

export type ComparativeContext = {
  day_change_pct?: number;
  vs_market_day_change_pct?: number;
  vs_sector_day_change_pct?: number;
  market_percentile?: number;
};

export type RelatedInstrument = {
  instrument_id: string;
  ticker: string;
  name: string;
  relation?: "peer" | "sector" | "supply_chain" | "co_mentioned" | string;
};

export type StockIntelligenceDoc = {
  instrument_id: string;
  headline?: string;
  thesis?: string;
  body?: string;
  source?: string;
  coverage_type?: string;
  news_count?: number;
  source_count?: number;
  overall_label?: string;
  overall_score?: number;
  setup_state?: string;
  catalyst?: string;
  risk?: string;
  today_brief?: string;
  week_summary?: string;
  visual_summary?: {
    what_changed?: string;
    why_it_matters?: string;
    what_to_watch?: string;
  };
  visual_cards?: VisualCards;
  directive?: Directive | null;
  key_points?: string[];
  data_quality?: DataQuality;
  comparative_context?: ComparativeContext;
  related_instruments?: RelatedInstrument[];
  generated_at?: string;
};

export type StockFundamentals = {
  week_52_high?: number;
  week_52_low?: number;
  market_cap?: number;
  pe_ttm?: number;
  dividend_yield?: number;
  // Yahoo-provided trend + risk metrics. Optional because not every ticker
  // exposes them on `.info` (illiquid / freshly-listed names).
  fifty_day_average?: number;
  two_hundred_day_average?: number;
  beta?: number;
};

export type AnalystConsensus = {
  label?: string;
  target_price?: number | null;
  buy?: number;
  hold?: number;
  sell?: number;
};

export type SentimentLane = {
  label: string;
  positive_pct: number;
};

export type SentimentSource = {
  source_name: string;
  article_count: number;
  mean_sentiment: number;
  lean: "bullish" | "bearish" | "neutral";
};

export type SentimentBreakdown = {
  overall_label?: string;
  overall_score?: number;
  lanes?: SentimentLane[];
  sources_breakdown?: SentimentSource[];
};

export type MomentumSignal = {
  rsi_14?: number;
  score?: number;
  label?: string;
};

export type TrendConvergence = {
  range?: string;
  price_series?: number[];
  mention_volume_series?: number[];
};

export type RelatedTicker = {
  instrument_id: string;
  ticker: string;
  name: string;
  price?: number;
  day_change_pct?: number;
};

export type TimelineEvent = {
  event_id?: string;
  title?: string;
  summary?: string;
  source_name?: string;
  article_url?: string;
  timestamp?: string;
  event_type?: string;
  sentiment_label?: string;
  impact_score?: number;
  confidence_score?: number;
  is_new_since_last_run?: boolean;
};

export type CatalystCard = {
  event: string;
  detail?: string;
  window?: string;
  expected_impact?: number;
  priced_in?: string;
};

export type DriverCard = {
  label: string;
  detail?: string;
  strength?: number;
  horizon?: string;
  direction?: "up" | "down" | "mixed" | "flat";
};

export type RiskCard = {
  label?: string;
  risk?: string;
  detail?: string;
  trigger?: string;
  severity?: number;
  probability?: number;
  horizon?: string;
};

export type Directive = {
  text: string;
  stance: "accumulate" | "trim" | "watch" | "avoid" | "hold";
  trigger_type:
    | "price_below"
    | "price_above"
    | "date"
    | "sentiment_flip"
    | "new_catalyst"
    | "none";
  trigger_value?: string;
  rationale?: string;
  confidence?: "low" | "med" | "high";
};

export type VisualCards = {
  catalyst_cards?: CatalystCard[];
  drivers?: DriverCard[];
  risk_cards?: RiskCard[];
};

export type InstrumentViewDoc = {
  instrument_id: string;
  momentum_signal?: MomentumSignal;
  trend_convergence?: TrendConvergence;
  sentiment_breakdown?: SentimentBreakdown;
  analyst_consensus?: AnalystConsensus;
  fundamentals?: StockFundamentals;
  related_tickers?: RelatedTicker[];
  timeline?: TimelineEvent[];
  intelligence_summary?: unknown;
  generated_at?: string;
};

export type StockSummary = {
  instrument_id: string;
  ticker: string;
  name: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  currency?: string;
  logo_url?: string;
  index_memberships?: string[];
  price: number;
  day_change_abs?: number;
  day_change_pct?: number;
  previous_close?: number;
  day_high?: number;
  day_low?: number;
  captured_at?: string;
  source: "instrument" | "snapshot" | "none";
  // Fundamentals are included here so callers don't need a second
  // tm_latest_prices read via getStockFundamentals.
  fundamentals?: StockFundamentals | null;
};

export type StockFacts = {
  instrument_id: string;
  market: "US" | "IN";
  ticker: string;
  captured_at?: string;
  returns?: {
    one_month_pct?: number | null;
    three_month_pct?: number | null;
    six_month_pct?: number | null;
    one_year_pct?: number | null;
  };
  quick_stats?: {
    market_cap?: number | null;
    pe_ttm?: number | null;
    eps_next_year_growth_pct?: number | null;
    institutional_ownership_pct?: number | null;
    recommendation_score?: number | null;
  };
  analyst?: {
    label?: string;
    target_price?: number | null;
    target_low?: number | null;
    target_high?: number | null;
    buy?: number;
    hold?: number;
    sell?: number;
    analyst_count?: number;
    source?: string;
  };
  events?: Array<{
    kind?: string;
    title?: string;
    date?: string;
    date_label?: string;
    source?: string;
  }>;
  financials?: {
    fiscal_year?: string | null;
    revenue?: number | null;
    revenue_growth_yoy_pct?: number | null;
    gross_profit?: number | null;
    operating_income?: number | null;
    net_income?: number | null;
    eps_diluted?: number | null;
    source?: string;
  };
  institutions?: {
    ownership_pct?: number | null;
    total_value_label?: string;
    total_holders?: string;
    top_holders?: Array<{
      name?: string;
      date?: string;
      shares?: string;
      change_pct?: string;
      market_value?: string;
    }>;
    source?: string;
  };
};

export type OnDemandNewsJobDoc = {
  instrument_id: string;
  market?: "US" | "IN" | string;
  universe_id?: string;
  status?: "queued" | "running" | "complete" | "no_articles" | "no_brief" | "failed" | "retry" | string;
  error?: string;
  updated_at?: string;
  requested_at?: string;
  started_at?: string;
  finished_at?: string;
};

export async function getStockFacts(
  instrumentId: string,
): Promise<StockFacts | null> {
  const doc = await adminFirestore
    .collection("tm_stock_facts")
    .doc(instrumentId)
    .get();
  return doc.exists ? (doc.data() as StockFacts) : null;
}

export async function getStockSummary(
  symbol: string,
  market: "US" | "IN" = "US",
): Promise<StockSummary | null> {
  const ticker = symbol.toUpperCase();
  const instrumentId = `${market}_${ticker}`;

  const [instrumentDoc, priceDoc] = await Promise.all([
    adminFirestore.collection("tm_instruments").doc(instrumentId).get(),
    adminFirestore.collection("tm_latest_prices").doc(instrumentId).get(),
  ]);

  if (instrumentDoc.exists) {
    const instrument = instrumentDoc.data() as Instrument;
    const priceData = priceDoc.exists ? (priceDoc.data() as LatestPrice) : null;
    const quote = priceData?.quote;
    if (quote && typeof quote.current === "number") {
      return {
        instrument_id: instrument.instrument_id,
        ticker: instrument.ticker,
        name: instrument.name,
        exchange: instrument.exchange,
        sector: instrument.sector,
        industry: instrument.industry,
        currency: instrument.currency,
        logo_url: instrument.logo_url,
        index_memberships: instrument.index_memberships,
        price: quote.current,
        day_change_abs: quote.day_change_abs,
        day_change_pct: quote.day_change_pct,
        previous_close: quote.previous_close,
        day_high: quote.high,
        day_low: quote.low,
        captured_at: priceData?.updated_at || priceData?.captured_at,
        source: "instrument",
        fundamentals: (priceData?.fundamentals ?? null) as StockFundamentals | null,
      };
    }
  }

  // Fallback for renamed / alias routes: resolve one instrument by ticker
  // instead of loading and scanning the whole market snapshot.
  const fallbackSnap = await adminFirestore
    .collection("tm_instruments")
    .where("market", "==", market)
    .where("ticker", "==", ticker)
    .limit(1)
    .get();
  const fallbackDoc = fallbackSnap.docs[0];
  if (fallbackDoc) {
    const instrument = fallbackDoc.data() as Instrument;
    const fallbackPriceDoc = await adminFirestore
      .collection("tm_latest_prices")
      .doc(instrument.instrument_id)
      .get();
    const fallbackPrice = fallbackPriceDoc.exists
      ? (fallbackPriceDoc.data() as LatestPrice)
      : null;
    const quote = fallbackPrice?.quote;
    if (quote && typeof quote.current === "number") {
      return {
        instrument_id: instrument.instrument_id,
        ticker: instrument.ticker,
        name: instrument.name,
        exchange: instrument.exchange,
        sector: instrument.sector,
        industry: instrument.industry,
        currency: instrument.currency,
        logo_url: instrument.logo_url,
        index_memberships: instrument.index_memberships,
        price: quote.current,
        day_change_abs: quote.day_change_abs,
        day_change_pct: quote.day_change_pct,
        previous_close: quote.previous_close,
        day_high: quote.high,
        day_low: quote.low,
        captured_at: fallbackPrice?.updated_at || fallbackPrice?.captured_at,
        source: "instrument",
        fundamentals: (fallbackPrice?.fundamentals ?? null) as StockFundamentals | null,
      };
    }
  }

  // Last-resort: synthesize a summary from the price doc alone. This covers
  // tickers that the snapshot pipeline writes but that haven't been registered
  // in `tm_instruments` yet (a known gap on the IN side).
  if (priceDoc.exists) {
    const priceData = priceDoc.data() as LatestPrice;
    const quote = priceData?.quote;
    if (quote && typeof quote.current === "number") {
      return {
        instrument_id: instrumentId,
        ticker: priceData.ticker || ticker,
        name: priceData.provider_metadata?.name || ticker,
        exchange: priceData.provider_metadata?.exchange,
        currency: priceData.currency,
        price: quote.current,
        day_change_abs: quote.day_change_abs,
        day_change_pct: quote.day_change_pct,
        previous_close: quote.previous_close,
        day_high: quote.high,
        day_low: quote.low,
        captured_at: priceData?.updated_at || priceData?.captured_at,
        source: "snapshot",
        fundamentals: (priceData?.fundamentals ?? null) as StockFundamentals | null,
      };
    }
  }

  return null;
}

export async function getInstrumentViewDoc(
  instrumentId: string,
  market: "US" | "IN" = "US",
): Promise<InstrumentViewDoc | null> {
  const universe = await getPriceUniverse(market);
  const docId = `${instrumentId}__${universe}`;
  const doc = await adminFirestore
    .collection("tm_views_instrument")
    .doc(docId)
    .get();
  if (!doc.exists) return null;
  return doc.data() as InstrumentViewDoc;
}

export async function getStockIntelligenceDoc(
  instrumentId: string,
  market: "US" | "IN" = "US",
): Promise<StockIntelligenceDoc | null> {
  const universe = await getAiUniverse(market);
  const ns = `${market}__${universe}`;
  const doc = await adminFirestore
    .collection("tm_news_runs")
    .doc(ns)
    .collection("stock_intelligence")
    .doc(instrumentId)
    .get();
  if (!doc.exists) return null;
  return doc.data() as StockIntelligenceDoc;
}

export async function getStockIntelPro(
  instrumentId: string,
  market: "US" | "IN" = "US",
): Promise<StockIntelPro | null> {
  // The price universe is the broad scored set, so it should be the cheap
  // first lookup for stock pages. Fall back to the AI universe only for older
  // data before the broad scorecard job has run.
  const [aiUniverse, priceUniverse] = await Promise.all([
    getAiUniverse(market),
    getPriceUniverse(market),
  ]);
  const preferredUniverse = priceUniverse || aiUniverse;
  const doc = await adminFirestore
    .collection("tm_stock_intel_pro")
    .doc(`${market}__${preferredUniverse}`)
    .collection("stocks")
    .doc(instrumentId)
    .get();
  return doc.exists ? (doc.data() as StockIntelPro) : null;
}

export async function getOnDemandNewsJob(
  instrumentId: string,
): Promise<OnDemandNewsJobDoc | null> {
  const doc = await adminFirestore
    .collection("tm_on_demand_news_jobs")
    .doc(instrumentId)
    .get();
  if (!doc.exists) return null;
  return doc.data() as OnDemandNewsJobDoc;
}

export async function getStockFundamentals(
  instrumentId: string,
): Promise<StockFundamentals | null> {
  const doc = await adminFirestore
    .collection("tm_latest_prices")
    .doc(instrumentId)
    .get();
  if (!doc.exists) return null;
  const data = doc.data() as LatestPrice;
  return (data.fundamentals ?? null) as StockFundamentals | null;
}

/** Normalized ticker from `/stock/[symbol]`. Returns null if invalid. */
export function normalizeStockSymbolParam(raw: string): string | null {
  const s = decodeURIComponent(String(raw ?? "").trim()).toUpperCase();
  if (!s || s.length > 16) return null;
  if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(s)) return null;
  return s;
}
