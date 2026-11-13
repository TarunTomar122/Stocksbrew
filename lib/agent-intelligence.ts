import {
  AGENT_ACCESS_VERSION,
  AGENT_DATA_NOTICE,
  type AgentScope,
} from "@/lib/agent-access-config";
import { requireAgentScope, type AgentPrincipal } from "@/lib/agent-auth";
import { AgentDataError } from "@/lib/agent-errors";
import {
  getAgentCopyTest,
  getAgentDividendPlan,
  getAgentStressTest,
  getAgentWhatYouOwn,
  readAgentWatchRequest,
} from "@/lib/agent-feature-tools";
import { getAgentBasket, getAgentFilingChanges, listAgentBaskets } from "@/lib/agent-idea-tools";
import { consumeAgentQuota } from "@/lib/agent-quota";
import { compareStocks } from "@/lib/compare-stocks";
import { MARKET_FEED_FRESHNESS, freshnessInfo } from "@/lib/freshness";
import { getHomeView } from "@/lib/home-view";
import { getInstrumentLabels, resolveInstrumentByTicker } from "@/lib/instrument-resolver";
import { filterSearchEntries, getSearchIndexForApi } from "@/lib/search";
import { getOnDemandNewsStatus } from "@/lib/on-demand-queue";
import { getInstrument, getMarketSnapshot } from "@/lib/firestore";
import { canonicalAgentRadarLabel } from "@/lib/agent-radar-labels";
import { getHeatList } from "@/lib/heat";
import { getNear52WeekLists } from "@/lib/near-52-week";
import { getRedditCues, hasRedditBrief, getRedditContextForTicker } from "@/lib/reddit-cues";
import { getTrumpLogic } from "@/lib/trump-logic";
import { isTrumpMentionRecent } from "@/lib/trump-logic-format";
import { getThematicScreens } from "@/lib/screens";
import { listMarketDailyEditions } from "@/lib/market-daily";
import { getNewsForTicker } from "@/lib/news";
import { getLatestTechnicals } from "@/lib/technicals";
import { getLatestEarningsIntelByTicker } from "@/lib/earnings-intel";
import { getNextEarningsCalendarEvent } from "@/lib/earnings";
import { getPreEarningsIntelDoc } from "@/lib/pre-earnings-intel";
import { getDailyAnomalyForTicker } from "@/lib/daily-anomalies";
import { getPremarketMovers } from "@/lib/premarket";
import { FollowLimitError, addRadarStock, removeRadarStock } from "@/lib/radar-mutations";
import {
  createStockAlert,
  deleteStockAlert,
  isAlertKind,
  listStockAlerts,
  StockAlertError,
} from "@/lib/stock-alerts";
import {
  getInstrumentViewDoc,
  getStockBusinessQuestions,
  getStockFacts,
  getStockIntelPro,
  getStockIntelligenceDoc,
  getStockPriceHistory,
  getStockSummary,
} from "@/lib/stock";
import { loadRadarRowsForUser } from "@/lib/radar-rows";
import { getRadarUserView, getWatchlistView, type WatchlistRow } from "@/lib/watchlist-view";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export type AgentMarket = "US" | "IN";
export type AgentToolName =
  | "search_stocks"
  | "get_stock_intelligence"
  | "get_stock_detail"
  | "compare_stocks"
  | "get_market_brief"
  | "get_market_history"
  | "get_explore"
  | "get_screens"
  | "get_my_radar"
  | "get_radar_changes"
  | "add_to_radar"
  | "remove_from_radar"
  | "get_my_alerts"
  | "create_alert"
  | "delete_alert"
  | "what_you_own"
  | "dividend_plan"
  | "stress_test"
  | "copy_test"
  | "watch_in_plain_words"
  | "get_filing_changes"
  | "list_baskets"
  | "get_basket";

export { AgentDataError };

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function latestIso(values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  let latestTime = -Infinity;
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isFinite(time) && time > latestTime) {
      latest = value;
      latestTime = time;
    }
  }
  return latest;
}

function envelope<T extends Record<string, unknown>>(data: T, asOf?: string | null) {
  const freshness = freshnessInfo(asOf, MARKET_FEED_FRESHNESS);
  return {
    schema_version: AGENT_ACCESS_VERSION,
    as_of: asOf ?? null,
    freshness: {
      status: freshness.status,
      age_hours: freshness.ageHours === null ? null : Math.round(freshness.ageHours * 10) / 10,
      relative: freshness.relative || null,
    },
    notice: AGENT_DATA_NOTICE,
    ...data,
  };
}

function requiredScopeForTool(tool: AgentToolName): AgentScope {
  if (tool === "get_market_brief" || tool === "get_market_history" || tool === "get_explore" || tool === "get_screens" || tool === "copy_test") return "market:read";
  if (tool === "add_to_radar" || tool === "remove_from_radar") return "radar:write";
  if (tool === "get_my_alerts") return "alerts:read";
  if (tool === "create_alert" || tool === "delete_alert") return "alerts:write";
  if (tool === "get_my_radar" || tool === "get_radar_changes" || tool === "what_you_own" || tool === "dividend_plan" || tool === "stress_test" || tool === "list_baskets" || tool === "get_basket") return "radar:read";
  return "stocks:read";
}

