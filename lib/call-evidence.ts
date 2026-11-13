/**
 * The evidence under a call and the measurable conditions that would change it.
 *
 * Pure: the stock page (and Ask) load the numbers we already store and this turns them into sentences. Nothing here
 * is written by a model. Every evidence line carries a number, a comparison and a dated source; every condition
 * names a number someone can check after the fact. When a number is missing, its line is left out. A vague line
 * is never written in its place.
 *
 * Where the numbers come from:
 * - sales over the last four quarters and the fiscal years before: `tm_stock_facts` (stockanalysis, from company
 *   filings), dated by the latest results report in `tm_earnings_history` (8-K item 2.02, with the quarter's end
 *   and whether a 10-Q or 10-K followed);
 * - earnings per share against the forecast, and the forecast for the next report: `tm_earnings_events`;
 * - moves against the S&P 500 and the 52-week high: adjusted daily closes in `tm_price_history_daily` (SPY for
 *   the market);
 * - the P/E against its own median: the screener snapshot's daily P/E record;
 * - the dividend: `tm_stock_facts` dividends, over today's price.
 *
 * The conditions follow the rule that holds calls steady (backend/call_stability.py): one step at a time (Buy more
 * and Sell some only ever move to Keep, Keep moves either way), and the only things that can move a call quickly are
 * a results report, a move of the stock's own beyond `MOVE_SIGMA` of its usual daily swings against the market (times
 * the square root of the days), and an S&P 500 drop of `MARKET_DROP_PCT` in `MARKET_DROP_SESSIONS` sessions. The
 * thresholds are those numbers for this stock, and the report bars come from its own growth: the bar to buy more is
 * the slower of today's pace and the last full year's (when the last year was at least half today's), and a sharp
 * slowdown means growth halves.
 */

import { dayPossessive, daysFromToday, onDayWords } from "@/lib/day-words";
import type { CallWord } from "@/lib/stock-chart";

// The steady-call rule's numbers (backend/call_stability.py `Rules`). call-evidence.test.ts checks they still match.
export const MOVE_SIGMA = 4.0;
export const MOVE_WEEK_SESSIONS = 5;
export const VOL_SESSIONS = 60;
export const MARKET_DROP_PCT = 4.0;
export const MARKET_DROP_SESSIONS = 5;

const SESSION_WORDS: Record<number, string> = { 3: "three", 4: "four", 5: "five", 6: "six" };
const TIMES_WORDS: Record<number, string> = { 2: "twice", 3: "three times", 4: "four times", 5: "five times", 6: "six times" };
export const MIN_HOLD_SESSIONS = 12;

export type DailyClose = { date: string; close: number };

export type ResultsReport = {
  /** Day the results came out (8-K item 2.02), YYYY-MM-DD. */
  date: string;
  /** Last day of the quarter or year reported. */
  periodEnd: string | null;
  /** "10-Q" or "10-K" when the report says which periodic filing followed. */
  form: string | null;
  /** The results release on SEC EDGAR (the 8-K), when stored. */
  url?: string | null;
};

/** A row of the earnings calendar (`tm_earnings_events`), past or upcoming. */
export type CalendarReport = {
  event_date: string;
  eps_estimate?: number | null;
  estimated_eps?: number | null;
  reported_eps?: number | null;
  eps_surprise?: number | null;
  source?: string | null;
  actuals_source?: string | null;
};

export type CallEvidenceInput = {
  ticker: string;
  call: CallWord | null;
  /** New York day, YYYY-MM-DD. */
  today: string;
  /** Sales over the last four quarters, from the stock's facts. */
  sales: {
    revenue: number | null;
    growthPct: number | null;
    /** The facts' yearly rows ("FY 2026"); anything else is ignored. */
    history: ReadonlyArray<{ period: string; revenue?: number | null }>;
    /** When the facts were fetched (ISO). */
    capturedAt: string | null;
  } | null;
  /** Results reports, any order. */
  reports: ReadonlyArray<ResultsReport>;
  /** Calendar rows, any order. */
  calendar: ReadonlyArray<CalendarReport>;
  /** The next report, when the calendar has one. */
  nextReport: { date: string; epsEstimate: number | null } | null;
  /** Adjusted daily closes, oldest first: the stock and SPY. */
  series: ReadonlyArray<DailyClose> | null;
  benchmark: ReadonlyArray<DailyClose> | null;
  /** Where the closes come from ("Yahoo Finance"). */
  priceSource?: string | null;
  /** Today's P/E and its median over the days the screener has on file. */
  valuation: { pe: number | null; medianPe: number | null; from: string | null; to: string | null; days: number | null } | null;
  /** Dividend per share a year, today's price, years raised in a row, and when the facts were fetched. */
  dividend: { annual: number | null; price: number | null; growthYears: number | null; capturedAt: string | null } | null;
  /**
   * The steady call, when it is published: the day it took its value, and which way its last change went (+1 up to
   * it, -1 down to it, 0 when it never changed). Null when calls are not held steady.
   */
  steady: { since: string | null; lastStep: -1 | 0 | 1 } | null;
  /**
   * Say the last close's day in words ("closed at $552.90 yesterday", lib/day-words.ts). Only for a page rendered at
   * request time: Ask's answers are kept and read later, so they keep the date. Sources always keep the date.
   */
  sayDays?: boolean;
};

/** One side of a fact card's comparison bar: "NVDA" at -13.2 shown as "−13%", "S&P 500" at -0.9. */
export type EvidenceBar = { label: string; value: number; display: string };

/**
 * A fact as the stock page's card (owner, Nov 12: "these bullet points' issue... It's a very big issue for me"): one
 * big figure, a label of a few words, at most one short line that adds something the figure and the bars don't, and a
 * bar pair where the fact compares two numbers (the stock against the S&P 500, now against before). Built from the
 * same numbers as the sentence, never parsed from it.
 */
