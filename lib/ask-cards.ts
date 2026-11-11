/**
 * The shapes the Ask tools hand back, and the pure maths behind them.
 *
 * A tool result is a "card": plain JSON with a `card` kind, a `source` and an
 * `as_of`. The model reads the same card the person sees, so a number in an
 * answer can be found in a card above it. Nothing in this file touches the
 * network or the store.
 */

import type { UIMessage } from "ai";
import type { AgentJobDraft } from "@/lib/agent-jobs";

/* ── cards ──────────────────────────────────────────────────────────────── */

type CardBase = {
  /** Who the data came from, in words a person recognises. */
  source: string;
  /** When the data is from: an ISO instant or a YYYY-MM-DD day. */
  as_of: string | null;
  source_url?: string | null;
};

export type QuoteCard = CardBase & {
  card: "quote";
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  currency: string;
  price: number | null;
  day_change_pct: number | null;
  market_cap: number | null;
  pe_ttm: number | null;
  dividend_yield: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  revenue_growth_yoy_pct: number | null;
  analyst_target: number | null;
  target_upside_pct: number | null;
  rsi_14: number | null;
  score: number | null;
  verdict: string | null;
  headline: string | null;
  thesis: string | null;
  what_changed: string | null;
  what_to_watch: string | null;
  /**
   * The same evidence and measurable conditions the stock page shows under the call (lib/call-evidence.ts), from
   * stored numbers only. `what_would_change` is empty unless the viewer covers the stock.
   */
  call_evidence?: { evidence: Array<{ text: string; source: string }>; what_would_change: string[] } | null;
  key_points: string[];
  risks: string[];
  /** False when the reasoning above was withheld because the viewer's plan does not cover this stock. */
  full_read?: boolean;
  next_earnings: { date: string; time: string | null } | null;
  research_status: string;
};

export type SeriesPoint = { date: string; close: number };

export type ReturnsCard = CardBase & {
  card: "returns";
  ticker: string;
  period: string;
  from: SeriesPoint;
  to: SeriesPoint;
  return_pct: number;
  annualized_pct: number | null;
  high: SeriesPoint;
  low: SeriesPoint;
  max_drawdown_pct: number;
  benchmark: { ticker: string; return_pct: number } | null;
  adjusted: boolean;
  /** A thinned copy for the chart. The model never sees it. */
  points: SeriesPoint[];
};

export type CompareRow = {
  ticker: string;
  name: string;
  sector: string | null;
  price: number | null;
  day_change_pct: number | null;
  market_cap: number | null;
  pe_ttm: number | null;
  dividend_yield: number | null;
  analyst_target: number | null;
  score: number | null;
  verdict: string | null;
  rsi_14: number | null;
  r_1m: number | null;
  r_3m: number | null;
  r_6m: number | null;
  r_1y: number | null;
};

export type CompareCard = CardBase & { card: "compare"; rows: CompareRow[]; missing: string[] };

export type PortfolioRow = {
  ticker: string;
  name: string | null;
  position: "holding" | "watching";
  price: number | null;
  day_change_pct: number | null;
  weight_pct: number | null;
  gain_pct: number | null;
  /** What the person entered. Null when they did not. */
  shares?: number | null;
  avg_cost?: number | null;
  value?: number | null;
  call: string | null;
  note: string | null;
};

export type PortfolioCard = CardBase & {
  card: "portfolio";
  /** True when this is the example portfolio, not the person's own. */
  example?: boolean;
  tracked: number;
  holdings: number | null;
  watching: number | null;
  rows: PortfolioRow[];
  needs_attention: Array<{ ticker: string | null; text: string }>;
};

export type ChangesCard = CardBase & {
  card: "changes";
  headline: string;
  body: string;
  items: Array<{ ticker: string | null; title: string; detail: string | null; at: string | null }>;
  upcoming: Array<{ ticker: string | null; title: string; date: string | null }>;
};

export type MoverRow = { ticker: string; name: string | null; price: number | null; day_change_pct: number | null; reason?: string | null };

