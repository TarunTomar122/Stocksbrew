/**
 * Building a results read from the stored records. Pure: the reads live in
 * ./server.ts, so every rule here (which estimate, which move, whether the
 * call moved) is tested on plain records in ./build.test.ts.
 */
import { fmtEps, type Session } from "@/lib/calendar-shared";
import { earningsDayHref } from "@/lib/earnings-day-shared";
import { moveStats, type PastReport } from "@/lib/earnings-season";
import { etDayOf } from "@/lib/day-words";
import { isExtendedLive, type ExtendedQuote } from "@/lib/extended-quotes";
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

/**
 * The report came out overnight, as the morning briefing means it: after the last session's close or before today's
 * open (today's evening reports count too, once the briefing is read after them). A report from before the open on
 * the last trading day was already in that session's price, so it is yesterday's news, not overnight; a report with
 * no known time on that day cannot be placed and is left out.
 */
export function isOvernight(date: string, session: Session, today: string): boolean {
  if (!DAY_RE.test(date) || date > today) return false;
  if (date === today) return true;
  const last = previousTradingDay(today);
  if (date > last) return true; // a weekend or holiday release
  return date === last && session === "amc";
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
  /** The calendar's own estimate (`eps_estimate`), kept to check a release's EPS pair is on the same basis. */
  calendarEstimate?: number | null;
  /**
   * The row has its actual (`reported_eps`), even when `eps` is null because the two estimates disagree: then no EPS
   * pair from the release stands in for it either.
   */
  reported?: boolean;
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

/**
 * Beat, miss or in line, with the same ±1% thresholds as the calendar job (earnings_calendar.surprise_label). Judged on
 * the exact surprise, never a rounded one (a 0.96% surprise rounded to 1.0% is not a beat), and the surprise is kept
 * unrounded so the words round it once (./words.ts).
 */
export function epsResult(actual: number, expected: number): Pick<ResultEps, "verdict" | "surprisePct"> {
  if (expected === 0) return { verdict: actual > 0 ? "beat" : actual < 0 ? "miss" : "in_line", surprisePct: null };
  const pct = ((actual - expected) / Math.abs(expected)) * 100;
  // No float tolerance on purpose: the calendar's own label (lib/tone.ts) compares the same way, so one report never
  // gets two verdicts on two pages.
  return { verdict: pct >= 1 ? "beat" : pct <= -1 ? "miss" : "in_line", surprisePct: pct };
}

/**
 * A stored calendar row as an event. The estimate is the one the provider of the actual published beside it
 * (`estimated_eps`), so both are on one basis; Nasdaq's rows carry the same number in both fields. A row whose EPS is
 * not posted yet is kept with no EPS: the company's release (revenue, the outlook) can be out hours before the actual
 * reaches the calendar, and buildResult drops the event when there is neither.
 */
export function eventFromDoc(raw: Record<string, unknown>): ResultEvent | null {
  const ticker = str(raw.ticker).toUpperCase();
  const date = str(raw.event_date).slice(0, 10);
  if (!ticker || !DAY_RE.test(date) || str(raw.market) !== "US") return null;
  const actual = num(raw.reported_eps);
  const providerEstimate = num(raw.estimated_eps);
  const calendarEstimate = num(raw.eps_estimate);
  const expected = providerEstimate ?? calendarEstimate;
  const source = SOURCE_NAMES[str(raw.actuals_source)] ?? (str(raw.actuals_source) || "Nasdaq earnings calendar");
  const capturedAt = str(raw.actuals_captured_at) || str(raw.captured_at) || null;
  const time = str(raw.time).toLowerCase();
  const eps: ResultEps | null =
    actual !== null && expected !== null && !basisClash(providerEstimate, calendarEstimate)
      ? { actual, expected, ...epsResult(actual, expected), source, asOf: capturedAt }
      : null;
  return {
    ticker,
    company: str(raw.company) || ticker,
    date,
    session: time === "bmo" ? "bmo" : time === "amc" ? "amc" : "unknown",
    eps,
    capturedAt,
    calendarEstimate,
    reported: actual !== null,
  };
}

/**
 * The EPS pair the earnings day job stored with the release (`eps`: the calendar's actual and estimate, read the
 * evening of the report), for the hours before the actual reaches `tm_earnings_events` (the actuals job fills it the
 * next evening). Only a pair from one provider, on the calendar's basis (basisClash against its own estimate), and
 * never a profit or loss the release does not report.
 */
export function releaseEps(doc: Record<string, unknown> | null, calendarEstimate: number | null): ResultEps | null {
  const raw = doc && doc.eps && typeof doc.eps === "object" ? (doc.eps as Record<string, unknown>) : null;
  if (!raw) return null;
  const actual = num(raw.actual);
  const expected = num(raw.estimate);
  const source = str(raw.actual_source);
  if (actual === null || expected === null || !source || source !== str(raw.estimate_source)) return null;
  if (basisClash(expected, calendarEstimate)) return null;
  // A profit the release itself does not show: the provider's "actual" is its own adjusted figure (CBRS, Nov 12: the
  // calendar's $0.13 against a GAAP loss of $0.67 and no adjusted EPS in the release), so it is not said.
  const gaap = raw.gaap && typeof raw.gaap === "object" ? num((raw.gaap as Record<string, unknown>).value) : null;
  const adjusted = raw.adjusted && typeof raw.adjusted === "object" ? num((raw.adjusted as Record<string, unknown>).value) : num(raw.adjusted);
  if (adjusted === null && gaap !== null && Math.sign(gaap) !== Math.sign(actual)) return null;
  const filing = doc!.filing && typeof doc!.filing === "object" ? (doc!.filing as Record<string, unknown>) : {};
  const asOf = str(doc!.generated_at) || str(filing.filed_at) || null;
  return { actual, expected, ...epsResult(actual, expected), source, asOf };
}

/* ── the move ───────────────────────────────────────────────────────────── */

/** A quote taken at or after 15:55 New York is the session's last price. */
const LAST_SNAPSHOT_HOUR = 15;
const LAST_SNAPSHOT_MINUTE = 55;

export type PriceMeta = { lastDate: string | null; fetchedAt: string | null };
export type LiveQuote = { pct: number; capturedAt: string; price?: number | null };
export type PremarketQuote = { pct: number; date: string; at: string | null; price?: number | null };

/** After the open on the reaction day, the pre-market print still stands until the session's first quote, up to 10:30. */
const OPEN_GRACE_HOUR = 10;
const OPEN_GRACE_MINUTE = 30;

/**
 * How the stock took the results:
 * 1. the measured close-to-close move (lib/earnings-season.ts) once the reaction session's close is final;
 * 2. else the live quote, when it is from the reaction session (its day change is from the close before it);
 * 3. else, before the open on the reaction day, the pre-market quote (the newer of the movers snapshot and the stored
 *    extended quote);
 * 4. else, after an after-close report and before the next open, the after-hours print against the report day's
 *    close. It is said as "after hours", never as the session's move.
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
  /** The stored after-hours or pre-market quote (lib/extended-quotes.ts), when there is one. */
  extended?: ExtendedQuote | null;
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
    // The price job's last snapshot of a session is at 15:59, never at 16:00: once the session is over, a quote from
    // its last few minutes is how the day ended.
    const over = endDay < today || now.getTime() >= etMs(endDay, 16, 0);
    const final = at >= etMs(endDay, 16, 0) || (over && at >= etMs(endDay, LAST_SNAPSHOT_HOUR, LAST_SNAPSHOT_MINUTE));
    const started = at >= etMs(endDay, 9, 30);
    if (started && (final || endDay === today)) {
      return { pct: quote.pct, kind: final ? "day" : "today", day: endDay, nextDay: session === "amc", source: final ? "last price of the session" : "live price", asOf: quote.capturedAt, price: quote.price ?? null };
    }
  }
  const premarket = input.premarket;
  const beforeOpen = endDay === today && now.getTime() < etMs(today, 9, 30);
  // Just after the open the session's first quote can be minutes away (the price job's first run): until it is in,
  // the pre-market print is still how the stock took the results, said as "before the open", never as the session.
  const openGrace = endDay === today && !beforeOpen && now.getTime() < etMs(today, OPEN_GRACE_HOUR, OPEN_GRACE_MINUTE);
  const preWindow = beforeOpen || openGrace;
  const movers = preWindow && premarket && premarket.date === today && Number.isFinite(premarket.pct) ? premarket : null;
  // The stored quote stops being "live" at the open; in the grace minutes its pre-market print still counts.
  const extended = input.extended && (openGrace || isExtendedLive(input.extended, now)) ? input.extended : null;
  // A pre-market print counts only when it moved from the close the report came after (amc) or before (bmo).
  const reportClose = session === "amc" ? date : previousTradingDay(endDay);
  const pre = preWindow && extended?.session === "pre" && etDayOf(extended.asOf) === today && etDayOf(extended.regularCloseAt) === reportClose ? extended : null;
  if (movers || pre) {
    // The newer of the two pre-market snapshots.
    const useStored = pre && (!movers || !movers.at || Date.parse(pre.asOf) > Date.parse(movers.at));
    if (useStored) return { pct: pre.changePct, kind: "before_open", day: endDay, nextDay: session === "amc", source: "pre-market price", asOf: pre.asOf, price: pre.price };
    return { pct: movers!.pct, kind: "before_open", day: endDay, nextDay: session === "amc", source: "pre-market price", asOf: movers!.at, price: movers!.price ?? null };
  }
  // After an after-close report, before the reaction session opens: the after-hours print on the report evening.
  const post = session === "amc" ? (extended?.session === "post" ? extended : extended?.lastPost ?? null) : null;
  if (post && etDayOf(post.regularCloseAt) === date && etDayOf(post.asOf) === date && now.getTime() < etMs(endDay, 9, 30)) {
    return { pct: post.changePct, kind: "after_hours", day: date, nextDay: true, source: "after-hours price", asOf: post.asOf, price: post.price };
  }
  return null;
}

