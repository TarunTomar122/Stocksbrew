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
import { getOnDemandNewsStatus } from "@/lib/on-demand-queue";
import { addRadarStock, removeRadarStock } from "@/lib/radar-mutations";
import {
  createStockAlert,
  deleteStockAlert,
  isAlertKind,
  listStockAlerts,
  StockAlertError,
} from "@/lib/stock-alerts";
import {
  getInstrumentViewDoc,
  getStockFacts,
  getStockIntelPro,
  getStockIntelligenceDoc,
  getStockSummary,
} from "@/lib/stock";
import { getRadarUserView, getWatchlistView } from "@/lib/watchlist-view";
import { getUserDoc } from "@/lib/watchlist";

export type AgentMarket = "US" | "IN";
export type AgentToolName =
  | "search_stocks"
  | "get_stock_intelligence"
  | "compare_stocks"
  | "get_market_brief"
  | "get_my_radar"
  | "get_radar_changes"
  | "add_to_radar"
  | "remove_from_radar"
  | "get_my_alerts"
  | "create_alert"
  | "delete_alert";

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
  if (tool === "add_to_radar" || tool === "remove_from_radar") return "radar:write";
  if (tool === "get_my_alerts") return "alerts:read";
  if (tool === "create_alert" || tool === "delete_alert") return "alerts:write";
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
              message: "Baseline data is available, but the AI brief is missing. Ask the user before adding this stock to Radar. Adding it queues research.",
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

export async function getMyAgentRadar(uid: string, input: { limit?: number; offset?: number } = {}) {
  const view = await getWatchlistView(uid);
  if (!view) return envelope({ tracked_count: 0, rows: [], brief: null, pulse: null }, null);
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit || 50)));
  const offset = Math.max(0, Math.floor(input.offset || 0));
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
    returned_count: Math.min(limit, Math.max(0, (view.rows?.length || 0) - offset)),
    next_offset: offset + limit < (view.rows?.length || 0) ? offset + limit : null,
    rows: (view.rows ?? []).slice(offset, offset + limit).map((row) => ({
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

export async function getAgentRadarChanges(uid: string, input: { since?: string } = {}) {
  const view = await getRadarUserView(uid);
  if (!view) {
    return envelope({
      headline: "No current Radar changes",
      body: "Stocksbrew has no fresh, quality-passed changes for this Radar yet.",
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
    const result = await addRadarStock({
      uid,
      instrumentId: stock.instrument_id,
      positionType: input.positionType === "holding" ? "holding" : "watchlist",
      requestedBy: "agent",
    });
    return envelope({
      instrument: stock,
      position_type: input.positionType === "holding" ? "holding" : "watchlist",
      ...result,
      research_status: result.research_queued ? "queued" : "ready_or_already_queued",
      next_action: {
        tool: "get_stock_intelligence",
        message: result.research_queued
          ? "Research was queued. Check the stock again later."
          : "The stock is on Radar. Read its current intelligence now.",
      },
    }, new Date().toISOString());
  } catch (error) {
    if (error instanceof Error && error.message === "profile_not_ready") {
      throw new AgentDataError("The Stocksbrew profile is not ready.", "profile_not_ready", 409);
    }
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
    case "compare_stocks":
      data = await compareAgentStocks({
        tickers: Array.isArray(args.tickers) ? args.tickers.map(String) : [],
      });
      break;
    case "get_market_brief":
      data = await getMarketAgentBrief({ market: args.market === "IN" ? "IN" : "US" });
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
    default:
      throw new AgentDataError("Unknown agent tool.", "unknown_tool", 404);
  }
  return { ...data, usage };
}