export async function searchStocks(input: {
  query: string;
  market?: AgentMarket;
  limit?: number;
}) {
  const market = input.market === "IN" ? "IN" : "US";
  const query = input.query.trim();
  if (!query) throw new AgentDataError("A ticker or company name is required.", "invalid_query");
  const requestedLimit = typeof input.limit === "number" && Number.isFinite(input.limit) ? input.limit : 10;
  const limit = Math.min(20, Math.max(1, Math.floor(requestedLimit)));
  const entries = await getSearchIndexForApi(market).catch(() => []);
  const matches = filterSearchEntries(entries, query, limit).map((entry) => ({
    instrument_id: entry.instrument_id,
    ticker: entry.ticker,
    name: entry.name,
    market,
  }));
  return envelope({ market, query, matches }, null);
}

export async function getStockAgentIntelligence(input: {
  ticker: string;
  market?: AgentMarket;
  uid?: string;
}) {
  const market = input.market === "IN" ? "IN" : "US";
  const ticker = input.ticker.trim().toUpperCase();
  if (!ticker || ticker.length > 20) throw new AgentDataError("A valid ticker is required.", "invalid_ticker");
  const resolved = await resolveInstrumentByTicker(ticker, market).catch(() => null);
  if (!resolved) throw new AgentDataError(`${ticker} was not found in the ${market} catalog.`, "stock_not_found", 404);

  const [summary, view, intelligence, intelPro, facts, user, researchJob] = await Promise.all([
    getStockSummary(resolved.ticker, market).catch(() => null),
    getInstrumentViewDoc(resolved.instrument_id, market).catch(() => null),
    getStockIntelligenceDoc(resolved.instrument_id, market).catch(() => null),
    getStockIntelPro(resolved.instrument_id, market).catch(() => null),
    getStockFacts(resolved.instrument_id).catch(() => null),
    input.uid ? getUserDoc(input.uid).catch(() => null) : null,
    getOnDemandNewsStatus(resolved.instrument_id).catch(() => null),
  ]);
  const tracked = Boolean(user?.tracked_stocks?.includes(resolved.instrument_id));
  const hasDetailedCall = Boolean(intelligence?.directive_v2);
  const hasBaseline = Boolean(summary || view || intelligence || intelPro || facts);
  const jobStatus = researchJob?.status || null;
  const researchStatus = hasDetailedCall
    ? "ready"
    : jobStatus === "queued" || jobStatus === "running"
      ? jobStatus
      : jobStatus === "no_articles" || jobStatus === "no_brief"
        ? "no_sources"
        : jobStatus === "failed"
          ? "failed"
          : hasBaseline
            ? "baseline_only"
            : "unavailable";

  const targetPrice = nullableNumber(facts?.analyst?.target_price ?? view?.analyst_consensus?.target_price);
  const currentPrice = nullableNumber(summary?.price);
  const targetUpsidePct = targetPrice !== null && currentPrice !== null && currentPrice > 0
    ? Math.round(((targetPrice - currentPrice) / currentPrice) * 1000) / 10
    : null;
  const asOf = latestIso([
    summary?.captured_at,
    view?.generated_at,
    intelligence?.generated_at,
    intelPro?.generated_at,
    intelPro?.snapshot_date,
    facts?.captured_at,
  ]);

  return envelope({
    market,
    instrument: {
      instrument_id: resolved.instrument_id,
      ticker: resolved.ticker,
      name: summary?.name ?? resolved.name,
      exchange: summary?.exchange ?? null,
      sector: summary?.sector ?? intelPro?.sector_label ?? null,
      industry: summary?.industry ?? intelPro?.industry_label ?? null,
      currency: summary?.currency ?? (market === "IN" ? "INR" : "USD"),
    },
    market_data: {
      price: currentPrice,
      day_change_abs: nullableNumber(summary?.day_change_abs),
      day_change_pct: nullableNumber(summary?.day_change_pct),
      previous_close: nullableNumber(summary?.previous_close),
      indicative_only: true,
    },
    stocksbrew_intelligence: {
      headline: intelligence?.headline ?? null,
      thesis: intelligence?.thesis ?? intelligence?.body ?? null,
      setup_state: intelligence?.setup_state ?? null,
      call: intelligence?.directive_v2 ?? null,
      target_price: targetPrice,
      target_upside_pct: targetUpsidePct,
      drivers: intelligence?.visual_cards?.drivers ?? [],
      catalysts: intelligence?.visual_cards?.catalyst_cards ?? [],
      risks: intelligence?.visual_cards?.risk_cards ?? [],
      what_changed: intelligence?.visual_summary?.what_changed ?? null,
      why_it_matters: intelligence?.visual_summary?.why_it_matters ?? null,
      what_to_watch: intelligence?.visual_summary?.what_to_watch ?? null,
      key_points: intelligence?.key_points ?? [],
      evidence_count: intelligence?.data_quality?.evidence_count ?? intelligence?.source_count ?? null,
      confidence: intelligence?.data_quality?.freshness_status ?? intelPro?.overall?.confidence ?? null,
    },
    scores: intelPro ? {
      overall: nullableNumber(intelPro.overall?.score),
      verdict: intelPro.overall?.verdict ?? null,
      stance: intelPro.overall?.stance ?? null,
      valuation: nullableNumber(intelPro.pillars?.valuation?.score),
      growth: nullableNumber(intelPro.pillars?.growth?.score),
      quality: nullableNumber(intelPro.pillars?.quality?.score),
      momentum: nullableNumber(intelPro.pillars?.momentum?.score),
    } : null,
    fundamentals: {
      market_cap: nullableNumber(summary?.fundamentals?.market_cap ?? facts?.quick_stats?.market_cap),
      pe_ttm: nullableNumber(summary?.fundamentals?.pe_ttm ?? facts?.quick_stats?.pe_ttm),
      dividend_yield: nullableNumber(summary?.fundamentals?.dividend_yield),
      week_52_high: nullableNumber(summary?.fundamentals?.week_52_high),
      week_52_low: nullableNumber(summary?.fundamentals?.week_52_low),
      revenue_growth_yoy_pct: nullableNumber(facts?.financials?.revenue_growth_yoy_pct),
    },
    technicals: {
      rsi_14: nullableNumber(view?.momentum_signal?.rsi_14),
      momentum_label: view?.momentum_signal?.label ?? null,
    },
    coverage: {
      type: intelligence?.coverage_type ?? null,
      status: researchStatus,
      tracked_in_radar: tracked,
      has_baseline_data: hasBaseline,
      has_detailed_call: hasDetailedCall,
      has_pro_scores: Boolean(intelPro),
      research_job: researchJob,
      next_action: hasDetailedCall
        ? { action: "answer", message: "Use the current Stocksbrew brief and cite its freshness." }
        : !tracked
          ? {
              action: "ask_to_add_to_radar",
              tool: "add_to_radar",
              message: "Baseline data is available, but the detailed research is missing. Ask the user before adding this stock to Watchlist. Adding it queues research.",
            }
          : researchStatus === "queued" || researchStatus === "running"
            ? {
                action: "recheck_later",
                tool: "get_stock_intelligence",
                message: "Research is in progress. Keep the baseline answer clearly labeled and check again later.",
              }
            : {
                action: "ask_to_refresh_research",
                tool: "add_to_radar",
                message: "Answer only from available market and fundamental data. Say that the detailed AI brief is missing, then ask before using add_to_radar to refresh its research queue.",
              },
    },
  }, asOf);
}

