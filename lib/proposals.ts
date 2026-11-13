/**
 * Agent proposals: after a real event on the person's own stocks, the agent drafts one concrete, safe in-app action
 * with the reasoning behind it, and the person accepts or dismisses it.
 *
 * Pure: the rules, the ids, the dedupe and the staleness checks. The reads and the store are in
 * lib/proposals-server.ts, the accept path in lib/proposals-actions.ts.
 *
 * Every number on a proposal comes from the inputs here (alerts, closes, quotes, calls, results, filings, reason
 * checks, agent runs and jobs). Nothing is worded by a model.
 *
 * Stored in `tm_agent_proposals/{uid}__{id}`, where `id` is a hash of the event key, so the same event never makes a
 * second proposal. Additive only: a proposal's own document changes status, nothing else is ever removed.
 */

import { AGENT_TEMPLATES, planMayRun, type AgentCall, type AgentScope, type AgentTrigger } from "@/lib/agent-jobs";
import { daysFromToday, etDayOf, onDayWords, weekdayName } from "@/lib/day-words";
import { can, limitFor, type Plan } from "@/lib/entitlements";
import { quote, risks } from "@/lib/filing-changes/words";
import { firstSentence } from "@/lib/thread/record";
import { basketDrafts, basketStale, type ProposalBasket } from "@/lib/basket-agent/proposals";
import type { BasketChange } from "@/lib/basket-agent/model";
import { thesisBasketOf, thesisDrafts, type ProposalThesis } from "@/lib/thesis-monitor/proposals";

export const PROPOSALS_COLLECTION = "tm_agent_proposals";
export const PROPOSAL_VERSION = 1;
/** Most proposals waiting for one person at once. */
export const MAX_PENDING = 5;
/** A proposal nobody answered goes away after this many days. */
export const EXPIRY_DAYS = 7;
/** Events older than this many days make no new proposal. */
export const EVENT_DAYS = 5;
/** The same idea (the same alert, the same agent) is not proposed again within this many days of the last time. */
export const IDEA_COOLDOWN_DAYS = 14;
/** An accept that never finished (the server stopped mid-way) is released after this long. */
export const APPLYING_STALE_MS = 2 * 60_000;
/** Word budgets (docs/owner-design-rules.md rule 8). */
export const TITLE_MAX_WORDS = 10;
export const WHY_MAX_WORDS = 15;
export const WHY_MAX_LINES = 2;

const DAY_MS = 86_400_000;

/* ── types ──────────────────────────────────────────────────────────────── */

export type ProposalStatus = "pending" | "applying" | "accepted" | "dismissed" | "expired";

export type ProposalKind =
  | "alert_hit"
  | "results"
  | "call_change"
  | "level_reached"
  | "big_move"
  | "filing"
  | "filing_risks"
  | "reason_broken"
  | "earnings_soon"
  | "agent_resume"
  | "agent_pause"
  | "agent_flagged"
  /** An idea basket's agent found a company whose reason broke, or one that now fits better (lib/basket-agent). */
  | "basket_drop"
  | "basket_add"
  /** A thesis's check broke a line on a holding or moved it to a worse status (lib/thesis-monitor): review it. */
  | "thesis_review";

export type ProposalAction =
  /** Set a price alert; with `replaces`, the old alert is turned off once the new one is set (a move). */
  | { type: "alert_price"; ticker: string; instrument_id: string; condition: "below" | "above"; price: number; replaces: { alert_id: string; price: number } | null }
  /** The earnings reminder toggle: records the preference as an earnings_24h alert. */
  | { type: "alert_earnings"; ticker: string; instrument_id: string; report_date: string; label: string }
  | { type: "watch_add"; ticker: string; instrument_id: string }
  | { type: "agent_enable"; job_id: string; job_name: string; enabled: boolean }
  | { type: "agent_create"; template: string; name: string; trigger: AgentTrigger; scope: AgentScope }
  /** Opens the practice ticket filled in; the person still places the order there. */
  | { type: "practice_ticket"; ticker: string; side: "buy" | "sell" }
  /** Takes a company out of, or puts one into, the person's idea basket (lib/basket-agent). Nothing is bought or sold. */
  | {
      type: "basket_edit";
      basket_id: string;
      basket_name: string;
      op: BasketChange["op"];
      ticker: string;
      company: string | null;
      kind: BasketChange["kind"];
      reason: string | null;
    };

/** What the agent read, with the date of each source. */
export type ProposalSource = { label: string; at: string; href: string | null };
/** A number the agent checked. */
export type ProposalFigure = { label: string; value: string };

export type ProposalResult = {
  ok: boolean;
  /** "done", "already", "opened", or the failing path's code ("plan_limit", "pro_required", "agents", "stale", "failed"). */
  code: string;
  /** One line for the card. */
  message: string;
  at: string;
  /** Where to go next (the practice ticket). */
  href?: string | null;
  /** The record the action wrote (an alert id, a job id). */
  ref?: string | null;
};

export type ProposalDraft = {
  kind: ProposalKind;
  ticker: string | null;
  instrument_id: string | null;
  /** The event behind it: `key` is what the id is built from; `refs` name the records it read. */
  event: { key: string; kind: ProposalKind; at: string; refs: string[] };
  /** The action's intent, stable across events ("alert:NVDA:below:135"): the same idea is not proposed twice in a row. */
  idea: string;
  /** The proposal, at most TITLE_MAX_WORDS words. */
  title: string;
  /** Why, at most two lines of at most 15 words. */
  why: string[];
  /** What accepting does, one line. */
  does: string;
  read: ProposalSource[];
  figures: ProposalFigure[];
  action: ProposalAction;
  priority: number;
  /** The stock's quote when the proposal was last worked out: the card's price when a fresh read is slow. */
  quote?: ProposalQuote | null;
  /** The level the proposal is about (the alert's price, the call's own level), for the card's price-vs-level bar. */
  level?: ProposalLevel | null;
  /** A report coming up: the stock's usual move on its reports (percent, unsigned), for the card's range bar. */
  usualPct?: number | null;
};

export type ProposalLevel = { price: number; label: string };

export type Proposal = ProposalDraft & {
  id: string;
  uid: string;
  version: number;
  status: ProposalStatus;
  result: ProposalResult | null;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  updated_at: string;
  expired_reason?: string | null;
};

/* ── inputs ─────────────────────────────────────────────────────────────── */

export type ProposalStock = { ticker: string; instrumentId: string; position: "holding" | "watchlist" };

export type ProposalAlert = {
  id: string;
  ticker: string;
  instrumentId: string;
  kind: string;
  condition: "below" | "above" | null;
  price: number | null;
  /** On, not paused and not fired. */
  live: boolean;
  triggered: boolean;
  triggeredAt: string | null;
  createdAt: string | null;
};

export type ProposalLevels = { add_below: number | null; trim_above?: number | null; locked?: boolean };
export type ProposalCallLog = { call: AgentCall | null; changes: Array<{ date: string; from: AgentCall | null; to: AgentCall }> };
export type ProposalQuote = { price: number; dayPct: number | null; at: string | null };

export type ProposalResultRead = {
  ticker: string;
  reportDate: string;
  movePct: number | null;
  guidance: "raised" | "lowered" | "mixed" | "narrowed" | "reaffirmed" | "issued" | null;
  epsVerdict: string | null;
  epsSurprisePct: number | null;
  revenueVerdict: string | null;
  sources: Array<{ label: string; source?: string | null; at: string | null; url: string | null }>;
};

export type ProposalFiling = { ticker: string; filed_at: string; line: string; url: string | null };

/** A 10-K or 10-Q whose risk factors changed (tm_filing_changes, lib/filing-changes): the company's own headings. */
export type ProposalFilingChange = {
  ticker: string;
  form: "10-K" | "10-Q";
  accession: string;
  /** YYYY-MM-DD. */
  filed: string;
  url: string;
  /** New risk headings, as filed. */
  added: string[];
  dropped: number;
  /** What it was compared with. */
  base: { form: "10-K" | "10-Q"; filed: string; url: string } | null;
  /** A 10-Q that lists only some risks, held against its 10-K. */
  partial?: boolean;
};

export type ProposalReason = {
  verdict: "holds" | "weaker" | "broken" | "played_out";
  /** The day the verdict last changed to what it is now. */
  since: string | null;
  signals: Array<{ text: string; asOf: string; level: string }>;
  /**
   * The person's own measurable line that broke, when one did (lib/thesis-watch/conditions.ts): the why-line names it
   * with its figure, "Revenue growth is 18%, under your 20%.", and "How I got here" shows the dated source.
   */
  condition?: { line: string; source: string; asOf: string | null; href: string | null; label: string; now: string | null } | null;
};

export type ProposalRunFinding = {
  ticker: string | null;
  headline: string;
  kind?: string;
  change_pct?: number;
  close?: number;
  url?: string | null;
  source?: string;
  at?: string;
};

export type ProposalRun = { id: string; job_id: string; job_name: string; day: string; ran_at: string; decision: "notify" | "nothing" | "could_not_check"; findings: ProposalRunFinding[] };

export type ProposalJob = { id: string; name: string; enabled: boolean; trigger: AgentTrigger; scope: AgentScope };

export type ProposalUpcoming = { ticker: string; date: string; session: "bmo" | "amc" | "unknown"; usualPct: number | null };

/**
 * Everything the rules read. A field left undefined (or null) is a read that failed or ran out of time: the rules that
 * need it make nothing, and staleness checks that need it keep the proposal as it is.
 */