/* ── the call ───────────────────────────────────────────────────────────── */

const CALL_WORDS: Record<string, ResultCallWord> = { add: "Buy more", hold: "Keep", trim: "Sell some" };

export function callWord(value: unknown): ResultCallWord | null {
  return CALL_WORDS[str(value).toLowerCase()] ?? null;
}

/** A call whose last run is more than this many trading days old is not current: the stock is no longer reviewed. */
export const CALL_STALE_SESSIONS = 3;

/** The trading day `count` sessions before `day`. */
function sessionsBefore(day: string, count: number): string {
  let out = day;
  for (let i = 0; i < count; i++) out = previousTradingDay(out);
  return out;
}

/**
 * Whether the results moved the steady call (backend/call_stability.py). The results count from the day the market
 * first had them; a change on or after it is the results' change, a run on or after it that kept the call means the
 * call held, and before that run the call is only stated.
 *
 * The call is only said while it is current: its last run (`session`) within CALL_STALE_SESSIONS trading days of
 * today. A stock the call engine stopped reviewing keeps an old state whose `updated_at` still moves (other jobs touch
 * the document), so that stamp never stands for a review: `asOf` is the run's own day, or the change's.
 */
export function callAfter(stability: Record<string, unknown> | null, date: string, session: Session, today: string): ResultCall | null {
  if (!stability) return null;
  const call = callWord(stability.call);
  if (!call) return null;
  const ran = str(stability.session);
  if (!DAY_RE.test(ran) || ran < sessionsBefore(today, CALL_STALE_SESSIONS)) return null;
  const knownOn = session === "amc" ? nextTradingDay(date) : date;
  const changes = Array.isArray(stability.changes) ? (stability.changes as Array<Record<string, unknown>>) : [];
  const change = [...changes].reverse().find((row) => {
    const day = str(row.date);
    return DAY_RE.test(day) && day >= knownOn && day <= today;
  });
  if (change) {
    const to = callWord(change.to);
    const from = callWord(change.from);
    if (to && from && to === call && from !== to) {
      return { status: "changed", call, from, on: str(change.date), reason: str(change.reason) || null, asOf: str(change.date) };
    }
  }
  if (ran >= knownOn) return { status: "held", call, asOf: ran };
  return { status: "pending", call, asOf: null };
}

