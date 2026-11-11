/**
 * Building a results read from the stored records. Pure: the reads live in
 * ./server.ts, so every rule here (which estimate, which move, whether the
 * call moved) is tested on plain records in ./build.test.ts.
 */
import { fmtEps, type Session } from "@/lib/calendar-shared";
import { earningsDayHref } from "@/lib/earnings-day-shared";
import { moveStats, type PastReport } from "@/lib/earnings-season";
import { etWallTimeToUtcMs, isNyseHoliday } from "@/lib/market-session";

import type { ResultCall, ResultCallWord, ResultEps, ResultGuidance, ResultMove, ResultRead, ResultRevenue, ResultSource } from "./types";
import { revenueWords } from "./words";

/* ── days ───────────────────────────────────────────────────────────────── */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isTradingDay(day: string): boolean {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isNyseHoliday(day);
}

/** The first trading day after `day`. */
export function nextTradingDay(day: string): string {
  let next = shiftDay(day, 1);
  for (let guard = 0; guard < 10 && !isTradingDay(next); guard++) next = shiftDay(next, 1);
  return next;
}

/** The last trading day before `day`. */
export function previousTradingDay(day: string): string {
  let prev = shiftDay(day, -1);
  for (let guard = 0; guard < 10 && !isTradingDay(prev); guard++) prev = shiftDay(prev, -1);
  return prev;
}

/** Calendar days from `from` to `to`. */
export function daysApart(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The New York day of an instant. */
export function nyDayOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function etMs(day: string, hour: number, minute: number): number {
  return etWallTimeToUtcMs(Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10)), hour, minute);
}

/** The session the results were first traded in: the report day before the open, the next one after the close. */
export function reactionDay(date: string, session: Session): string {
  if (session === "bmo") return isTradingDay(date) ? date : nextTradingDay(date);
  return nextTradingDay(date);
}

/* ── the calendar row ───────────────────────────────────────────────────── */

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const SOURCE_NAMES: Record<string, string> = {
  nasdaq_calendar: "Nasdaq earnings calendar",
  alphavantage: "Alpha Vantage",
  yfinance: "Yahoo Finance",
};

/** One reported row of `tm_earnings_events`, with the EPS pair it can stand behind. */
export type ResultEvent = {
  ticker: string;
  company: string;
  date: string;
  session: Session;
  eps: ResultEps | null;
  capturedAt: string | null;
};

/**
 * The provider's own estimate and the calendar's estimate disagree so much that one of them is on another basis
 * (a foreign listing reported in its home currency: HSAI's 0.72 against a 1.24 estimate, while Nasdaq expected 0.08).
 * Then no EPS comparison is shown at all.
 */
export function basisClash(providerEstimate: number | null, calendarEstimate: number | null): boolean {
  if (providerEstimate === null || calendarEstimate === null) return false;
  const gap = Math.abs(providerEstimate - calendarEstimate);
  if (gap <= 0.25) return false;
  if (Math.sign(providerEstimate) !== Math.sign(calendarEstimate)) return true;
  const small = Math.min(Math.abs(providerEstimate), Math.abs(calendarEstimate));
  const big = Math.max(Math.abs(providerEstimate), Math.abs(calendarEstimate));
  return small === 0 || big / small > 2;
}

/** Beat, miss or in line, with the same ±1% thresholds as the calendar job (earnings_calendar.surprise_label). */
export function epsResult(actual: number, expected: number): Pick<ResultEps, "verdict" | "surprisePct"> {
  if (expected === 0) return { verdict: actual > 0 ? "beat" : actual < 0 ? "miss" : "in_line", surprisePct: null };
  const pct = Math.round(((actual - expected) / Math.abs(expected)) * 1000) / 10;
  return { verdict: pct >= 1 ? "beat" : pct <= -1 ? "miss" : "in_line", surprisePct: pct };
}

/**
 * A stored calendar row as a reported event, or null when it has no result. The estimate is the one the provider of
 * the actual published beside it (`estimated_eps`), so both are on one basis; Nasdaq's rows carry the same number in
 * both fields.
 */
export function eventFromDoc(raw: Record<string, unknown>): ResultEvent | null {
  const ticker = str(raw.ticker).toUpperCase();
  const date = str(raw.event_date).slice(0, 10);
  if (!ticker || !DAY_RE.test(date) || str(raw.market) !== "US") return null;
  const actual = num(raw.reported_eps);
  if (actual === null) return null;
  const providerEstimate = num(raw.estimated_eps);
  const calendarEstimate = num(raw.eps_estimate);
  const expected = providerEstimate ?? calendarEstimate;
  const source = SOURCE_NAMES[str(raw.actuals_source)] ?? (str(raw.actuals_source) || "Nasdaq earnings calendar");
  const capturedAt = str(raw.actuals_captured_at) || str(raw.captured_at) || null;
  const time = str(raw.time).toLowerCase();
  const eps: ResultEps | null =
    expected !== null && !basisClash(providerEstimate, calendarEstimate)
      ? { actual, expected, ...epsResult(actual, expected), source, asOf: capturedAt }
      : null;
  return {
    ticker,
    company: str(raw.company) || ticker,
    date,
    session: time === "bmo" ? "bmo" : time === "amc" ? "amc" : "unknown",
    eps,
    capturedAt,
  };
}