export type ProposalInputs = {
  now: Date;
  /** New York day. */
  today: string;
  plan: Plan;
  stocks: ProposalStock[];
  levels?: Record<string, ProposalLevels> | null;
  calls?: Record<string, ProposalCallLog> | null;
  /** Daily closes per ticker, oldest first. */
  series?: Record<string, ReadonlyArray<{ date: string; close: number }>> | null;
  quotes?: Record<string, ProposalQuote> | null;
  alerts?: ProposalAlert[] | null;
  results?: ProposalResultRead[] | null;
  filings?: ProposalFiling[] | null;
  /** Filings whose risk factors changed, on the person's stocks. */
  filingChanges?: ProposalFilingChange[] | null;
  reasons?: Record<string, ProposalReason> | null;
  runs?: ProposalRun[] | null;
  jobs?: ProposalJob[] | null;
  upcoming?: ProposalUpcoming[] | null;
  /** Shares held in the practice account, by ticker: a practice sale is only offered for a stock it holds. */
  practice?: Record<string, number> | null;
  /** The person's idea baskets with their recent checks (lib/basket-agent). */
  baskets?: ProposalBasket[] | null;
  /** The person's theses with their latest check (lib/thesis-monitor). */
  theses?: ProposalThesis[] | null;
};

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const numOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/**
 * One stored alert as the rules read it. A fired alert is `triggered: true` and `active: false` (both alert jobs write
 * that together, with `updated_at` equal to `triggered_at`: backend/price_alerts.py mark_alert_triggered,
 * backend/mail/jobs.py _mark_fired). One the person turned off after it fired has a later `updated_at` and is left out.
 */
export function alertFromDoc(id: string, data: Record<string, unknown>): ProposalAlert {
  const paused = typeof data.paused_reason === "string" && data.paused_reason.length > 0;
  const triggeredAt = str(data.triggered_at) || null;
  const touchedAfter = typeof data.updated_at === "string" && Boolean(triggeredAt) && data.updated_at !== triggeredAt;
  return {
    id,
    ticker: str(data.ticker).toUpperCase(),
    instrumentId: str(data.instrument_id),
    kind: str(data.kind) || "price_threshold",
    condition: data.condition === "below" || data.condition === "above" ? data.condition : null,
    price: numOrNull(data.target_price),
    live: data.active !== false && data.triggered !== true && !paused,
    triggered: data.triggered === true && !touchedAfter,
    triggeredAt,
    createdAt: str(data.created_at) || null,
  };
}

/* ── ids and words ──────────────────────────────────────────────────────── */

/** FNV-1a, twice with different seeds: a short stable id from the event key, the same on every server. */
function fnv(text: string, seed: number): string {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function proposalId(eventKey: string): string {
  return `${fnv(eventKey, 0x811c9dc5)}${fnv(eventKey, 0x01000193 ^ 0x5bd1e995)}`;
}

export const PROPOSAL_ID_RE = /^[0-9a-f]{16}$/;

export function proposalDocId(uid: string, id: string): string {
  return `${uid}__${id}`;
}

export const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/** "$158", "$139.80", "$1,240": whole dollars stay whole. */
export function usd(value: number): string {
  const whole = Math.abs(value - Math.round(value)) < 0.005;
  const digits = whole ? 0 : Math.abs(value) < 1 ? 4 : 2;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: digits })}`;
}

export function signedPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toFixed(1)}%`;
}

/** A made-up step level (5% from the price) as an alert holds it: whole dollars from $50, cents from $1, else 4 places. */
export function roundLevel(value: number): number {
  if (value >= 50) return Math.round(value);
  if (value >= 1) return Math.round(value * 100) / 100;
  return Math.round(value * 10_000) / 10_000;
}

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const CALL_WORD: Record<AgentCall, string> = { Add: "Buy more", Hold: "Keep", Trim: "Sell some" };

/** The New York day of a day or a time: an 8 PM ET filing is that day, not the next UTC one. */
function dayOf(at: string | null | undefined): string | null {
  return at ? etDayOf(at) : null;
}

function recent(day: string | null, today: string, days = EVENT_DAYS): boolean {
  if (!day) return false;
  const gap = daysFromToday(day, today);
  return gap !== null && gap <= 0 && gap >= -days;
}

/* ── prices and levels ──────────────────────────────────────────────────── */

type PricePoint = { price: number; at: string; source: "quote" | "close" };

/** The latest price: the live quote when there is one, else the last stored close. */
export function latestPrice(inputs: ProposalInputs, ticker: string): PricePoint | null {
  const quote = inputs.quotes?.[ticker];
  if (quote && fin(quote.price) && quote.price > 0) return { price: quote.price, at: quote.at ?? inputs.today, source: "quote" };
  const series = inputs.series?.[ticker];
  const last = series && series.length > 0 ? series[series.length - 1] : null;
  return last && fin(last.close) && last.close > 0 ? { price: last.close, at: last.date, source: "close" } : null;
}

const RANGE_SESSIONS = 60;
/** A level must be at least this far from the price to be worth an alert. */
const LEVEL_GAP = 0.02;
const FALLBACK_STEP = 0.05;

export type LevelPick = { price: number; basis: "buy_more" | "sell_some" | "low_60" | "high_60" | "step"; words: string };

function closesOf(inputs: ProposalInputs, ticker: string): number[] {
  return (inputs.series?.[ticker] ?? []).slice(-RANGE_SESSIONS).map((point) => point.close).filter((close) => fin(close) && close > 0);
}

function openLevels(inputs: ProposalInputs, ticker: string): ProposalLevels | null {
  const levels = inputs.levels?.[ticker];
  return levels && !levels.locked ? levels : null;
}

/** The nearest meaningful level under the price: its buy-more level or its 60-day low, else 5% under. */
export function levelBelow(inputs: ProposalInputs, ticker: string, price: number): LevelPick {
  const options: LevelPick[] = [];
  const add = openLevels(inputs, ticker)?.add_below;
  if (fin(add) && add > 0) options.push({ price: add, basis: "buy_more", words: "its buy-more level" });
  const closes = closesOf(inputs, ticker);
  if (closes.length >= 20) options.push({ price: Math.min(...closes), basis: "low_60", words: "its 60-day low" });
  const fits = options.filter((option) => option.price <= price * (1 - LEVEL_GAP)).sort((a, b) => b.price - a.price);
  // A real level (the call's own, the 60-day low) stays exact, as the stock page prints it; only the step is rounded.
  return fits[0] ?? { price: roundLevel(price * (1 - FALLBACK_STEP)), basis: "step", words: "5% under the price" };
}

/** The nearest meaningful level over the price: its sell-some level or its 60-day high, else 5% over. */
export function levelAbove(inputs: ProposalInputs, ticker: string, price: number): LevelPick {
  const options: LevelPick[] = [];
  const trim = openLevels(inputs, ticker)?.trim_above;
  if (fin(trim) && trim > 0) options.push({ price: trim, basis: "sell_some", words: "its sell-some level" });
  const closes = closesOf(inputs, ticker);
  if (closes.length >= 20) options.push({ price: Math.max(...closes), basis: "high_60", words: "its 60-day high" });
  const fits = options.filter((option) => option.price >= price * (1 + LEVEL_GAP)).sort((a, b) => a.price - b.price);
  return fits[0] ?? { price: roundLevel(price * (1 + FALLBACK_STEP)), basis: "step", words: "5% over the price" };
}

/**
 * Whether a new price alert (not a move) fits the plan: Free keeps a few live ones. A proposal whose action could only
 * fail on the limit is not made; a move frees its own slot, so it always fits.
 */
function roomForAlert(inputs: ProposalInputs): boolean {
  const limit = limitFor("price_alerts", inputs.plan);
  if (!Number.isFinite(limit)) return true;
  return (inputs.alerts ?? []).filter((alert) => alert.live && (alert.kind === "price_threshold" || alert.kind === "")).length < limit;
}

/** Whether one more agent can run on this plan (the jobs read is needed to say). */
function roomForAgent(inputs: ProposalInputs): boolean {
  if (!inputs.jobs) return false;
  // Idea baskets that are switched on take the same slots (lib/basket-agent). A read that failed (null) means no room
  // can be promised; baskets the caller did not read at all (undefined) count as none.
  if (inputs.baskets === null) return false;
  const baskets = inputs.baskets?.filter((basket) => basket.enabled).length ?? 0;
  return inputs.jobs.filter((job) => job.enabled).length + baskets < limitFor("agents", inputs.plan);
}

/** "The next level down is $131.20, its 60-day low." */
function nextLine(next: LevelPick, way: "down" | "up"): string {
  return `The next level ${way} is ${usd(next.price)}, ${next.words}.`;
}

/** "on Monday", "yesterday"; the day itself when it has no words (never an empty gap in a sentence). */
function onDay(day: string, today: string): string {
  return onDayWords(day, today) || `on ${day}`;
}

function priceAlerts(inputs: ProposalInputs, ticker: string): ProposalAlert[] {
  return (inputs.alerts ?? []).filter((alert) => alert.ticker === ticker && (alert.kind === "price_threshold" || alert.kind === ""));
}

/** A live price alert on this side within 1% of the level: the alert is already there. */
function hasAlertNear(inputs: ProposalInputs, ticker: string, condition: "below" | "above", level: number): boolean {
  return priceAlerts(inputs, ticker).some((alert) => alert.live && alert.condition === condition && fin(alert.price) && Math.abs(alert.price - level) / level <= 0.01);
}

function liveAlertOn(inputs: ProposalInputs, ticker: string, condition: "below" | "above"): ProposalAlert | null {
  return priceAlerts(inputs, ticker).filter((alert) => alert.live && alert.condition === condition && fin(alert.price)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] ?? null;
}

export function priceFigures(ticker: string, point: PricePoint, inputs: ProposalInputs): ProposalFigure[] {
  const quote = inputs.quotes?.[ticker];
  const out: ProposalFigure[] = [{ label: "Price", value: usd(point.price) }];
  if (point.source === "quote" && quote && fin(quote.dayPct)) out.push({ label: "Today", value: signedPct(quote.dayPct) });
  return out;
}

/**
 * The levels the agent weighed on the side the proposal acts on (owner rule: a call shows only its own level): under
 * the price, the buy-more level and the 60-day low; over it, the sell-some level and the 60-day high.
 */
export function levelFigures(inputs: ProposalInputs, ticker: string, side: "below" | "above"): ProposalFigure[] {
  const out: ProposalFigure[] = [];
  const levels = openLevels(inputs, ticker);
  if (side === "below" && fin(levels?.add_below)) out.push({ label: "Buy-more level", value: usd(levels!.add_below!) });
  if (side === "above" && fin(levels?.trim_above)) out.push({ label: "Sell-some level", value: usd(levels!.trim_above!) });
  const closes = closesOf(inputs, ticker);
  if (closes.length >= 20) out.push(side === "below" ? { label: "60-day low", value: usd(Math.min(...closes)) } : { label: "60-day high", value: usd(Math.max(...closes)) });
  return out;
}

