import { tavily } from "@tavily/core";
import { tool, type ToolSet } from "ai";
import { z } from "zod";

import {
  AgentDataError,
  compareAgentStocks,
  getAgentRadarChanges,
  getAgentScreens,
  getMarketAgentBrief,
  getMyAgentRadar,
  getStockAgentIntelligence,
  searchStocks,
} from "@/lib/agent-intelligence";
import { draftBasket, finishBasket, type BasketFacts, type ProposedLine } from "@/lib/ask-basket";
import {
  cardForModel,
  cleanTickerList,
  errorCard,
  fin,
  isIsoDay,
  num,
  parsePeriod,
  pct,
  returnStats,
  round,
  roundOrNull,
  slicePeriod,
  thin,
  type ActionCard,
  type AskCard,
  type BacktestCard,
  type BacktestStats,
  type ChangesCard,
  type CompareCard,
  type CongressCard,
  type EarningsCard,
  type FundCard,
  type InsidersCard,
  type InvestorsCard,
  type MarketBriefCard,
  type MarketsCard,
  type MatchesCard,
  type MoverRow,
  type NewsCard,
  type Period,
  type PortfolioCard,
  type QuoteCard,
  type ReturnsCard,
  type ScreensCard,
  type SignInCard,
  type ThemesCard,
  type WebCard,
} from "@/lib/ask-cards";
import { loadDailySeries, loadTickerNews, loadWire } from "@/lib/ask-data";
import { BacktestError, MissingHistoryError, SpecError, runWeightsBacktest } from "@/lib/backtest/engine";
import type { CurveStats } from "@/lib/backtest/types";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getEarnings, getNextEarningsCalendarEventCached } from "@/lib/earnings";
import {
  getFollowActivity,
  getFollowProfile,
  getFollowSources,
  getInsiderBuys,
  getInsiderSummary,
  getInsiderTrades,
  getInsiderTradesForSymbol,
  type CongressProfile,
  type FollowSource,
  type FundProfile,
  type InsiderTrade,
} from "@/lib/follow";
import { resolveInstrumentByTicker } from "@/lib/instrument-resolver";
import { getMarketsData } from "@/lib/markets";
import { CLASS_LABEL, assetHref, changeTone, dayChangeLabel, formatChange, formatLevel } from "@/lib/markets-shared";
import { getPowerTradesCached } from "@/lib/power-trades";
import { getLiveInvestmentThemes } from "@/lib/research-themes";
import { getStockIntelPro, getStockSummary } from "@/lib/stock";
import { redactLevels } from "@/lib/entitlements";
import type { Viewer } from "@/lib/entitlements-server";
import { buildMineTools } from "@/lib/ask-tools-mine";
import { loadExamplePortfolio } from "@/lib/portfolio-data";

/**
 * The tools the Ask copilot can call. Every tool returns a card (see
 * `lib/ask-cards.ts`): JSON with a source and an as-of time that the model
 * reads and the page draws. Tools read; they never write. The two "propose"
 * tools return a card with a Confirm button, and the write happens only when
 * the person presses it (`/api/ask/action`).
 */

export type AskToolContext = {
  /** Null when signed out. Personal tools answer with a sign-in card. */
  uid: string | null;
  /** Whether the person is on Pro. */
  isPro: boolean;
  /**
   * May this viewer see level detail (what to watch, risks) for a ticker?
   * `canSeeLevels` from lib/entitlements-server.ts. Defaults to no.
   */
  levels?: (ticker: string) => boolean;
  /** Earliest backtest start the plan allows (ISO day), or null for the full history. */
  earliestBacktestStart?: string | null;
  now?: Date;
  /** Who is asking, resolved by the route (getViewer). Plan gates on the person's own tools read it. */
  viewer?: Viewer | null;
  /**
   * The question came from the example portfolio (an `ex.` context, lib/ask-context.ts). The portfolio tools then
   * answer about the example when the person has no portfolio of their own, and the card says it is the example.
   */
  example?: boolean;
};

const SIGN_IN: Record<string, string> = {
  portfolio: "Sign in to ask about your own portfolio. Questions about any stock or the market work without an account.",
  action: "Sign in to save names to a watchlist or set alerts.",
};

function signIn(kind: keyof typeof SIGN_IN): SignInCard {
  return { card: "sign_in", message: SIGN_IN[kind]! };
}

/** Run a tool body; turn a known data error into a card the model can read and explain. */
async function safe(name: string, run: () => Promise<AskCard>): Promise<AskCard> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AgentDataError) return errorCard(error.message);
    if (error instanceof SpecError || error instanceof BacktestError) return errorCard(`The backtest could not run: ${error.message}.`);
    console.error("ask_tool_failed", name, error);
    return errorCard("That lookup failed on our side. Nothing was returned, so do not guess the answer.");
  }
}

const modelView = ({ output }: { output: unknown }) => ({
  type: "json" as const,
  value: cardForModel(output as AskCard) as never,
});

