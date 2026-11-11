import { adminFirestore } from "@/lib/firebase-admin";
import type { DocumentReference, DocumentData } from "firebase-admin/firestore";
import {
  batchGetRefs,
  getLatestPriceCore,
  getLatestPriceCores,
  getLatestPrices,
  getLatestPriceFundamentals,
  getLatestPriceHistory,
  getPriceUniverse,
  type LatestPriceCore,
} from "@/lib/firestore";
import { getAiUniverse, getInstrument } from "@/lib/firestore";
import { hasSufficientOverallData } from "@/lib/fundamentals-coverage";
import { buildPriceHistorySeries } from "@/lib/price-history-series";
import type { PriceHistoryPoint } from "@/lib/price-history-chart";
import { resolveSectorSlug, sectorSlugForIntel } from "@/lib/sector-slugs";
import type { Instrument, LatestPrice, StockIntelPro } from "@/lib/types";
import { listCatalogInstruments } from "@/lib/universe-catalog";
import { getCoverageUniverse, getIntelUniverseIds } from "@/lib/universe-tiers";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";
import type { PreEarningsIntelDoc } from "@/lib/pre-earnings-intel-shared";
import type { StockTechnicals } from "@/lib/technicals";
import { unstable_cache } from "next/cache";

export type { PriceHistoryPoint } from "@/lib/price-history-chart";
export { PRICE_HISTORY_CHART_MIN } from "@/lib/price-history-chart";
export { buildPriceHistorySeries } from "@/lib/price-history-series";

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
  directive_v2?: DirectiveV2 | null;
  key_points?: string[];
  data_quality?: DataQuality;
  comparative_context?: ComparativeContext;
  related_instruments?: RelatedInstrument[];
  generated_at?: string;
};

export type StockBusinessQuestionsDoc = {
  instrument_id: string;
  ticker: string;
  generated_at?: string;
  questions?: Array<{ question: string; answer: string }>;
};

export type StockFundamentals = {
  week_52_high?: number;
  week_52_low?: number;
  market_cap?: number;
  pe_ttm?: number;
  /**
   * Yahoo's yield, stored as a fraction for some stocks and a percent for others (Yahoo changed the field). Do not
   * show it: use `dividend_yield_pct`, which the stock page works out from the annual dividend and today's price.
   */
  dividend_yield?: number;
  /** Dividend per share a year at the current rate. */
  annual_dividend?: number;
  /** Set by the stock page (lib/stock-header-facts.ts): the annual dividend over today's price, in percent. */
  dividend_yield_pct?: number;
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
  horizon?: string;
};

export type Directive = {
  text: string;
  action_now?: string;
  stance: "accumulate" | "trim" | "watch" | "avoid" | "hold";
  trigger_type:
    | "price_below"
    | "price_above"
    | "date"
    | "sentiment_flip"
    | "new_catalyst"
    | "none";
  trigger_value?: string;
  add_on?: DirectiveZone;
  trim_on?: DirectiveZone;
  breaks_if?: DirectiveZone;
  rationale?: string;
  confidence?: "low" | "med" | "high";
};

export type DirectiveZone = {
  text?: string;
  trigger_type?:
    | "price_below"
    | "price_above"
    | "date"
    | "sentiment_flip"
    | "new_catalyst"
    | "none";
  trigger_value?: string;
};