export async function getStockAgentDetail(input: {
  ticker: string;
  market?: AgentMarket;
  uid?: string;
}) {
  const market = input.market === "IN" ? "IN" : "US";
  const stock = await resolveAgentStock(input.ticker, market);
  const base = await getStockAgentIntelligence(input);
  const [summary, instrumentMeta, instrumentView, intelligence, intelPro, facts, businessQuestions, priceHistory, technicals, news, reddit, earnings, preEarnings, nextEarnings, anomaly, premarket] = await Promise.all([
    getStockSummary(stock.ticker, market).catch(() => null),
    getInstrument(stock.instrument_id).catch(() => null),
    getInstrumentViewDoc(stock.instrument_id, market).catch(() => null),
    getStockIntelligenceDoc(stock.instrument_id, market).catch(() => null),
    getStockIntelPro(stock.instrument_id, market).catch(() => null),
    getStockFacts(stock.instrument_id).catch(() => null),
    getStockBusinessQuestions(stock.instrument_id, market).catch(() => null),
    getStockPriceHistory(stock.instrument_id).catch(() => []),
    getLatestTechnicals(stock.instrument_id).catch(() => null),
    getNewsForTicker(market, stock.ticker, { days: 7, limit: 7 }).catch(() => []),
    getRedditContextForTicker(market, stock.ticker).catch(() => null),
    getLatestEarningsIntelByTicker(market, stock.ticker).catch(() => null),
    getPreEarningsIntelDoc(market, stock.instrument_id).catch(() => null),
    getNextEarningsCalendarEvent(market, stock.ticker).catch(() => null),
    getDailyAnomalyForTicker(market, stock.ticker).catch(() => null),
    getPremarketMovers(market).catch(() => null),
  ]);
  const detailAsOf = latestIso([
    summary?.captured_at,
    instrumentView?.generated_at,
    intelligence?.generated_at,
    intelPro?.generated_at,
    facts?.captured_at,
    businessQuestions?.generated_at,
    technicals?.generated_at,
    ...news.map((article) => article.published_at),
  ]);

  return {
    ...base,
    detail_as_of: detailAsOf,
    stock_page: {
      evidence_status: {
        instrument: instrumentMeta ? "available" : "not_enough_current_evidence",
        financials: facts?.financial_history?.length || facts?.financials ? "available" : "not_enough_current_evidence",
        business_questions: businessQuestions ? "available" : "not_enough_current_evidence",
        price_history: priceHistory.length ? "available" : "not_enough_current_evidence",
        technicals: technicals ? "available" : "not_enough_current_evidence",
        news: news.length ? "available" : "not_enough_current_evidence",
        reddit: reddit ? "available" : "not_enough_current_evidence",
        earnings: earnings ? "available" : "not_enough_current_evidence",
        pre_earnings: preEarnings ? "available" : "not_enough_current_evidence",
        next_earnings: nextEarnings ? "available" : "not_enough_current_evidence",
        anomaly: anomaly ? "available" : "not_enough_current_evidence",
        premarket: premarket ? "available" : "not_enough_current_evidence",
      },
      evidence_message: "Missing sections are reported as not enough current evidence.",
      business_questions: businessQuestions?.questions ?? [],
      business_questions_status: businessQuestions ? "available" : "not_enough_current_evidence",
      price_history: priceHistory,
      technicals,
      news,
      reddit,
      earnings,
      pre_earnings: preEarnings,
      next_earnings: nextEarnings,
      anomaly,
      premarket,
      source_documents: {
        summary,
        instrument: instrumentMeta,
        instrument_view: instrumentView,
        intelligence,
        intel_pro: intelPro,
        facts,
        business_questions: businessQuestions,
      },
    },
  };
}