function text(value: unknown, max = 400): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trimEnd()}…` : cleaned;
}

function pick(record: unknown, ...keys: string[]): string | null {
  if (!record || typeof record !== "object") return null;
  for (const key of keys) {
    const value = text((record as Record<string, unknown>)[key]);
    if (value) return value;
  }
  return null;
}

function texts(list: unknown, max: number, ...keys: string[]): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    const value = typeof item === "string" ? text(item, 240) : pick(item, ...keys);
    if (value && !out.includes(value)) out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/* ── stocks ─────────────────────────────────────────────────────────────── */

async function quoteCard(ticker: string, uid: string | null, levels: boolean): Promise<QuoteCard> {
  const [data, earnings] = await Promise.all([
    getStockAgentIntelligence({ ticker, uid: uid ?? undefined }),
    getNextEarningsCalendarEventCached("US", ticker).catch(() => null),
  ]);
  const intel = data.stocksbrew_intelligence;
  // GATE: the call's one-line headline, the score and the analyst target go to every viewer. The reasoning (thesis,
  // what changed, key points, what to watch, risks) is the full read, which comes with covering the stock
  // (lib/entitlements.ts: stock_zones). An uncovered viewer gets null, so neither the model nor the card holds it.
  return {
    card: "quote",
    ticker: data.instrument.ticker,
    name: data.instrument.name ?? null,
    sector: data.instrument.sector ?? null,
    industry: data.instrument.industry ?? null,
    currency: data.instrument.currency,
    price: roundOrNull(data.market_data.price),
    day_change_pct: roundOrNull(data.market_data.day_change_pct),
    market_cap: num(data.fundamentals.market_cap),
    pe_ttm: roundOrNull(data.fundamentals.pe_ttm, 1),
    dividend_yield: roundOrNull(data.fundamentals.dividend_yield),
    week_52_high: roundOrNull(data.fundamentals.week_52_high),
    week_52_low: roundOrNull(data.fundamentals.week_52_low),
    revenue_growth_yoy_pct: roundOrNull(data.fundamentals.revenue_growth_yoy_pct, 1),
    analyst_target: roundOrNull(intel.target_price),
    target_upside_pct: roundOrNull(intel.target_upside_pct, 1),
    rsi_14: roundOrNull(data.technicals.rsi_14, 0),
    score: roundOrNull(data.scores?.overall, 0),
    verdict: data.scores?.verdict ?? null,
    // A headline can quote the call's add or trim level; those come with covering the stock.
    headline: levels ? text(intel.headline, 200) : text(redactLevels(typeof intel.headline === "string" ? intel.headline : null), 200),
    thesis: levels ? text(intel.thesis, 600) : null,
    what_changed: levels ? text(intel.what_changed, 400) : null,
    // "What to watch" and the risks are what the stock page shows as "what would change the call".
    // They come with covering a stock, so an uncovered viewer gets null and the model never holds them.
    what_to_watch: levels ? text(intel.what_to_watch, 400) : null,
    key_points: levels ? texts(intel.key_points, 4, "text", "point", "title") : [],
    risks: levels ? texts(intel.risks, 3, "risk", "title", "label", "detail") : [],
    full_read: levels,
    next_earnings: earnings ? { date: earnings.event_date, time: earnings.time ?? null } : null,
    research_status: data.coverage.status,
    source: "stocksbrew market data and research",
    as_of: data.as_of,
    source_url: `/stock/${encodeURIComponent(data.instrument.ticker)}`,
  };
}

async function returnsCard(input: { ticker: string; period?: string; start?: string; end?: string }): Promise<AskCard> {
  const ticker = input.ticker.trim().toUpperCase();
  let period: Period | null;
  if (input.start) {
    if (!isIsoDay(input.start) || (input.end && !isIsoDay(input.end))) return errorCard("Dates must look like 2024-01-31.");
    if (input.end && input.end <= input.start) return errorCard("The end date must be after the start date.");
    period = { kind: "range", start: input.start, end: input.end ?? null, label: `${input.start} to ${input.end ?? "the latest close"}` };
  } else {
    period = parsePeriod(input.period ?? "1y");
    if (!period) return errorCard("Use a period like 5d, 3m, 1y, 5y, ytd or max, or give a start date.");
  }
  const history = await loadDailySeries(ticker);
  if (!history) return errorCard(`We hold no daily price history for ${ticker}.`);
  const slice = slicePeriod(history.series, period);
  const stats = returnStats(slice);
  if (!stats) return errorCard(`There are not enough closes for ${ticker} in that period.`);

  let benchmark: ReturnsCard["benchmark"] = null;
  if (ticker !== "SPY") {
    const spy = await loadDailySeries("SPY");
    const spyStats = spy
      ? returnStats(slicePeriod(spy.series, { kind: "range", start: stats.from.date, end: stats.to.date, label: "" }))
      : null;
    if (spyStats) benchmark = { ticker: "SPY", return_pct: spyStats.return_pct };
  }
  return {
    card: "returns",
    ticker,
    period: period.label,
    from: stats.from,
    to: stats.to,
    return_pct: stats.return_pct,
    annualized_pct: stats.annualized_pct,
    high: stats.high,
    low: stats.low,
    max_drawdown_pct: stats.max_drawdown_pct,
    benchmark,
    adjusted: history.adjusted,
    points: thin(slice, 90),
    source: history.adjusted ? `${history.source}, adjusted for splits and dividends` : history.source,
    as_of: stats.to.date,
  };
}

/** Trailing returns for one ticker from adjusted daily closes. A window we cannot measure is null, never zero. */
async function trailingReturns(ticker: string): Promise<{ r_1m: number | null; r_3m: number | null; r_6m: number | null; r_1y: number | null; source: string | null }> {
  const history = await loadDailySeries(ticker);
  const over = (days: number) => {
    if (!history) return null;
    const first = history.series[0]!.date;
    const last = history.series[history.series.length - 1]!.date;
    // The series must reach back far enough, or the "1 year" would silently be a shorter stretch.
    if ((Date.parse(last) - Date.parse(first)) / 86400000 < days - 5) return null;
    const stats = returnStats(slicePeriod(history.series, { kind: "days", days, label: "" }));
    return stats ? round(stats.return_pct, 1) : null;
  };
  return { r_1m: over(30), r_3m: over(91), r_6m: over(183), r_1y: over(365), source: history?.source ?? null };
}

async function compareCard(tickers: string[]): Promise<CompareCard> {
  const data = await compareAgentStocks({ tickers });
  const returns = new Map<string, Awaited<ReturnType<typeof trailingReturns>>>();
  await Promise.all(data.stocks.map(async (stock) => returns.set(stock.ticker, await trailingReturns(stock.ticker))));
  const historySource = [...returns.values()].find((row) => row.source)?.source ?? null;
  return {
    card: "compare",
    rows: data.stocks.map((stock) => ({
      ticker: stock.ticker,
      name: stock.name,
      sector: stock.sector || null,
      price: roundOrNull(stock.price),
      day_change_pct: roundOrNull(stock.day_change_pct),
      market_cap: num(stock.market_cap),
      pe_ttm: roundOrNull(stock.pe_ttm, 1),
      dividend_yield: roundOrNull(stock.dividend_yield),
      analyst_target: roundOrNull(stock.target_price),
      score: roundOrNull(stock.scores?.overall, 0),
      verdict: stock.verdict ?? null,
      rsi_14: roundOrNull(stock.rsi_14, 0),
      r_1m: returns.get(stock.ticker)?.r_1m ?? null,
      r_3m: returns.get(stock.ticker)?.r_3m ?? null,
      r_6m: returns.get(stock.ticker)?.r_6m ?? null,
      r_1y: returns.get(stock.ticker)?.r_1y ?? null,
    })),
    missing: data.missing_tickers,
    source: historySource ? `stocksbrew market data and research. Returns from ${historySource}, adjusted.` : "stocksbrew market data and research",
    as_of: data.as_of ?? new Date().toISOString(),
  };
}

/* ── the person's own names ─────────────────────────────────────────────── */

function callText(call: unknown): string | null {
  if (typeof call === "string") return text(call, 80);
  const stance = pick(call, "stance", "action", "label", "holding_status");
  const title = pick(call, "title", "text");
  if (stance && title) return text(`${stance}: ${title}`, 140);
  return stance ?? title;
}

/** The example portfolio the Portfolio page shows visitors: made-up shares, real prices. */
async function examplePortfolioCard(): Promise<AskCard> {
  const example = await loadExamplePortfolio();
  if (!example) return errorCard("The example portfolio is not available right now.");
  const { portfolio } = example;
  const row = (position: (typeof portfolio.positions)[number], kind: "holding" | "watching") => ({
    ticker: position.ticker,
    name: text(position.name, 60),
    position: kind,
    price: roundOrNull(position.price),
    day_change_pct: roundOrNull(position.dayPct),
    weight_pct: roundOrNull(position.weight, 1),
    gain_pct: roundOrNull(position.gainPct, 1),
    shares: num(position.shares),
    avg_cost: roundOrNull(position.avgCost),
    value: roundOrNull(position.value, 0),
    call: null,
    note: null,
  });
  const card: PortfolioCard = {
    card: "portfolio",
    example: true,
    tracked: portfolio.positions.length + portfolio.watching.length,
    holdings: portfolio.positions.length,
    watching: portfolio.watching.length,
    rows: [...portfolio.positions.map((position) => row(position, "holding")), ...portfolio.watching.map((position) => row(position, "watching"))],
    needs_attention: [],
    source: "The example portfolio: made-up shares, priced with real quotes. Not the person's own.",
    as_of: example.pricesAsOf,
    source_url: "/portfolio",
  };
  return card;
}

async function portfolioCard(uid: string, example: boolean): Promise<AskCard> {
  const data = await getMyAgentRadar(uid, { limit: 40 });
  const rows = (data.rows ?? []) as Array<Record<string, unknown>>;
  // Nothing held and the question came from the example: answer about the example, and the card says so.
  if (example && !rows.some((row) => row.position_type === "holding")) return examplePortfolioCard();
  return {
    card: "portfolio",
    example: false,
    tracked: Number(data.tracked_count) || 0,
    holdings: num((data as { holdings_count?: unknown }).holdings_count),
    watching: num((data as { watchlist_count?: unknown }).watchlist_count),
    rows: rows.map((row) => {
      const holding = (row.holding ?? null) as Record<string, unknown> | null;
      return {
        ticker: String(row.ticker ?? ""),
        name: text(row.name, 60),
        position: row.position_type === "holding" ? ("holding" as const) : ("watching" as const),
        price: roundOrNull(row.price),
        day_change_pct: roundOrNull(row.day_change_pct),
        weight_pct: roundOrNull(holding?.portfolio_weight_pct, 1),
        gain_pct: roundOrNull(holding?.unrealized_gain_pct, 1),
        shares: num(holding?.quantity),
        avg_cost: roundOrNull(holding?.average_cost),
        value: roundOrNull(holding?.market_value, 0),
        // The call is the same for every reader, paid or not.
        call: callText(row.call),
        note: text(row.summary, 160),
      };
    }),
    needs_attention: ((data as { attention_items?: unknown[] }).attention_items ?? []).slice(0, 5).flatMap((item) => {
      const line = pick(item, "reason", "title", "headline", "body", "text");
      return line ? [{ ticker: pick(item, "ticker"), text: line }] : [];
    }),
    source: "Your stocksbrew watchlist. Holdings are the ones you entered, not a broker feed.",
    as_of: data.as_of,
    source_url: "/watchlist",
  };
}

async function changesCard(uid: string, since?: string): Promise<ChangesCard> {
  const data = await getAgentRadarChanges(uid, { since });
  const items = ((data as { attention_items?: unknown[] }).attention_items ?? []) as unknown[];
  const upcoming = ((data as { upcoming_events?: unknown[] }).upcoming_events ?? []) as unknown[];
  return {
    card: "changes",
    headline: String(data.headline ?? ""),
    body: String(data.body ?? ""),
    items: items.slice(0, 8).flatMap((item) => {
      const title = pick(item, "title", "headline", "reason", "summary");
      return title ? [{ ticker: pick(item, "ticker"), title, detail: pick(item, "body", "detail", "why_it_matters"), at: pick(item, "occurred_at", "at") }] : [];
    }),
    upcoming: upcoming.slice(0, 6).flatMap((item) => {
      const title = pick(item, "description", "event_type", "title");
      return title ? [{ ticker: pick(item, "ticker"), title, date: pick(item, "expected_at", "date") }] : [];
    }),
    source: "Your stocksbrew watchlist",
    as_of: data.as_of,
    source_url: "/briefing",
  };
}

/* ── the market ─────────────────────────────────────────────────────────── */

async function marketBriefCard(): Promise<MarketBriefCard> {
  const [brief, anomalies] = await Promise.all([getMarketAgentBrief({ market: "US" }), getDailyAnomalies("US").catch(() => null)]);
  const reasons = new Map<string, string>();
  for (const row of anomalies?.anomalies ?? []) {
    const reason = row.narrative_status === "unverified" ? null : text(row.move_explanation?.headline ?? row.headline, 180);
    // The feed writes "--" when it has no explanation. That is not a reason.
    if (reason && /[a-z]{3}/i.test(reason)) reasons.set(row.ticker.toUpperCase(), reason);
  }
  const mover = (row: { ticker: string; name: string; price: number | null; day_change_pct: number | null }): MoverRow => ({
    ticker: row.ticker,
    name: row.name ?? null,
    price: roundOrNull(row.price),
    day_change_pct: roundOrNull(row.day_change_pct),
    reason: reasons.get(row.ticker.toUpperCase()) ?? null,
  });
  const sentiment = brief.sentiment as unknown;
  return {
    card: "market_brief",
    // The feed's fallback title is a label, not a headline. Without a real one the body leads.
    title: /^market intelligence briefing$/i.test((brief.brief?.title ?? "").trim()) ? null : text(brief.brief?.title, 160),
    body: text(brief.brief?.body, 900),
    sentiment: typeof sentiment === "string" ? sentiment : pick(sentiment, "label", "summary", "status"),
    macro: brief.macro.slice(0, 8).map((card) => ({
      label: card.label,
      value: fin(card.value) ? card.value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(card.value ?? ""),
      day_change_pct: roundOrNull(card.day_change_pct),
    })),
    gainers: brief.movers.gainers.map(mover),
    losers: brief.movers.losers.map(mover),
    source: "stocksbrew market brief",
    as_of: brief.as_of,
    source_url: "/briefing",
  };
}

async function screensCard(): Promise<ScreensCard> {
  const data = await getAgentScreens({ market: "US" });
  return {
    card: "screens",
    screens: data.screens.slice(0, 10).map((screen) => ({
      id: screen.id,
      title: screen.title,
      tagline: screen.tagline,
      match_count: screen.match_count,
      top: screen.matches.slice(0, 5).map((row) => ({
        ticker: row.ticker,
        name: row.name ?? null,
        price: roundOrNull(row.price),
        day_change_pct: roundOrNull(row.day_change_pct),
        score: roundOrNull(row.overall_score, 0),
      })),
    })),
    source: "stocksbrew screens, rules run over our US coverage",
    as_of: data.generated_at,
    source_url: "/screener",
  };
}

async function themesCard(slug?: string): Promise<AskCard> {
  const themes = await getLiveInvestmentThemes();
  const wanted = slug ? themes.filter((theme) => theme.slug === slug.trim().toLowerCase()) : themes;
  if (wanted.length === 0) return errorCard(`There is no theme called "${slug}". Call get_themes without a slug to list them.`);
  const card: ThemesCard = {
    card: "themes",
    themes: wanted.map((theme) => ({
      slug: theme.slug,
      name: theme.name,
      description: theme.cardDescription,
      names: theme.candidates.slice(0, slug ? 12 : 5).map((candidate) => ({
        ticker: candidate.ticker,
        company: candidate.company,
        role: candidate.role,
      })),
    })),
    source: "stocksbrew research themes",
    as_of: null,
    source_url: slug ? `/themes/${wanted[0]!.slug}` : "/themes",
  };
  return card;
}

async function newsCard(ticker: string | null): Promise<NewsCard> {
  const articles = ticker ? await loadTickerNews(ticker, 8) : await loadWire(12);
  return {
    card: "news",
    ticker,
    articles,
    source: "Publisher headlines and excerpts, as written by each source",
    as_of: articles[0]?.published_at ?? null,
    source_url: "/news",
  };
}

const TAVILY_TIMEOUT_MS = 12_000;

async function webCard(query: string): Promise<AskCard> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return errorCard("Web search is not configured here. Answer from the other tools, or say the answer needs a web search.");
  const client = tavily({ apiKey });
  const search = client
    .search(query, { searchDepth: "basic", includeImages: false, includeAnswer: false, maxResults: 5 })
    .then((response) => response.results);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TAVILY_TIMEOUT_MS));
  const results = await Promise.race([search, timeout]);
  if (!results) return errorCard("The web search timed out.");
  const card: WebCard = {
    card: "web",
    query,
    results: results
      .filter((row) => row.title && /^https?:\/\//i.test(row.url ?? ""))
      .map((row) => ({ title: row.title, url: row.url, snippet: (row.content || "").replace(/\s+/g, " ").trim().slice(0, 320) })),
    source: "Web search",
    as_of: new Date().toISOString(),
  };
  return card;
}

/** "2026-11-13" to "Friday". Empty when it is not a day. */
function weekdayOf(day: string): string {
  const at = Date.parse(`${day.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(at) ? new Date(at).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) : "";
}