export function priceSource(ticker: string, point: PricePoint): ProposalSource {
  return point.source === "quote"
    ? { label: `${ticker} latest price`, at: point.at, href: `/stock/${encodeURIComponent(ticker)}` }
    : { label: `${ticker} last close`, at: point.at, href: `/stock/${encodeURIComponent(ticker)}` };
}

export function seriesSource(inputs: ProposalInputs, ticker: string): ProposalSource[] {
  const series = inputs.series?.[ticker];
  const last = series && series.length > 0 ? series[series.length - 1] : null;
  return last ? [{ label: `${ticker} daily closes, last 60 sessions`, at: last.date, href: `/stock/${encodeURIComponent(ticker)}` }] : [];
}

export function alertAction(ticker: string, instrumentId: string, condition: "below" | "above", price: number, replaces: ProposalAlert | null): ProposalAction {
  return {
    type: "alert_price",
    ticker,
    instrument_id: instrumentId,
    condition,
    price,
    replaces: replaces && fin(replaces.price) ? { alert_id: replaces.id, price: replaces.price } : null,
  };
}

export function alertDoes(ticker: string, condition: "below" | "above", price: number, replaces: ProposalAlert | null): string {
  const side = condition === "below" ? "falls to" : "rises to";
  return replaces && fin(replaces.price)
    ? `Turns off your ${usd(replaces.price)} alert and emails you if ${ticker} ${side} ${usd(price)}.`
    : `Emails you if ${ticker} ${side} ${usd(price)}.`;
}

/**
 * A set-or-move alert proposal's title: the action alone ("Set an alert on ASTS at $33.66"). What set it off is the
 * card's one line, so the title never says it a second time (owner rule 8).
 */
function alertTitle(ticker: string, price: number, replaces: ProposalAlert | null): string {
  return replaces ? `Move ${ticker}'s ${usd(replaces.price!)} alert to ${usd(price)}` : `Set an alert on ${ticker} at ${usd(price)}`;
}

function stockOf(inputs: ProposalInputs, ticker: string): ProposalStock | null {
  return inputs.stocks.find((stock) => stock.ticker === ticker) ?? null;
}

const stockHref = (ticker: string) => `/stock/${encodeURIComponent(ticker)}`;

/* ── rules ──────────────────────────────────────────────────────────────── */

/**
 * A price alert that fired (the alert job marks it triggered and turns it off) while the price is still past it: set
 * the next one at the next level. A live alert is never touched before it has emailed.
 */
function alertRules(inputs: ProposalInputs): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  if (!roomForAlert(inputs)) return out;
  for (const alert of inputs.alerts ?? []) {
    if (alert.kind !== "price_threshold" && alert.kind !== "") continue;
    if (!alert.condition || !fin(alert.price) || alert.price <= 0) continue;
    const firedDay = dayOf(alert.triggeredAt);
    if (!alert.triggered || !firedDay || !recent(firedDay, inputs.today)) continue;
    const point = latestPrice(inputs, alert.ticker);
    if (!point) continue;
    const past = alert.condition === "below" ? point.price <= alert.price : point.price >= alert.price;
    if (!past) continue;
    const next = alert.condition === "below" ? levelBelow(inputs, alert.ticker, point.price) : levelAbove(inputs, alert.ticker, point.price);
    if (hasAlertNear(inputs, alert.ticker, alert.condition, next.price)) continue;
    const ticker = alert.ticker;
    const way = alert.condition === "below" ? "down" : "up";
    out.push({
      kind: "alert_hit",
      ticker,
      instrument_id: alert.instrumentId,
      // One proposal per firing: the step level moves with every quote, so it is not in the key. The follow-up alert,
      // once it fires, has its own id and makes its own proposal.
      event: { key: `alert:${alert.id}:${alert.triggeredAt}`, kind: "alert_hit", at: alert.triggeredAt ?? point.at, refs: [`tm_alerts/${alert.id}`] },
      idea: `alert:${ticker}:${alert.condition}:${next.price}`,
      // The action alone: which alert fired is the line under it (owner rule 8, judge 89).
      title: `Move ${ticker}'s alert ${way} to ${usd(next.price)}`,
      why: [`${ticker} hit your ${usd(alert.price)} alert ${onDay(firedDay, inputs.today)} and is at ${usd(point.price)}.`, nextLine(next, way)],
      does: `Emails you if ${ticker} ${alert.condition === "below" ? "falls" : "rises"} to ${usd(next.price)}. Your ${usd(alert.price)} alert already fired.`,
      read: [
        { label: `Your ${ticker} alert ${alert.condition} ${usd(alert.price)}`, at: alert.triggeredAt ?? alert.createdAt ?? inputs.today, href: "/portfolio?tab=alerts" },
        priceSource(ticker, point),
        ...seriesSource(inputs, ticker),
      ],
      figures: [
        ...priceFigures(ticker, point, inputs),
        { label: `Your alert (${alert.condition})`, value: usd(alert.price) },
        ...levelFigures(inputs, ticker, alert.condition),
        { label: "New alert", value: usd(next.price) },
      ],
      action: alertAction(ticker, alert.instrumentId, alert.condition, next.price, null),
      priority: 85,
    });
  }
  return out;
}

/**
 * Results that came out with a hard reaction (a drop of 5% or more, or lowered guidance): set or move the alert under
 * the stock to the next level, so the person hears if it keeps falling.
 */
function resultsRules(inputs: ProposalInputs): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  // Without the person's alerts there is no knowing whether one is already set: no alert proposal at all.
  if (!inputs.alerts) return out;
  for (const read of inputs.results ?? []) {
    const stock = stockOf(inputs, read.ticker);
    if (!stock || !recent(read.reportDate, inputs.today)) continue;
    const cut = read.guidance === "lowered";
    const drop = fin(read.movePct) && read.movePct <= -5;
    if (!cut && !drop) continue;
    const point = latestPrice(inputs, read.ticker);
    if (!point) continue;
    const ticker = read.ticker;
    const next = levelBelow(inputs, ticker, point.price);
    const replaces = alertUnder(inputs, ticker, point.price, next);
    if (replaces === false) continue;
    // One sentence (owner rule 8), the earnings surprise folded in: "ASTS reported on Monday, missed on earnings by
    // 7.3% and fell 8.7%."
    const surprise = read.epsVerdict === "miss" || read.epsVerdict === "beat" ? read.epsVerdict : null;
    const did = [
      `reported ${onDay(read.reportDate, inputs.today)}`,
      ...(cut ? ["lowered its guidance"] : []),
      ...(surprise ? [`${surprise === "miss" ? "missed" : "beat"} on earnings${fin(read.epsSurprisePct) ? ` by ${Math.abs(Math.round(read.epsSurprisePct * 10) / 10)}%` : ""}`] : []),
      ...(fin(read.movePct) ? [`${read.movePct < 0 ? "fell" : "rose"} ${Math.abs(Math.round(read.movePct * 10) / 10)}%`] : []),
    ];
    out.push({
      kind: "results",
      ticker,
      instrument_id: stock.instrumentId,
      event: { key: `results:${ticker}:${read.reportDate}`, kind: "results", at: read.reportDate, refs: [`results/${ticker}/${read.reportDate}`] },
      idea: `alert:${ticker}:below:${next.price}`,
      // The action alone; the line under it says what happened (owner rule 8, judge 89).
      title: alertTitle(ticker, next.price, replaces),
      why: [`${ticker} ${listWords(did)}.`, nextLine(next, "down")],
      does: alertDoes(ticker, "below", next.price, replaces),
      read: [
        ...read.sources.slice(0, 4).map((source) => ({ label: resultSourceWords(ticker, source), at: source.at ?? read.reportDate, href: source.url })),
        priceSource(ticker, point),
        ...seriesSource(inputs, ticker),
      ],
      figures: [
        ...priceFigures(ticker, point, inputs),
        ...(fin(read.movePct) ? [{ label: "Move on the report", value: signedPct(read.movePct) }] : []),
        ...(read.guidance ? [{ label: "Guidance", value: capital(read.guidance) }] : []),
        ...(read.epsVerdict ? [{ label: "Earnings per share", value: `${capital(read.epsVerdict)}${fin(read.epsSurprisePct) ? ` (${signedPct(read.epsSurprisePct)})` : ""}` }] : []),
        ...(read.revenueVerdict ? [{ label: "Revenue", value: capital(read.revenueVerdict) }] : []),
        ...(replaces ? [{ label: "Your alert (below)", value: usd(replaces.price!) }] : []),
        ...levelFigures(inputs, ticker, "below"),
        { label: "New alert", value: usd(next.price) },
      ],
      action: alertAction(ticker, stock.instrumentId, "below", next.price, replaces),
      priority: 80,
    });
  }
  return out;
}

/** A results source in words: "NVDA earnings against the estimate (Yahoo Finance)", "Our call on NVDA, reviewed". */
function resultSourceWords(ticker: string, source: ProposalResultRead["sources"][number]): string {
  const words: Record<string, string> = {
    "EPS and estimate": `${ticker} earnings against the estimate`,
    "Revenue and outlook": `${ticker} revenue and outlook`,
    Revenue: `${ticker} revenue`,
    Outlook: `${ticker} outlook`,
    Move: `${ticker} move on the report`,
    "Call reviewed": `Our call on ${ticker}, reviewed`,
  };
  const label = words[source.label] ?? `${ticker} ${source.label}`;
  return source.source ? `${label} (${source.source})` : label;
}