export type EvidenceCard = {
  /** The big number: "+83%", "−13%", "$1.23", "2.4%", "18×". */
  figure: string;
  /** Which way the figure reads for the company: up (green), down (red), or neither. */
  tone: "up" | "down" | null;
  /** What the figure is, lower case, a few words: "sales over four quarters". */
  label: string;
  /** At most one short line, or null when the figure, label and bars already say it all. */
  line: string | null;
  /** The two numbers the fact compares, the stock's (or today's) first. */
  compare: [EvidenceBar, EvidenceBar] | null;
  /**
   * What the bars are: "change" (a rise or fall, in percent), drawn in the up tone right of zero and the down tone
   * left of it; "level" (a price, a P/E, earnings per share), drawn in ink, a loss still left of zero.
   */
  compareKind: "change" | "level" | null;
};

export type EvidenceLine = {
  id: "sales" | "move" | "high" | "eps" | "dividend" | "valuation";
  text: string;
  /** Short, with a date: "From the 10-Q for the quarter to Jul 26, reported Aug 26". */
  source: string;
  /** The same fact taken apart for the stock page's fact card. */
  card: EvidenceCard;
};

/**
 * One measurable condition inside a check, built from the same numbers as the check's sentence (never parsed from it).
 * - `eps`: earnings per share in the next report against analysts' forecast, in dollars a share. A forecast loss stays
 *   negative: `above -0.12` is a loss smaller than 12 cents (or a profit).
 * - `sales_growth`: sales growth over four quarters as of the next report, in percent. `below 0` is shrinking sales.
 * - `relative_return`: the stock's return minus the S&P 500's over `period.sessions` trading days, in percentage
 *   points. Negative is worse than the index: `below -9` is a day 9 points worse.
 */
export type CheckCondition = {
  kind: "eps" | "sales_growth" | "relative_return";
  operator: "above" | "below";
  value: number;
  unit: "usd_per_share" | "percent" | "points";
  /** The next results report, or a run of trading sessions ending on any close. */
  period: { kind: "report" } | { kind: "sessions"; sessions: number };
  /** What a relative return is measured against; null for report figures. */
  benchmark: "S&P 500" | null;
  /** For a one-day relative return: the stock's usual daily gap from the index, in points. Null elsewhere. */
  usual: number | null;
};

export type CheckSource = { source: string; href: string | null };

/**
 * One thing that would change the call (owner rules 3 and 9): which way it would move the call and where to, the
 * sentence, where the number comes from, and the same condition as structured fields for the stock page's cards.
 * `href` is the results release on SEC EDGAR behind a sales figure (the 8-K, not the 10-Q the source names).
 *
 * Grouping: every condition inside one check must hold together (`join: "and"`, e.g. a beat AND growth above the bar);
 * checks with the same `way` are alternatives, any one of which could move the call.
 */
export type ChangeCheck = {
  way: "raise" | "lower";
  /** The threshold: "7%", "$4.85". */
  figure: string;
  text: string;
  /** Empty only when the figures carry no date at all; the check is still listed. */
  source: string;
  href: string | null;
  /** The same source taken apart, one entry per figure behind the check (the forecast, the filing), each with its link. */
  sources: CheckSource[];
  /** The call it could move to: one step only (Keep to Buy more or Sell some, either of those back to Keep). */
  to: CallWord;
  /** What could set it off: the next results report, or a move of the stock's own against the market. */
  event: "report" | "move";
  /** The next report's day (YYYY-MM-DD) when the calendar has one within the next 100 days; null otherwise. */
  eventDate: string | null;
  join: "and";
  conditions: CheckCondition[];
};