async function earningsCard(input: { ticker?: string; days?: number; mine?: boolean }, now: Date, tracked: string[] | null): Promise<AskCard> {
  if (input.mine && !input.ticker) {
    if (!tracked) return signIn("portfolio");
    if (tracked.length === 0) return errorCard("You are not tracking any stocks yet, so there are no reports to list for you.");
  }
  if (input.ticker) {
    const ticker = input.ticker.trim().toUpperCase();
    const event = await getNextEarningsCalendarEventCached("US", ticker);
    const card: EarningsCard = {
      card: "earnings",
      scope: `Next report for ${ticker}`,
      events: event
        ? [{ ticker: event.ticker, company: event.company, date: event.event_date, weekday: weekdayOf(event.event_date), time: event.time ?? null, eps_estimate: roundOrNull(event.eps_estimate) }]
        : [],
      source: "Earnings calendar",
      as_of: event?.captured_at ?? null,
      source_url: "/calendar",
    };
    return card;
  }
  const days = Math.min(21, Math.max(1, Math.round(input.days ?? 7)));
  const from = today(now);
  const to = new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
  const all = await getEarnings("US", from, to);
  const mine = input.mine && tracked ? new Set(tracked) : null;
  const events = mine ? all.filter((event) => mine.has(event.ticker.toUpperCase())) : all;
  const card: EarningsCard = {
    card: "earnings",
    scope: mine ? `Your stocks reporting from ${from} to ${to}` : `Reports from ${from} to ${to}`,
    events: events.slice(0, 40).map((event) => ({
      ticker: event.ticker,
      company: event.company,
      date: event.event_date,
      weekday: weekdayOf(event.event_date),
      time: event.time ?? null,
      eps_estimate: roundOrNull(event.eps_estimate),
    })),
    source: "Earnings calendar",
    as_of: all[0]?.captured_at ?? null,
    source_url: "/calendar",
  };
  return card;
}