export async function compareAgentStocks(input: { tickers: string[] }) {
  const tickers = [...new Set(input.tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
  if (tickers.length < 2 || tickers.length > 5) {
    throw new AgentDataError("Compare between 2 and 5 unique tickers.", "invalid_tickers");
  }
  const result = await compareStocks(tickers);
  return envelope({
    stocks: result.stocks.map((stock) => ({
      ticker: stock.ticker,
      name: stock.name,
      market: stock.market,
      sector: stock.sector,
      industry: stock.industry,
      price: stock.price,
      day_change_pct: stock.day_change_pct,
      market_cap: stock.market_cap,
      pe_ttm: stock.pe_ttm,
      dividend_yield: stock.dividend_yield,
      target_price: stock.analyst_target_price,
      scores: stock.scores,
      verdict: stock.verdict,
      rsi_14: stock.rsi,
      returns: {
        one_month_pct: stock.one_month_return,
        three_month_pct: stock.three_month_return,
        six_month_pct: stock.six_month_return,
        one_year_pct: stock.one_year_return,
      },
    })),
    missing_tickers: result.missing_tickers,
  }, null);
}

export async function getMarketAgentBrief(input: { market?: AgentMarket }) {
  const market = input.market === "IN" ? "IN" : "US";
  const home = await getHomeView(market);
  if (!home?.dashboard) throw new AgentDataError(`The ${market} market brief is unavailable.`, "market_unavailable", 503);
  const dashboard = home.dashboard;
  const asOf = latestIso([home.updated_at, dashboard.generated_at, dashboard.hero_brief?.updated_at]);
  const compactMover = (row: (typeof dashboard.gainers)[number]) => ({
    ticker: row.ticker,
    name: row.name,
    price: nullableNumber(row.price),
    day_change_pct: nullableNumber(row.day_change_pct),
    sentiment_score: nullableNumber(row.ai_sentiment_score),
  });
  return envelope({
    market,
    sentiment: dashboard.market_sentiment ?? null,
    brief: dashboard.hero_brief ? {
      title: dashboard.hero_brief.title,
      body: dashboard.hero_brief.body,
      verified_source_count: dashboard.hero_brief.verified_source_count,
    } : null,
    context: dashboard.market_context ?? null,
    macro: (dashboard.macro_cards ?? []).slice(0, 12).map((card) => ({
      id: card.id,
      label: card.label,
      value: card.value,
      day_change_pct: card.day_change_pct,
    })),
    sector_flows: (dashboard.sector_flows ?? []).slice(0, 20),
    movers: {
      gainers: (dashboard.gainers ?? []).slice(0, 5).map(compactMover),
      losers: (dashboard.losers ?? []).slice(0, 5).map(compactMover),
    },
  }, asOf);
}

const EXPLORE_TRENDING_TICKERS = ["NVDA", "TSM", "MSFT", "GOOGL", "AAPL", "PLTR", "MU", "AMZN", "TSLA", "AMD", "COIN"];

export async function getAgentExplore(input: { market?: AgentMarket }) {
  const market = input.market === "IN" ? "IN" : "US";
  const [snapshotRows, heat, reddit, near52, trump] = await Promise.all([
    getMarketSnapshot(market).catch(() => []),
    getHeatList(market).catch(() => null),
    getRedditCues(market).catch(() => null),
    getNear52WeekLists(market, 20).catch(() => ({ nearHighs: [], nearLows: [] })),
    getTrumpLogic(market).catch(() => null),
  ]);
  const bySymbol = new Map(snapshotRows.map((row) => [row.symbol.toUpperCase(), row]));
  const trending = EXPLORE_TRENDING_TICKERS.map((ticker) => {
    const row = bySymbol.get(ticker);
    return row
      ? {
          ticker,
          name: row.name,
          price: row.price.current,
          change_pct: row.price.changePct ?? null,
        }
      : null;
  }).filter((row): row is NonNullable<typeof row> => row !== null);
  const heatRows = heat?.rows ?? [];
  const sortedHeat = [...heatRows].sort((a, b) => (b.heat_score ?? 0) - (a.heat_score ?? 0));
  const recentTrump = (trump?.tickers ?? [])
    .filter((row) => isTrumpMentionRecent(row.latest_published_at))
    .sort((a, b) => String(b.latest_published_at).localeCompare(String(a.latest_published_at)))
    .map((row) => ({
      ...row,
      mentions: row.mentions.filter((mention) => isTrumpMentionRecent(mention.published_at)),
    }));
  const redditRows = (reddit?.tickers ?? [])
    .filter(hasRedditBrief)
    .sort((a, b) => (b.mention_count ?? 0) - (a.mention_count ?? 0))
    .slice(0, 20);
  const asOf = latestIso([
    heat?.generated_at,
    reddit?.generated_at,
    trump?.generated_at,
    ...snapshotRows.map((row) => row.lastUpdated),
  ]);

  return envelope({
    market,
    evidence_status: {
      snapshot: snapshotRows.length ? "available" : "not_enough_current_evidence",
      heat: heat ? "available" : "not_enough_current_evidence",
      reddit: reddit ? "available" : "not_enough_current_evidence",
      near_52_week: near52.nearHighs.length || near52.nearLows.length ? "available" : "not_enough_current_evidence",
      trump: trump ? "available" : "not_enough_current_evidence",
    },
    evidence_message: "Empty Explore sections mean not enough current evidence for that source.",
    sections: {
      trending,
      hot: sortedHeat.slice(0, 20),
      momentum: [...heatRows]
        .filter((row) => typeof row.momentum_score === "number")
        .sort((a, b) => (b.momentum_score ?? 0) - (a.momentum_score ?? 0))
        .slice(0, 20),
      news_spikes: [...heatRows]
        .filter((row) => row.multiplier > 1.5 && row.mention_count_7d > 0)
        .sort((a, b) => b.multiplier - a.multiplier)
        .slice(0, 20),
      catalyst_watch: heatRows.filter((row) => (row.setup_type ?? "momentum_watch") === "catalyst_watch").slice(0, 20),
      dip_setup: heatRows.filter((row) => (row.setup_type ?? "momentum_watch") === "dip_setup").slice(0, 20),
      near_52_week_highs: near52.nearHighs,
      near_52_week_lows: near52.nearLows,
      reddit_buzz: redditRows,
      trump_mentions: recentTrump,
    },
    source_freshness: {
      heat_generated_at: heat?.generated_at ?? null,
      reddit_generated_at: reddit?.generated_at ?? null,
      trump_generated_at: trump?.generated_at ?? null,
    },
  }, asOf);
}

export async function getMarketAgentHistory(input: { market?: AgentMarket; days?: number }) {
  const market = input.market === "IN" ? "IN" : "US";
  const requestedDays = typeof input.days === "number" && Number.isFinite(input.days)
    ? Math.min(30, Math.max(1, Math.floor(input.days)))
    : 7;
  if (market !== "US") {
    return envelope({
      market,
      requested_days: requestedDays,
      returned_editions: 0,
      evidence_status: "not_enough_current_evidence",
      evidence_message: "Market Daily history is currently available for the US market only.",
      editions: [],
    }, null);
  }
  const editions = await listMarketDailyEditions(requestedDays);
  if (!editions.length) {
    return envelope({
      market,
      requested_days: requestedDays,
      returned_editions: 0,
      evidence_status: "not_enough_current_evidence",
      evidence_message: "not enough current evidence: no Market Daily editions are available.",
      editions: [],
    }, null);
  }
  const asOf = latestIso(editions.map((edition) => edition.updated_at || edition.published_at || edition.generated_at));
  return envelope({
    market,
    requested_days: requestedDays,
    returned_editions: editions.length,
    evidence_status: editions.length >= requestedDays ? "available" : "not_enough_current_evidence",
    evidence_message: editions.length >= requestedDays
      ? null
      : `not enough current evidence for ${requestedDays} published editions; only ${editions.length} are available.`,
    missing_editions: Math.max(0, requestedDays - editions.length),
    window_start: editions[editions.length - 1]?.edition_date ?? null,
    window_end: editions[0]?.edition_date ?? null,
    editions,
  }, asOf);
}

export async function getAgentScreens(input: { market?: AgentMarket }) {
  const market = input.market === "IN" ? "IN" : "US";
  const doc = await getThematicScreens(market);
  if (!doc) throw new AgentDataError(`The ${market} screen catalog is unavailable.`, "screens_unavailable", 503);
  return envelope({
    market,
    generated_at: doc.generated_at,
    universe_id: doc.universe_id,
    coverage: doc.coverage,
    screens: doc.screens,
  }, doc.generated_at);
}

/** Rows in the order the view had them (its attention order); stocks it doesn't have yet go last. */
function orderLike(rows: WatchlistRow[], viewRows: WatchlistRow[]): WatchlistRow[] {
  const rank = new Map(viewRows.map((row, index) => [row.instrument_id, index]));
  return [...rows].sort((a, b) => (rank.get(a.instrument_id) ?? Infinity) - (rank.get(b.instrument_id) ?? Infinity));
}

/** Each holding's value: shares times the live price, else the value entered, else the stored computed value. */
function liveHoldingValues(rows: WatchlistRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    if (row.position_type !== "holding" || !row.holding) continue;
    const entered = row.holding.market_value;
    const shares = row.holding.quantity;
    // As My stocks counts it (lib/portfolio-data.ts buildPortfolio): shares at the live price, else the value typed in.
    const value = typeof shares === "number" && shares > 0 && typeof row.price === "number" && row.price > 0
      ? shares * row.price
      : typeof entered === "number" && entered > 0
        ? entered
        : row.holding.computed_market_value;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) out.set(row.instrument_id, Math.round(value * 100) / 100);
  }
  return out;
}