export type MarketBriefCard = CardBase & {
  card: "market_brief";
  title: string | null;
  body: string | null;
  sentiment: string | null;
  macro: Array<{ label: string; value: string; day_change_pct: number | null }>;
  gainers: MoverRow[];
  losers: MoverRow[];
};

export type ScreensCard = CardBase & {
  card: "screens";
  screens: Array<{
    id: string;
    title: string;
    tagline: string;
    match_count: number;
    top: Array<{ ticker: string; name: string | null; price: number | null; day_change_pct: number | null; score: number | null }>;
  }>;
};

export type ThemesCard = CardBase & {
  card: "themes";
  themes: Array<{ slug: string; name: string; description: string; names: Array<{ ticker: string; company: string; role: string }> }>;
};

export type NewsItem = {
  title: string;
  url: string;
  source: string;
  published_at: string;
  summary: string | null;
  tickers: string[];
};

export type NewsCard = CardBase & { card: "news"; ticker: string | null; articles: NewsItem[] };

export type WebCard = CardBase & { card: "web"; query: string; results: Array<{ title: string; url: string; snippet: string }> };

export type EarningsCard = CardBase & {
  card: "earnings";
  scope: string;
  /** `weekday` is the date's day name ("Friday"), so an answer never works it out. */
  events: Array<{ ticker: string; company: string; date: string; weekday?: string; time: string | null; eps_estimate: number | null }>;
};

export type BacktestStats = {
  total_return_pct: number;
  annualized_pct: number | null;
  volatility_pct: number | null;
  sharpe: number | null;
  max_drawdown_pct: number;
};

export type BacktestCard = CardBase & {
  card: "backtest";
  simulated: true;
  holdings: Array<{ ticker: string; weight_pct: number; total_return_pct: number }>;
  rebalance: string;
  benchmark: string;
  start: string;
  end: string;
  years: number;
  limited_by: { ticker: string; first_date: string } | null;
  strategy: BacktestStats;
  benchmark_stats: BacktestStats;
  beat_years: { beat: number; of: number };
  best_year: { year: number; return_pct: number } | null;
  worst_year: { year: number; return_pct: number } | null;
  cost_bps: number;
  caveats: Array<{ title: string; text: string }>;
  /** Thinned for the chart: both lines start at 100. The model never sees it. */
  curve: Array<{ date: string; strategy: number; benchmark: number }>;
};

export type FundCard = CardBase & {
  card: "fund";
  slug: string;
  manager: string;
  fund: string;
  quarter: string;
  filed_at: string;
  lag_days: number | null;
  stock_value: number | null;
  positions_count: number | null;
  compared_with: string | null;
  positions: Array<{ ticker: string | null; name: string; weight_pct: number | null; value: number | null; change: string | null; shares_delta_pct: number | null }>;
  bought: Array<{ ticker: string | null; name: string; weight_pct: number | null; shares_delta_pct: number | null; kind: "new" | "added" }>;
  sold: Array<{ ticker: string | null; name: string; prev_weight_pct: number | null; shares_delta_pct: number | null; kind: "sold" | "reduced" }>;
  record: { since: string; fund_return_pct: number | null; spy_return_pct: number | null; one_year_pct: number | null; max_drawdown_pct: number | null } | null;
};

export type InvestorsCard = CardBase & {
  card: "investors";
  investors: Array<{ slug: string; kind: "fund" | "congress"; name: string; person: string; latest_date: string; headline: string }>;
};

export type CongressCard = CardBase & {
  card: "congress";
  scope: string;
  trades: Array<{
    person: string;
    party: string | null;
    ticker: string;
    company: string;
    side: string;
    amount_low: number | null;
    amount_high: number | null;
    traded: string;
    disclosed: string;
    lag_days: number | null;
    url: string | null;
  }>;
};

export type InsidersCard = CardBase & {
  card: "insiders";
  scope: string;
  trades: Array<{
    ticker: string;
    company: string;
    insider: string;
    role: string;
    side: "buy" | "sell";
    shares: number;
    price: number | null;
    value: number | null;
    traded: string;
    filed: string;
    planned: boolean;
    url: string | null;
  }>;
};