/* ── backtest ───────────────────────────────────────────────────────────── */

function statsOf(stats: CurveStats): BacktestStats {
  return {
    total_return_pct: pct(stats.total_return) ?? 0,
    annualized_pct: pct(stats.annualized_return),
    volatility_pct: pct(stats.volatility),
    sharpe: roundOrNull(stats.sharpe),
    max_drawdown_pct: pct(stats.max_drawdown) ?? 0,
  };
}

export async function backtestCard(input: {
  holdings: Array<{ ticker: string; weight?: number }>;
  start?: string;
  end?: string;
  rebalance?: string;
  benchmark?: string;
}): Promise<AskCard> {
  const benchmark = (input.benchmark || "SPY").trim().toUpperCase();
  const holdings = input.holdings
    .map((holding) => ({ symbol: holding.ticker.trim().toUpperCase(), weight: fin(holding.weight) && holding.weight > 0 ? holding.weight : 1 }))
    .filter((holding) => holding.symbol);
  if (holdings.length === 0) return errorCard("A backtest needs at least one ticker.");
  if (input.start && !isIsoDay(input.start)) return errorCard("The start date must look like 2019-01-01.");
  if (input.end && !isIsoDay(input.end)) return errorCard("The end date must look like 2024-12-31.");

  const symbols = [...new Set([...holdings.map((holding) => holding.symbol), benchmark])];
  const loaded = await Promise.all(symbols.map((symbol) => loadDailySeries(symbol)));
  const prices: Record<string, { dates: string[]; closes: number[] }> = {};
  let source = "Daily closes";
  loaded.forEach((history, index) => {
    if (!history) return;
    source = history.source;
    prices[symbols[index]!] = { dates: history.series.map((point) => point.date), closes: history.series.map((point) => point.close) };
  });

  let result;
  try {
    result = runWeightsBacktest(
      { holdings, rebalance: input.rebalance || "monthly", benchmark, start: input.start ?? null, end: input.end ?? null },
      prices,
    );
  } catch (error) {
    if (error instanceof MissingHistoryError) {
      return errorCard(`We hold no daily price history for ${error.symbols.join(", ")}, so this backtest cannot run. Drop those tickers or pick others.`);
    }
    throw error;
  }

  const curve = thin(
    result.curve.dates.map((date, index) => ({ date, strategy: result.curve.strategy[index]!, benchmark: result.curve.benchmark[index]! })),
    120,
  );
  const card: BacktestCard = {
    card: "backtest",
    simulated: true,
    holdings: result.holdings.map((holding) => ({
      ticker: holding.symbol,
      weight_pct: pct(holding.weight) ?? 0,
      total_return_pct: pct(holding.total_return) ?? 0,
    })),
    rebalance: result.input.rebalance,
    benchmark: result.input.benchmark,
    start: result.period.start,
    end: result.period.end,
    years: round(result.period.years, 1),
    limited_by: result.limited_by ? { ticker: result.limited_by.symbol, first_date: result.limited_by.first_date } : null,
    strategy: statsOf(result.summary.strategy),
    benchmark_stats: statsOf(result.summary.benchmark),
    beat_years: { beat: result.hit_rate.beat, of: result.hit_rate.years },
    best_year: result.best_year ? { year: result.best_year.year, return_pct: pct(result.best_year.strategy) ?? 0 } : null,
    worst_year: result.worst_year ? { year: result.worst_year.year, return_pct: pct(result.worst_year.strategy) ?? 0 } : null,
    cost_bps: result.costs.bps,
    caveats: result.caveats.map((caveat) => ({ title: caveat.title, text: caveat.text })),
    curve,
    source: `Simulated from ${source}, adjusted for splits and dividends`,
    as_of: result.period.end,
    source_url: "/backtest",
  };
  return card;
}