/**
 * The person's stocks with live numbers, for Ask's portfolio card and MCP get_my_radar. Rows come from the live list
 * (lib/radar-rows.ts: only stocks still tracked, holding or watching and shares from users/{uid}, fresh prices), in the
 * view's order; the view adds the call, scores and briefing. Value, gain and weight are worked out from the live
 * shares and price when the stored row has none, so they never come back empty after a scheduled build.
 */
export async function getMyAgentRadar(uid: string, input: { limit?: number; offset?: number } = {}) {
  const view = await getWatchlistView(uid).catch(() => null);
  // The view is passed on, so the live rows don't read it a second time.
  const live = await loadRadarRowsForUser(uid, view).catch(() => null);
  const liveRows = live ? orderLike(live.rows, view?.rows ?? []) : null;
  const allRows: WatchlistRow[] = liveRows ?? view?.rows ?? [];
  if (!view && allRows.length === 0) {
    return envelope({
      data_status: "not_enough_current_evidence",
      evidence_message: "not enough current evidence to load this Watchlist view.",
      tracked_count: 0,
      rows: [],
      brief: null,
      pulse: null,
    }, null);
  }
  const tracked = new Set(allRows.map((row) => row.instrument_id));
  // The view's write-ups (brief, pulse, portfolio diagnosis, risks, changes) describe the book it was built from. When
  // that is not today's book (a stock added, removed or moved since), they are left out rather than describe old stocks.
  const viewPositions = new Map((view?.rows ?? []).map((row) => [row.instrument_id, row.position_type]));
  // Same stocks and kinds, and built from this version of the book (a shares or cost edit bumps the version too).
  const viewCurrent = Boolean(view) && viewPositions.size === allRows.length
    && allRows.every((row) => viewPositions.get(row.instrument_id) === row.position_type)
    && (!live || Number(view?.source_version ?? 0) >= live.version);
  const current = <T,>(value: T | undefined): T | null => (viewCurrent ? value ?? null : null);
  const holdingsCount = allRows.filter((row) => row.position_type === "holding").length;
  const values = liveHoldingValues(allRows);
  const totalValue = [...values.values()].reduce((sum, value) => sum + value, 0);
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit || 50)));
  const offset = Math.max(0, Math.floor(input.offset || 0));
  const asOf = latestIso([view?.updated_at, view?.built_at, view?.brief?.generated_at, view?.today_setup?.generated_at]);
  const selectedRows = allRows.slice(offset, offset + limit);
  const labelsById = await getInstrumentLabels(selectedRows.map((row) => row.instrument_id)).catch(() => new Map());
  // A stock removed since the view was built drops out of the view's own lists too.
  const onList = <T,>(items: T[] | undefined): T[] =>
    (items ?? []).filter((item) => {
      const id = (item as { instrument_id?: unknown })?.instrument_id;
      return typeof id !== "string" || tracked.has(id);
    });
  return envelope({
    data_status: "available",
    tracked_count: allRows.length,
    holdings_count: holdingsCount,
    watchlist_count: allRows.length - holdingsCount,
    /** "current" when the brief, pulse, portfolio, risks and changes below describe this book; otherwise they are null. */
    view_status: viewCurrent ? "current" : "rebuilding",
    pulse: current(view?.pulse),
    brief: viewCurrent && view?.brief ? {
      narrative: view.brief.narrative,
      signals: view.brief.signals,
      status: view.brief.status,
    } : null,
    today_setup: current(view?.today_setup),
    portfolio: current(view?.portfolio),
    attention_items: onList(view?.attention_items),
    suggestions: view?.suggestions ?? [],
    blind_spot_suggestions: view?.blind_spot_suggestions ?? [],
    momentum_lift_suggestions: view?.momentum_lift_suggestions ?? [],
    pillar_lift_suggestions: view?.pillar_lift_suggestions ?? null,
    risk_summary: current(view?.risk_summary),
    event_radar: onList(view?.event_radar),
    changes: current(view?.changes),
    returned_count: Math.min(limit, Math.max(0, allRows.length - offset)),
    next_offset: offset + limit < allRows.length ? offset + limit : null,
    rows: selectedRows.map((row) => {
      const label = canonicalAgentRadarLabel(row, labelsById.get(row.instrument_id));
      return {
        instrument_id: row.instrument_id,
        ticker: label.ticker,
        name: label.name,
        logo_url: row.logo_url ?? null,
        position_type: row.position_type,
        market: row.market,
        sector: row.sector_label,
        industry: row.industry_label,
        currency: row.currency,
        price: row.price,
        day_change_pct: row.day_change_pct,
        day_change_abs: row.day_change_abs,
        scores: row.scores,
        target_upside_pct: row.target_upside_pct ?? null,
        call: row.directive_v2 ?? row.ai_directive ?? null,
        summary: row.brief_tile?.micro ?? null,
        facts: row.facts ?? null,
        technicals: row.technicals ?? null,
        alerts: row.alerts ?? [],
        catalysts: row.catalysts ?? [],
        news_velocity: row.news_velocity ?? null,
        premium_signals: row.premium_signals ?? [],
        top_metric_summaries: row.top_metric_summaries ?? [],
        holding_status: row.holding_status ?? null,
        has_intel_pro: row.has_intel_pro,
        attention: row.attention_reason ? {
          kind: row.attention_kind ?? null,
          reason: row.attention_reason,
          suggested_action: row.suggested_action ?? null,
        } : null,
        // Only a holding has numbers: a stock moved to Watching never carries its old shares.
        holding: row.position_type === "holding" && row.holding ? {
          quantity: row.holding.quantity ?? null,
          market_value: values.get(row.instrument_id) ?? null,
          average_cost: row.holding.average_cost ?? null,
          // Weights are worked out across the live values; a holding with no value has no weight.
          // Never the stored weight: it was worked out on an older book.
          portfolio_weight_pct: totalValue > 0 && values.has(row.instrument_id)
            ? Math.round((values.get(row.instrument_id)! / totalValue) * 1000) / 10
            : null,
          unrealized_gain_pct: row.holding.average_cost && row.holding.average_cost > 0 && typeof row.price === "number" && row.price > 0
            ? Math.round((row.price / row.holding.average_cost - 1) * 1000) / 10
            : row.holding.unrealized_gain_pct ?? null,
        } : null,
        coverage_status: row.coverage_status,
      };
    }),
  }, asOf);
}

