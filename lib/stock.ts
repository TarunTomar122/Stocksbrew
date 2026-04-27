import { adminFirestore } from "@/lib/firebase-admin";
import { getActiveUniverse, getPriceUniverse, getMarketSnapshot } from "@/lib/firestore";
import type { Instrument, LatestPrice, SnapshotRow, StockIntelPro } from "@/lib/types";

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
  target_price?: number;
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
  source: "instrument" | "snapshot" | "none";
  // Fundamentals are included here so callers don't need a second
  // tm_latest_prices read via getStockFundamentals.
  fundamentals?: StockFundamentals | null;
};

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
        source: "instrument",
        fundamentals: (priceData?.fundamentals ?? null) as StockFundamentals | null,
      };
    }
  }

  // Fallback: look for the symbol in the snapshot.
  const rows = await getMarketSnapshot(market);
  const match = rows.find(
    (r: SnapshotRow) => r.symbol?.toUpperCase() === ticker,
  );
  if (match) {
    const instrument = instrumentDoc.exists
      ? (instrumentDoc.data() as Instrument)
      : null;
    return {
      instrument_id: match.instrumentId,
      ticker: match.symbol,
      name: instrument?.name || match.name || match.symbol,
      exchange: instrument?.exchange,
      sector: instrument?.sector,
      industry: instrument?.industry,
      currency: "USD",
      logo_url: instrument?.logo_url,
      index_memberships: instrument?.index_memberships,
      price: match.price.current,
      day_change_abs: match.price.change,
      day_change_pct: match.price.changePct,
      previous_close: match.price.previousClose,
      source: "snapshot",
      fundamentals: null,
    };
  }

  return null;
}

export async function getInstrumentViewDoc(
  instrumentId: string,
  market: "US" | "IN" = "US",
): Promise<InstrumentViewDoc | null> {
  const universe = await getActiveUniverse(market);
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
  const universe = await getActiveUniverse(market);
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
  // Try the AI/active universe first, then fall back to the price universe.
  // The AI universe (e.g. us_test_10) covers the 10 headline stocks; the
  // price universe (e.g. us_core_155) covers the full scored set. Any stock
  // not in the AI universe still gets a scorecard from the broader run.
  const [aiUniverse, priceUniverse] = await Promise.all([
    getActiveUniverse(market),
    getPriceUniverse(market),
  ]);
  const universes = aiUniverse === priceUniverse
    ? [aiUniverse]
    : [aiUniverse, priceUniverse];
  for (const universe of universes) {
    const doc = await adminFirestore
      .collection("tm_stock_intel_pro")
      .doc(`${market}__${universe}`)
      .collection("stocks")
      .doc(instrumentId)
      .get();
    if (doc.exists) return doc.data() as StockIntelPro;
  }
  return null;
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