export type MarketsCard = CardBase & {
  card: "markets";
  assets: Array<{
    id: string;
    name: string;
    symbol: string;
    kind: string;
    level: string;
    change: string | null;
    change_label: string;
    tone: "up" | "down" | "flat";
    href: string;
    source: string;
    as_of: string;
  }>;
};

export type BasketEvidence = { label: string; value: string; source: string; as_of: string | null };

export type BasketLine = {
  ticker: string;
  company: string;
  what_it_does: string;
  why_it_fits: string;
  breaks_if: string;
  evidence: BasketEvidence[];
  /** Where the line came from: one of our theme baskets, a live screen, or the model's proposal checked against the catalog. */
  origin: "theme" | "screen" | "proposed";
  origin_label: string;
};

export type BasketCard = CardBase & {
  card: "basket";
  title: string;
  thesis: string;
  lines: BasketLine[];
  built_from: Array<{ kind: "theme" | "screen"; name: string; href: string }>;
  dropped: Array<{ ticker: string; reason: string }>;
  idea_risk: string | null;
  /** How the lines are ordered, when the thesis asked for an order ("cheap", "momentum"). */
  ranked_by: string | null;
};

export type ActionCard = CardBase & {
  card: "action";
  action: "add_to_watchlist" | "create_price_alert";
  /** Nothing has been done yet. The person confirms in the UI. */
  status: "needs_confirmation";
  tickers: string[];
  condition?: "above" | "below";
  target_price?: number;
  last_price?: number | null;
  reason: string | null;
};

/* ── the person's own: reasons, memo, agents, research, briefing ───────── */

export type Verdict = "holds" | "weaker" | "broken" | "played_out";

export type ReasonRow = {
  ticker: string;
  verdict: Verdict;
  /** "Reason weaker". */
  verdict_words: string;
  headline: string;
  /** The watcher's note: what fired, with its figures. */
  note: string;
  /** The person's own words, or null. */
  quote: string | null;
  /** What fired, worst first, at most three. */
  findings: Array<{ text: string; source: string; as_of: string; href: string | null }>;
  /** The verdict before the latest change and the day it changed. */
  changed_from: { verdict: Verdict; day: string } | null;
  as_of: string;
};

export type ReasonsCard = CardBase & {
  card: "reasons";
  example: boolean;
  /** Reasons saved on tracked stocks. */
  saved: number;
  /** Worst first. */
  rows: ReasonRow[];
  /** Stocks with a reason this plan does not check. */
  locked: string[];
  /** Stocks with a reason we had no data to check. */
  unchecked: string[];
};

export type MemoLine = { id: string; text: string; tickers: string[]; source: string; as_of: string; href: string };

export type MemoCard = CardBase & {
  card: "memo";
  example: boolean;
  week_key: string;
  monday: string;
  friday: string;
  /** Last close the memo is built on. */
  end_day: string | null;
  /** That close as a person says it: "Tuesday, Nov 10". */
  through: string | null;
  complete: boolean;
  top_line: string;
  /** The week's return line, when the memo has one. */
  week: string | null;
  changed: MemoLine[];
  hurt: MemoLine[];
  look: MemoLine[];
  /** The line the link pointed at, when it was found. */
  focus: MemoLine | null;
  /** A link named a line that is not in this week's memo (the week moved on, or the line dropped out). */
  focus_missing?: boolean;
  /** Reasons left out because the plan does not cover those stocks. */
  held_back: number;
};

export type AgentRow = {
  id: string;
  name: string;
  /** "Every market day, for NVDA": what it watches, in words. */
  watches: string;
  enabled: boolean;
  last_run: {
    day: string;
    /** "Found something", "Nothing to report", "Could not check". */
    decision: string;
    summary: string;
    findings: Array<{ ticker: string | null; headline: string; detail: string; at: string }>;
  } | null;
};

export type AgentsCard = CardBase & {
  card: "agents";
  /** Agents the person has, archived ones left out. */
  total: number;
  rows: AgentRow[];
  /** The agent the link pointed at; null when none or not found. */
  focus: string | null;
  focus_missing: boolean;
};