/** "a", "a and b", "a, b and c". */
function listWords(parts: string[]): string {
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The live alert under the price a set-or-move proposal would move (null: set a new one), or false when nothing should
 * be proposed: an alert already sits at the level (within 1%) or close to it (within 3%), or a new one would not fit
 * the plan.
 */
export function alertUnder(inputs: ProposalInputs, ticker: string, price: number, next: LevelPick): ProposalAlert | null | false {
  if (hasAlertNear(inputs, ticker, "below", next.price)) return false;
  const existing = liveAlertOn(inputs, ticker, "below");
  const under = existing && existing.price! < price ? existing : null;
  if (under && Math.abs(under.price! - next.price) / next.price <= 0.03) return false;
  if (!under && !roomForAlert(inputs)) return false;
  return under;
}

function capital(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

/**
 * Our call changed: to Buy more, an alert at its buy-more level (or, already under it, a practice buy); to Sell some
 * on a holding, an alert at its sell-some level (or, already over it, a practice sale).
 */
function callRules(inputs: ProposalInputs): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  for (const stock of inputs.stocks) {
    const log = inputs.calls?.[stock.ticker];
    const levels = openLevels(inputs, stock.ticker);
    if (!log || !levels) continue;
    const change = [...log.changes].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!change || !recent(change.date, inputs.today) || change.to !== log.call) continue;
    const ticker = stock.ticker;
    const point = latestPrice(inputs, ticker);
    if (!point) continue;
    const base = {
      kind: "call_change" as const,
      ticker,
      instrument_id: stock.instrumentId,
      event: { key: `call:${ticker}:${change.date}:${change.to}`, kind: "call_change" as const, at: change.date, refs: [`tm_call_stability/${stock.instrumentId}`] },
      read: [{ label: `Our call on ${ticker}`, at: change.date, href: stockHref(ticker) }, priceSource(ticker, point)],
      priority: 75,
    };
    const moved = `Our call on ${ticker} moved to ${CALL_WORD[change.to]} ${onDay(change.date, inputs.today)}.`;
    const callFigures: ProposalFigure[] = [
      ...(change.from ? [{ label: "Call before", value: CALL_WORD[change.from] }] : []),
      { label: "Call now", value: CALL_WORD[change.to] },
      ...priceFigures(ticker, point, inputs),
    ];
    // The call's own level, exact, as the stock page prints it.
    if (change.to === "Add" && fin(levels.add_below)) {
      const level = levels.add_below;
      if (point.price > level) {
        if (!inputs.alerts || hasAlertNear(inputs, ticker, "below", level) || !roomForAlert(inputs)) continue;
        const gap = ((point.price - level) / point.price) * 100;
        out.push({
          ...base,
          idea: `alert:${ticker}:below:${level}`,
          title: `Set an alert at ${ticker}'s ${usd(level)} buy-more level`,
          why: [moved, `It's at ${usd(point.price)}, ${Math.round(gap * 10) / 10}% above that level.`],
          does: alertDoes(ticker, "below", level, null),
          figures: [...callFigures, { label: "Buy-more level", value: usd(level) }],
          action: alertAction(ticker, stock.instrumentId, "below", level, null),
        });
      } else {
        out.push({
          ...base,
          idea: `practice:${ticker}:buy`,
          title: `Try buying ${ticker} in your practice account`,
          why: [moved, `It's at ${usd(point.price)}, under its ${usd(level)} buy-more level.`],
          does: `Opens a practice ticket to buy ${ticker}.`,
          figures: [...callFigures, { label: "Buy-more level", value: usd(level) }],
          action: { type: "practice_ticket", ticker, side: "buy" },
          level: { price: level, label: "Buy-more level" },
        });
      }
    } else if (change.to === "Trim" && stock.position === "holding" && fin(levels.trim_above)) {
      const level = levels.trim_above;
      if (point.price < level) {
        if (!inputs.alerts || hasAlertNear(inputs, ticker, "above", level) || !roomForAlert(inputs)) continue;
        out.push({
          ...base,
          idea: `alert:${ticker}:above:${level}`,
          title: `Set an alert at ${ticker}'s ${usd(level)} sell-some level`,
          why: [moved, `It's at ${usd(point.price)}, under that level.`],
          does: alertDoes(ticker, "above", level, null),
          figures: [...callFigures, { label: "Sell-some level", value: usd(level) }],
          action: alertAction(ticker, stock.instrumentId, "above", level, null),
        });
      } else if (practiceHolds(inputs, ticker)) {
        out.push({
          ...base,
          idea: `practice:${ticker}:sell`,
          title: `Try selling some ${ticker} in your practice account`,
          why: [moved, `It's at ${usd(point.price)}, over its ${usd(level)} sell-some level.`],
          does: `Opens a practice ticket to sell ${ticker}.`,
          figures: [...callFigures, { label: "Sell-some level", value: usd(level) }],
          action: { type: "practice_ticket", ticker, side: "sell" },
          level: { price: level, label: "Sell-some level" },
        });
      }
    }
  }
  return out;
}

/** Whether the practice account holds this stock: a practice sale is only offered then. */
function practiceHolds(inputs: ProposalInputs, ticker: string): boolean {
  return (inputs.practice?.[ticker] ?? 0) > 0;
}

/** The first close inside the zone after one outside it, within the last EVENT_DAYS sessions. */
function crossing(series: ReadonlyArray<{ date: string; close: number }>, inside: (close: number) => boolean): { date: string; close: number } | null {
  const tail = series.slice(-(EVENT_DAYS + 1));
  if (tail.length < 2 || !inside(tail[tail.length - 1]!.close)) return null;
  for (let index = tail.length - 1; index > 0; index -= 1) {
    if (inside(tail[index]!.close) && !inside(tail[index - 1]!.close)) return tail[index]!;
  }
  return null;
}

/** A close crossed into the call's own zone: under the buy-more level on a Buy more call, over the sell-some level on a Sell some holding. */
function levelRules(inputs: ProposalInputs): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  for (const stock of inputs.stocks) {
    const ticker = stock.ticker;
    const levels = openLevels(inputs, ticker);
    const call = inputs.calls?.[ticker]?.call ?? null;
    const series = inputs.series?.[ticker];
    if (!levels || !series || !call) continue;
    const point = latestPrice(inputs, ticker);
    if (!point) continue;
    let zone: { side: "buy" | "sell"; level: number; cross: { date: string; close: number } } | null = null;
    if (call === "Add" && fin(levels.add_below)) {
      const level = levels.add_below;
      const cross = crossing(series, (close) => close <= level);
      if (cross && point.price <= level) zone = { side: "buy", level, cross };
    } else if (call === "Trim" && stock.position === "holding" && fin(levels.trim_above) && practiceHolds(inputs, ticker)) {
      const level = levels.trim_above;
      const cross = crossing(series, (close) => close >= level);
      if (cross && point.price >= level) zone = { side: "sell", level, cross };
    }
    // A stale series can end weeks ago: only a crossing in the last few days is news.
    if (!zone || !recent(zone.cross.date, inputs.today)) continue;
    const words = zone.side === "buy" ? "buy-more" : "sell-some";
    out.push({
      kind: "level_reached",
      ticker,
      instrument_id: stock.instrumentId,
      event: { key: `level:${ticker}:${zone.side}:${zone.cross.date}`, kind: "level_reached", at: zone.cross.date, refs: [`tm_price_history_daily/${ticker}`] },
      idea: `practice:${ticker}:${zone.side}`,
      title: zone.side === "buy" ? `Try buying ${ticker} in your practice account` : `Try selling some ${ticker} in your practice account`,
      why: [
        // A close that is the level itself says the figure once.
        usd(zone.cross.close) === usd(zone.level)
          ? `${ticker} closed at its ${usd(zone.level)} ${words} level ${onDay(zone.cross.date, inputs.today)}.`
          : `${ticker} closed at ${usd(zone.cross.close)} ${onDay(zone.cross.date, inputs.today)}, ${zone.side === "buy" ? "under" : "over"} its ${usd(zone.level)} ${words} level.`,
        `Our call on it is ${CALL_WORD[call]}.`,
      ],
      does: `Opens a practice ticket to ${zone.side} ${ticker}.`,
      read: [{ label: `Our call on ${ticker}`, at: inputs.today, href: stockHref(ticker) }, priceSource(ticker, point), ...seriesSource(inputs, ticker)],
      figures: [
        ...priceFigures(ticker, point, inputs),
        { label: "Close that crossed", value: usd(zone.cross.close) },
        { label: zone.side === "buy" ? "Buy-more level" : "Sell-some level", value: usd(zone.level) },
        { label: "Call", value: CALL_WORD[call] },
      ],
      action: { type: "practice_ticket", ticker, side: zone.side },
      level: { price: zone.level, label: zone.side === "buy" ? "Buy-more level" : "Sell-some level" },
      priority: 70,
    });
  }
  return out;
}

const MOVE_KINDS = new Set(["move", "mover"]);

/** A big drop an agent flagged with a sourced reason: an alert under the stock at the next level. */
function moveRules(inputs: ProposalInputs): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  if (!inputs.alerts) return out;
  for (const run of inputs.runs ?? []) {
    if (run.decision !== "notify" || !recent(run.day, inputs.today)) continue;
    for (const finding of run.findings) {
      const ticker = finding.ticker?.toUpperCase() ?? "";
      const stock = ticker ? stockOf(inputs, ticker) : null;
      // A confirmed reason: the finding links the story it came from.
      if (!stock || !MOVE_KINDS.has(finding.kind ?? "") || !fin(finding.change_pct) || finding.change_pct > -5 || !finding.url) continue;
      const point = latestPrice(inputs, ticker);
      if (!point) continue;
      const next = levelBelow(inputs, ticker, point.price);
      const replaces = alertUnder(inputs, ticker, point.price, next);
      if (replaces === false) continue;
      const day = dayOf(finding.at) ?? run.day;
      out.push({
        kind: "big_move",
        ticker,
        instrument_id: stock.instrumentId,
        event: { key: `move:${ticker}:${day}`, kind: "big_move", at: day, refs: [`tm_agent_runs/${run.id}`] },
        idea: `alert:${ticker}:below:${next.price}`,
        title: alertTitle(ticker, next.price, replaces),
        why: [
          `${ticker} fell ${Math.abs(Math.round(finding.change_pct * 10) / 10)}% ${onDay(day, inputs.today)}, with a reason your agent found.`,
          nextLine(next, "down"),
        ],
        does: alertDoes(ticker, "below", next.price, replaces),
        read: [
          { label: `${run.job_name}: ${ticker} move`, at: run.ran_at || run.day, href: null },
          { label: finding.source ? `${finding.source} story` : "The story behind it", at: day, href: finding.url },
          priceSource(ticker, point),
          ...seriesSource(inputs, ticker),
        ],
        figures: [
          ...priceFigures(ticker, point, inputs),
          { label: "Move", value: signedPct(finding.change_pct) },
          ...(replaces ? [{ label: "Your alert (below)", value: usd(replaces.price!) }] : []),
          ...levelFigures(inputs, ticker, "below"),
          { label: "New alert", value: usd(next.price) },
        ],
        action: alertAction(ticker, stock.instrumentId, "below", next.price, replaces),
        priority: 65,
      });
    }
  }
  return out;
}