/* ── the release (earnings day job) ─────────────────────────────────────── */

const GUIDANCE_CHANGES = new Set(["raised", "lowered", "mixed", "narrowed", "reaffirmed", "issued"]);

function lowerFirst(label: string): string {
  // "Adjusted EPS" -> "adjusted EPS", "Revenue" -> "revenue", "EPS" stays.
  return /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;
}

function bareRange(low: number | null, high: number | null, unit: unknown): string | null {
  if (low === null || high === null) return null;
  const fmt = (value: number) => (unit === "usd_per_share" ? fmtEps(value) : revenueWords(value));
  return low === high ? fmt(low) : `${fmt(low)} to ${fmt(high)}`;
}

function rangeWords(item: Record<string, unknown>): string | null {
  const label = str(item.label);
  const range = bareRange(num(item.low), num(item.high), item.unit);
  if (!range || !label) return null;
  const period = str(item.period);
  return `${period ? `${period} ` : ""}${period ? lowerFirst(label) : label} ${range}`;
}

const DIRECTION_RANK: Record<string, number> = { lowered: 0, raised: 1, narrowed: 2, reaffirmed: 3, new: 4, issued: 4 };
const METRIC_RANK: Record<string, number> = { revenue: 0, net_bookings: 1, adjusted_eps: 2, eps: 3, adjusted_ebitda: 4 };