export type ResearchCard = CardBase & {
  card: "research";
  ticker: string;
  name: string;
  key: string;
  status: "running" | "ready" | "failed";
  created_at: string;
  headline: string | null;
  summary: string[];
  change: string[];
  watch: Array<{ date: string | null; text: string }>;
  risks: Array<{ title: string; text: string }>;
  sources: number;
  href: string;
};

export type ResearchListCard = CardBase & {
  card: "research_list";
  ticker: string | null;
  reports: Array<{ ticker: string; name: string; key: string; status: string; created_at: string; headline: string | null; href: string }>;
};

export type BriefingItemCard = CardBase & {
  card: "briefing_item";
  ticker: string;
  name: string;
  day: string;
  headline: string;
  why: string;
  metric: string | null;
  reason_confirmed: boolean;
  next_step: string;
  evidence: Array<{ label: string; source: string; url: string | null; at: string | null }>;
  day_change_pct: number | null;
  price: number | null;
};

/** "Keep watching": an agent an answer leads to. Nothing is set up until the person taps it (or saves it on /agents). */
export type WatchCard = CardBase & {
  card: "watch";
  /** "ready": not set up, the button opens the agent box. "already": the person has this agent. */
  status: "ready" | "already";
  /** The request as typed into the agent box. */
  request: string;
  /** What the agent will do, in the agent box's own words. */
  preview: string;
  href: string;
  /** Names of the person's agents that already do this. */
  existing: Array<{ name: string; enabled: boolean }>;
  note: string | null;
  /**
   * The rule in plain words, for the card to state before anything is saved. Absent on cards written before
   * Nov 11 2026, which show the preview sentence and a link instead.
   */
  rule?: {
    /** One line per agent the request makes: "NVIDIA moves 5% or more in a day, up or down". */
    what: string[];
    /** The stocks it watches by name. Empty with `mine`. */
    stocks: Array<{ ticker: string; name: string }>;
    /** It follows every stock the person tracks. */
    mine: boolean;
  };
  /**
   * The agents the request makes, as the Agents page would save them (validated by parseJobDraft). Signed in, the
   * card saves exactly these through POST /api/agents/save when the person taps it, never before.
   */
  drafts?: AgentJobDraft[];
  /**
   * Signed in: what saving would do on their plan right now, read when the answer was written. The save itself
   * decides; this only warns before the tap. Null when it would simply start.
   */
  outlook?: {
    /** "full": no room for another agent at all; "pro_only": filing or news agents on a plan without them; "paused": over the running limit. */
    kind: "full" | "pro_only" | "paused";
    /** One sentence for before the tap. */
    line: string;
  } | null;
};

export type MatchesCard = CardBase & { card: "matches"; query: string; matches: Array<{ ticker: string; name: string }> };

export type SignInCard = { card: "sign_in"; message: string };
export type ErrorCard = { card: "error"; message: string };

export type AskCard =
  | QuoteCard
  | ReturnsCard
  | CompareCard
  | PortfolioCard
  | ChangesCard
  | MarketBriefCard
  | ScreensCard
  | ThemesCard
  | NewsCard
  | WebCard
  | EarningsCard
  | BacktestCard
  | FundCard
  | InvestorsCard
  | CongressCard
  | InsidersCard
  | MarketsCard
  | BasketCard
  | ActionCard
  | ReasonsCard
  | MemoCard
  | AgentsCard
  | ResearchCard
  | ResearchListCard
  | BriefingItemCard
  | WatchCard
  | MatchesCard
  | SignInCard
  | ErrorCard;

export function isAskCard(value: unknown): value is AskCard {
  return Boolean(value) && typeof value === "object" && typeof (value as { card?: unknown }).card === "string";
}

export function errorCard(message: string): ErrorCard {
  return { card: "error", message };
}

/* ── small maths ────────────────────────────────────────────────────────── */