export type CallEvidence = {
  /** Two or three lines, most telling first. */
  evidence: EvidenceLine[];
  /** What would change the call, each a sentence with a number in it. */
  conditions: string[];
  /** The same conditions taken apart: one check per line, each with its figure and source. */
  checks: ChangeCheck[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** "Nov 17", or "Dec 22, 2025" when the day falls in another year than `today`. */
function day(iso: string | null | undefined, today: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  if (!match || !month) return "";
  // A non-breaking space, so "Nov 17" never splits across lines.
  const text = `${month}\u00a0${Number(match[3])}`;
  return match[1] === today.slice(0, 4) ? text : `${text}, ${match[1]}`;
}

/** "Nov 17", or with `sayDays` a close within the week in words: "yesterday's close", "Monday's close". */
function closeDay(iso: string | null | undefined, input: Pick<CallEvidenceInput, "today" | "sayDays">): string {
  const gap = input.sayDays ? daysFromToday(iso, input.today) : null;
  return gap !== null && gap <= 0 && gap >= -6 ? `${dayPossessive(iso, input.today)} close` : day(iso, input.today);
}

/** "on Nov 17", or with `sayDays` the recent day in words: "yesterday", "on Monday" (lib/day-words.ts). */
function onDay(iso: string | null | undefined, input: Pick<CallEvidenceInput, "today" | "sayDays">): string {
  const words = input.sayDays ? onDayWords(iso, input.today) : "";
  return words ? words.replace(/ (\d)/, " $1") : `on ${day(iso, input.today)}`;
}

function dayMs(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

function daysBetween(from: string, to: string): number | null {
  const a = dayMs(from);
  const b = dayMs(to);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : null;
}

/** "83%", "4.2%": whole numbers from 10 up. */
function pct(value: number): string {
  const size = Math.abs(value);
  return size >= 10 ? `${Math.round(size)}%` : `${size.toFixed(1).replace(/\.0$/, "")}%`;
}

function dollars(value: number): string {
  return `$${Math.abs(value).toFixed(2)}`;
}

/** "+83%", "−13%", "0%": a percent with its sign, for a card's figure and its bars. */
function signedPct(value: number): string {
  const text = pct(value);
  return text === "0%" ? text : `${value > 0 ? "+" : "−"}${text}`;
}

/** "−$0.12" for a loss, "$1.23" otherwise. */
function signedDollars(value: number): string {
  return `${value <= -0.005 ? "−" : ""}${dollars(value)}`;
}

function toneOf(value: number): EvidenceCard["tone"] {
  return value >= 0.05 ? "up" : value <= -0.05 ? "down" : null;
}

function bigMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(abs >= 1e11 ? 0 : 1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}M`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

/** The weekday `sessions` trading days after `start` (holidays ignored), as the rule counts a hold. */
export function addSessions(start: string, sessions: number): string {
  const date = new Date(dayMs(start));
  let left = Math.max(0, sessions);
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * The stock's usual daily move against the market, as the rule measures it (backend `daily_swing`): the standard
 * deviation of its daily return minus SPY's, over the last `VOL_SESSIONS` days both traded. A fraction; null with
 * fewer than 20 days.
 */
export function dailySwing(series: ReadonlyArray<DailyClose> | null, benchmark: ReadonlyArray<DailyClose> | null): number | null {
  if (!series || !benchmark) return null;
  const market = new Map<string, number>();
  for (const point of benchmark) if (fin(point.close) && point.close > 0) market.set(point.date, point.close);
  const excess: number[] = [];
  let prev: DailyClose | null = null;
  for (const point of series) {
    if (!fin(point.close) || point.close <= 0) continue;
    if (prev && market.has(point.date) && market.has(prev.date)) {
      excess.push(point.close / prev.close - 1 - (market.get(point.date)! / market.get(prev.date)! - 1));
    }
    prev = point;
  }
  const values = excess.slice(-VOL_SESSIONS);
  if (values.length < 20) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return variance > 0 ? Math.sqrt(variance) : null;
}

/**
 * Growth from one fiscal year's sales to the next, for the latest two consecutive years on file. A year whose sales
 * are the four quarters themselves (the last report was the annual one) says nothing new, so the year before it is
 * used instead.
 */
function lastYearGrowth(
  history: ReadonlyArray<{ period: string; revenue?: number | null }>,
  fourQuarters?: number | null,
): { pct: number; year: number } | null {
  const byYear = new Map<number, number>();
  for (const row of history) {
    const match = /^FY\s*(\d{4})$/i.exec(row.period.trim());
    if (match && fin(row.revenue) && row.revenue > 0) byYear.set(Number(match[1]), row.revenue);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);
  const same = (value: number | undefined) => value !== undefined && fin(fourQuarters) && fourQuarters > 0 && Math.abs(value / fourQuarters - 1) < 0.005;
  const latest = same(byYear.get(years[0]!)) ? years[1] : years[0];
  if (latest === undefined || !byYear.has(latest - 1)) return null;
  return { pct: (byYear.get(latest)! / byYear.get(latest - 1)! - 1) * 100, year: latest };
}

/**
 * The results report the four-quarter figures include: the latest on or before three days before the facts were
 * fetched (a source can lag a report by a day or two). Null when there is none, or when it is so old that a report
 * must be missing from the list.
 */
export function reportBehind(reports: ReadonlyArray<ResultsReport>, capturedAt: string | null): ResultsReport | null {
  const fetched = capturedAt ? dayMs(capturedAt) : NaN;
  if (!Number.isFinite(fetched)) return null;
  const settled = new Date(fetched - 3 * 86_400_000).toISOString().slice(0, 10);
  let found: ResultsReport | null = null;
  for (const report of reports) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(report.date) || report.date > settled) continue;
    if (!found || report.date > found.date) found = report;
  }
  if (found && fetched - dayMs(found.date) > 120 * 86_400_000) return null;
  return found;
}

function salesLine(input: CallEvidenceInput): EvidenceLine | null {
  const sales = input.sales;
  if (!sales || !fin(sales.growthPct) || !fin(sales.revenue) || sales.revenue <= 0) return null;
  const g0 = sales.growthPct;
  const verb = g0 >= 0.5 ? `rose ${pct(g0)}` : g0 <= -0.5 ? `fell ${pct(g0)}` : "were flat";
  let text = `${input.ticker}'s sales ${verb} over the last four quarters, to ${bigMoney(sales.revenue)}`;
  const year = lastYearGrowth(sales.history, sales.revenue);
  if (year) {
    const g1 = year.pct;
    // A year under half a percent either way would read "after falling 0.3%" or "faster than the 0.2%": say it was
    // flat instead ("as in" when the last four quarters were flat too).
    if (Math.abs(g1) < 0.5) text += Math.abs(g0) < 0.5 ? `, as in fiscal ${year.year}` : `, after flat sales in fiscal ${year.year}`;
    else if (g1 < 0 && g0 >= 0) text += `, after falling ${pct(g1)} in fiscal ${year.year}`;
    // Sales that fell: "faster" or "slower" than a year's rise or fall reads backwards, so say what the year did.
    else if (g0 < 0) text += `, after ${g1 < 0 ? "falling" : "growing"} ${pct(g1)} in fiscal ${year.year}`;
    else if (g0 - g1 > 2) text += `, faster than its ${pct(g1)} growth in fiscal ${year.year}`;
    else if (g1 - g0 > 2) text += `, slower than its ${pct(g1)} growth in fiscal ${year.year}`;
    else text += `, about the same as its ${pct(g1)} growth in fiscal ${year.year}`;
  }
  text += ".";
  const source = salesSource(input)?.source ?? "";
  if (!source) return null;
  // The card: the four quarters' growth large and the fiscal year as the second bar; only without that bar does a line
  // say the sales in dollars and the pace.
  const flat = Math.abs(g0) < 0.5;
  const yearFlat = !year || Math.abs(year.pct) < 0.5;
  const pace =
    !year || flat || yearFlat || g0 < 0 || year.pct < 0
      ? ""
      : g0 - year.pct > 2
        ? `, faster than in fiscal ${year.year}`
        : year.pct - g0 > 2
          ? `, slower than in fiscal ${year.year}`
          : `, about the pace of fiscal ${year.year}`;
  const compared = Boolean(year && !(flat && yearFlat));
  const card: EvidenceCard = {
    figure: flat ? "0%" : signedPct(g0),
    tone: flat ? null : toneOf(g0),
    label: "sales over four quarters",
    // With the two growth bars the card says it all: the figure and the comparison, no sentence (judges, ship 85).
    line: compared ? null : `${bigMoney(sales.revenue)} in sales${pace}.`,
    compare: compared && year
        ? [
            { label: "Past four quarters", value: flat ? 0 : g0, display: flat ? "0%" : signedPct(g0) },
            { label: `Fiscal ${year.year}`, value: yearFlat ? 0 : year.pct, display: yearFlat ? "0%" : signedPct(year.pct) },
          ]
        : null,
    compareKind: compared ? "change" : null,
  };
  return { id: "sales", text, source, card };
}

/** Where the four-quarter sales figures come from, and the results release's link on SEC EDGAR when stored. */
function salesSource(input: CallEvidenceInput): { source: string; href: string | null } | null {
  const sales = input.sales;
  if (!sales) return null;
  const report = reportBehind(input.reports, sales.capturedAt);
  const source = report
    ? report.periodEnd
      ? `From the ${report.form ?? "results"} for the ${report.form === "10-K" ? "year" : "quarter"} to ${day(report.periodEnd, input.today)}, reported ${day(report.date, input.today)}`
      : `From the results reported ${day(report.date, input.today)}`
    : sales.capturedAt
      ? `From company filings, as of ${day(sales.capturedAt, input.today)}`
      : "";
  if (!source) return null;
  const href = report?.url && /^https:\/\/www\.sec\.gov\//.test(report.url) ? report.url : null;
  return { source, href };
}

/** Where the forecast for the next report comes from: the calendar row for that day. */
function forecastSource(input: CallEvidenceInput, date: string): string {
  const row = input.calendar.find((item) => item.event_date.slice(0, 10) === date);
  return /nasdaq/i.test(row?.source ?? "") ? "Analysts' forecast on the Nasdaq earnings calendar" : "Analysts' forecast on the earnings calendar";
}

function closeOn(benchmark: ReadonlyArray<DailyClose>, date: string): number | null {
  for (let i = benchmark.length - 1; i >= 0; i--) {
    const point = benchmark[i]!;
    if (point.date === date) return fin(point.close) && point.close > 0 ? point.close : null;
    if (point.date < date) return null;
  }
  return null;
}

function priceSourceNote(input: CallEvidenceInput, last: string): string {
  return `${input.priceSource ? `${input.priceSource} daily closes` : "Daily closes"} to ${day(last, input.today)}`;
}

/** The week or month the stock moved most against the market, measured in its own usual swings. */
function moveLine(input: CallEvidenceInput, swing: number | null): EvidenceLine | null {
  const series = (input.series ?? []).filter((point) => fin(point.close) && point.close > 0);
  const benchmark = input.benchmark ?? [];
  if (series.length < 22 || !benchmark.length || swing === null) return null;
  const last = series[series.length - 1]!;
  const marketLast = closeOn(benchmark, last.date);
  if (marketLast === null) return null;
  let best: { span: number; stock: number; market: number; z: number } | null = null;
  for (const span of [MOVE_WEEK_SESSIONS, 21]) {
    const start = series[series.length - 1 - span];
    const marketStart = start ? closeOn(benchmark, start.date) : null;
    if (!start || marketStart === null) continue;
    const stock = (last.close / start.close - 1) * 100;
    const market = (marketLast / marketStart - 1) * 100;
    const z = Math.abs(stock - market) / (swing * 100 * Math.sqrt(span));
    if (!best || z > best.z) best = { span, stock, market, z };
  }
  if (!best || best.z < 1.5 || Math.abs(best.stock) < 3) return null;
  // The short window is the last five sessions, said as trading days so it is never read as this week so far (the
  // weekly memo's week, from Friday's close).
  const window = best.span === MOVE_WEEK_SESSIONS ? `${SESSION_WORDS[MOVE_WEEK_SESSIONS] ?? MOVE_WEEK_SESSIONS} trading days` : "month";
  const marketWords = Math.abs(best.market) < 0.05 ? "the S&P 500 was flat" : `the S&P 500 ${best.market > 0 ? "rose" : "fell"} ${pct(best.market)}`;
  const marketFlat = Math.abs(best.market) < 0.05;
  const to = closeDay(last.date, input);
  return {
    id: "move",
    text: `${input.ticker} ${best.stock > 0 ? "rose" : "fell"} ${pct(best.stock)} in the ${window} to ${to}, while ${marketWords}.`,
    source: priceSourceNote(input, last.date),
    // The card: the stock's move large and the stock and the S&P 500 as the bars; no line (owner rule 8: a card is a
    // figure, a label and one thing, and here the bars are that one thing). The close it runs to is in the source.
    card: {
      figure: signedPct(best.stock),
      tone: toneOf(best.stock),
      label: best.span === MOVE_WEEK_SESSIONS ? window : "past month",
      line: null,
      compare: [
        { label: input.ticker, value: best.stock, display: signedPct(best.stock) },
        { label: "S&P 500", value: marketFlat ? 0 : best.market, display: marketFlat ? "0%" : signedPct(best.market) },
      ],
      compareKind: "change",
    },
  };
}

function highLine(input: CallEvidenceInput): EvidenceLine | null {
  const all = (input.series ?? []).filter((point) => fin(point.close) && point.close > 0);
  const latest = all[all.length - 1];
  // The past year by the calendar, like the page's "Past year's range": 252 sessions back can reach past it.
  const yearAgo = latest ? new Date(dayMs(latest.date) - 365 * 86_400_000).toISOString().slice(0, 10) : "";
  const series = all.slice(-252).filter((point) => point.date > yearAgo);
  if (series.length < 120) return null;
  const last = series[series.length - 1]!;
  const high = series.reduce((top, point) => (point.close > top.close ? point : top));
  const below = (last.close / high.close - 1) * 100;
  if (below > -10) return null;
  return {
    id: "high",
    text: `${input.ticker} closed at ${dollars(last.close)} ${onDay(last.date, input)}, ${pct(below)} below its high of ${dollars(high.close)} ${onDay(high.date, input)}.`,
    source: priceSourceNote(input, last.date),
    // The card: how far below the high, and the last close and the high as the bars (the bars are its one line).
    card: {
      figure: signedPct(below),
      tone: "down",
      label: "below its past-year high",
      line: null,
      compare: [
        { label: "Last close", value: last.close, display: dollars(last.close) },
        { label: "High", value: high.close, display: dollars(high.close) },
      ],
      compareKind: "level",
    },
  };
}

/** Earnings per share against the forecast in the latest report, when the calendar has both and they agree. */
function epsLine(input: CallEvidenceInput): EvidenceLine | null {
  const latestReport = [...input.reports].map((report) => report.date).sort().pop() ?? null;
  const rows = input.calendar
    .filter((row) => /^\d{4}-\d{2}-\d{2}/.test(row.event_date) && row.event_date.slice(0, 10) < input.today && fin(row.reported_eps))
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
  const row = rows[rows.length - 1];
  if (!row) return null;
  const date = row.event_date.slice(0, 10);
  // Only the latest report: an older beat says little once a newer report is out.
  if (latestReport && Math.abs(daysBetween(date, latestReport) ?? 99) > 7 && latestReport > date) return null;
  const age = daysBetween(date, input.today);
  if (age === null || age > 120) return null;
  const actual = row.reported_eps!;
  const forecast = fin(row.estimated_eps) ? row.estimated_eps : fin(row.eps_estimate) ? row.eps_estimate : null;
  if (forecast === null) return null;
  // The feed's own surprise must agree with the two figures, or the row mixes two bases.
  if (fin(row.eps_surprise) && Math.abs(actual - forecast - row.eps_surprise) > 0.015) return null;
  const gap = actual - forecast;
  const when = `In its ${day(date, input.today)} report`;
  // The card: the reported figure large, and reported and forecast as the bars, which say the beat or miss; no second
  // sentence under it (owner rule 8, judge92). The report's day is in the source, the card's hover.
  const matched = Math.abs(gap) < 0.005;
  const card: EvidenceCard = {
    figure: signedDollars(actual),
    tone: matched ? null : gap > 0 ? "up" : "down",
    label: "earnings per share",
    line: null,
    compare: [
      { label: "Reported", value: actual, display: signedDollars(actual) },
      { label: "Forecast", value: forecast, display: signedDollars(forecast) },
    ],
    compareKind: "level",
  };
  let text: string;
  if (actual >= 0 && forecast >= 0) {
    const said = Math.abs(gap) < 0.005 ? "matched" : gap > 0 ? "beat" : "missed";
    text = `${when}, ${input.ticker}'s earnings per share of ${dollars(actual)} ${said} the ${dollars(forecast)} analysts expected.`;
  } else {
    // A loss on either side: say it as money made or lost, not as "earnings of a loss".
    const result = actual < 0 ? `lost ${dollars(actual)} a share` : `earned ${dollars(actual)} a share`;
    const versus = Math.abs(gap) < 0.005 ? "in line with" : gap > 0 ? "better than" : "worse than";
    text = `${when}, ${input.ticker} ${result}, ${versus} the ${dollars(forecast)} ${forecast < 0 ? "loss" : "profit"} analysts expected.`;
  }
  return {
    id: "eps",
    text,
    // The provider the pair came from (backend/agentdata/earnings_day.py `_PROVIDERS`).
    source: `${row.actuals_source === "alphavantage" ? "Alpha Vantage earnings data" : row.actuals_source === "yfinance" ? "Yahoo Finance earnings data" : "Nasdaq earnings calendar"}, ${day(date, input.today)}`,
    card,
  };
}

function dividendLine(input: CallEvidenceInput): EvidenceLine | null {
  const dividend = input.dividend;
  if (!dividend || !fin(dividend.annual) || !fin(dividend.price) || dividend.annual <= 0 || dividend.price <= 0) return null;
  const yieldPct = (dividend.annual / dividend.price) * 100;
  const years = fin(dividend.growthYears) ? Math.floor(dividend.growthYears) : 0;
  if (yieldPct < 0.5 || years < 5 || !dividend.capturedAt) return null;
  return {
    id: "dividend",
    text: `${input.ticker} pays ${dollars(dividend.annual)} a share a year, ${yieldPct.toFixed(1)}% of today's price, and has raised its dividend ${years} years in a row.`,
    source: `Dividend history, as of ${day(dividend.capturedAt, input.today)}`,
    card: {
      figure: `${yieldPct.toFixed(1)}%`,
      tone: null,
      label: "dividend yield",
      line: `${dollars(dividend.annual)} a share a year, raised ${years} years in a row.`,
      compare: null,
      compareKind: null,
    },
  };
}

function valuationLine(input: CallEvidenceInput): EvidenceLine | null {
  const v = input.valuation;
  if (!v || !fin(v.pe) || !fin(v.medianPe) || v.pe <= 0 || v.medianPe <= 0 || !fin(v.days) || v.days < 30 || !v.from || !v.to) return null;
  // A median from a window that ended over a month ago is not today's baseline.
  const age = daysBetween(v.to, input.today);
  if (age === null || age > 31) return null;
  const off = v.pe / v.medianPe - 1;
  if (Math.abs(off) < 0.1) return null;
  const times = (value: number) => (value >= 10 ? value.toFixed(0) : value.toFixed(1));
  return {
    id: "valuation",
    text: `At ${times(v.pe)} times its past year's earnings, ${input.ticker} is ${off < 0 ? "cheaper" : "more expensive"} than its median of ${times(v.medianPe)} from ${day(v.from, input.today)} to ${day(v.to, input.today)}.`,
    source: `Daily P/E on file, ${day(v.from, input.today)} to ${day(v.to, input.today)}`,
    // The card: today's P/E large, and today's and the median as the bars (the window the median spans is the source).
    card: {
      figure: `${times(v.pe)}×`,
      tone: null,
      label: "price to past year's earnings",
      line: null,
      compare: [
        { label: "Now", value: v.pe, display: `${times(v.pe)}×` },
        { label: "Median", value: v.medianPe, display: `${times(v.medianPe)}×` },
      ],
      compareKind: "level",
    },
  };
}

/** The bars for the next report, from the stock's own growth. */
export function growthBars(growthPct: number | null | undefined, lastYearPct: number | null | undefined): { up: number | null; down: number | null; recover: number | null } {
  if (!fin(growthPct)) return { up: null, down: null, recover: null };
  const g0 = growthPct;
  const g1 = fin(lastYearPct) ? lastYearPct : null;
  // Holding the pace: the slower of today's and last year's, when last year was at least half of today's.
  const up = g0 >= 2 ? Math.floor(g1 !== null && g1 < g0 && g1 >= g0 / 2 ? g1 : g0) : null;
  // A sharp slowdown: growth halves. Slow growers only count shrinking sales.
  // Never above the bar to buy more (g0 = 21, g1 = 10.6 would give 10 and 11), so one result can't meet both.
  const down = g0 >= 10 ? Math.min(Math.round(g0 / 2), up ?? Infinity) : g0 >= 2 ? 0 : null;
  // Back on track for a Sell some call: sales growing again, or back to last year's faster pace.
  const recover = g0 < 0 ? 0 : g1 !== null && g1 - g0 > 2 ? Math.floor(g1) : null;
  return { up, down, recover };
}

function conditionLines(input: CallEvidenceInput, swing: number | null): { lines: string[]; checks: ChangeCheck[] } {
  const call = input.call;
  if (!call) return { lines: [], checks: [] };
  const t = input.ticker;
  const next = input.nextReport;
  const until = next ? daysBetween(input.today, next.date) : null;
  const dated = next && until !== null && until >= 0 && until <= 100;
  const report = dated ? `the ${day(next.date, input.today)} report` : `${t}'s next report`;
  const Report = report.charAt(0).toUpperCase() + report.slice(1);
  const eps = dated && fin(next.epsEstimate) ? next.epsEstimate : null;
  const forecast = eps === null ? "" : eps < 0 ? `the ${dollars(eps)} a share loss analysts expect` : `the ${dollars(eps)} a share analysts expect`;
  const missed = eps === null ? "" : eps < 0 ? `misses the forecast loss of ${dollars(eps)}` : `misses the ${dollars(eps)} forecast`;

  const g0 = input.sales && fin(input.sales.growthPct) ? input.sales.growthPct : null;
  const year = input.sales ? lastYearGrowth(input.sales.history, input.sales.revenue) : null;
  const bars = growthBars(g0, year?.pct ?? null);
  // Where each sales bar comes from, said beside it (owner rule 9): today's pace over the four quarters to the last
  // report's quarter end, or the last fiscal year's.
  const behind = input.sales ? reportBehind(input.reports, input.sales.capturedAt) : null;
  const quarterEnd = behind?.periodEnd ? day(behind.periodEnd, input.today) : "";
  const fourQuarters = quarterEnd ? `the four quarters to ${quarterEnd}` : "the last four quarters";
  const paceOf = (bar: number): string =>
    g0 !== null && bar === Math.floor(g0)
      ? `, its pace over ${fourQuarters}`
      : year && bar === Math.floor(year.pct)
        ? `, its pace in fiscal ${year.year}`
        : "";
  const slowdown =
    bars.down === null
      ? ""
      : bars.down === 0
        ? "shows sales shrinking"
        : `shows sales growth below ${bars.down}%${g0 !== null && bars.down === Math.round(g0 / 2) ? `, half its ${pct(g0)} growth over ${fourQuarters}` : ""}`;

  // Before the call has stood its minimum time, a change that took it up can only be undone by a report.
  const holdUntil = input.steady?.since ? addSessions(input.steady.since, MIN_HOLD_SESSIONS) : null;
  const inHold = Boolean(holdUntil && holdUntil > input.today);
  const fallsCount = !(inHold && input.steady?.lastStep === 1);
  // The rule watches a one-day and a one-week move of the stock's own against the market, and a market drop.
  const dayBar = swing !== null ? Math.round(MOVE_SIGMA * swing * 100) : null;
  const weekBar = swing !== null ? Math.round(MOVE_SIGMA * swing * Math.sqrt(MOVE_WEEK_SESSIONS) * 100) : null;
  // The day's bar against the stock's own usual day (owner rule 9: say why a 4% fall matters), from the same swing:
  // "about four times the 1.1% it usually moves apart from the index in a day". The ratio is of the two figures as shown, so it never disagrees with them.
  const usual = swing !== null ? Number((swing * 100).toFixed(1)) : null;
  const times = dayBar !== null && usual !== null && usual > 0 ? TIMES_WORDS[Math.round(dayBar / usual)] : undefined;
  const usualDay = times && usual !== null ? `, about ${times} the ${usual}% it usually moves apart from the index in a day,` : "";
  const ownMoves =
    fallsCount && dayBar !== null && weekBar !== null && dayBar >= 3
      ? [`a day in which ${t} falls ${dayBar}% more than the S&P 500${usualDay}`, `a week in which it falls ${weekBar}% more`]
      : [];
  // Only the stock's own moves: the market-wide drop (a week in which the S&P 500 falls 4%) still moves the call in the
  // backend rule, but it says nothing about this stock, so it is not listed (council, Nov 11).
  const moves = fallsCount ? ownMoves : [];

  // Where each number comes from, for the checks: the filing behind the sales bars, the calendar behind the forecast,
  // and the daily closes behind the moves.
  const salesFrom = salesSource(input);
  const forecastFrom = dated && eps !== null ? forecastSource(input, next.date) : "";
  const closes = (input.series ?? []).filter((point) => fin(point.close) && point.close > 0);
  const lastClose = closes[closes.length - 1];
  const pricesFrom = lastClose ? priceSourceNote(input, lastClose.date) : "";
  const checks: ChangeCheck[] = [];
  // One step only (backend/call_stability.py): Keep moves to Buy more or Sell some, either of those back to Keep.
  const destination = (way: ChangeCheck["way"]): CallWord => (way === "raise" ? (call === "Trim" ? "Hold" : "Add") : call === "Add" ? "Hold" : "Trim");
  const reportDay = dated ? next.date.slice(0, 10) : null;
  // The structured conditions, from the same numbers as the sentences.
  const onReport = { kind: "report" } as const;
  const epsBeats = (operator: CheckCondition["operator"]): CheckCondition => ({ kind: "eps", operator, value: eps!, unit: "usd_per_share", period: onReport, benchmark: null, usual: null });
  const salesGrowth = (operator: CheckCondition["operator"], value: number): CheckCondition => ({ kind: "sales_growth", operator, value, unit: "percent", period: onReport, benchmark: null, usual: null });
  // Every condition said above becomes a check, so the list never says less than the sentences would.
  type From = { source: string; href?: string | null; parts?: CheckSource[] } | null;
  const check = (way: ChangeCheck["way"], figure: string, text: string, from: From, conditions: CheckCondition[]) => {
    const event = conditions.some((item) => item.period.kind === "report") ? "report" : "move";
    checks.push({
      way,
      figure,
      text,
      source: from?.source ?? "",
      href: from?.href ?? null,
      sources: from?.parts ?? (from?.source ? [{ source: from.source, href: from.href ?? null }] : []),
      to: destination(way),
      event,
      eventDate: event === "report" ? reportDay : null,
      join: "and",
      conditions,
    });
  };
  const both = (a: string, b: { source: string; href: string | null } | null): From =>
    b
      ? { source: `${a}; ${b.source.charAt(0).toLowerCase()}${b.source.slice(1)}`, href: b.href, parts: [{ source: a, href: null }, b].filter((part) => part.source) }
      : { source: a, href: null };
  // Plain words for the checks list (owner, Nov 12: "what do those percentages even mean"): a day or a week that much
  // worse than the S&P 500, with the stock's normal gap beside the day.
  const shortDay = usual !== null && times ? ` (a normal day's gap is about ${usual}%)` : "";
  const moveChecks = () => {
    if (!moves.length || dayBar === null || weekBar === null) return;
    const behind = (sessions: number, bar: number): CheckCondition => ({
      kind: "relative_return",
      operator: "below",
      value: -bar,
      unit: "points",
      period: { kind: "sessions", sessions },
      benchmark: "S&P 500",
      usual: sessions === 1 && shortDay ? usual : null,
    });
    check("lower", `${dayBar}%`, `${t} has a day ${dayBar}% worse than the S&P 500${shortDay}.`, { source: pricesFrom }, [behind(1, dayBar)]);
    check("lower", `${weekBar}%`, `${t} has a week ${weekBar}% worse than the S&P 500.`, { source: pricesFrom }, [behind(MOVE_WEEK_SESSIONS, weekBar)]);
  };

  // Phrased as what would change the call, never as a second call: the other call words are not named.
  const lines: string[] = [];
  if (call === "Hold") {
    const holds = bars.up !== null ? `sales growth stays above ${bars.up}%${paceOf(bars.up)}` : "";
    if (forecast && holds) {
      lines.push(`${Report} could raise the call if it beats ${forecast} and ${holds}.`);
      check("raise", dollars(eps!), `${Report} beats ${forecast} and ${holds}.`, both(forecastFrom, salesFrom), [epsBeats("above"), salesGrowth("above", bars.up!)]);
    } else if (forecast) {
      lines.push(`${Report} could raise the call if it beats ${forecast}.`);
      check("raise", dollars(eps!), `${Report} beats ${forecast}.`, { source: forecastFrom }, [epsBeats("above")]);
    } else if (bars.up !== null) {
      lines.push(`${Report} could raise the call if it keeps sales growth above ${bars.up}%${paceOf(bars.up)}.`);
      check("raise", `${bars.up}%`, `${Report} keeps sales growth above ${bars.up}%${paceOf(bars.up)}.`, salesFrom, [salesGrowth("above", bars.up)]);
    }
  }
  if (call === "Add" || call === "Hold") {
    const lower = [missed, slowdown].filter(Boolean);
    if (lower.length) {
      lines.push(`${lines.length ? "It" : Report} could lower the call if it ${lower.join(" or ")}.`);
      if (moves.length) lines.push(`So could ${joinOr(moves)}.`);
      if (missed) check("lower", dollars(eps!), `${Report} ${missed}.`, { source: forecastFrom }, [epsBeats("below")]);
      if (slowdown) check("lower", bars.down ? `${bars.down}%` : "0%", `${Report} ${slowdown}.`, salesFrom, [salesGrowth("below", bars.down ?? 0)]);
      moveChecks();
    } else if (ownMoves.length) {
      // Without a report line, only the stock's own moves are worth a line; the market drop alone says nothing about it.
      lines.push(`${upperFirst(joinOr(moves))} could lower the call.`);
      moveChecks();
    }
  }
  if (call === "Trim") {
    const back = bars.recover === null ? "" : bars.recover === 0 ? "sales start growing again" : `sales growth gets back above ${bars.recover}%${paceOf(bars.recover)}`;
    if (forecast && back) {
      lines.push(`${Report} could raise the call if it beats ${forecast} and ${back}.`);
      check("raise", dollars(eps!), `${Report} beats ${forecast} and ${back}.`, both(forecastFrom, salesFrom), [epsBeats("above"), salesGrowth("above", bars.recover!)]);
    } else if (forecast) {
      lines.push(`${Report} could raise the call if it beats ${forecast}.`);
      check("raise", dollars(eps!), `${Report} beats ${forecast}.`, { source: forecastFrom }, [epsBeats("above")]);
    } else if (bars.recover !== null) {
      const shows = bars.recover === 0 ? "shows sales growing again" : `shows sales growth back above ${bars.recover}%${paceOf(bars.recover)}`;
      lines.push(`${Report} could raise the call if it ${shows}.`);
      check("raise", `${bars.recover}%`, `${Report} ${shows}.`, salesFrom, [salesGrowth("above", bars.recover)]);
    }
  }
  // No "Short of that, the call stands until at least Nov 25." after these: it explains the steady-call rule rather
  // than saying what would change the call (owner rule 8: no mechanics copy).
  return { lines, checks };
}

/**
 * A condition in a few words for the stock page's cards, from its fields (never from the sentence), with the key figure
 * apart so it can be set in bold: "Earnings above " + "$2.49" + " a share", "" + "9 points" + " worse in one day".
 */
export function conditionWords(condition: CheckCondition): { lead: string; figure: string; tail: string } {
  const { kind, operator, value } = condition;
  if (kind === "eps") {
    if (value === 0) return { lead: "", figure: operator === "above" ? "A profit" : "A loss", tail: "" };
    // A forecast loss: beating it is a smaller loss, missing it a bigger one.
    if (value < 0) return { lead: `Loss ${operator === "above" ? "under" : "over"} `, figure: dollars(value), tail: " a share" };
    return { lead: `Earnings ${operator} `, figure: dollars(value), tail: " a share" };
  }
  if (kind === "sales_growth") {
    if (value === 0) return { lead: "Sales ", figure: operator === "above" ? "growing" : "shrinking", tail: "" };
    return { lead: `Sales growth ${operator} `, figure: `${Number(value.toFixed(1))}%`, tail: "" };
  }
  const sessions = condition.period.kind === "sessions" ? condition.period.sessions : 1;
  const size = Number(Math.abs(value).toFixed(1));
  return {
    lead: "",
    figure: `${size} ${size === 1 ? "point" : "points"}`,
    tail: ` ${value < 0 ? "worse" : "better"} in ${sessions === 1 ? "one day" : `${sessions} trading days`}`,
  };
}

/**
 * A condition as the stock page's figure-led card part, from its fields (never from the sentence): the threshold large,
 * what it is in a few words under it, and which side of it counts ("above", "below"), or "" when the figure or label
 * already says it ("9 points" / "worse in one day", "Shrinking" / "sales").
 */
export function conditionFigure(condition: CheckCondition): { figure: string; label: string; side: "above" | "below" | "under" | "over" | "" } {
  const { kind, operator, value } = condition;
  if (kind === "eps") {
    if (Math.abs(value) < 0.005) return { figure: operator === "above" ? "A profit" : "A loss", label: "at the report", side: "" };
    // A forecast loss reads as a loss, never "below −$0.13": beating it is a loss under $0.13, missing it one over.
    if (value < 0) return { figure: dollars(value), label: "loss per share", side: operator === "above" ? "under" : "over" };
    return { figure: dollars(value), label: "earnings per share", side: operator };
  }
  if (kind === "sales_growth") {
    if (value === 0) return { figure: operator === "above" ? "Growing" : "Shrinking", label: "sales", side: "" };
    return { figure: `${Number(value.toFixed(1))}%`, label: "sales growth", side: operator };
  }
  const sessions = condition.period.kind === "sessions" ? condition.period.sessions : 1;
  const size = Number(Math.abs(value).toFixed(1));
  const span = sessions === 1 ? "one day" : `${SESSION_WORDS[sessions] ?? sessions} trading days`;
  return { figure: `${size} ${size === 1 ? "point" : "points"}`, label: `${value < 0 ? "worse" : "better"} in ${span}`, side: "" };
}

/** A check's card as plain text ("Earnings above $2.49 a share AND sales growth above 65%"), for counting and tests. */
export function checkCardText(check: Pick<ChangeCheck, "conditions">): string {
  return check.conditions
    .map((condition, index) => {
      const { lead, figure, tail } = conditionWords(condition);
      const text = `${lead}${figure}${tail}`;
      return index ? text.charAt(0).toLowerCase() + text.slice(1) : text;
    })
    .join(" AND ");
}

function joinOr(items: string[]): string {
  if (items.length <= 2) return items.join(" or ");
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A line that argues against its own call: a missed report or a fall under Buy more, a beat or a rise under Sell
 * some. Listed under "Why" it would read as a reason for the call it contradicts, so it is left out there (the
 * landing's cards use the same test, lib/landing-taste-shared.ts). Keep has no side to argue against.
 */
export function leansAgainst(line: { id: string; text: string }, call: CallWord | null): boolean {
  const lead = line.text.split(",")[0] ?? "";
  if (call === "Add") return (line.id === "eps" && /\b(?:missed|worse than)\b/.test(line.text)) || (line.id === "move" && /\bfell\b/.test(lead));
  if (call === "Trim") return (line.id === "eps" && /\b(?:beat|better than)\b/.test(line.text)) || (line.id === "move" && /\brose\b/.test(lead));
  return false;
}

export function buildCallEvidence(input: CallEvidenceInput): CallEvidence {
  const swing = dailySwing(input.series, input.benchmark);
  // A move that argues against the call gives way to the high, as a move that says nothing does.
  const move = moveLine(input, swing);
  const candidates = [salesLine(input), move && !leansAgainst(move, input.call) ? move : highLine(input), epsLine(input), dividendLine(input), valuationLine(input)];
  // The "Why" under a call: only lines that back it, so the next one in line takes the place of one that argues against it.
  const evidence = candidates.filter((line): line is EvidenceLine => line !== null && !leansAgainst(line, input.call)).slice(0, 3);
  const { lines, checks } = conditionLines(input, swing);
  return { evidence, conditions: lines, checks };
}