export async function getAgentRadarChanges(uid: string, input: { since?: string } = {}) {
  const view = await getRadarUserView(uid);
  if (!view) {
    return envelope({
      headline: "No current Watchlist changes",
      body: "Stocksbrew has no new Watchlist changes yet.",
      attention_items: [],
      upcoming_events: [],
      cursor: null,
    }, null);
  }
  const sinceTime = input.since ? Date.parse(input.since) : NaN;
  const attentionItems = Number.isFinite(sinceTime)
    ? view.attention_items.filter((item) => Date.parse(item.occurred_at) > sinceTime)
    : view.attention_items;
  return envelope({
    headline: view.narrative.headline,
    body: view.narrative.body,
    cursor: view.generated_at,
    attention_items: attentionItems,
    upcoming_events: view.upcoming_events,
    quiet_summary: view.quiet_summary,
    source_versions: view.source_versions,
    generated_copy_status: view.generated_copy_status,
  }, view.as_of || view.generated_at);
}

async function resolveAgentStock(ticker: string, market: AgentMarket = "US") {
  const normalized = ticker.trim().toUpperCase();
  const resolved = normalized ? await resolveInstrumentByTicker(normalized, market).catch(() => null) : null;
  if (!resolved) throw new AgentDataError(`${normalized || "That stock"} was not found in the ${market} catalog.`, "stock_not_found", 404);
  return resolved;
}