const SEC_TEMPLATE = AGENT_TEMPLATES.find((template) => template.id === "sec-filing");

function jobCovers(job: ProposalJob, ticker: string, tracked: boolean): boolean {
  if (job.scope.kind === "any") return true;
  if (job.scope.kind === "watchlist") return tracked;
  return job.scope.tickers.map((entry) => entry.toUpperCase()).includes(ticker);
}

const isFilingJob = (job: ProposalJob) => job.trigger.type === "event" && job.trigger.event === "sec_filing";

/** A major filing on a stock no agent reads filings for: turn the paused filings agent back on, or set one up. */
function filingRules(inputs: ProposalInputs): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  if (!inputs.jobs) return out;
  for (const filing of inputs.filings ?? []) {
    const ticker = filing.ticker.toUpperCase();
    const stock = stockOf(inputs, ticker);
    const day = dayOf(filing.filed_at);
    if (!stock || !recent(day, inputs.today)) continue;
    const covering = inputs.jobs.filter((job) => isFilingJob(job) && jobCovers(job, ticker, true));
    if (covering.some((job) => job.enabled)) continue;
    const trigger: AgentTrigger = { type: "event", event: "sec_filing" };
    // Only when the plan can run it now: a proposal whose agent would be saved paused can only disappoint.
    if (!planMayRun({ trigger }, inputs.plan) || !roomForAgent(inputs)) continue;
    const said = filingSaid(ticker, filing.line, day!, inputs.today);
    const paused = covering[0] ?? null;
    const base = {
      kind: "filing" as const,
      ticker,
      instrument_id: stock.instrumentId,
      event: { key: `filing:${ticker}:${filing.filed_at}`, kind: "filing" as const, at: filing.filed_at, refs: [`filings/${ticker}/${filing.filed_at}`] },
      read: [
        { label: `${ticker} SEC filing`, at: filing.filed_at, href: filing.url },
        { label: "Your agents", at: inputs.today, href: "/agents" },
      ],
      priority: 50,
    };
    if (paused) {
      out.push({
        ...base,
        idea: `agent_enable:${paused.id}:true`,
        title: `Turn your filings agent back on for ${ticker}`,
        why: [said, `Your agent "${clipWords(paused.name, 5)}" that reads filings is paused.`],
        does: `Turns on "${clipWords(paused.name, 6)}" so it reads every new filing.`,
        figures: [{ label: "Form", value: filingForm(filing.line) }, { label: "Agent", value: "Paused" }],
        action: { type: "agent_enable", job_id: paused.id, job_name: paused.name, enabled: true },
      });
    } else if (SEC_TEMPLATE) {
      out.push({
        ...base,
        idea: "agent_create:sec-filing",
        title: `Set up an agent that reads ${ticker}'s SEC filings`,
        why: [said, "None of your agents reads filings yet."],
        does: "Adds the SEC filings agent for all your stocks. It tells you, never trades.",
        figures: [{ label: "Form", value: filingForm(filing.line) }, { label: "Filings agents", value: "0" }],
        action: { type: "agent_create", template: SEC_TEMPLATE.defaults.template, name: SEC_TEMPLATE.defaults.name, trigger: SEC_TEMPLATE.defaults.trigger, scope: { kind: "watchlist" } },
      });
    }
  }
  return out;
}

/** "Yesterday, NVDA filed an 8-K on a new material agreement." / "An investor reported an active stake in NVDA today." */
export function filingSaid(ticker: string, line: string, day: string, today: string): string {
  const when = onDay(day, today);
  if (/active stake/i.test(line)) return `An investor reported an active stake in ${ticker} ${when}.`;
  return `${capital(when)}, ${ticker} ${lowerFirst(line)}.`;
}

function filingForm(line: string): string {
  if (/8-K/.test(line)) return "8-K";
  const match = /\((10-K|10-Q|[0-9A-Z/-]+)\)/.exec(line);
  if (match) return match[1]!;
  if (/active stake/i.test(line)) return "13D";
  return "Filing";
}

function lowerFirst(text: string): string {
  return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
}

function clipWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length <= max ? words.join(" ") : `${words.slice(0, max).join(" ")}…`;
}

/**
 * A reason check that turned broken on a holding: an alert under the price, so the person hears if it keeps falling.
 * The holding itself is never moved or changed.
 */
function reasonRules(inputs: ProposalInputs): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  if (!inputs.alerts) return out;
  for (const stock of inputs.stocks) {
    const reason = inputs.reasons?.[stock.ticker];
    if (!reason || reason.verdict !== "broken" || stock.position !== "holding" || !recent(reason.since, inputs.today, EXPIRY_DAYS)) continue;
    const ticker = stock.ticker;
    const point = latestPrice(inputs, ticker);
    const hard = reason.signals.filter((signal) => signal.level === "hard");
    const read: ProposalSource[] = [
      { label: `Your reason check on ${ticker}`, at: reason.since!, href: `${stockHref(ticker)}#reason` },
      ...hard.slice(0, 3).map((signal) => ({ label: clipWords(signal.text, 14), at: signal.asOf || reason.since!, href: null })),
    ];
    const line = reason.condition ?? null;
    const brokeWhen = line?.line ?? `Your reason check on ${ticker} turned broken ${onDay(reason.since!, inputs.today)}.`;
    const base = {
      kind: "reason_broken" as const,
      ticker,
      instrument_id: stock.instrumentId,
      event: { key: `reason:${ticker}:${reason.since}`, kind: "reason_broken" as const, at: reason.since!, refs: [`tm_thesis_checks/${stock.instrumentId}`] },
      priority: 90,
    };
    const figures: ProposalFigure[] = [
      { label: "Reason check", value: "Broken" },
      ...(line?.now ? [{ label: line.label, value: line.now }] : [{ label: "Hard signals", value: String(hard.length) }]),
    ];
    if (line) {
      // The broken line's own signal is said by its dated source; it is not listed a second time.
      const own = read.findIndex((source) => source.label === clipWords(line.line, 14));
      if (own > 0) read.splice(own, 1);
      read.splice(1, 0, { label: line.source, at: line.asOf ?? reason.since!, href: line.href });
    }
    if (!point) continue;
    const next = levelBelow(inputs, ticker, point.price);
    const replaces = alertUnder(inputs, ticker, point.price, next);
    if (replaces === false) continue;
    out.push({
      ...base,
      idea: `alert:${ticker}:below:${next.price}`,
      title: alertTitle(ticker, next.price, replaces),
      why: [brokeWhen, nextLine(next, "down")],
      does: alertDoes(ticker, "below", next.price, replaces),
      read: [...read, priceSource(ticker, point), ...seriesSource(inputs, ticker)],
      figures: [...figures, ...priceFigures(ticker, point, inputs), ...levelFigures(inputs, ticker, "below"), { label: "New alert", value: usd(next.price) }],
      action: alertAction(ticker, stock.instrumentId, "below", next.price, replaces),
    });
  }
  return out;
}

/**
 * A holding's new 10-K or 10-Q added risks to its risk factors: an alert under the price at the next level down, so
 * the person hears if the market starts pricing them in. The holding itself is never touched. The new risk is quoted
 * in the company's own words.
 */
function filingRiskRules(inputs: ProposalInputs): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  if (!inputs.alerts) return out;
  for (const change of inputs.filingChanges ?? []) {
    const ticker = change.ticker.toUpperCase();
    const stock = stockOf(inputs, ticker);
    if (!stock || stock.position !== "holding" || change.added.length === 0 || !recent(change.filed, inputs.today)) continue;
    const point = latestPrice(inputs, ticker);
    if (!point) continue;
    const next = levelBelow(inputs, ticker, point.price);
    const replaces = alertUnder(inputs, ticker, point.price, next);
    if (replaces === false) continue;
    const count = change.added.length;
    // The new risk in the company's words when they fit the line with "New:" (whole, or cut at a clause), else not quoted.
    const newRisk = quote(change.added[0]!, WHY_MAX_WORDS - 1);
    const dropped = change.dropped > 0 ? ` and drops ${change.dropped}` : change.partial ? " since its 10-K" : "";
    out.push({
      kind: "filing_risks",
      ticker,
      instrument_id: stock.instrumentId,
      event: { key: `filing_risks:${ticker}:${change.accession}`, kind: "filing_risks", at: change.filed, refs: [`tm_filing_changes/${ticker}`] },
      idea: `alert:${ticker}:below:${next.price}`,
      title: alertTitle(ticker, next.price, replaces),
      why: [
        `${ticker}'s ${change.form} ${onDay(change.filed, inputs.today)} adds ${risks(count)}${dropped}.`,
        ...(newRisk.fits ? [`New: “${newRisk.text}”`] : []),
        nextLine(next, "down"),
      ],
      does: alertDoes(ticker, "below", next.price, replaces),
      read: [
        { label: `${ticker} ${change.form} risk factors`, at: change.filed, href: change.url },
        ...(change.base ? [{ label: `${ticker} ${change.base.form} risk factors`, at: change.base.filed, href: change.base.url }] : []),
        priceSource(ticker, point),
        ...seriesSource(inputs, ticker),
      ],
      figures: [
        { label: "Risks added", value: String(count) },
        ...(change.dropped > 0 ? [{ label: "Risks dropped", value: String(change.dropped) }] : []),
        ...priceFigures(ticker, point, inputs),
        ...levelFigures(inputs, ticker, "below"),
        { label: "New alert", value: usd(next.price) },
      ],
      action: alertAction(ticker, stock.instrumentId, "below", next.price, replaces),
      priority: 55,
    });
  }
  return out;
}