export function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function num(value: unknown): number | null {
  return fin(value) ? value : null;
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function roundOrNull(value: unknown, digits = 2): number | null {
  return fin(value) ? round(value, digits) : null;
}

/** A fraction (0.12) as a rounded percentage (12). */
export function pct(fraction: unknown, digits = 1): number | null {
  return fin(fraction) ? round(fraction * 100, digits) : null;
}

/* ── periods and returns ────────────────────────────────────────────────── */

export type Period =
  | { kind: "days"; days: number; label: string }
  | { kind: "ytd"; label: string }
  | { kind: "max"; label: string }
  | { kind: "range"; start: string; end: string | null; label: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "1m", "6mo", "3y", "ytd", "max", "5d", "2w". Anything else is null, so the
 * caller can say what it accepts instead of guessing.
 */
export function parsePeriod(raw: string | null | undefined): Period | null {
  const text = (raw ?? "").trim().toLowerCase();
  if (!text) return null;
  if (text === "ytd") return { kind: "ytd", label: "Year to date" };
  if (text === "max" || text === "all") return { kind: "max", label: "Full history" };
  const match = /^(\d{1,3})\s*(d|day|days|w|wk|week|weeks|m|mo|month|months|y|yr|year|years)$/.exec(text);
  if (!match) return null;
  const count = Number(match[1]);
  if (!(count > 0)) return null;
  const unit = match[2]![0];
  if (unit === "d") return { kind: "days", days: count, label: `${count} day${count === 1 ? "" : "s"}` };
  if (unit === "w") return { kind: "days", days: count * 7, label: `${count} week${count === 1 ? "" : "s"}` };
  if (unit === "m") return { kind: "days", days: Math.round(count * 30.4375), label: `${count} month${count === 1 ? "" : "s"}` };
  return { kind: "days", days: Math.round(count * 365.25), label: `${count} year${count === 1 ? "" : "s"}` };
}

export function isIsoDay(value: unknown): value is string {
  return typeof value === "string" && ISO_DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Keep the pairs that are a real day with a positive close, oldest first. */
export function cleanSeries(dates: unknown, closes: unknown): SeriesPoint[] {
  if (!Array.isArray(dates) || !Array.isArray(closes)) return [];
  const out: SeriesPoint[] = [];
  for (let i = 0; i < Math.min(dates.length, closes.length); i += 1) {
    const date = dates[i];
    const close = closes[i];
    if (typeof date === "string" && fin(close) && close > 0) out.push({ date, close });
  }
  return out;
}

/** The slice of a series a period covers. Starts on the first session on or after the period's start. */
export function slicePeriod(series: SeriesPoint[], period: Period): SeriesPoint[] {
  if (series.length === 0) return [];
  const last = series[series.length - 1]!;
  let start: string;
  let end = last.date;
  if (period.kind === "max") start = series[0]!.date;
  else if (period.kind === "ytd") start = `${Number(last.date.slice(0, 4)) - 1}-12-31`;
  else if (period.kind === "days") start = shiftDay(last.date, -period.days);
  else {
    start = period.start;
    if (period.end) end = period.end;
  }
  // Year to date is measured from the last close of the prior year, so that
  // close belongs in the slice when we have it.
  let from = series.findIndex((point) => point.date >= start);
  if (from < 0) return [];
  if (period.kind === "ytd" && series[from]!.date > start && from > 0) from -= 1;
  const slice: SeriesPoint[] = [];
  for (let i = from; i < series.length; i += 1) {
    if (series[i]!.date > end) break;
    slice.push(series[i]!);
  }
  return slice;
}

export type ReturnStats = {
  from: SeriesPoint;
  to: SeriesPoint;
  return_pct: number;
  annualized_pct: number | null;
  high: SeriesPoint;
  low: SeriesPoint;
  max_drawdown_pct: number;
  sessions: number;
};

/** Total return, range and worst peak-to-trough fall over a slice. Null with fewer than two closes. */
export function returnStats(slice: SeriesPoint[]): ReturnStats | null {
  if (slice.length < 2) return null;
  const from = slice[0]!;
  const to = slice[slice.length - 1]!;
  let high = from;
  let low = from;
  let peak = from.close;
  let worst = 0;
  for (const point of slice) {
    if (point.close > high.close) high = point;
    if (point.close < low.close) low = point;
    if (point.close > peak) peak = point.close;
    const fall = point.close / peak - 1;
    if (fall < worst) worst = fall;
  }
  const total = to.close / from.close - 1;
  const years = (Date.parse(`${to.date}T00:00:00Z`) - Date.parse(`${from.date}T00:00:00Z`)) / (365.25 * 86400000);
  // Annualising a few weeks produces a number nobody should act on.
  const annualized = years >= 1 ? (1 + total) ** (1 / years) - 1 : null;
  return {
    from,
    to,
    return_pct: round(total * 100, 2),
    annualized_pct: annualized === null ? null : round(annualized * 100, 2),
    high,
    low,
    max_drawdown_pct: round(worst * 100, 2),
    sessions: slice.length,
  };
}

/** At most `max` points, evenly spaced, always keeping the first and the last. */
export function thin<T>(items: T[], max: number): T[] {
  if (max < 2 || items.length <= max) return items.slice();
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  let previous = -1;
  for (let i = 0; i < max; i += 1) {
    const index = Math.round(i * step);
    if (index !== previous) out.push(items[index]!);
    previous = index;
  }
  return out;
}

/** Up to five clean, unique tickers from whatever the model sent. */
export function cleanTickerList(raw: unknown, max = 5): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,]+/) : [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const ticker = item.trim().toUpperCase().replace(/^\$/, "");
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) continue;
    if (!out.includes(ticker)) out.push(ticker);
    if (out.length >= max) break;
  }
  return out;
}