/* ── investors ──────────────────────────────────────────────────────────── */

function words(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1);
}

/** The investor whose name, person or slug best matches what was asked. */
export function findInvestor(query: string, sources: FollowSource[]): FollowSource | null {
  const wanted = words(query);
  if (wanted.length === 0) return null;
  let best: { source: FollowSource; score: number } | null = null;
  for (const source of sources) {
    const hay = new Set(words(`${source.name} ${source.person} ${source.slug}`));
    let score = 0;
    for (const word of wanted) if (hay.has(word)) score += 1;
    if (source.slug === query.trim().toLowerCase()) score += 5;
    if (score > 0 && (!best || score > best.score)) best = { source, score };
  }
  return best?.source ?? null;
}

/** Weights and returns in a profile are fractions; the change in share count is already a percentage. */
function fundCard(profile: FundProfile): FundCard {
  const changes = profile.changes;
  const performance = profile.performance;
  return {
    card: "fund",
    slug: profile.slug,
    manager: profile.manager,
    fund: profile.fund,
    quarter: profile.latest.quarter,
    filed_at: profile.latest.filed_at,
    lag_days: num(profile.latest.lag_days),
    stock_value: num(profile.latest.stock_value),
    positions_count: num(profile.latest.stock_positions),
    compared_with: profile.compared_with,
    positions: profile.portfolio.slice(0, 12).map((position) => ({
      ticker: position.ticker,
      name: position.name,
      weight_pct: pct(position.weight),
      value: num(position.value),
      change: position.change ?? null,
      shares_delta_pct: roundOrNull(position.shares_delta_pct, 1),
    })),
    bought: [
      ...(changes?.new ?? []).slice(0, 5).map((row) => ({ ticker: row.ticker, name: row.name, weight_pct: pct(row.weight), shares_delta_pct: null, kind: "new" as const })),
      ...(changes?.added ?? []).slice(0, 5).map((row) => ({ ticker: row.ticker, name: row.name, weight_pct: pct(row.weight), shares_delta_pct: roundOrNull(row.shares_delta_pct, 1), kind: "added" as const })),
    ],
    sold: [
      ...(changes?.sold ?? []).slice(0, 5).map((row) => ({ ticker: row.ticker, name: row.name, prev_weight_pct: pct(row.prev_weight), shares_delta_pct: null, kind: "sold" as const })),
      ...(changes?.reduced ?? []).slice(0, 5).map((row) => ({ ticker: row.ticker, name: row.name, prev_weight_pct: pct(row.prev_weight), shares_delta_pct: roundOrNull(row.shares_delta_pct, 1), kind: "reduced" as const })),
    ],
    record: performance
      ? {
          since: performance.start_date,
          fund_return_pct: pct(performance.fund.r_since),
          spy_return_pct: pct(performance.spy.r_since),
          one_year_pct: pct(performance.fund.r_1y),
          max_drawdown_pct: pct(performance.fund.max_drawdown),
        }
      : null,
    source: "SEC EDGAR, Form 13F. Positions are as of quarter end and filed up to 45 days later.",
    as_of: profile.latest.filed_at,
    source_url: profile.latest.url || profile.source_url || `/follow/${profile.slug}`,
  };
}

function congressFromProfile(profile: CongressProfile): CongressCard {
  return {
    card: "congress",
    scope: `Trades disclosed by ${profile.name}`,
    trades: profile.trades.slice(0, 15).map((trade) => ({
      person: trade.person_name,
      party: profile.party || null,
      ticker: trade.ticker,
      company: trade.company,
      side: trade.tx_type,
      amount_low: num(trade.amount_low),
      amount_high: num(trade.amount_high),
      traded: trade.transaction_date,
      disclosed: trade.disclosure_date,
      lag_days: num(trade.lag_days),
      url: trade.source_url || null,
    })),
    source: `${profile.source || "House Clerk"} periodic transaction reports. Amounts are disclosed as ranges.`,
    as_of: profile.latest_date || null,
    source_url: `/follow/${profile.slug}`,
  };
}

async function investorCard(name: string): Promise<AskCard> {
  const sources = await getFollowSources();
  if (sources.length === 0) return errorCard("Investor filings are not loaded right now.");
  const match = findInvestor(name, sources);
  if (!match) return errorCard(`We do not track an investor matching "${name}". Call list_investors to see who we follow.`);
  const profile = await getFollowProfile(match.slug);
  if (!profile) return errorCard(`The filings for ${match.name} are not available right now.`);
  return profile.kind === "fund" ? fundCard(profile) : congressFromProfile(profile);
}

async function investorsCard(kind?: "fund" | "congress"): Promise<InvestorsCard> {
  const [sources, activity] = await Promise.all([getFollowSources(), getFollowActivity(40).catch(() => [])]);
  const rows = sources
    .filter((source) => (kind ? source.kind === kind : true))
    .sort((a, b) => (a.latest_date < b.latest_date ? 1 : -1))
    .slice(0, 25);
  return {
    card: "investors",
    investors: rows.map((source) => ({
      slug: source.slug,
      kind: source.kind,
      name: source.name,
      person: source.person,
      latest_date: source.latest_date,
      headline: source.headline,
    })),
    source: "SEC EDGAR 13F filings and House Clerk disclosures",
    as_of: activity[0]?.date ?? rows[0]?.latest_date ?? null,
    source_url: "/follow",
  };
}