export type DirectiveV2 = {
  version?: string;
  stance?: "accumulate" | "trim" | "watch" | "avoid" | "hold";
  execution?: string;
  horizon?: string;
  confidence?: "low" | "med" | "medium" | "high";
  action?: {
    label?: string;
    summary?: string;
  };
  zones?: {
    accumulate_below?: number;
    breakout_above?: number;
    trim_above?: number;
    near_term_resistance?: number;
  };
  watch_out?: string;
  invalidation?: string;
  changed_from_previous?: boolean;
  change_reason?: string;
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
  country?: string;
  description?: string;
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

const PRICE_HISTORY_CHART_MAX = 252;

// ─── Batched stock-page reads ─────────────────────────────────────────────────
// The stock page needs ~12 single Firestore docs per render. Reading them one
// by one costs one HTTPS round trip each against LocalDB. This loader packs
// every known-path doc into one getAll (LocalDB turns that into a single
// batchGet) and slices the result per getter.

export type StockPageDocBundle = {
  facts: StockFacts | null;
  technicals: StockTechnicals | null;
  onDemandJob: OnDemandNewsJobDoc | null;
  earningsIntel: EarningsIntelDoc | null;
  preEarnings: PreEarningsIntelDoc | null;
};

export type StockPageDocBundleSections = {
  facts?: boolean;
  technicals?: boolean;
  onDemandJob?: boolean;
  earningsIntel?: boolean;
  preEarnings?: boolean;
};

export async function getStockPageDocBundle(
  market: "US" | "IN",
  instrumentId: string,
  ticker: string,
  sections: StockPageDocBundleSections = {},
): Promise<StockPageDocBundle> {
  const want = {
    facts: sections.facts ?? false,
    technicals: sections.technicals ?? false,
    onDemandJob: sections.onDemandJob ?? false,
    earningsIntel: sections.earningsIntel ?? false,
    preEarnings: sections.preEarnings ?? false,
  };
  const refMap: Record<string, DocumentReference<DocumentData> | null> = {
    facts: want.facts ? adminFirestore.collection("tm_stock_facts").doc(instrumentId) : null,
    technicals: want.technicals ? adminFirestore.collection("tm_stock_technicals_latest").doc(instrumentId) : null,
    onDemandJob: want.onDemandJob
      ? adminFirestore.collection("tm_on_demand_news_jobs").doc(instrumentId)
      : null,
    earningsIntel: want.earningsIntel ? adminFirestore.collection("tm_earnings_intel").doc(`${market}__${instrumentId}__latest`) : null,
    preEarnings: want.preEarnings ? adminFirestore.collection("tm_pre_earnings_intel").doc(`${market}__${instrumentId}__upcoming`) : null,
  };
  const activeRefs = Object.values(refMap).filter((ref): ref is DocumentReference<DocumentData> => ref !== null);
  const docs = activeRefs.length ? await adminFirestore.getAll(...activeRefs) : [];
  const byPath = new Map(docs.map((doc) => [doc.ref.path, doc.exists ? doc.data() : null]));
  const pick = <T,>(ref: { path: string } | null): T | null =>
    ref ? (byPath.get(ref.path) as T | null) ?? null : null;

  const preEarningsRaw = pick<PreEarningsIntelDoc>(refMap.preEarnings);
  const preEarnings =
    preEarningsRaw?.instrument_id && preEarningsRaw?.ticker && preEarningsRaw?.event_date
      ? { ...preEarningsRaw, doc_id: `${market}__${instrumentId}__upcoming` }
      : null;

  return {
    facts: pick<StockFacts>(refMap.facts),
    technicals: pick<StockTechnicals>(refMap.technicals),
    onDemandJob: pick<OnDemandNewsJobDoc>(refMap.onDemandJob),
    earningsIntel: pick<EarningsIntelDoc>(refMap.earningsIntel),
    preEarnings,
  };
}

// The view is an opportunistic read cache. Its stamps only authorize use of a
// section; stale or missing sections are fetched from their canonical sources.
export type StockPageViewPeers = {
  better: SectorPeerPick[];
  rows: SectorPeerRow[];
};

export type StockPageViewDoc = {
  instrument_id: string;
  ticker?: string;
  intelligence?: StockIntelligenceDoc | null;
  intelligence_stamp?: string | null;
  business_questions?: StockBusinessQuestionsDoc | null;
  business_questions_stamp?: string | null;
  instrument_view?: InstrumentViewDoc | null;
  instrument_view_stamp?: string | null;
  intel_pro?: StockIntelPro | null;
  intel_pro_stamp?: string | null;
  facts?: StockFacts | null;
  facts_stamp?: string | null;
  technicals?: StockTechnicals | null;
  technicals_stamp?: string | null;
  earnings_intel?: EarningsIntelDoc | null;
  earnings_intel_stamp?: string | null;
  pre_earnings?: PreEarningsIntelDoc | null;
  pre_earnings_stamp?: string | null;
  peers?: StockPageViewPeers | null;
  peers_stamp?: string | null;
};

export type StockPageSections = {
  intelligence: StockIntelligenceDoc | null;
  business_questions: StockBusinessQuestionsDoc | null;
  instrument_view: InstrumentViewDoc | null;
  intel_pro: StockIntelPro | null;
  facts: StockFacts | null;
  technicals: StockTechnicals | null;
  earnings_intel: EarningsIntelDoc | null;
  pre_earnings: PreEarningsIntelDoc | null;
  peers: StockPageViewPeers | null;
};

export type StockPageSectionKey = keyof StockPageSections;

const STOCK_PAGE_VIEW_MAX_AGE_MS: Record<StockPageSectionKey, number> = {
  intelligence: 24 * 3600_000,
  business_questions: 14 * 86400_000,
  instrument_view: 14 * 86400_000,
  intel_pro: 14 * 86400_000,
  facts: 14 * 86400_000,
  technicals: 14 * 86400_000,
  earnings_intel: 90 * 86400_000,
  pre_earnings: 14 * 86400_000,
  peers: 14 * 86400_000,
};

export function stockPageViewDocId(market: "US" | "IN", instrumentId: string): string {
  return `${market}__${instrumentId.toUpperCase()}`;
}

function sectionFresh(view: StockPageViewDoc | null, key: StockPageSectionKey, nowMs: number): boolean {
  const stamp = view?.[`${key}_stamp` as keyof StockPageViewDoc];
  const stampMs = typeof stamp === "string" ? new Date(stamp).getTime() : Number.NaN;
  return Number.isFinite(stampMs) && nowMs - stampMs <= STOCK_PAGE_VIEW_MAX_AGE_MS[key];
}

export type StockPageViewResolution = {
  view: StockPageViewDoc | null;
  sections: StockPageSections;
  directNeeded: Record<StockPageSectionKey, boolean>;
};

export function resolveStockPageViewSections(
  view: StockPageViewDoc | null,
  nowMs: number = Date.now(),
  instrumentId?: string,
): StockPageViewResolution {
  if (view && instrumentId && view.instrument_id !== instrumentId) view = null;
  const sections = {
    intelligence: view?.intelligence ?? null,
    business_questions: view?.business_questions ?? null,
    instrument_view: view?.instrument_view ?? null,
    intel_pro: view?.intel_pro ?? null,
    facts: view?.facts ?? null,
    technicals: view?.technicals ?? null,
    earnings_intel: view?.earnings_intel ?? null,
    pre_earnings: view?.pre_earnings ?? null,
    peers: view?.peers ?? null,
  };
  const directNeeded = {} as Record<StockPageSectionKey, boolean>;
  for (const key of Object.keys(sections) as StockPageSectionKey[]) {
    directNeeded[key] = !sectionFresh(view, key, nowMs);
    if (directNeeded[key]) sections[key] = null;
  }
  return { view, sections, directNeeded };
}

const getStockPageViewUncached = async (market: "US" | "IN", instrumentId: string): Promise<StockPageViewDoc | null> => {
  const doc = await adminFirestore.collection("tm_stock_page_views").doc(stockPageViewDocId(market, instrumentId)).get();
  if (!doc.exists) return null;
  const data = doc.data() as StockPageViewDoc | undefined;
  return data?.instrument_id === instrumentId ? data : null;
};

export const getStockPageView = unstable_cache(
  getStockPageViewUncached,
  ["stock-page-view-v2"],
  { revalidate: 60 },
);

/** Daily closes for the Returns chart. Capped to ~1Y of sessions. */
export async function getStockPriceHistory(
  instrumentId: string,
): Promise<PriceHistoryPoint[]> {
  const data = await getLatestPriceHistory(instrumentId);
  return buildPriceHistorySeries(data).slice(-PRICE_HISTORY_CHART_MAX);
}

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
  financial_history?: Array<{
    period: string;
    revenue?: number | null;
    gross_profit?: number | null;
    operating_income?: number | null;
    net_income?: number | null;
    eps_diluted?: number | null;
    free_cash_flow?: number | null;
    gross_margin_pct?: number | null;
    operating_margin_pct?: number | null;
    profit_margin_pct?: number | null;
  }>;
  balance?: {
    cash_and_investments?: number | null;
    total_debt?: number | null;
    net_cash?: number | null;
  };
  valuation?: {
    forward_pe?: number | null;
    price_to_sales?: number | null;
    price_to_fcf?: number | null;
    ev_to_ebitda?: number | null;
  };
  quality?: {
    roic_pct?: number | null;
    roe_pct?: number | null;
    debt_to_equity?: number | null;
    current_ratio?: number | null;
  };
  dividends?: {
    annual_dividend?: number | null;
    yield_pct?: number | null;
    payout_ratio_pct?: number | null;
    growth_pct?: number | null;
    growth_years?: number | null;
    buyback_yield_pct?: number | null;
    shareholder_yield_pct?: number | null;
    next_ex_dividend_date?: string | null;
    history?: Array<{
      ex_date: string;
      amount: number;
      record_date?: string | null;
      pay_date?: string | null;
    }>;
  };
  business_segments?: StockRevenueMix | null;
  geographic_mix?: StockRevenueMix | null;
  analyst_trend?: {
    target?: {
      low?: number | null;
      average?: number | null;
      median?: number | null;
      high?: number | null;
    };
    recommendation_trend?: Array<{
      period: string;
      strong_buy?: number | null;
      buy?: number | null;
      hold?: number | null;
      sell?: number | null;
      strong_sell?: number | null;
    }>;
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
  source_status?: {
    sources?: string[];
    errors?: string[];
  };
};

export type StockRevenueMix = {
  period?: string | null;
  items?: Array<{
    name: string;
    value: number;
    share_pct: number;
  }>;
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

  const [instrument, priceData] = await Promise.all([
    getInstrument(instrumentId),
    getLatestPriceCore(instrumentId),
  ]);

  if (instrument) {
    const quote = priceData?.quote;
    if (quote && typeof quote.current === "number") {
      return {
        instrument_id: instrument.instrument_id,
        ticker: instrument.ticker,
        name: instrument.name,
        exchange: instrument.exchange,
        sector: instrument.sector,
        industry: instrument.industry,
        country: instrument.country,
        description: instrument.description,
        currency: instrument.currency,
        logo_url: instrument.logo_url,
        index_memberships: instrument.index_memberships,
        price: quote.current,
        day_change_abs: quote.day_change_abs,
        day_change_pct: quote.day_change_pct,
        previous_close: quote.previous_close,
        day_high: quote.high,
        day_low: quote.low,
        captured_at: priceData?.captured_at || priceData?.updated_at,
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
    const fallbackPrice = await getLatestPriceCore(instrument.instrument_id);
    const quote = fallbackPrice?.quote;
    if (quote && typeof quote.current === "number") {
      return {
        instrument_id: instrument.instrument_id,
        ticker: instrument.ticker,
        name: instrument.name,
        exchange: instrument.exchange,
        sector: instrument.sector,
        industry: instrument.industry,
        country: instrument.country,
        description: instrument.description,
        currency: instrument.currency,
        logo_url: instrument.logo_url,
        index_memberships: instrument.index_memberships,
        price: quote.current,
        day_change_abs: quote.day_change_abs,
        day_change_pct: quote.day_change_pct,
        previous_close: quote.previous_close,
        day_high: quote.high,
        day_low: quote.low,
        captured_at: fallbackPrice?.captured_at || fallbackPrice?.updated_at,
        source: "instrument",
        fundamentals: (fallbackPrice?.fundamentals ?? null) as StockFundamentals | null,
      };
    }
  }

  // Last-resort: synthesize a summary from the price doc alone. This covers
  // tickers that the snapshot pipeline writes but that haven't been registered
  // in `tm_instruments` yet (a known gap on the IN side).
  if (priceData) {
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
        captured_at: priceData?.captured_at || priceData?.updated_at,
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
  return getNewsRunDoc<StockIntelligenceDoc>(
    instrumentId,
    market,
    "stock_intelligence",
  );
}

export async function getStockBusinessQuestions(
  instrumentId: string,
  market: "US" | "IN" = "US",
): Promise<StockBusinessQuestionsDoc | null> {
  return getNewsRunDoc<StockBusinessQuestionsDoc>(
    instrumentId,
    market,
    "business_questions",
  );
}

async function getNewsRunDoc<T>(
  instrumentId: string,
  market: "US" | "IN",
  collection: "stock_intelligence" | "business_questions",
): Promise<T | null> {
  const universes = await getIntelUniverseIds(market);
  const refs = universes.map((universe) =>
    adminFirestore
      .collection("tm_news_runs")
      .doc(`${market}__${universe}`)
      .collection(collection)
      .doc(instrumentId),
  );
  if (!refs.length) return null;

  const docs = await adminFirestore.getAll(...refs);
  const match = docs.find((doc) => doc.exists);
  return match ? (match.data() as T) : null;
}

export async function getStockIntelPro(
  instrumentId: string,
  market: "US" | "IN" = "US",
): Promise<StockIntelPro | null> {
  const [universes, instrument] = await Promise.all([
    getIntelUniverseIds(market),
    getInstrument(instrumentId).catch(() => null),
  ]);
  if (!universes.length) return null;

  const refs = universes.map((universe) =>
    adminFirestore
      .collection("tm_stock_intel_pro")
      .doc(`${market}__${universe}`)
      .collection("stocks")
      .doc(instrumentId),
  );
  const snapshots = await adminFirestore.getAll(...refs);
  const docs = snapshots
    .filter((doc) => doc.exists)
    .map((doc) => doc.data() as StockIntelPro);

  if (!docs.length) return null;

  const primary = docs.sort((a, b) => stockIntelQualityScore(b) - stockIntelQualityScore(a))[0];
  const sectorSource =
    docs.find((row) => Boolean(sectorSlugForIntel(row, instrument))) ??
    docs.find((row) => Boolean(row.sector_slug || row.sector_label)) ??
    null;

  const sector_slug =
    (sectorSource ? sectorSlugForIntel(sectorSource, instrument) : "") ||
    sectorSlugForIntel(primary, instrument) ||
    primary.sector_slug ||
    "";
  const sector_label =
    sectorSource?.sector_label ||
    primary.sector_label ||
    instrument?.sector ||
    "";
  const industry_label =
    sectorSource?.industry_label ||
    primary.industry_label ||
    instrument?.industry ||
    "";

  return {
    ...primary,
    sector_slug,
    sector_label,
    industry_label,
  };
}

function stockIntelQualityScore(row: StockIntelPro): number {
  const overall = Number(row.overall?.score ?? 0);
  const pillars = Object.values(row.pillars ?? {});
  const coverageAwarePillars = pillars.filter(
    (pillar) => typeof pillar?.coverage === "number" && Number.isFinite(pillar.coverage),
  ).length;
  const scoredPillars = pillars.filter((pillar) => Number(pillar?.score ?? 0) > 0).length;
  const scoredMetrics = pillars.reduce((count, pillar) => {
    const metrics = Array.isArray(pillar?.metrics) ? pillar.metrics : [];
    return count + metrics.filter((metric) => typeof metric.score === "number").length;
  }, 0);
  // Prefer documents produced by the coverage-aware scorer when a ticker
  // exists in multiple universe namespaces. This prevents a more populated
  // legacy document from silently restoring the old missing-data behavior.
  return coverageAwarePillars * 100_000 + scoredPillars * 1000 + scoredMetrics * 10 + overall;
}

function intelHasCompositeScore(intel: StockIntelPro): boolean {
  return (
    typeof intel.overall?.score === "number" &&
    Object.keys(intel.pillars ?? {}).length > 0 &&
    hasSufficientOverallData(intel)
  );
}

function intelSectorSlug(intel: StockIntelPro): string {
  return resolveSectorSlug({
    sector_slug: intel.sector_slug,
    sector_label: intel.sector_label,
  });
}

async function querySectorIntelDocs(
  market: "US" | "IN",
  universe: string,
  sectorSlug: string,
  limit: number,
): Promise<StockIntelPro[]> {
  const collection = adminFirestore
    .collection("tm_stock_intel_pro")
    .doc(`${market}__${universe}`)
    .collection("stocks");

  try {
    const snap = await collection
      .where("sector_slug", "==", sectorSlug)
      .orderBy("overall.score", "desc")
      .limit(limit)
      .get();
    return snap.docs.map((d) => d.data() as StockIntelPro);
  } catch {
    const snap = await collection.where("sector_slug", "==", sectorSlug).limit(Math.max(limit * 4, 24)).get();
    return snap.docs
      .map((d) => d.data() as StockIntelPro)
      .filter(intelHasCompositeScore)
      .sort((a, b) => (b.overall?.score ?? 0) - (a.overall?.score ?? 0))
      .slice(0, limit);
  }
}

async function scanUniverseSectorPeers(
  market: "US" | "IN",
  universe: string,
  sectorSlug: string,
  excludeInstrumentId: string,
  limit: number,
): Promise<StockIntelPro[]> {
  const snap = await adminFirestore
    .collection("tm_stock_intel_pro")
    .doc(`${market}__${universe}`)
    .collection("stocks")
    .limit(650)
    .get();
  const candidates = snap.docs
    .map((d) => d.data() as StockIntelPro)
    .filter((row) => row.instrument_id !== excludeInstrumentId && intelHasCompositeScore(row));

  const needsInstrument = candidates.filter((row) => !intelSectorSlug(row));
  const instrumentById =
    needsInstrument.length > 0
      ? await batchGetRefs<Instrument>(
          needsInstrument.map((row) => adminFirestore.collection("tm_instruments").doc(row.instrument_id)),
        )
      : new Map<string, Instrument>();

  return candidates
    .filter((row) => {
      const slug = sectorSlugForIntel(row, instrumentById.get(row.instrument_id));
      return slug === sectorSlug;
    })
    .sort((a, b) => (b.overall?.score ?? 0) - (a.overall?.score ?? 0))
    .slice(0, limit);
}

async function loadCatalogSectorPeers(
  instrumentId: string,
  market: "US" | "IN",
  sectorSlug: string,
  limit: number,
  seen: Set<string>,
): Promise<StockIntelPro[]> {
  if (!sectorSlug || limit <= 0) return [];
  const coverageId = await getCoverageUniverse(market);
  const catalog = await listCatalogInstruments(market, coverageId);
  const matches = catalog.filter((row) => {
    if (row.instrument_id === instrumentId || seen.has(row.instrument_id)) return false;
    return resolveSectorSlug({ sector_label: row.sector, instrument_industry: row.industry }) === sectorSlug;
  });
  if (!matches.length) return [];

  const universes = await getIntelUniverseIds(market);
  const intelById = new Map<string, StockIntelPro>();
  const candidateIds = matches.map((row) => row.instrument_id);
  for (const universe of universes) {
    const batch = await batchGetRefs<StockIntelPro>(
      candidateIds.map((id) =>
        adminFirestore.collection("tm_stock_intel_pro").doc(`${market}__${universe}`).collection("stocks").doc(id),
      ),
    );
    for (const [id, intel] of batch.entries()) {
      if (intel && !intelById.has(id)) intelById.set(id, intel);
    }
  }

  const prices = await getLatestPriceFundamentals(candidateIds);
  const sorted = [...matches].sort((a, b) => {
    const capA = prices.get(a.instrument_id)?.fundamentals?.market_cap ?? 0;
    const capB = prices.get(b.instrument_id)?.fundamentals?.market_cap ?? 0;
    return capB - capA;
  });

  const out: StockIntelPro[] = [];
  for (const row of sorted) {
    const intel = intelById.get(row.instrument_id);
    if (intel) {
      out.push(intel);
    } else {
      out.push({
        instrument_id: row.instrument_id,
        ticker: row.ticker,
        sector_slug: sectorSlug,
        sector_label: row.sector,
        industry_label: row.industry,
        overall: { score: 0, verdict: "", stance: "" },
        pillars: {},
      } as StockIntelPro);
    }
    if (out.length >= limit) break;
  }
  return out;
}

async function loadSectorIntelPeers(
  instrumentId: string,
  market: "US" | "IN",
  sectorSlug: string,
  limit: number,
): Promise<StockIntelPro[]> {
  if (!sectorSlug) return [];
  const universes = await getIntelUniverseIds(market);
  if (!universes.length) return [];

  const seen = new Set<string>();
  const out: StockIntelPro[] = [];

  for (const universe of universes) {
    const queried = await querySectorIntelDocs(market, universe, sectorSlug, limit + 8);
    for (const row of queried) {
      if (row.instrument_id === instrumentId || seen.has(row.instrument_id)) continue;
      if (!intelHasCompositeScore(row)) continue;
      seen.add(row.instrument_id);
      out.push(row);
      if (out.length >= limit) return out;
    }
  }

  if (out.length >= limit) return out.slice(0, limit);

  for (const universe of universes) {
    const scanned = await scanUniverseSectorPeers(
      market,
      universe,
      sectorSlug,
      instrumentId,
      limit + 8,
    );
    for (const row of scanned) {
      if (seen.has(row.instrument_id)) continue;
      seen.add(row.instrument_id);
      out.push(row);
      if (out.length >= limit) return out;
    }
  }

  if (out.length < limit) {
    const catalogPeers = await loadCatalogSectorPeers(
      instrumentId,
      market,
      sectorSlug,
      limit - out.length,
      seen,
    );
    for (const row of catalogPeers) {
      if (seen.has(row.instrument_id)) continue;
      seen.add(row.instrument_id);
      out.push(row);
      if (out.length >= limit) return out;
    }
  }

  return out.slice(0, limit);
}

const getCachedSectorPeerRankings = unstable_cache(
  async (
    instrumentId: string,
    market: "US" | "IN",
    sectorSlug: string,
    limit: number,
  ) => loadSectorIntelPeers(instrumentId, market, sectorSlug, limit),
  ["stock-sector-peer-rankings-v1"],
  { revalidate: 900 },
);

export type SectorPeerPick = { instrument_id: string; ticker: string; score: number; verdict: string };

export type SectorPeerRow = {
  instrument_id: string;
  ticker: string;
  name: string;
  score: number | null;
  verdict: string;
  day_change_pct?: number;
  price?: number;
  market_cap?: number;
  pe_ttm?: number;
  revenue_growth_yoy_pct?: number;
};

function peerFundamentalsFromDocs(
  instrumentId: string,
  factsById: Map<string, StockFacts>,
  pricesById: Map<string, LatestPriceCore>,
): Pick<SectorPeerRow, "market_cap" | "pe_ttm" | "revenue_growth_yoy_pct"> {
  const facts = factsById.get(instrumentId);
  const price = pricesById.get(instrumentId);
  return {
    market_cap: facts?.quick_stats?.market_cap ?? price?.fundamentals?.market_cap ?? undefined,
    pe_ttm: facts?.quick_stats?.pe_ttm ?? price?.fundamentals?.pe_ttm ?? undefined,
    revenue_growth_yoy_pct: facts?.financials?.revenue_growth_yoy_pct ?? undefined,
  };
}

async function enrichSectorPeerRows(
  peers: StockIntelPro[],
  market: "US" | "IN",
): Promise<SectorPeerRow[]> {
  if (peers.length === 0) return [];
  const peerIds = peers.map((p) => p.instrument_id);
  const [prices, factsById, instrumentsById] = await Promise.all([
    getLatestPriceCores(peerIds),
    batchGetRefs<StockFacts>(peerIds.map((id) => adminFirestore.collection("tm_stock_facts").doc(id))),
    batchGetRefs<Instrument>(peerIds.map((id) => adminFirestore.collection("tm_instruments").doc(id))),
  ]);
  return peers.map((s) => {
    const quote = prices.get(s.instrument_id)?.quote;
    const instrument = instrumentsById.get(s.instrument_id);
    const scored = intelHasCompositeScore(s);
    return {
      instrument_id: s.instrument_id,
      ticker: s.ticker,
      name: instrument?.name || s.industry_label || s.overall.verdict,
      score: scored ? s.overall.score : null,
      verdict: s.overall.verdict,
      price: typeof quote?.current === "number" ? quote.current : undefined,
      day_change_pct: typeof quote?.day_change_pct === "number" ? quote.day_change_pct : undefined,
      ...peerFundamentalsFromDocs(s.instrument_id, factsById, prices),
    };
  });
}

/** Fill comparison metrics for curated related tickers when indexed sector peers are unavailable. */
export async function enrichRelatedTickersForComparison(
  instrumentId: string,
  market: "US" | "IN",
  related: RelatedTicker[],
  limit = 4,
): Promise<SectorPeerRow[]> {
  const candidates = related.filter((r) => r.instrument_id !== instrumentId).slice(0, limit);
  if (candidates.length === 0) return [];

  const ids = candidates.map((r) => r.instrument_id);
  const universes = await getIntelUniverseIds(market);

  const [prices, factsById, instrumentsById] = await Promise.all([
    getLatestPriceCores(ids),
    batchGetRefs<StockFacts>(ids.map((id) => adminFirestore.collection("tm_stock_facts").doc(id))),
    batchGetRefs<Instrument>(ids.map((id) => adminFirestore.collection("tm_instruments").doc(id))),
  ]);

  const intelById = new Map<string, StockIntelPro>();
  for (const universe of universes) {
    const batch = await batchGetRefs<StockIntelPro>(
      ids.map((id) =>
        adminFirestore.collection("tm_stock_intel_pro").doc(`${market}__${universe}`).collection("stocks").doc(id),
      ),
    );
    for (const [id, intel] of batch.entries()) {
      if (intel && !intelById.has(id)) intelById.set(id, intel);
    }
  }

  return candidates.map((row) => {
    const intel = intelById.get(row.instrument_id);
    const instrument = instrumentsById.get(row.instrument_id);
    const quote = prices.get(row.instrument_id)?.quote;
    const metrics = peerFundamentalsFromDocs(row.instrument_id, factsById, prices);
    return {
      instrument_id: row.instrument_id,
      ticker: row.ticker,
      name: instrument?.name || row.name,
      score: intel && intelHasCompositeScore(intel) ? intel.overall.score : null,
      verdict: intel?.overall?.verdict ?? "",
      price: typeof quote?.current === "number" ? quote.current : undefined,
      day_change_pct: typeof quote?.day_change_pct === "number" ? quote.day_change_pct : undefined,
      ...metrics,
    };
  });
}

/** Top names in the same sector by composite score (excludes the current ticker). */
export async function getSectorPeerRows(
  instrumentId: string,
  market: "US" | "IN",
  sectorSlug: string,
  limit = 6,
): Promise<SectorPeerRow[]> {
  const peers = await getCachedSectorPeerRankings(instrumentId, market, sectorSlug, limit);
  if (peers.length === 0) return [];

  try {
    return await enrichSectorPeerRows(peers, market);
  } catch {
    return peers.map((s) => ({
      instrument_id: s.instrument_id,
      ticker: s.ticker,
      name: s.industry_label || s.overall.verdict,
      score: s.overall.score,
      verdict: s.overall.verdict,
    }));
  }
}

/** Same-sector stocks that score higher on the fundamentals composite. */
export async function getBetterSectorPeers(
  instrumentId: string,
  market: "US" | "IN",
  sectorSlug: string,
  minScore: number,
  limit = 4,
): Promise<SectorPeerPick[]> {
  if (!sectorSlug || !Number.isFinite(minScore)) return [];
  const peers = await getCachedSectorPeerRankings(instrumentId, market, sectorSlug, limit + 8);
  return peers
    .filter((s) => intelHasCompositeScore(s) && (s.overall?.score ?? 0) > minScore)
    .slice(0, limit)
    .map((s) => ({
      instrument_id: s.instrument_id,
      ticker: s.ticker,
      score: s.overall.score,
      verdict: s.overall.verdict,
    }));
}

export async function getSectorPeersForStock(
  instrumentId: string,
  market: "US" | "IN",
  intelPro: StockIntelPro | null,
  instrument?: Instrument | null,
  limit = 6,
): Promise<SectorPeerRow[]> {
  const sectorSlug = sectorSlugForIntel(intelPro, instrument);
  if (!sectorSlug) return [];
  return getSectorPeerRows(instrumentId, market, sectorSlug, limit);
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
  const data = (await getLatestPriceFundamentals([instrumentId])).get(instrumentId);
  if (!data) return null;
  return (data.fundamentals ?? null) as StockFundamentals | null;
}

/** Normalized ticker from `/stock/[symbol]`. Returns null if invalid. */
export function normalizeStockSymbolParam(raw: string): string | null {
  const s = decodeURIComponent(String(raw ?? "").trim()).toUpperCase();
  if (!s || s.length > 16) return null;
  if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(s)) return null;
  return s;
}