/* ── what the model is allowed to see ───────────────────────────────────── */

/**
 * The model gets the card without the chart series: those are hundreds of
 * numbers it has no reason to quote, and leaving them out keeps "every number
 * in the answer is on a card" checkable.
 */
export function cardForModel(card: AskCard): Record<string, unknown> {
  if (card.card === "returns") {
    const { points: _points, ...rest } = card;
    return rest;
  }
  if (card.card === "backtest") {
    const { curve: _curve, ...rest } = card;
    return rest;
  }
  if (card.card === "watch") {
    // The saved drafts and the rule are for the page; the model has the request and the preview in words.
    const { drafts: _drafts, rule: _rule, outlook: _outlook, ...rest } = card;
    return rest;
  }
  return card as Record<string, unknown>;
}

/* ── the number audit ───────────────────────────────────────────────────── */

export type NumberAudit = {
  /** Figures in the answer we looked for. */
  checked: number;
  /** Figures that appear in a tool result. */
  traced: number;
  /** Figures with no match, as they were written. */
  untraced: string[];
};

const SCALE_WORDS: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  mn: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  t: 1e12,
  tn: 1e12,
  trillion: 1e12,
};

const MONTH_BEFORE = /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*$/i;

/** Every finite number in a JSON value, including the ones written inside strings. */
export function collectNumbers(value: unknown, out: number[] = [], depth = 0): number[] {
  if (depth > 12 || value == null) return out;
  if (typeof value === "number") {
    if (Number.isFinite(value)) out.push(value);
    return out;
  }
  if (typeof value === "string") {
    for (const match of value.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
      const parsed = Number(match[0].replace(/,/g, ""));
      if (Number.isFinite(parsed)) out.push(parsed);
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, out, depth + 1);
    return out;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collectNumbers(item, out, depth + 1);
  }
  return out;
}

type Claim = { raw: string; value: number; decimals: number; scaled: boolean };