export async function addAgentStockToRadar(uid: string, input: { ticker: string; market?: AgentMarket; positionType?: string }) {
  const market = input.market === "IN" ? "IN" : "US";
  const stock = await resolveAgentStock(input.ticker, market);
  try {
    const positionType = input.positionType === "holding" ? "holding" : "watchlist";
    const result = await addRadarStock({
      uid,
      instrumentId: stock.instrument_id,
      positionType,
      // No `move`: MCP's position_type defaults to "watchlist", so an add may mark a watched stock as held but never
      // turns a holding into a watched stock (that would drop its shares and cost).
      requestedBy: "agent",
    });
    return envelope({
      instrument: stock,
      ...result,
      research_status: result.research_queued ? "queued" : "ready_or_already_queued",
      next_action: {
        tool: "get_stock_intelligence",
        message: result.research_queued
          ? "Research was queued. Check the stock again later."
          : `The stock is in ${result.position_type === "holding" ? "Holdings" : "Watchlist"}. Read its current research now.`,
      },
    }, new Date().toISOString());
  } catch (error) {
    if (error instanceof Error && error.message === "profile_not_ready") {
      throw new AgentDataError("The Stocksbrew profile is not ready.", "profile_not_ready", 409);
    }
    if (error instanceof FollowLimitError) throw new AgentDataError(error.reason, error.code, 409);
    throw error;
  }
}

export async function removeAgentStockFromRadar(uid: string, input: { ticker: string; market?: AgentMarket }) {
  const market = input.market === "IN" ? "IN" : "US";
  const stock = await resolveAgentStock(input.ticker, market);
  const result = await removeRadarStock({ uid, instrumentId: stock.instrument_id, requestedBy: "agent" });
  return envelope({ instrument: stock, ...result }, new Date().toISOString());
}

export async function getMyAgentAlerts(uid: string, input: { ticker?: string; market?: AgentMarket; kind?: string; limit?: number }) {
  if (input.kind && !isAlertKind(input.kind)) {
    throw new AgentDataError("Unsupported alert kind.", "invalid_alert_kind");
  }
  const stock = input.ticker
    ? await resolveAgentStock(input.ticker, input.market === "IN" ? "IN" : "US")
    : null;
  const alerts = await listStockAlerts(uid, {
    instrumentId: stock?.instrument_id,
    kind: input.kind,
    limit: input.limit,
  });
  return envelope({ count: alerts.length, alerts }, new Date().toISOString());
}

export async function createAgentAlert(uid: string, input: {
  ticker: string;
  market?: AgentMarket;
  kind?: string;
  condition?: string;
  targetPrice?: number;
  note?: string;
}) {
  const market = input.market === "IN" ? "IN" : "US";
  const stock = await resolveAgentStock(input.ticker, market);
  const user = await getUserDoc(uid).catch(() => null);
  if (!user?.email) throw new AgentDataError("Add an email address to the Stocksbrew profile before creating alerts.", "email_required", 409);
  const kind = input.kind || "price_threshold";
  if (!isAlertKind(kind)) throw new AgentDataError("Unsupported alert kind.", "invalid_alert_kind");
  if (kind !== "price_threshold") {
    throw new AgentDataError(
      "Agents can currently create price threshold alerts. Use get_radar_changes for earnings, RSI, call, anomaly, and news updates.",
      "invalid_alert_kind",
    );
  }
  try {
    const created = await createStockAlert({
      uid,
      email: user.email,
      instrumentId: stock.instrument_id,
      ticker: stock.ticker,
      kind,
      condition: input.condition === "above" ? "above" : input.condition === "below" ? "below" : undefined,
      targetPrice: input.targetPrice,
      note: input.note,
      plan: resolveIsSubscribed(user) ? "pro" : "free",
    });
    return envelope({ instrument: stock, ...created, delivery: "email" }, new Date().toISOString());
  } catch (error) {
    if (error instanceof StockAlertError) throw new AgentDataError(error.message, error.code, error.status);
    throw error;
  }
}