/**
 * The outlook item worth showing, the same pick as the earnings day job's own sentence
 * (backend/agentdata/earnings_day.py guidance_lead_item): the one that moved most, revenue before EPS, the full year
 * before a quarter. Items without a range are skipped.
 */
export function leadGuidanceItem(items: Array<Record<string, unknown>>): Record<string, unknown> | null {
  const ranged = items.filter((item) => rangeWords(item) !== null);
  const key = (item: Record<string, unknown>) => [
    DIRECTION_RANK[str(item.direction)] ?? 5,
    METRIC_RANK[str(item.metric)] ?? 9,
    /full year|fiscal/i.test(str(item.period)) ? 0 : 1,
  ];
  return (
    ranged
      .map((item, index) => ({ item, index, key: key(item) }))
      .sort((a, b) => a.key[0]! - b.key[0]! || a.key[1]! - b.key[1]! || a.key[2]! - b.key[2]! || a.index - b.index)[0]?.item ?? null
  );
}

/** Revenue against the estimate, with the EPS thresholds, judged on the unrounded surprise. */
export function revenueResult(value: number, expected: number | null): Pick<ResultRevenue, "expected" | "verdict" | "surprisePct"> {
  if (expected === null || !(expected > 0)) return { expected: null, verdict: null, surprisePct: null };
  const pct = (value / expected - 1) * 100;
  return { expected, verdict: pct >= 1 ? "beat" : pct <= -1 ? "miss" : "in_line", surprisePct: pct };
}

/** A period or headline that is the whole year: "Full year 2026", "Fiscal 2027", "Raises Full-Year Outlook". */
const FULL_YEAR = /\b(?:full[- ]year|fiscal(?: year)? ?20\d\d|fiscal[- ]year|annual)\b/i;

