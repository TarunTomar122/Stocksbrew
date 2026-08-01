import {
  AGENT_ACCESS_VERSION,
  AGENT_DATA_NOTICE,
  type AgentScope,
} from "@/lib/agent-access-config";
import { requireAgentScope, type AgentPrincipal } from "@/lib/agent-auth";
import { consumeAgentQuota } from "@/lib/agent-quota";
import { compareStocks } from "@/lib/compare-stocks";
import { MARKET_FEED_FRESHNESS, freshnessInfo } from "@/lib/freshness";
import { getHomeView } from "@/lib/home-view";
import { resolveInstrumentByTicker } from "@/lib/instrument-resolver";
import { filterSearchEntries, getSearchIndexForApi } from "@/lib/search";
import {
  getInstrumentViewDoc,
  getStockFacts,
  getStockIntelPro,
  getStockIntelligenceDoc,
  getStockSummary,
} from "@/lib/stock";
import { getRadarUserView, getWatchlistView } from "@/lib/watchlist-view";

export type AgentMarket = "US" | "IN";
export type AgentToolName =
  | "search_stocks"
  | "get_stock_intelligence"
  | "compare_stocks"
  | "get_market_brief"
  | "get_my_radar"
  | "get_radar_changes";

export class AgentDataError extends Error {
  constructor(
    message: string,
    public readonly code = "data_error",
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AgentDataError";
  }
}

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
  if (tool === "get_market_brief") return "market:read";
  if (tool === "get_my_radar" || tool === "get_radar_changes") return "radar:read";
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
}) {
  const market = input.market === "IN" ? "IN" : "US";
  const ticker = input.ticker.trim().toUpperCase();
  if (!ticker || ticker.length > 20) throw new AgentDataError("A valid ticker is required.", "invalid_ticker");
  const resolved = await resolveInstrumentByTicker(ticker, market).catch(() => null);
  if (!resolved) throw new AgentDataError(`${ticker} was not found in the ${market} catalog.`, "stock_not_found", 404);

  const [summary, view, intelligence, intelPro, facts] = await Promise.all([
    getStockSummary(resolved.ticker, market).catch(() => null),
    getInstrumentViewDoc(resolved.instrument_id, market).catch(() => null),
    getStockIntelligenceDoc(resolved.instrument_id, market).catch(() => null),
    getStockIntelPro(resolved.instrument_id, market).catch(() => null),
    getStockFacts(resolved.instrument_id).catch(() => null),
  ]);
  if (!summary && !intelligence && !intelPro) {
    throw new AgentDataError(`Stocksbrew does not have enough current data for ${resolved.ticker}.`, "coverage_pending", 404);
  }

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
      has_detailed_call: Boolean(intelligence?.directive_v2),
      has_pro_scores: Boolean(intelPro),
    },
  }, asOf);
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

export async function getMyAgentRadar(uid: string) {
  const view = await getWatchlistView(uid);
  if (!view) return envelope({ tracked_count: 0, rows: [], brief: null, pulse: null }, null);
  const asOf = latestIso([view.updated_at, view.built_at, view.brief?.generated_at, view.today_setup?.generated_at]);
  return envelope({
    tracked_count: view.tracked_count,
    holdings_count: view.holdings_count ?? null,
    watchlist_count: view.watchlist_count ?? null,
    pulse: view.pulse ?? null,
    brief: view.brief ? {
      narrative: view.brief.narrative,
      signals: view.brief.signals,
      status: view.brief.status,
    } : null,
    today_setup: view.today_setup ?? null,
    rows: (view.rows ?? []).slice(0, 50).map((row) => ({
      instrument_id: row.instrument_id,
      ticker: row.ticker,
      name: row.instrument_name ?? row.ticker,
      position_type: row.position_type,
      market: row.market,
      sector: row.sector_label,
      price: row.price,
      day_change_pct: row.day_change_pct,
      scores: row.scores,
      target_upside_pct: row.target_upside_pct ?? null,
      call: row.directive_v2 ?? row.ai_directive ?? null,
      summary: row.brief_tile?.micro ?? null,
      attention: row.attention_reason ? {
        kind: row.attention_kind ?? null,
        reason: row.attention_reason,
        suggested_action: row.suggested_action ?? null,
      } : null,
      holding: row.holding ? {
        quantity: row.holding.quantity ?? null,
        market_value: row.holding.market_value ?? row.holding.computed_market_value ?? null,
        average_cost: row.holding.average_cost ?? null,
        portfolio_weight_pct: row.holding.portfolio_weight_pct ?? null,
        unrealized_gain_pct: row.holding.unrealized_gain_pct ?? null,
      } : null,
      coverage_status: row.coverage_status,
    })),
  }, asOf);
}

export async function getAgentRadarChanges(uid: string) {
  const view = await getRadarUserView(uid);
  if (!view) {
    return envelope({
      headline: "No current Radar changes",
      body: "Stocksbrew has no fresh, quality-passed changes for this Radar yet.",
      attention_items: [],
      upcoming_events: [],
    }, null);
  }
  return envelope({
    headline: view.narrative.headline,
    body: view.narrative.body,
    attention_items: view.attention_items,
    upcoming_events: view.upcoming_events,
    quiet_summary: view.quiet_summary,
    source_versions: view.source_versions,
    generated_copy_status: view.generated_copy_status,
  }, view.as_of || view.generated_at);
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
    case "get_my_radar":
      data = await getMyAgentRadar(principal.uid);
      break;
    case "get_radar_changes":
      data = await getAgentRadarChanges(principal.uid);
      break;
    default:
      throw new AgentDataError("Unknown agent tool.", "unknown_tool", 404);
  }
  return { ...data, usage };
}