/* ── the move ───────────────────────────────────────────────────────────── */

export type PriceMeta = { lastDate: string | null; fetchedAt: string | null };
export type LiveQuote = { pct: number; capturedAt: string };
export type PremarketQuote = { pct: number; date: string; at: string | null };

/**
 * How the stock took the results:
 * 1. the measured close-to-close move (lib/earnings-season.ts) once the reaction session's close is final;
 * 2. else the live quote, when it is from the reaction session (its day change is from the close before it);
 * 3. else, before the open on the reaction day, the pre-market quote.
 */
export function pickMove(input: {
  date: string;
  session: Session;
  today: string;
  now: Date;
  past: PastReport | null;
  priceMeta: PriceMeta | null;
  quote: LiveQuote | null;
  premarket: PremarketQuote | null;
}): Omit<ResultMove, "usualPct" | "usualCount"> | null {
  const { date, session, today, now } = input;
  const endDay = reactionDay(date, session);
  const past = input.past;
  if (past && typeof past.move === "number" && Number.isFinite(past.move)) {
    const meta = input.priceMeta;
    // A bar for the reaction day fetched before that day's close is the session in progress, not its close.
    const partial = Boolean(meta && meta.lastDate === endDay && meta.fetchedAt && Date.parse(meta.fetchedAt) < etMs(endDay, 16, 0));
    if (!partial) {
      return {
        pct: past.move,
        kind: past.basis === "2d" ? "two_days" : "day",
        day: endDay,
        nextDay: session === "amc",
        source: "daily closes from Yahoo Finance",
        asOf: endDay,
      };
    }
  }
  if (session === "unknown") return null;
  const quote = input.quote;
  if (quote && Number.isFinite(quote.pct) && nyDayOf(quote.capturedAt) === endDay) {
    const at = Date.parse(quote.capturedAt);
    const final = at >= etMs(endDay, 16, 0);
    const started = at >= etMs(endDay, 9, 30);
    if (started && (final || endDay === today)) {
      return { pct: quote.pct, kind: final ? "day" : "today", day: endDay, nextDay: session === "amc", source: "live price", asOf: quote.capturedAt };
    }
  }
  const premarket = input.premarket;
  if (endDay === today && now.getTime() < etMs(today, 9, 30) && premarket && premarket.date === today && Number.isFinite(premarket.pct)) {
    return { pct: premarket.pct, kind: "before_open", day: endDay, nextDay: session === "amc", source: "pre-market price", asOf: premarket.at };
  }
  return null;
}

/* ── the call ───────────────────────────────────────────────────────────── */

const CALL_WORDS: Record<string, ResultCallWord> = { add: "Buy more", hold: "Keep", trim: "Sell some" };

export function callWord(value: unknown): ResultCallWord | null {
  return CALL_WORDS[str(value).toLowerCase()] ?? null;
}

/**
 * Whether the results moved the steady call (backend/call_stability.py). The results count from the day the market
 * first had them; a change on or after it is the results' change, a run on or after it that kept the call means the
 * call held, and before that run the call is only stated.
 */
export function callAfter(stability: Record<string, unknown> | null, date: string, session: Session, today: string): ResultCall | null {
  if (!stability) return null;
  const call = callWord(stability.call);
  if (!call) return null;
  const knownOn = session === "amc" ? nextTradingDay(date) : date;
  const asOf = str(stability.updated_at) || null;
  const changes = Array.isArray(stability.changes) ? (stability.changes as Array<Record<string, unknown>>) : [];
  const change = [...changes].reverse().find((row) => {
    const day = str(row.date);
    return DAY_RE.test(day) && day >= knownOn && day <= today;
  });
  if (change) {
    const to = callWord(change.to);
    const from = callWord(change.from);
    if (to && from && to === call && from !== to) {
      return { status: "changed", call, from, on: str(change.date), reason: str(change.reason) || null, asOf };
    }
  }
  const session_ = str(stability.session);
  if (DAY_RE.test(session_) && session_ >= knownOn) return { status: "held", call, asOf };
  return { status: "pending", call, asOf };
}

/* ── the release (earnings day job) ─────────────────────────────────────── */

const GUIDANCE_CHANGES = new Set(["raised", "lowered", "mixed", "narrowed", "reaffirmed", "issued"]);

function lowerFirst(label: string): string {
  // "Adjusted EPS" -> "adjusted EPS", "Revenue" -> "revenue", "EPS" stays.
  return /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;
}