const SESSION_WORDS: Record<ProposalUpcoming["session"], string> = { bmo: "before the open", amc: "after the close", unknown: "" };

/** A report within a week and no reminder set: the earnings reminder toggle (Pro, where earnings alerts live). */
function earningsRules(inputs: ProposalInputs): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  if (!can("zone_alerts", inputs.plan) || !inputs.alerts) return out;
  for (const report of inputs.upcoming ?? []) {
    const stock = stockOf(inputs, report.ticker);
    const gap = daysFromToday(report.date, inputs.today);
    if (!stock || gap === null || gap < 1 || gap > 7) continue;
    const ticker = report.ticker;
    if (inputs.alerts.some((alert) => alert.ticker === ticker && alert.kind === "earnings_24h" && alert.live)) continue;
    const when = onDay(report.date, inputs.today);
    const label = `${weekdayName(report.date)}${report.session === "unknown" ? "" : `, ${SESSION_WORDS[report.session]}`}`;
    out.push({
      kind: "earnings_soon",
      ticker,
      instrument_id: stock.instrumentId,
      event: { key: `earnings:${ticker}:${report.date}`, kind: "earnings_soon", at: report.date, refs: [`earnings/${ticker}/${report.date}`] },
      idea: `earnings:${ticker}:${report.date}`,
      title: `Get a reminder the day before ${ticker} reports`,
      why: [
        `${ticker} reports ${when}${report.session === "unknown" ? "" : ` ${SESSION_WORDS[report.session]}`}.`,
        ...(fin(report.usualPct) ? [`It has moved about ${Math.round(report.usualPct * 10) / 10}% on a typical report.`] : []),
      ],
      does: `Emails you the day before ${ticker} reports.`,
      read: [{ label: `${ticker} earnings calendar`, at: inputs.today, href: stockHref(ticker) }],
      figures: [
        { label: "Report", value: capital(dayWordsOr(report.date, inputs.today)) },
        ...(report.session === "unknown" ? [] : [{ label: "When", value: capital(SESSION_WORDS[report.session]) }]),
        ...(fin(report.usualPct) ? [{ label: "Usual move", value: `±${Math.round(report.usualPct * 10) / 10}%` }] : []),
      ],
      action: { type: "alert_earnings", ticker, instrument_id: stock.instrumentId, report_date: report.date, label },
      usualPct: fin(report.usualPct) ? report.usualPct : null,
      priority: 45,
    });
  }
  return out;
}

function dayWordsOr(day: string, today: string): string {
  const words = onDayWords(day, today);
  return words.replace(/^on /, "");
}

const EARNINGS_EVENTS = new Set(["earnings_approaching", "earnings_reported"]);

/** A paused earnings agent while one of its stocks reports within a week: turn it back on. */
function agentResumeRules(inputs: ProposalInputs): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  for (const job of inputs.jobs ?? []) {
    if (job.enabled || job.trigger.type !== "event" || !EARNINGS_EVENTS.has(job.trigger.event) || !planMayRun(job, inputs.plan) || !roomForAgent(inputs)) continue;
    const report = (inputs.upcoming ?? [])
      .filter((entry) => {
        const gap = daysFromToday(entry.date, inputs.today);
        return gap !== null && gap >= 0 && gap <= 7 && jobCovers(job, entry.ticker, Boolean(stockOf(inputs, entry.ticker)));
      })
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!report) continue;
    const name = clipWords(job.name, 5);
    out.push({
      kind: "agent_resume",
      ticker: report.ticker,
      instrument_id: stockOf(inputs, report.ticker)?.instrumentId ?? null,
      event: { key: `agent_resume:${job.id}:${report.date}`, kind: "agent_resume", at: inputs.today, refs: [`tm_agent_jobs/${job.id}`] },
      idea: `agent_enable:${job.id}:true`,
      title: "Turn your earnings agent back on",
      why: [`${report.ticker} reports ${onDay(report.date, inputs.today)}.`, `"${name}" is paused.`],
      does: `Turns on "${clipWords(job.name, 6)}" so it tells you about the report.`,
      read: [
        { label: "Your agents", at: inputs.today, href: "/agents" },
        { label: `${report.ticker} earnings calendar`, at: inputs.today, href: stockHref(report.ticker) },
      ],
      figures: [{ label: "Agent", value: "Paused" }, { label: "Report", value: capital(dayWordsOr(report.date, inputs.today)) }],
      action: { type: "agent_enable", job_id: job.id, job_name: job.name, enabled: true },
      priority: 40,
    });
  }
  return out;
}

/** An agent whose last three runs could not check: pause it (on Free it holds one of the running slots). */
function agentPauseRules(inputs: ProposalInputs): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  for (const job of inputs.jobs ?? []) {
    if (!job.enabled) continue;
    const runs = (inputs.runs ?? []).filter((run) => run.job_id === job.id).sort((a, b) => b.day.localeCompare(a.day) || b.ran_at.localeCompare(a.ran_at));
    const last = runs.slice(0, 3);
    if (last.length < 3 || last.some((run) => run.decision !== "could_not_check") || !recent(last[0]!.day, inputs.today)) continue;
    const name = clipWords(job.name, 3);
    out.push({
      kind: "agent_pause",
      ticker: null,
      instrument_id: null,
      event: { key: `agent_pause:${job.id}:${last[0]!.day}`, kind: "agent_pause", at: last[0]!.ran_at || last[0]!.day, refs: last.map((run) => `tm_agent_runs/${run.id}`) },
      idea: `agent_enable:${job.id}:false`,
      title: `Pause "${name}"`,
      why: [
        // The title names the agent; the line is only what happened.
        "Its last three runs couldn't read their data.",
        inputs.plan === "pro" ? "You can turn it back on any time." : "Pausing it frees one of your running agent slots.",
      ],
      does: `Pauses "${clipWords(job.name, 6)}". Its runs and settings stay.`,
      read: last.map((run) => ({ label: `${name} run`, at: run.ran_at || run.day, href: "/agents" })),
      figures: [{ label: "Runs that couldn't check", value: "3 of 3" }],
      action: { type: "agent_enable", job_id: job.id, job_name: job.name, enabled: false },
      priority: 30,
    });
  }
  return out;
}

const FLAG_KINDS = new Set(["congress", "insider", "mover", "move", "filing", "news", "level", "call"]);

/** An agent flagged a stock the person does not track: add it to Watching. */
function flaggedRules(inputs: ProposalInputs): ProposalDraft[] {
  const out: ProposalDraft[] = [];
  const tracked = new Set(inputs.stocks.map((stock) => stock.ticker));
  for (const run of inputs.runs ?? []) {
    if (run.decision !== "notify" || !recent(run.day, inputs.today)) continue;
    for (const finding of run.findings) {
      const ticker = finding.ticker?.toUpperCase() ?? "";
      if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker) || tracked.has(ticker) || !FLAG_KINDS.has(finding.kind ?? "")) continue;
      const headline = finding.headline.trim();
      const name = clipWords(run.job_name, 5);
      const day = dayOf(finding.at) ?? run.day;
      out.push({
        kind: "agent_flagged",
        ticker,
        instrument_id: `US_${ticker.replace(/\./g, "_")}`,
        event: { key: `flag:${ticker}:${run.id}`, kind: "agent_flagged", at: run.ran_at || run.day, refs: [`tm_agent_runs/${run.id}`] },
        idea: `watch_add:${ticker}`,
        title: `Add ${ticker} to Watching`,
        why: [
          `"${name}" flagged ${ticker} ${onDay(run.day, inputs.today)}.`,
          // A source headline in Scraped Title Case is not shown (owner rule 8).
          ...(headline && wordCount(headline) <= WHY_MAX_WORDS && !titleCase(headline) ? [sentence(headline)] : []),
        ],
        does: `Adds ${ticker} to Watching. Nothing else changes.`,
        read: [
          { label: `${name} run`, at: run.ran_at || run.day, href: "/agents" },
          ...(finding.url ? [{ label: finding.source || "Source", at: day, href: finding.url }] : []),
        ],
        figures: [
          ...(fin(finding.change_pct) ? [{ label: "Move", value: signedPct(finding.change_pct) }] : []),
          ...(fin(finding.close) ? [{ label: "Close", value: usd(finding.close) }] : []),
          { label: "On your list", value: "No" },
        ],
        action: { type: "watch_add", ticker, instrument_id: `US_${ticker.replace(/\./g, "_")}` },
        priority: 35,
      });
    }
  }
  return out;
}

/** True for "Nvidia Shares Slide On Guidance Cut": most longer words capitalized. */
export function titleCase(text: string): boolean {
  const words = text.split(/\s+/).filter((word) => /^[A-Za-z]{4,}/.test(word));
  if (words.length < 3) return false;
  return words.filter((word) => /^[A-Z][a-z]/.test(word)).length / words.length >= 0.6;
}

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Every proposal the inputs support, strongest first. Duplicates by event key are dropped (the first wins). */
export function candidates(inputs: ProposalInputs): ProposalDraft[] {
  const all = [
    ...reasonRules(inputs),
    ...alertRules(inputs),
    ...resultsRules(inputs),
    ...callRules(inputs),
    ...levelRules(inputs),
    ...moveRules(inputs),
    ...filingRules(inputs),
    ...filingRiskRules(inputs),
    ...earningsRules(inputs),
    ...agentResumeRules(inputs),
    ...flaggedRules(inputs),
    ...agentPauseRules(inputs),
    ...basketDrafts(inputs.baskets, inputs.today),
    ...thesisDrafts(inputs),
  ]
    .map(fitWords)
    .filter((draft): draft is ProposalDraft => draft !== null)
    .map((draft) => ({ ...draft, quote: draft.ticker ? inputs.quotes?.[draft.ticker] ?? null : null, level: draft.level ?? levelOf(draft.action) }));
  const seen = new Set<string>();
  return all
    .sort((a, b) => b.priority - a.priority || String(b.event.at).localeCompare(String(a.event.at)))
    .filter((draft) => {
      if (seen.has(draft.event.key)) return false;
      seen.add(draft.event.key);
      return true;
    });
}