async function congressCard(input: { ticker?: string; person?: string; days?: number }): Promise<AskCard> {
  const days = Math.min(60, Math.max(1, Math.round(input.days ?? 30)));
  const data = await getPowerTradesCached(days);
  const ticker = input.ticker?.trim().toUpperCase();
  const person = input.person ? words(input.person) : [];
  const trades = data.trades.filter((trade) => {
    if (ticker && trade.ticker.toUpperCase() !== ticker) return false;
    if (person.length > 0) {
      const hay = new Set(words(trade.person_name));
      if (!person.some((word) => hay.has(word))) return false;
    }
    return true;
  });
  const card: CongressCard = {
    card: "congress",
    scope: [`Disclosed in the last ${days} days`, ticker ? `in ${ticker}` : "", input.person ? `by ${input.person}` : ""].filter(Boolean).join(" "),
    trades: trades.slice(0, 20).map((trade) => ({
      person: trade.person_name,
      party: trade.party || null,
      ticker: trade.ticker,
      company: trade.company,
      side: trade.tx_type,
      amount_low: num(trade.amount_low),
      amount_high: num(trade.amount_high),
      traded: trade.transaction_date,
      disclosed: trade.disclosure_date,
      lag_days: num(trade.lag_days),
      url: trade.source_url || null,
    })),
    source: "Congressional periodic transaction reports. Amounts are disclosed as ranges.",
    as_of: trades[0]?.disclosure_date ?? null,
    source_url: "/follow",
  };
  return card;
}

function insiderRow(trade: InsiderTrade): InsidersCard["trades"][number] {
  return {
    ticker: trade.symbol,
    company: trade.company,
    insider: trade.insider,
    role: trade.role,
    side: trade.tx_type,
    shares: trade.shares,
    price: roundOrNull(trade.price),
    value: num(trade.value),
    traded: trade.transaction_date,
    filed: trade.filing_date || trade.filed_at.slice(0, 10),
    planned: trade.plan_10b5_1,
    url: trade.url || null,
  };
}

async function insidersCard(input: { ticker?: string; buys_only?: boolean }): Promise<AskCard> {
  const ticker = input.ticker?.trim().toUpperCase();
  let trades: InsiderTrade[];
  if (ticker) trades = await getInsiderTradesForSymbol(ticker);
  else if (input.buys_only) trades = await getInsiderBuys(60);
  else trades = await getInsiderTrades(60);
  if (input.buys_only) trades = trades.filter((trade) => trade.tx_type === "buy");
  // An empty result can mean "nobody traded" or "the filings are not loaded". Only the first is an answer.
  if (trades.length === 0) {
    const loaded = await getInsiderSummary()
      .then((summary) => Boolean(summary.meta))
      .catch(() => false);
    if (!ticker || !loaded) return errorCard("Insider filings (Form 4) are not loaded right now, so we cannot say who bought or sold.");
  }
  // The biggest open-market trades say the most; the newest break ties.
  const ranked = ticker ? trades : [...trades].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const card: InsidersCard = {
    card: "insiders",
    scope: [input.buys_only ? "Open-market buys" : "Open-market buys and sales", ticker ? `in ${ticker}` : "across our coverage, largest first"].join(" "),
    trades: ranked.slice(0, 20).map(insiderRow),
    source: "SEC EDGAR, Form 4",
    as_of: trades[0]?.filed_at ?? null,
    source_url: ticker ? `/stock/${ticker}` : "/follow",
  };
  return card;
}

/* ── other asset classes ────────────────────────────────────────────────── */

async function marketsCard(input: { query?: string; kind?: string }, now: Date): Promise<AskCard> {
  const data = await getMarketsData();
  if (data.assets.length === 0) return errorCard("Cross-asset quotes are not loaded right now.");
  const wanted = input.query ? words(input.query) : [];
  let assets = data.assets;
  if (input.kind) assets = assets.filter((asset) => asset.class === input.kind);
  if (wanted.length > 0) {
    assets = assets.filter((asset) => {
      const hay = new Set(words(`${asset.name} ${asset.symbol} ${asset.id} ${asset.group ?? ""}`));
      return wanted.some((word) => hay.has(word));
    });
  }
  if (assets.length === 0) return errorCard("No market matched that. Try an asset class (index, etf, rate, commodity, fx, crypto) or a name like gold or bitcoin.");
  const card: MarketsCard = {
    card: "markets",
    assets: [...assets]
      .sort((a, b) => a.order - b.order)
      .slice(0, 14)
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        symbol: asset.symbol,
        kind: CLASS_LABEL[asset.class] ?? asset.class,
        level: formatLevel(asset.price, asset.unit),
        change: formatChange(asset.change.d1, asset.change_mode),
        change_label: dayChangeLabel(asset, now),
        tone: changeTone(asset.change.d1, asset.change_mode),
        href: assetHref(asset),
        source: asset.source_name,
        as_of: asset.as_of,
      })),
    source: [...new Set(assets.slice(0, 14).map((asset) => asset.source_name))].slice(0, 4).join(", "),
    as_of: data.as_of,
    source_url: "/markets",
  };
  return card;
}

/* ── idea to basket ─────────────────────────────────────────────────────── */

/** Run `work` over `items`, at most `limit` at a time. */
async function eachLimited<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next]!;
      next += 1;
      await work(item);
    }
  });
  await Promise.all(runners);
}

/** Null means the ticker is not in the catalog. A failed read throws, so "missing" and "could not load" stay apart. */
async function basketFacts(ticker: string): Promise<BasketFacts | null> {
  const resolved = await resolveInstrumentByTicker(ticker, "US");
  if (!resolved) return null;
  const [summary, pro, history] = await Promise.all([
    getStockSummary(resolved.ticker, "US"),
    getStockIntelPro(resolved.instrument_id, "US").catch(() => null),
    loadDailySeries(resolved.ticker),
  ]);
  if (!summary) return null;
  const year = history ? returnStats(slicePeriod(history.series, { kind: "days", days: 365, label: "1 year" })) : null;
  const price = num(summary.price);
  return {
    ticker: resolved.ticker,
    name: summary.name ?? resolved.name ?? null,
    sector: summary.sector ?? null,
    industry: summary.industry ?? null,
    description: summary.description ?? null,
    price: price !== null && price > 0 ? round(price) : null,
    day_change_pct: roundOrNull(summary.day_change_pct),
    market_cap: num(summary.fundamentals?.market_cap),
    pe_ttm: roundOrNull(summary.fundamentals?.pe_ttm, 1),
    r_1y_pct: year ? round(year.return_pct, 1) : null,
    score: roundOrNull(pro?.overall?.score, 0),
    verdict: pro?.overall?.verdict ?? null,
    quote_source: "stocksbrew market data",
    quote_as_of: summary.captured_at ?? null,
    history_source: history ? `${history.source}, adjusted` : null,
    history_as_of: year?.to.date ?? null,
  };
}