export async function deleteAgentAlert(uid: string, alertId: string) {
  try {
    return envelope(await deleteStockAlert(uid, alertId), new Date().toISOString());
  } catch (error) {
    if (error instanceof StockAlertError) throw new AgentDataError(error.message, error.code, error.status);
    throw error;
  }
}

export async function executeAgentTool(
  principal: AgentPrincipal,
  tool: AgentToolName,
  args: Record<string, unknown>,
) {
  requireAgentScope(principal, requiredScopeForTool(tool));
  const usage = await consumeAgentQuota(principal.uid, tool);
  let data: Record<string, unknown>;
  switch (tool) {
    case "search_stocks":
      data = await searchStocks({
        query: String(args.query || ""),
        market: args.market === "IN" ? "IN" : "US",
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });
      break;
    case "get_stock_intelligence":
      data = await getStockAgentIntelligence({
        ticker: String(args.ticker || ""),
        market: args.market === "IN" ? "IN" : "US",
        uid: principal.uid,
      });
      break;
    case "get_stock_detail":
      data = await getStockAgentDetail({
        ticker: String(args.ticker || ""),
        market: args.market === "IN" ? "IN" : "US",
        uid: principal.uid,
      });
      break;
    case "compare_stocks":
      data = await compareAgentStocks({
        tickers: Array.isArray(args.tickers) ? args.tickers.map(String) : [],
      });
      break;
    case "get_market_brief":
      data = await getMarketAgentBrief({ market: args.market === "IN" ? "IN" : "US" });
      break;
    case "get_market_history":
      data = await getMarketAgentHistory({
        market: args.market === "IN" ? "IN" : "US",
        days: typeof args.days === "number" ? args.days : undefined,
      });
      break;
    case "get_explore":
      data = await getAgentExplore({ market: args.market === "IN" ? "IN" : "US" });
      break;
    case "get_screens":
      data = await getAgentScreens({ market: args.market === "IN" ? "IN" : "US" });
      break;
    case "get_my_radar":
      data = await getMyAgentRadar(principal.uid, {
        limit: typeof args.limit === "number" ? args.limit : undefined,
        offset: typeof args.offset === "number" ? args.offset : undefined,
      });
      break;
    case "get_radar_changes":
      data = await getAgentRadarChanges(principal.uid, { since: typeof args.since === "string" ? args.since : undefined });
      break;
    case "add_to_radar":
      data = await addAgentStockToRadar(principal.uid, {
        ticker: String(args.ticker || ""),
        market: args.market === "IN" ? "IN" : "US",
        positionType: String(args.position_type || "watchlist"),
      });
      break;
    case "remove_from_radar":
      data = await removeAgentStockFromRadar(principal.uid, {
        ticker: String(args.ticker || ""),
        market: args.market === "IN" ? "IN" : "US",
      });
      break;
    case "get_my_alerts":
      data = await getMyAgentAlerts(principal.uid, {
        ticker: typeof args.ticker === "string" ? args.ticker : undefined,
        market: args.market === "IN" ? "IN" : "US",
        kind: typeof args.kind === "string" ? args.kind : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });
      break;
    case "create_alert":
      data = await createAgentAlert(principal.uid, {
        ticker: String(args.ticker || ""),
        market: args.market === "IN" ? "IN" : "US",
        kind: typeof args.kind === "string" ? args.kind : undefined,
        condition: typeof args.condition === "string" ? args.condition : undefined,
        targetPrice: typeof args.target_price === "number" ? args.target_price : undefined,
        note: typeof args.note === "string" ? args.note : undefined,
      });
      break;
    case "delete_alert":
      data = await deleteAgentAlert(principal.uid, String(args.alert_id || ""));
      break;
    case "what_you_own":
      data = await getAgentWhatYouOwn(principal.uid, { limit: typeof args.limit === "number" ? args.limit : undefined });
      break;
    case "dividend_plan":
      data = await getAgentDividendPlan(principal.uid, { payments: args.payments === true });
      break;
    case "stress_test":
      data = await getAgentStressTest(principal.uid, { holdings: args.holdings === true });
      break;
    case "copy_test":
      data = await getAgentCopyTest({
        slug: typeof args.slug === "string" ? args.slug : undefined,
        query: typeof args.query === "string" ? args.query : undefined,
        kind: args.kind === "fund" || args.kind === "congress" ? args.kind : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });
      break;
    case "watch_in_plain_words":
      data = await readAgentWatchRequest(principal.uid, { text: String(args.text || "") });
      break;
    case "get_filing_changes":
      data = await getAgentFilingChanges({ ticker: String(args.ticker || "") });
      break;
    case "list_baskets":
      data = await listAgentBaskets(principal.uid);
      break;
    case "get_basket":
      data = await getAgentBasket(principal.uid, { basket_id: String(args.basket_id || "") });
      break;
    default:
      throw new AgentDataError("Unknown agent tool.", "unknown_tool", 404);
  }
  return { ...data, usage };
}