/** The level an alert proposal is about: its new alert's price. */
function levelOf(action: ProposalAction): ProposalLevel | null {
  return action.type === "alert_price" ? { price: action.price, label: action.replaces ? "New alert" : "Alert" } : null;
}

/** Holds a draft to the word budgets: a title over budget drops the draft, a why line over budget is dropped. */
export function fitWords(draft: ProposalDraft): ProposalDraft | null {
  if (wordCount(draft.title) > TITLE_MAX_WORDS) return null;
  // Each line one sentence of at most 15 words (owner rule 8): a line that is two sentences is dropped, never shown.
  const why = draft.why.filter((line) => line && wordCount(line) <= WHY_MAX_WORDS && firstSentence(line) === line.trim()).slice(0, WHY_MAX_LINES);
  if (why.length === 0) return null;
  return { ...draft, why };
}

/* ── choosing what to store ─────────────────────────────────────────────── */

/** Pending and not past its expiry (an accept left half-way long ago counts as pending again). */
export function isWaiting(proposal: Pick<Proposal, "status" | "expires_at" | "updated_at">, now: Date): boolean {
  if (Date.parse(proposal.expires_at) <= now.getTime()) return false;
  if (proposal.status === "pending") return true;
  return proposal.status === "applying" && now.getTime() - Date.parse(proposal.updated_at) > APPLYING_STALE_MS;
}

/**
 * The new proposals to store: not already stored (by event), not an idea that is waiting or was proposed in the last
 * IDEA_COOLDOWN_DAYS, one per stock among the waiting and the new, and no more than MAX_PENDING waiting in all.
 */
export function pickNew(drafts: ProposalDraft[], existing: Proposal[], now: Date, max = MAX_PENDING): ProposalDraft[] {
  const ids = new Set(existing.map((proposal) => proposal.id));
  const waiting = existing.filter((proposal) => isWaiting(proposal, now));
  const cooldown = now.getTime() - IDEA_COOLDOWN_DAYS * DAY_MS;
  const ideas = new Set(existing.filter((proposal) => isWaiting(proposal, now) || Date.parse(proposal.created_at) >= cooldown).map((proposal) => proposal.idea));
  const tickers = new Set(waiting.flatMap((proposal) => (proposal.ticker ? [proposal.ticker] : [])));
  const out: ProposalDraft[] = [];
  let room = max - waiting.length;
  for (const draft of drafts) {
    if (room <= 0) break;
    if (ids.has(proposalId(draft.event.key)) || ideas.has(draft.idea)) continue;
    if (draft.ticker && tickers.has(draft.ticker)) continue;
    out.push(draft);
    ideas.add(draft.idea);
    if (draft.ticker) tickers.add(draft.ticker);
    room -= 1;
  }
  return out;
}

/** Idea-basket proposals waiting at once: one per basket, two in all (lib/basket-agent), so they never fill the queue. */
export const MAX_BASKET_WAITING = 2;

function basketOf(entry: Pick<ProposalDraft, "action" | "kind" | "event">): string | null {
  // A thesis lives on a basket (lib/thesis-monitor): its review proposals take the same basket slots.
  return entry.action.type === "basket_edit" ? entry.action.basket_id : thesisBasketOf(entry);
}

/**
 * What to store and what to set aside, strongest first. Like pickNew (no stored event twice, no idea within its
 * cooldown, one per stock, MAX_PENDING waiting in all), plus: idea-basket proposals stay within MAX_BASKET_WAITING
 * (one per basket), and a stronger draft takes the place of a weaker waiting one, for the same stock or for the last
 * slot. The weaker one is returned in `outranked` to be marked expired ("outranked"), never deleted. One being applied
 * is never set aside.
 */
export function pickProposals(drafts: ProposalDraft[], existing: Proposal[], now: Date, max = MAX_PENDING): { fresh: ProposalDraft[]; outranked: Proposal[] } {
  const ids = new Set(existing.map((proposal) => proposal.id));
  const cooldown = now.getTime() - IDEA_COOLDOWN_DAYS * DAY_MS;
  const ideas = new Set(existing.filter((proposal) => isWaiting(proposal, now) || Date.parse(proposal.created_at) >= cooldown).map((proposal) => proposal.idea));
  let held = existing.filter((proposal) => isWaiting(proposal, now));
  const fresh: ProposalDraft[] = [];
  const outranked: Proposal[] = [];
  const movable = (proposal: Proposal) => proposal.status === "pending";
  const setAside = (proposal: Proposal) => {
    held = held.filter((entry) => entry.id !== proposal.id);
    outranked.push(proposal);
  };
  for (const draft of drafts) {
    if (ids.has(proposalId(draft.event.key)) || ideas.has(draft.idea)) continue;
    const basket = basketOf(draft);
    if (basket) {
      const queued = [...held, ...fresh].filter((entry) => basketOf(entry) !== null);
      if (queued.length >= MAX_BASKET_WAITING || queued.some((entry) => basketOf(entry) === basket)) continue;
    }
    if (draft.ticker) {
      if (fresh.some((entry) => entry.ticker === draft.ticker)) continue;
      const holder = held.find((entry) => entry.ticker === draft.ticker);
      if (holder) {
        if (!movable(holder) || holder.priority >= draft.priority) continue;
        setAside(holder);
      }
    }
    if (held.length + fresh.length >= max) {
      const weakest = held.filter(movable).sort((a, b) => a.priority - b.priority)[0];
      if (!weakest || weakest.priority >= draft.priority) continue;
      setAside(weakest);
    }
    fresh.push(draft);
    ideas.add(draft.idea);
  }
  return { fresh, outranked };
}

export function newProposal(uid: string, draft: ProposalDraft, now: Date): Proposal {
  const at = now.toISOString();
  return {
    ...draft,
    quote: draft.quote ?? null,
    level: draft.level ?? null,
    usualPct: draft.usualPct ?? null,
    id: proposalId(draft.event.key),
    uid,
    version: PROPOSAL_VERSION,
    status: "pending",
    result: null,
    created_at: at,
    expires_at: new Date(now.getTime() + EXPIRY_DAYS * DAY_MS).toISOString(),
    decided_at: null,
    updated_at: at,
    expired_reason: null,
  };
}

/**
 * The words and figures to write over a waiting proposal when today's run of the rules makes the same proposal (the
 * same event, the same action) with newer numbers or words; null when nothing changed or the action differs (then the
 * stored one stands as it was offered).
 */
export function refreshOf(proposal: Proposal, draft: ProposalDraft): Pick<Proposal, "title" | "why" | "does" | "read" | "figures" | "quote" | "level" | "usualPct"> | null {
  if (proposalId(draft.event.key) !== proposal.id || stableJson(draft.action) !== stableJson(proposal.action)) return null;
  const next = { title: draft.title, why: draft.why, does: draft.does, read: draft.read, figures: draft.figures, quote: draft.quote ?? proposal.quote ?? null, level: draft.level ?? null, usualPct: draft.usualPct ?? null };
  const same = stableJson(next) === stableJson({ title: proposal.title, why: proposal.why, does: proposal.does, read: proposal.read, figures: proposal.figures, quote: proposal.quote ?? null, level: proposal.level ?? null, usualPct: proposal.usualPct ?? null });
  return same ? null : next;
}

/** JSON with every object's keys sorted: the store hands documents back with their keys in its own order. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : entry,
  );
}

/** What a re-check before an accept says when it could not read the facts: the action does not run. */
export const UNVERIFIED = "unverified";

/* ── staleness ──────────────────────────────────────────────────────────── */

/**
 * Why a waiting proposal no longer fits the facts, or null when it still does (or the read it needs is missing, so
 * nothing can be said). Checked on every sync; accept checks the same before it writes.
 */
export function staleReason(proposal: Proposal, inputs: ProposalInputs): string | null {
  const action = proposal.action;
  if (Date.parse(proposal.expires_at) <= inputs.now.getTime()) return "expired";
  switch (action.type) {
    case "alert_price": {
      if (inputs.alerts && hasAlertNear(inputs, action.ticker, action.condition, action.price)) return "alert_set";
      if (action.replaces && inputs.alerts && !inputs.alerts.some((alert) => alert.id === action.replaces!.alert_id && (alert.live || alert.triggered))) return "alert_gone";
      const point = inputs.quotes || inputs.series ? latestPrice(inputs, action.ticker) : null;
      if (point && (action.condition === "below" ? point.price <= action.price : point.price >= action.price)) return "price_past_level";
      return null;
    }
    case "alert_earnings": {
      if (daysFromToday(action.report_date, inputs.today)! < 1) return "report_passed";
      if (inputs.alerts?.some((alert) => alert.ticker === action.ticker && alert.kind === "earnings_24h" && alert.live)) return "alert_set";
      return null;
    }
    case "watch_add":
      return inputs.stocks.some((stock) => stock.ticker === action.ticker) ? "tracked" : null;
    case "agent_enable": {
      if (!inputs.jobs) return null;
      const job = inputs.jobs.find((entry) => entry.id === action.job_id);
      if (!job) return "agent_gone";
      return job.enabled === action.enabled ? "agent_already" : null;
    }
    case "agent_create":
      return inputs.jobs?.some((job) => job.enabled && job.trigger.type === "event" && action.trigger.type === "event" && job.trigger.event === action.trigger.event) ? "agent_exists" : null;
    case "basket_edit":
      return basketStale(action, inputs.baskets);
    case "practice_ticket": {
      // Only a call that was read and differs; a stock missing from the read says nothing.
      const log = inputs.calls?.[action.ticker];
      if (log && log.call !== (action.side === "buy" ? "Add" : "Trim")) return "call_changed";
      if (action.side === "sell" && inputs.practice && !practiceHolds(inputs, action.ticker)) return "not_in_practice";
      return null;
    }
  }
  return null;
}