export async function basketCard(input: { thesis: string; candidates?: ProposedLine[]; idea_risk?: string }): Promise<AskCard> {
  const thesis = input.thesis.trim();
  if (thesis.length < 3) return errorCard("Describe the idea in a few words first.");
  const [themes, screens] = await Promise.all([
    getLiveInvestmentThemes().catch(() => []),
    getAgentScreens({ market: "US" })
      .then((doc) => doc.screens)
      .catch(() => []),
  ]);
  const draft = draftBasket({ thesis, themes, screens, proposed: input.candidates ?? [], ideaRisk: input.idea_risk ?? null });
  if (draft.lines.length === 0) {
    return errorCard(
      "Nothing in our themes or screens matches that idea, and no candidate tickers were given. Call build_basket again with candidates: tickers you believe fit, each with why it fits and what would break it. Use web_search first if you are unsure which companies fit.",
    );
  }
  const facts = new Map<string, BasketFacts | null>();
  const unavailable = new Set<string>();
  // A few at a time: sixteen companies at once is sixty-odd reads, and the store starts refusing them.
  await eachLimited(draft.lines, 4, async (line) => {
    try {
      facts.set(line.ticker, await basketFacts(line.ticker));
    } catch {
      try {
        facts.set(line.ticker, await basketFacts(line.ticker));
      } catch (error) {
        console.error("ask_basket_facts_failed", line.ticker, error);
        facts.set(line.ticker, null);
        unavailable.add(line.ticker);
      }
    }
  });
  const card = finishBasket(draft, facts, { unavailable });
  if (card.lines.length === 0) {
    return errorCard(
      unavailable.size > 0
        ? "We could not load the data for those companies just now, so there is no basket to show. Try again in a moment."
        : "None of those tickers are in our US catalog, so there is no basket to show.",
    );
  }
  return card;
}

/* ── the tool set ───────────────────────────────────────────────────────── */

const TICKER = z.string().min(1).max(12).describe("A US ticker symbol, like AAPL");