function rangeWords(item: Record<string, unknown>): string | null {
  const low = num(item.low);
  const high = num(item.high);
  const label = str(item.label);
  if (low === null || high === null || !label) return null;
  const fmt = (value: number) => (item.unit === "usd_per_share" ? fmtEps(value) : revenueWords(value));
  const range = low === high ? fmt(low) : `${fmt(low)} to ${fmt(high)}`;
  const period = str(item.period);
  return `${period ? `${period} ` : ""}${period ? lowerFirst(label) : label} ${range}`;
}

export function releaseParts(doc: Record<string, unknown> | null): { revenue: ResultRevenue | null; guidance: ResultGuidance | null; period: string | null; href: string | null } {
  if (!doc) return { revenue: null, guidance: null, period: null, href: null };
  const filing = (doc.filing && typeof doc.filing === "object" ? doc.filing : {}) as Record<string, unknown>;
  const url = str(filing.url) || str(filing.index_url) || null;
  const filedAt = str(filing.filed_at) || null;
  const source = "The company's 8-K release";
  const rev = (doc.revenue && typeof doc.revenue === "object" ? doc.revenue : null) as Record<string, unknown> | null;
  const value = rev ? num(rev.value) : null;
  const revenue: ResultRevenue | null = value !== null && value > 0 && url ? { value, yoyPct: num(rev!.yoy_pct), source, url, asOf: filedAt } : null;
  const g = (doc.guidance && typeof doc.guidance === "object" ? doc.guidance : null) as Record<string, unknown> | null;
  const change = g ? str(g.change).toLowerCase() : "";
  const items = g && Array.isArray(g.items) ? (g.items as Array<Record<string, unknown>>) : [];
  const guidance: ResultGuidance | null =
    GUIDANCE_CHANGES.has(change) && url ? { change: change as ResultGuidance["change"], first: items.length ? rangeWords(items[0]!) : null, source, url, asOf: filedAt } : null;
  const period = doc.period && typeof doc.period === "object" ? str((doc.period as Record<string, unknown>).label) || null : null;
  const read = doc.read && typeof doc.read === "object" && typeof (doc.read as Record<string, unknown>).title === "string";
  const ticker = str(doc.ticker);
  const day = str(doc.event_date).slice(0, 10);
  return { revenue, guidance, period, href: read && ticker && DAY_RE.test(day) ? earningsDayHref(ticker, day) : null };
}

/* ── the read ───────────────────────────────────────────────────────────── */

export type ResultInput = {
  event: ResultEvent;
  today: string;
  now: Date;
  /** The stock's report history (lib/earnings-season-data.ts): past reports with their moves, newest first. */
  history: { past: PastReport[]; typicalDayPct: number | null } | null;
  priceMeta: PriceMeta | null;
  quote: LiveQuote | null;
  premarket: PremarketQuote | null;
  stability: Record<string, unknown> | null;
  /** `tm_earnings_day/{TICKER}__{date}`, when the earnings day job read the release. */
  release: Record<string, unknown> | null;
};

/** The read, or null when there is nothing reported we can stand behind. */
export function buildResult(input: ResultInput): ResultRead | null {
  const { event, today } = input;
  const past = input.history?.past ?? [];
  const own = past.find((report) => report.date === event.date) ?? null;
  // Nasdaq often leaves the time out; the 8-K the company filed that day says when the results came out.
  const session: Session = event.session !== "unknown" ? event.session : own?.session ?? "unknown";
  const { revenue, guidance, period, href } = releaseParts(input.release);
  if (!event.eps && !revenue && !guidance) return null;

  const picked = pickMove({ date: event.date, session, today, now: input.now, past: own, priceMeta: input.priceMeta, quote: input.quote, premarket: input.premarket });
  const earlier = past.filter((report) => report.date !== event.date && report.date < event.date);
  const stats = moveStats(earlier, input.history?.typicalDayPct ?? null);
  const move: ResultMove | null = picked ? { ...picked, usualPct: stats.usual, usualCount: stats.count } : null;
  const call = callAfter(input.stability, event.date, session, today);

  const sources: ResultSource[] = [];
  if (event.eps) sources.push({ label: "EPS and estimate", source: event.eps.source, url: null, at: event.eps.asOf });
  if (revenue || guidance) sources.push({ label: revenue && guidance ? "Revenue and outlook" : revenue ? "Revenue" : "Outlook", source: "the company's 8-K", url: (revenue ?? guidance)!.url, at: (revenue ?? guidance)!.asOf });
  if (move) sources.push({ label: "Move", source: move.source, url: null, at: move.asOf });
  if (call) sources.push({ label: "Call reviewed", source: "", url: null, at: call.asOf });

  return {
    ticker: event.ticker,
    company: event.company,
    reportDate: event.date,
    session,
    period,
    eps: event.eps,
    revenue,
    guidance,
    move,
    call,
    reportHref: href,
    sources,
  };
}