/**
 * What the agent watches for the person: stocks, live price alerts, running agents, and (when the agents were read)
 * the paused ones and the next check in words ("after the close today, from 5:30 PM ET"). The queue's status tile.
 */
export type WatchSummary = { stocks: number; alerts: number; agents: number; paused?: number; next?: string | null };

/** A proposal the person answered, or one that went stale: one line of the activity record on /agent. */
export type ProposalOutcome = {
  id: string;
  status: "accepted" | "dismissed" | "expired";
  ticker: string | null;
  title: string;
  /** What happened, in the action's own words ("Alert set: NVDA below $158."); null for a dismissal or expiry. */
  message: string | null;
  /** When it was answered or went stale (ISO). */
  at: string;
};

/** How far back the record keeps answered proposals. */
export const OUTCOME_DAYS = 14;

/** The answered and stale proposals of the last OUTCOME_DAYS days, newest first. Never a waiting one. */
export function outcomesOf(proposals: Proposal[], now: Date): ProposalOutcome[] {
  const from = now.getTime() - OUTCOME_DAYS * DAY_MS;
  const out: ProposalOutcome[] = [];
  for (const proposal of proposals) {
    const expired = proposal.status === "expired" || ((proposal.status === "pending" || proposal.status === "applying") && Date.parse(proposal.expires_at) <= now.getTime());
    const status = proposal.status === "accepted" ? "accepted" : proposal.status === "dismissed" ? "dismissed" : expired ? "expired" : null;
    if (!status) continue;
    // A proposal that ran out of time is dated by its expiry; one whose facts went stale, by when that was noticed.
    const timedOut = status === "expired" && (proposal.status !== "expired" || proposal.expired_reason === "expired");
    const at = proposal.decided_at ?? (timedOut ? proposal.expires_at : proposal.updated_at);
    if (!Number.isFinite(Date.parse(at)) || Date.parse(at) < from) continue;
    out.push({ id: proposal.id, status, ticker: proposal.ticker, title: proposal.title, message: status === "accepted" ? proposal.result?.message ?? null : null, at });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Where the price (now) and a level sit on the card's bar, in percent of its width: a fixed scale around the price, at
 * least ±10% and wider for a far level, so the gap reads true from card to card.
 */
export function levelScale(now: number, level: number): { nowAt: number; levelAt: number; gapPct: number } {
  const gapPct = ((level - now) / now) * 100;
  const half = Math.max(10, Math.abs(gapPct) * 1.25);
  const at = (value: number) => Math.min(100, Math.max(0, 50 + (((value - now) / now) * 100 * 50) / half));
  return { nowAt: at(now), levelAt: at(level), gapPct };
}

/* ── the card ───────────────────────────────────────────────────────────── */

/** What the browser gets: no uid, no event refs. */
export type ProposalCard = Pick<Proposal, "id" | "kind" | "ticker" | "title" | "why" | "read" | "figures" | "status" | "result" | "created_at"> & {
  level: ProposalLevel | null;
  usualPct: number | null;
  /** What accepting does, or null when it would only repeat the title (repeatsTitle). */
  does: string | null;
  actionType: ProposalAction["type"];
  quote: { price: number; dayPct: number | null } | null;
  /** Which shared action it belongs to, so two or more cards of one action sit under one heading (groupOf). */
  group: ProposalGroup;
};

/**
 * Cards that do the same thing share a heading that says the action once ("Try buying in your practice account"), and
 * each card keeps only what differs (owner rule 1). `key` is the shared action; `heading` says it; `short` is the
 * card's own part of the action under that heading, or null when the ticker on the card already says it all.
 */
export type ProposalGroup = { key: string; heading: string; short: string | null };

/** An agent's name as its card says it under a group's heading, quoted as the titles quote it; null without one. */
function agentName(name: unknown): string | null {
  return typeof name === "string" && name.trim() ? `"${clipWords(name, 6)}"` : null;
}

export function groupOf(action: ProposalAction): ProposalGroup {
  switch (action.type) {
    case "practice_ticket":
      return action.side === "buy"
        ? { key: "practice:buy", heading: "Try buying in your practice account", short: null }
        : { key: "practice:sell", heading: "Try selling some in your practice account", short: null };
    case "alert_price":
      return {
        key: "alert_price",
        heading: "Set price alerts",
        short: action.replaces ? `Move the ${usd(action.replaces.price)} alert to ${usd(action.price)}` : `Alert at ${usd(action.price)}`,
      };
    case "alert_earnings":
      return { key: "alert_earnings", heading: "Get a reminder the day before each report", short: null };
    case "watch_add":
      return { key: "watch_add", heading: "Add to Watching", short: null };
    case "agent_enable":
      return action.enabled
        ? { key: "agent_on", heading: "Turn these agents back on", short: agentName(action.job_name) }
        : { key: "agent_off", heading: "Pause these agents", short: agentName(action.job_name) };
    case "agent_create":
      return { key: "agent_create", heading: "Set up these agents", short: agentName(action.name) };
    case "basket_edit": {
      const name = wordCount(action.basket_name) <= 5 ? `“${action.basket_name}”` : "your idea basket";
      return action.op === "drop"
        ? { key: `basket:${action.basket_id}:drop`, heading: `Drop from ${name}`, short: null }
        : { key: `basket:${action.basket_id}:add`, heading: `Add to ${name}`, short: null };
    }
  }
}

export function toCard(proposal: Proposal, quote: ProposalQuote | null): ProposalCard {
  // The fresh quote, else the one from the last sync (minutes old), so every card shows a price and its day.
  const shown = quote ?? proposal.quote ?? null;
  return {
    id: proposal.id,
    kind: proposal.kind,
    ticker: proposal.ticker,
    title: proposal.title,
    why: proposal.why,
    read: proposal.read,
    figures: proposal.figures,
    status: proposal.status,
    result: proposal.result,
    created_at: proposal.created_at,
    actionType: proposal.action.type,
    quote: shown ? { price: shown.price, dayPct: shown.dayPct } : null,
    does: repeatsTitle(proposal.title, proposal.does) ? null : proposal.does,
    level: proposal.level ?? levelOf(proposal.action),
    usualPct: proposal.usualPct ?? null,
    group: groupOf(proposal.action),
  };
}


/**
 * Whether "what accepting does" only says the title again: the same dollar figure, or mostly the same words. Then the
 * card leaves the line out ("Get a reminder the day before NVDA reports" needs no "Emails you the day before…").
 */
export function repeatsTitle(title: string, does: string): boolean {
  const figures = (text: string) => new Set(text.match(/\$[\d,.]+\d/g) ?? []);
  const titleFigures = figures(title);
  if ([...figures(does)].some((figure) => titleFigures.has(figure))) return true;
  const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 2);
  const titleWords = new Set(words(title));
  const doesWords = words(does);
  return doesWords.length > 0 && doesWords.filter((word) => titleWords.has(word)).length / doesWords.length >= 0.6;
}

function readLevel(raw: unknown): ProposalLevel | null {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const price = numOrNull(data?.price);
  return price !== null && price > 0 && typeof data?.label === "string" ? { price, label: data.label } : null;
}

function readQuote(raw: unknown): ProposalQuote | null {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const price = numOrNull(data?.price);
  if (price === null || price <= 0) return null;
  return { price, dayPct: numOrNull(data?.dayPct), at: typeof data?.at === "string" ? data.at : null };
}

/** Read a stored proposal, or null when it is not one (wrong version, missing fields). */
export function readProposal(data: unknown): Proposal | null {
  if (!data || typeof data !== "object") return null;
  const doc = data as Record<string, unknown>;
  if (doc.version !== PROPOSAL_VERSION || typeof doc.id !== "string" || typeof doc.uid !== "string" || typeof doc.title !== "string") return null;
  if (!doc.action || typeof doc.action !== "object" || typeof (doc.action as { type?: unknown }).type !== "string") return null;
  const status = doc.status;
  if (status !== "pending" && status !== "applying" && status !== "accepted" && status !== "dismissed" && status !== "expired") return null;
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);
  const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value.filter((entry) => entry && typeof entry === "object") as T[]) : []);
  const event = (doc.event && typeof doc.event === "object" ? doc.event : {}) as Record<string, unknown>;
  return {
    id: doc.id,
    uid: doc.uid,
    version: PROPOSAL_VERSION,
    kind: doc.kind as ProposalKind,
    status,
    ticker: typeof doc.ticker === "string" ? doc.ticker : null,
    instrument_id: typeof doc.instrument_id === "string" ? doc.instrument_id : null,
    event: { key: String(event.key ?? ""), kind: event.kind as ProposalKind, at: String(event.at ?? ""), refs: strings(event.refs) },
    idea: typeof doc.idea === "string" ? doc.idea : "",
    title: doc.title,
    why: strings(doc.why),
    does: typeof doc.does === "string" ? doc.does : "",
    read: list<ProposalSource>(doc.read),
    figures: list<ProposalFigure>(doc.figures),
    action: doc.action as ProposalAction,
    priority: typeof doc.priority === "number" ? doc.priority : 0,
    quote: readQuote(doc.quote),
    level: readLevel(doc.level),
    usualPct: numOrNull(doc.usualPct),
    result: doc.result && typeof doc.result === "object" ? (doc.result as ProposalResult) : null,
    created_at: String(doc.created_at ?? ""),
    expires_at: String(doc.expires_at ?? ""),
    decided_at: typeof doc.decided_at === "string" ? doc.decided_at : null,
    updated_at: String(doc.updated_at ?? doc.created_at ?? ""),
    expired_reason: typeof doc.expired_reason === "string" ? doc.expired_reason : null,
  };
}

/** The waiting ones for the cards, strongest first, then newest. */
export function waitingOf(proposals: Proposal[], now: Date): Proposal[] {
  return proposals.filter((proposal) => isWaiting(proposal, now)).sort((a, b) => b.priority - a.priority || b.created_at.localeCompare(a.created_at)).slice(0, MAX_PENDING);
}