/** The figures an answer states: prices, percentages, ratios, big totals. Dates, list numbers and bare small counts are skipped. */
export function extractClaims(text: string): Claim[] {
  const claims: Claim[] = [];
  // Links and code are not prose claims.
  const prose = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/https?:\/\/\S+/g, " ");
  const pattern = /(?<![\w.])([$€£])?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/g;
  const unit = /^\s?(%|x\b|(?:k|m|mm|mn|b|bn|t|tn|thousand|million|billion|trillion)\b)/i;
  for (const match of prose.matchAll(pattern)) {
    const index = match.index ?? 0;
    const end = index + match[0].length;
    const before = prose.slice(Math.max(0, index - 14), index);
    const rest = prose.slice(end, end + 12);
    const suffixMatch = unit.exec(rest);
    const suffix = (suffixMatch?.[1] ?? "").toLowerCase();
    const whole = match[2]!.replace(/,/g, "");
    const fraction = match[3] ?? "";
    const currency = Boolean(match[1]);
    const base = Number(`${whole}${fraction}`);
    if (!Number.isFinite(base)) continue;
    const decimals = fraction ? fraction.length - 1 : 0;
    const bare = decimals === 0 && !currency && !suffix;

    // A list marker: "1." or "2)" at the start of a line.
    if (bare && /(^|\n)\s*$/.test(before) && /^[.)]/.test(rest)) continue;
    // A year, or a day of the month: "2024", "Nov 5".
    if (bare && base >= 1900 && base <= 2100) continue;
    if (bare && base <= 31 && MONTH_BEFORE.test(before)) continue;
    // Part of a date like 2026-11-05 or a time like 4:05. A lone "-" before a number is a minus sign, not a date.
    if (/\d[-/:]$/.test(before) || /^[-/:]\d/.test(rest)) continue;
    // Form names and similar: 13F, 10-K, 8-K, 401k. Only when the letter touches the number.
    if (!suffix && /^[a-z]/i.test(rest)) continue;
    if (!suffix && /^-[a-z]/i.test(rest)) continue;
    if (bare && /(s&p|nasdaq|russell|form|top|rule)\s*$/i.test(before)) continue;
    // The top of a scale: "87 of 100", "7 out of 10".
    if (bare && (base === 100 || base === 10) && /\bof\s$/i.test(before)) continue;
    // A bare small count ("3 stocks", "the 2 names") says nothing about the market.
    if (bare && base <= 12) continue;

    const scale = suffix && suffix !== "%" && suffix !== "x" ? SCALE_WORDS[suffix] : undefined;
    const raw = `${match[0]}${suffix === "%" || suffix === "x" ? suffix : suffix ? ` ${suffixMatch![1]}` : ""}`;
    claims.push({ raw, value: scale ? base * scale : base, decimals, scaled: Boolean(scale) });
  }
  return claims;
}

function matches(claim: Claim, known: number): boolean {
  const target = Math.abs(claim.value);
  const have = Math.abs(known);
  if (claim.scaled) {
    // "$3.4 trillion" against 3,412,000,000,000: allow the rounding the unit implies.
    if (have === 0) return target === 0;
    return Math.abs(have - target) / have <= 0.06;
  }
  const factor = 10 ** claim.decimals;
  const tolerance = 0.5 / factor + 1e-9;
  if (Math.abs(have - target) <= tolerance) return true;
  // Fractions shown as percentages: 0.1234 written as 12.3%.
  if (Math.abs(have * 100 - target) <= tolerance) return true;
  return false;
}

/**
 * Check the figures in an answer against the tool results it was written
 * from. A figure counts as traced when some number in a result rounds to it.
 * It is a floor, not a proof: a model can still pair a real number with the
 * wrong label. It does catch a figure that came from nowhere.
 */
export function auditNumbers(answer: string, toolOutputs: unknown[]): NumberAudit {
  const claims = extractClaims(answer);
  if (claims.length === 0) return { checked: 0, traced: 0, untraced: [] };
  const known = collectNumbers(toolOutputs);
  const untraced: string[] = [];
  let traced = 0;
  for (const claim of claims) {
    if (known.some((value) => matches(claim, value))) traced += 1;
    else if (!untraced.includes(claim.raw)) untraced.push(claim.raw);
  }
  return { checked: claims.length, traced, untraced: untraced.slice(0, 12) };
}

/** A message in an Ask conversation: text, tool results, plus the audit and any notice. */
export type AskUIMessage = UIMessage<never, { audit: NumberAudit; notice: { text: string } }>;