export function releaseParts(doc: Record<string, unknown> | null): { revenue: ResultRevenue | null; guidance: ResultGuidance | null; period: string | null; href: string | null } {
  if (!doc) return { revenue: null, guidance: null, period: null, href: null };
  const filing = (doc.filing && typeof doc.filing === "object" ? doc.filing : {}) as Record<string, unknown>;
  const url = str(filing.url) || str(filing.index_url) || null;
  const filedAt = str(filing.filed_at) || null;
  const source = "The company's 8-K release";
  const rev = (doc.revenue && typeof doc.revenue === "object" ? doc.revenue : null) as Record<string, unknown> | null;
  const value = rev ? num(rev.value) : null;
  const yoyPct = rev ? num(rev.yoy_pct) : null;
  const estimate = rev && rev.estimate && typeof rev.estimate === "object" ? num((rev.estimate as Record<string, unknown>).value) : null;
  // Only a revenue the release compares with the same quarter a year ago: a figure read from a sentence with nothing
  // beside it has been a ratio's base or a segment before (YETI's "$90.0 million"), so it is not shown alone.
  const revenue: ResultRevenue | null =
    value !== null && value > 0 && yoyPct !== null && url ? { value, yoyPct, ...revenueResult(value, estimate), source, url, asOf: filedAt } : null;
  const g = (doc.guidance && typeof doc.guidance === "object" ? doc.guidance : null) as Record<string, unknown> | null;
  const change = g ? str(g.change).toLowerCase() : "";
  const items = g && Array.isArray(g.items) ? (g.items as Array<Record<string, unknown>>) : [];
  const lead = leadGuidanceItem(items);
  const guidance: ResultGuidance | null =
    GUIDANCE_CHANGES.has(change) && url
      ? {
          change: change as ResultGuidance["change"],
          first: lead ? rangeWords(lead) : null,
          previous: lead ? bareRange(num(lead.prev_low), num(lead.prev_high), lead.unit) : null,
          fullYear: FULL_YEAR.test(lead ? str(lead.period) : str(g!.headline_quote)),
          source,
          url,
          asOf: filedAt,
        }
      : null;
  const period = doc.period && typeof doc.period === "object" ? str((doc.period as Record<string, unknown>).label) || null : null;
  const read = doc.read && typeof doc.read === "object" && typeof (doc.read as Record<string, unknown>).title === "string";
  const ticker = str(doc.ticker);
  const day = str(doc.event_date).slice(0, 10);
  return { revenue, guidance, period, href: read && ticker && DAY_RE.test(day) ? earningsDayHref(ticker, day) : null };
}

/**
 * The finished close-to-close move the earnings day job measured from Yahoo's daily closes (`reaction`, final), or
 * null. The read's own move comes from our price history first; this covers a stock whose stored history is behind,
 * where the live quote has already moved on to the next session and the move would otherwise be lost.
 */
export function releaseMove(doc: Record<string, unknown> | null, session: Session): Omit<ResultMove, "usualPct" | "usualCount"> | null {
  const reaction = doc && doc.reaction && typeof doc.reaction === "object" ? (doc.reaction as Record<string, unknown>) : null;
  if (!reaction || reaction.final !== true) return null;
  const pct = num(reaction.pct);
  const day = str(reaction.to_date);
  if (pct === null || !DAY_RE.test(day)) return null;
  return { pct, kind: "day", day, nextDay: session === "amc", source: "daily closes from Yahoo Finance", asOf: day };
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
  /** `tm_extended_quotes/{TICKER}`, parsed: the after-hours or pre-market move before the reaction session opens. */
  extended?: ExtendedQuote | null;
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
  // The calendar's pair first; on results night, before the actuals job fills it, the one stored with the release.
  const eps = event.eps ?? (event.reported ? null : releaseEps(input.release, event.calendarEstimate ?? null));
  if (!eps && !revenue && !guidance) return null;

  const picked =
    pickMove({ date: event.date, session, today, now: input.now, past: own, priceMeta: input.priceMeta, quote: input.quote, premarket: input.premarket, extended: input.extended ?? null }) ??
    releaseMove(input.release, session);
  const earlier = past.filter((report) => report.date !== event.date && report.date < event.date);
  const stats = moveStats(earlier, input.history?.typicalDayPct ?? null);
  const move: ResultMove | null = picked ? { ...picked, usualPct: stats.usual, usualCount: stats.count } : null;
  const call = callAfter(input.stability, event.date, session, today);

  const sources: ResultSource[] = [];
  if (eps) sources.push({ label: "EPS and estimate", source: eps.source, url: null, at: eps.asOf });
  if (revenue || guidance) sources.push({ label: revenue && guidance ? "Revenue and outlook" : revenue ? "Revenue" : "Outlook", source: "the company's 8-K", url: (revenue ?? guidance)!.url, at: (revenue ?? guidance)!.asOf });
  if (move) sources.push({ label: "Move", source: move.source, url: null, at: move.asOf });
  // Only a run after the results reviewed the call; a call still waiting for one has no review to date.
  if (call && call.status !== "pending" && call.asOf) sources.push({ label: "Call reviewed", source: "", url: null, at: call.asOf });

  return {
    ticker: event.ticker,
    company: event.company,
    reportDate: event.date,
    session,
    period,
    eps,
    revenue,
    guidance,
    move,
    call,
    reportHref: href,
    sources,
  };
}