export function buildAskTools(context: AskToolContext): ToolSet {
  const uid = context.uid;
  const now = () => context.now ?? new Date();
  /** The tickers the signed-in person tracks, from the session's own viewer. Null when signed out. */
  const trackedTickers = (): string[] | null =>
    uid && context.viewer?.uid === uid ? context.viewer.tracked.filter((id) => id.startsWith("US_")).map((id) => id.slice(3).replace(/_/g, ".").toUpperCase()) : uid ? [] : null;

  const tools: ToolSet = {
    find_stock: tool({
      description: "Find the ticker for a company name, or check a ticker exists. Use it when a name is ambiguous or you are not sure of the symbol.",
      inputSchema: z.object({ query: z.string().min(1).max(60).describe("Company name or ticker") }),
      execute: async ({ query }) =>
        safe("find_stock", async () => {
          const data = await searchStocks({ query, market: "US", limit: 6 });
          const card: MatchesCard = {
            card: "matches",
            query,
            matches: data.matches.map((match) => ({ ticker: match.ticker, name: match.name })),
            source: "stocksbrew catalog",
            as_of: null,
          };
          return card;
        }),
    }),

    get_stock: tool({
      description:
        "Latest price, valuation, analyst target, our research call and the next earnings date for one US stock. The first call for any question about a single company.",
      inputSchema: z.object({ ticker: TICKER }),
      execute: async ({ ticker }) => safe("get_stock", () => quoteCard(ticker, uid, context.levels?.(ticker) ?? false)),
      toModelOutput: modelView,
    }),

    get_price_history: tool({
      description:
        "Total return, high, low and worst fall for a stock or ETF over a period, from adjusted daily closes, with the S&P 500 (SPY) over the same dates. Use it for any 'how has X done' question. Give either a period or a start date.",
      inputSchema: z.object({
        ticker: TICKER,
        period: z.string().max(12).optional().describe("5d, 1m, 3m, 6m, 1y, 3y, 5y, 10y, ytd or max. Defaults to 1y."),
        start: z.string().optional().describe("Start date, YYYY-MM-DD. Overrides period."),
        end: z.string().optional().describe("End date, YYYY-MM-DD. Defaults to the latest close."),
      }),
      execute: async (input) => safe("get_price_history", () => returnsCard(input)),
      toModelOutput: modelView,
    }),

    compare_stocks: tool({
      description: "Side by side for 2 to 5 US stocks: price, market value, P/E, analyst target, our score, and 1, 3, 6 and 12 month returns.",
      inputSchema: z.object({ tickers: z.array(TICKER).min(2).max(5) }),
      execute: async ({ tickers }) =>
        safe("compare_stocks", async () => {
          const clean = cleanTickerList(tickers, 5);
          if (clean.length < 2) return errorCard("Give 2 to 5 different tickers to compare.");
          return compareCard(clean);
        }),
      toModelOutput: modelView,
    }),

    get_my_portfolio: tool({
      description:
        "The signed-in person's holdings and watchlist: shares, average cost, value, weight, gain since cost, price, today's move and our current call on each.",
      inputSchema: z.object({}),
      execute: async () =>
        safe("get_my_portfolio", async () => (uid ? portfolioCard(uid, Boolean(context.example)) : context.example ? examplePortfolioCard() : signIn("portfolio"))),
      toModelOutput: modelView,
    }),

    get_portfolio_changes: tool({
      description: "What changed for the signed-in person's names since they last looked, and what is coming up for them.",
      inputSchema: z.object({ since: z.string().optional().describe("ISO time to look back to. Optional.") }),
      execute: async ({ since }) => safe("get_portfolio_changes", async () => (uid ? changesCard(uid, since) : signIn("portfolio"))),
      toModelOutput: modelView,
    }),

    get_market_brief: tool({
      description: "Today's US market: the brief, the main indexes and macro readings, and the biggest gainers and losers with the reason when we confirmed one.",
      inputSchema: z.object({}),
      execute: async () => safe("get_market_brief", () => marketBriefCard()),
      toModelOutput: modelView,
    }),

    get_screens: tool({
      description: "Our live rule-based screens (value, momentum, quality and so on) with how many stocks match each and the top matches.",
      inputSchema: z.object({}),
      execute: async () => safe("get_screens", () => screensCard()),
      toModelOutput: modelView,
    }),

    get_themes: tool({
      description: "Our research themes (AI capex, energy, defense, cybersecurity and others) and the companies in each. Pass a slug for one theme in full.",
      inputSchema: z.object({ slug: z.string().max(60).optional() }),
      execute: async ({ slug }) => safe("get_themes", () => themesCard(slug)),
      toModelOutput: modelView,
    }),

    get_news: tool({
      description: "Recent headlines with the publisher's own excerpt. Pass a ticker for one company, or nothing for the market wire.",
      inputSchema: z.object({ ticker: TICKER.optional() }),
      execute: async ({ ticker }) => safe("get_news", () => newsCard(ticker ? ticker.trim().toUpperCase() : null)),
      toModelOutput: modelView,
    }),

    web_search: tool({
      description:
        "Search the web. Use it only when the other tools cannot answer: something that happened in the last hours, a fact about a private company, or which companies belong to a niche idea.",
      inputSchema: z.object({ query: z.string().min(3).max(200) }),
      execute: async ({ query }) => safe("web_search", () => webCard(query)),
      toModelOutput: modelView,
    }),

    get_earnings: tool({
      description:
        "Earnings dates. Pass a ticker for that company's next report, or days for everything reporting in the next N days. Add mine=true to list only the stocks the signed-in person tracks ('which of my stocks report this week').",
      inputSchema: z.object({ ticker: TICKER.optional(), days: z.number().int().min(1).max(21).optional(), mine: z.boolean().optional() }),
      execute: async (input) => safe("get_earnings", () => earningsCard(input, now(), trackedTickers())),
      toModelOutput: modelView,
    }),

    run_backtest: tool({
      description:
        "Simulate holding a fixed set of tickers against a benchmark over history: return, volatility, worst fall, year by year. Weights default to equal. The result is a simulation and must be described as one.",
      inputSchema: z.object({
        holdings: z
          .array(z.object({ ticker: TICKER, weight: z.number().positive().optional().describe("Relative weight. Omit for equal weights.") }))
          .min(1)
          .max(20),
        start: z.string().optional().describe("YYYY-MM-DD. Defaults to the earliest date every ticker has prices."),
        end: z.string().optional().describe("YYYY-MM-DD. Defaults to the latest close."),
        rebalance: z.enum(["never", "monthly", "quarterly", "yearly"]).optional(),
        benchmark: TICKER.optional().describe("Defaults to SPY."),
      }),
      execute: async (input) => safe("run_backtest", () => {
          // The plan's lookback applies here the same way it does on /backtest.
          const earliest = context.earliestBacktestStart ?? null;
          const start = earliest && (!input.start || input.start < earliest) ? earliest : input.start;
          return backtestCard({ ...input, start });
        }),
      toModelOutput: modelView,
    }),

    list_investors: tool({
      description: "The funds (from 13F filings) and members of Congress we follow, newest filing first.",
      inputSchema: z.object({ kind: z.enum(["fund", "congress"]).optional() }),
      execute: async ({ kind }) => safe("list_investors", () => investorsCard(kind)),
      toModelOutput: modelView,
    }),

    get_investor: tool({
      description:
        "One followed investor. For a fund: top holdings from the latest 13F, what it bought and sold against the prior quarter, and its record from filing dates. For a member of Congress: their disclosed trades.",
      inputSchema: z.object({ name: z.string().min(2).max(80).describe("Fund, manager or member name, like Berkshire Hathaway or Pelosi") }),
      execute: async ({ name }) => safe("get_investor", () => investorCard(name)),
      toModelOutput: modelView,
    }),

    get_congress_trades: tool({
      description: "Stock trades members of Congress disclosed recently, optionally for one ticker or one member.",
      inputSchema: z.object({ ticker: TICKER.optional(), person: z.string().max(60).optional(), days: z.number().int().min(1).max(60).optional() }),
      execute: async (input) => safe("get_congress_trades", () => congressCard(input)),
      toModelOutput: modelView,
    }),

    get_insider_trades: tool({
      description: "Open-market buys and sales by company insiders from Form 4 filings, for one ticker or across our coverage.",
      inputSchema: z.object({ ticker: TICKER.optional(), buys_only: z.boolean().optional() }),
      execute: async (input) => safe("get_insider_trades", () => insidersCard(input)),
      toModelOutput: modelView,
    }),

    get_markets: tool({
      description: "Quotes outside single stocks: indexes, ETFs, Treasury yields, commodities, currencies and crypto. Filter by a name (gold, bitcoin, 10-year) or a kind.",
      inputSchema: z.object({
        query: z.string().max(60).optional(),
        kind: z.enum(["index", "etf", "rate", "commodity", "fx", "crypto"]).optional(),
      }),
      execute: async (input) => safe("get_markets", () => marketsCard(input, now())),
      toModelOutput: modelView,
    }),

    build_basket: tool({
      description:
        "Turn an investing idea into a basket of companies. It matches the idea against our themes and screens, checks every ticker against our catalog and attaches the evidence. If the idea is niche, pass candidates: tickers you believe fit, each with why it fits and what would break it. Never put numbers in those two fields; the tool supplies all figures.",
      inputSchema: z.object({
        thesis: z.string().min(3).max(400).describe("The idea in the person's own words"),
        candidates: z
          .array(
            z.object({
              ticker: TICKER,
              why_it_fits: z.string().min(8).max(300).describe("One sentence, no figures"),
              breaks_if: z.string().min(8).max(300).describe("What would make this company stop fitting the idea. One sentence, no figures."),
            }),
          )
          .max(12)
          .optional(),
        idea_risk: z.string().max(400).optional().describe("What would break the whole idea. One or two sentences, no figures."),
      }),
      execute: async (input) => safe("build_basket", () => basketCard(input)),
      toModelOutput: modelView,
    }),

    propose_watchlist_add: tool({
      description:
        "Offer to add tickers to the person's watchlist. This does not add anything: it shows a card with a Confirm button. Call it only when the person asks to save or track names.",
      inputSchema: z.object({ tickers: z.array(TICKER).min(1).max(12), reason: z.string().max(200).optional() }),
      execute: async ({ tickers, reason }) =>
        safe("propose_watchlist_add", async () => {
          if (!uid) return signIn("action");
          const clean = cleanTickerList(tickers, 12);
          if (clean.length === 0) return errorCard("Those do not look like tickers.");
          const card: ActionCard = {
            card: "action",
            action: "add_to_watchlist",
            status: "needs_confirmation",
            tickers: clean,
            reason: text(reason, 200),
            source: "Nothing has been saved yet",
            as_of: null,
          };
          return card;
        }),
    }),

    propose_price_alert: tool({
      description:
        "Offer to set a price alert (an email when a stock closes above or below a level). This does not create anything: it shows a card with a Confirm button. Call it only when the person asks for an alert.",
      inputSchema: z.object({
        ticker: TICKER,
        condition: z.enum(["above", "below"]),
        target_price: z.number().positive(),
        reason: z.string().max(200).optional(),
      }),
      execute: async ({ ticker, condition, target_price, reason }) =>
        safe("propose_price_alert", async () => {
          if (!uid) return signIn("action");
          const [clean] = cleanTickerList([ticker], 1);
          if (!clean) return errorCard("That does not look like a ticker.");
          const summary = await getStockSummary(clean, "US").catch(() => null);
          const last = num(summary?.price);
          const card: ActionCard = {
            card: "action",
            action: "create_price_alert",
            status: "needs_confirmation",
            tickers: [clean],
            condition,
            target_price: round(target_price),
            last_price: last !== null && last > 0 ? round(last) : null,
            reason: text(reason, 200),
            source: "Nothing has been created yet",
            as_of: summary?.captured_at ?? null,
          };
          return card;
        }),
    }),
  };
  // The person's own reasons, memo, agents, research and briefing, plus "Watch this". Same uid, same viewer.
  Object.assign(tools, buildMineTools({ uid, viewer: context.viewer ?? null, example: Boolean(context.example), now: context.now }));
  // Several inputs are optional. Strict schemas would require every field, so say so explicitly
  // instead of relying on the provider's default.
  for (const item of Object.values(tools)) (item as { strict?: boolean }).strict = false;
  return tools;
}
