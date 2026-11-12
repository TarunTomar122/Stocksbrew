/**
 * The earnings season planner (/portfolio/earnings): every report coming for
 * the stocks a person holds or watches in the next six weeks, and what each
 * stock has done after its past reports.
 *
 * Pure rules over stored data, so it is easy to test:
 * - report dates, times, EPS estimates and results from `tm_earnings_events`;
 * - past report days the calendar does not hold, and the time of day a report
 *   came out, from the company's own 8-K "results of operations" filing
 *   (item 2.02): three years of them in `tm_earnings_history`, the newest in
 *   `tm_agent_filings`;
 * - the move after each report from the stored daily closes, measured the way
 *   `backend/agentdata/earnings_reactions.py` measures it, else the stored
 *   reaction.
 * Nothing here is estimated. A stock with no history says so.
 */
import { addDays, defaultWeekStart, resultWord, surprisePctOf, weekdayIndex, type EarningsItem, type Session } from "@/lib/calendar-shared";
import { typicalDailyMove } from "@/lib/calendar-insights";
import { onDayWords } from "@/lib/day-words";
import { pickInsights, type Insight, type TheRead } from "@/lib/insights";
import { absPct, countWord, isNum, listNames, shortDay } from "@/lib/read-format";

/** Weeks the planner looks ahead, starting with the current one (the coming one on a weekend). */
export const SEASON_WEEKS = 6;
/** Past reports kept per stock. */
export const MAX_PAST = 8;
/** Below this many past moves the read calls the history a small sample. */
export const SMALL_SAMPLE = 4;

/* ── One stock's history ───────────────────────────────────────────────── */

export type PastReport = {
  date: string;
  session: Session;
  /** Where the report's date came from: our earnings calendar or the company's 8-K. */
  from: "calendar" | "filing";
  epsEstimate: number | null;
  epsActual: number | null;
  result: "beat" | "miss" | "in-line" | null;
  surprisePct: number | null;
  /** Close-to-close move in percent around the report, or null when it cannot be measured. */
  move: number | null;
  /** "1d": one session. "2d": the report time is unknown, so the window spans the close before to the close after. */
  basis: "1d" | "2d" | null;
};

export type NextReport = {
  date: string;
  session: Session;
  epsEstimate: number | null;
  /** A result is already in (it reported earlier today). */
  reported: boolean;
  result: "beat" | "miss" | "in-line" | null;
};

export type StoredReaction = { date: string; pct: number; basis: "1d" | "2d"; toDate: string };

/** An 8-K carrying item 2.02. Amendments (8-K/A) restate an old release and are not a report day. */
export type Filing202 = { filedAt: string; amended?: boolean };

/** A calendar row and when we captured it, so a date projected months ahead is not taken as a real report day. */
export type CalendarRow = EarningsItem & { capturedAt?: string | null };

/** 8-Ks within this many days of a report belong to the same quarter (a preliminary release, a reissue). */
const SAME_QUARTER_DAYS = 45;
/** A past calendar row without a result counts only if it was captured this close to its date, or an 8-K confirms the day. */
const CONFIRMED_CAPTURE_DAYS = 30;

export type HistoryInput = {
  /** The stock's calendar rows (any order). */
  events: CalendarRow[];
  /** Stored reactions from `tm_agent_earnings_reactions`, used when there are no closes. */
  reactions: StoredReaction[];
  /** 8-K filings carrying item 2.02, with their acceptance time. */
  filings: Filing202[];
  /** Adjusted daily closes, oldest first. */
  series: { dates: string[]; closes: number[] } | null;
};

export type StockHistory = {
  past: PastReport[];
  next: NextReport | null;
  /** Mean absolute daily move over the last 120 sessions, percent. */
  typicalDayPct: number | null;
};

const ET_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * New York day and session of an 8-K's acceptance time: before 9:30 is before
 * the open, 4:00 PM or later is after the close, anything else is unknown.
 */
export function filingSession(filedAt: string): { day: string; session: Session } | null {
  const at = new Date(filedAt);
  if (!filedAt || Number.isNaN(at.getTime())) return null;
  const parts = Object.fromEntries(ET_PARTS.formatToParts(at).map((part) => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(minutes)) return null;
  return { day, session: minutes < 9 * 60 + 30 ? "bmo" : minutes >= 16 * 60 ? "amc" : "unknown" };
}

function lowerBound(sorted: string[], value: string): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The close-to-close move around one report, the same windows as
 * `earnings_reactions.reaction`: before the open is the prior close to that
 * day's close, after the close is that day's close to the next one, unknown
 * spans both. `dates` must hold finished sessions only.
 */
export function measureMove(
  dates: string[],
  closes: number[],
  day: string,
  session: Session,
): { pct: number; basis: "1d" | "2d" } | null {
  if (!dates.length || dates.length !== closes.length) return null;
  const index = lowerBound(dates, day);
  if (index >= dates.length) return null;
  let start: number;
  let end: number;
  let basis: "1d" | "2d" = "1d";
  if (session === "bmo") {
    start = index - 1;
    end = index;
  } else if (session === "amc") {
    [start, end] = dates[index] === day ? [index, index + 1] : [index - 1, index];
  } else {
    start = index - 1;
    end = index + 1;
    basis = "2d";
    if (dates[index] !== day) {
      end = index;
      basis = "1d";
    }
  }
  if (start < 0 || end >= dates.length) return null;
  const before = closes[start]!;
  const after = closes[end]!;
  if (!(before > 0) || !(after > 0)) return null;
  return { pct: Math.round(((after - before) / before) * 10000) / 100, basis };
}

function dayGap(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

function resultOf(item: EarningsItem): PastReport["result"] {
  const word = resultWord(item);
  if (!word) return null;
  return word.tone === "up" ? "beat" : word.tone === "down" ? "miss" : "in-line";
}

/**
 * One stock's past reports (newest first, at most MAX_PAST), its next report
 * and the size of a normal day, from the calendar, its 8-K filings and its
 * closes. `today` is New York's day; nothing on or after it counts as past.
 */
export function buildHistory(input: HistoryInput, today: string): StockHistory {
  // Finished sessions only: a bar dated today may be the session still in progress.
  const dates: string[] = [];
  const closes: number[] = [];
  if (input.series) {
    const n = Math.min(input.series.dates.length, input.series.closes.length);
    for (let i = 0; i < n; i++) {
      const date = input.series.dates[i]!;
      const close = input.series.closes[i]!;
      if (typeof date === "string" && date < today && isNum(close) && close > 0 && (dates.length === 0 || date > dates[dates.length - 1]!)) {
        dates.push(date);
        closes.push(close);
      }
    }
  }

  // Newest day first, so within a quarter the later filing (the release, not an early preliminary one) is kept.
  // Within one day the earliest acceptance comes first: that is when the market had the results
  // (earnings_reactions.py picks the same one).
  const filingDays = input.filings
    .filter((filing) => !filing.amended)
    .map((filing) => ({ at: Date.parse(filing.filedAt), when: filingSession(filing.filedAt) }))
    .filter((value): value is { at: number; when: { day: string; session: Session } } => value.when !== null && value.when.day < today)
    .sort((a, b) => b.when.day.localeCompare(a.when.day) || a.at - b.at)
    .map((value) => value.when);
  const filingOn = new Map<string, Session>();
  for (const value of filingDays) if (!filingOn.has(value.day)) filingOn.set(value.day, value.session);
  const filedNear = (day: string, within: number) => filingDays.some((value) => Math.abs(dayGap(value.day, day)) <= within);
  const storedOn = new Map(input.reactions.filter((reaction) => reaction.toDate < today).map((reaction) => [reaction.date, reaction]));

  // One row per report: two calendar rows a few days apart are the same quarter; the one with a result wins.
  const events = [...input.events].sort((a, b) => a.date.localeCompare(b.date));
  const pastEvents: CalendarRow[] = [];
  for (const item of events) {
    if (item.date >= today) continue;
    // A row with no result that was projected long before its date may never have been the real day.
    const captured = item.capturedAt ? item.capturedAt.slice(0, 10) : null;
    const confirmed = item.epsActual !== null || filedNear(item.date, 2) || (captured !== null && dayGap(item.date, captured) <= CONFIRMED_CAPTURE_DAYS);
    if (!confirmed) continue;
    const clash = pastEvents.findIndex((kept) => Math.abs(dayGap(kept.date, item.date)) <= 5);
    if (clash < 0) pastEvents.push(item);
    else if (pastEvents[clash]!.epsActual === null && item.epsActual !== null) pastEvents[clash] = item;
  }

  const measure = (day: string, session: Session): { move: number | null; basis: PastReport["basis"] } => {
    const measured = dates.length ? measureMove(dates, closes, day, session) : null;
    if (measured) return { move: measured.pct, basis: measured.basis };
    const stored = storedOn.get(day);
    return stored ? { move: stored.pct, basis: stored.basis } : { move: null, basis: null };
  };

  const past: PastReport[] = pastEvents.map((item) => {
    // Nasdaq often leaves the time out; the 8-K filed that day says when the results came out.
    const session = item.session !== "unknown" ? item.session : filingOn.get(item.date) ?? "unknown";
    const { move, basis } = measure(item.date, session);
    return {
      date: item.date,
      session,
      from: "calendar",
      epsEstimate: item.epsEstimate,
      epsActual: item.epsActual,
      result: resultOf(item),
      surprisePct: item.epsActual !== null ? surprisePctOf(item) : null,
      move,
      basis,
    };
  });

  // Reports the calendar never held, from the 8-K. A filing in the same quarter as a calendar row
  // (past or coming) is a preliminary release or a reissue, not another report.
  const calendarDays = events.map((item) => item.date);
  for (const filing of filingDays) {
    if (weekdayIndex(filing.day) >= 5) continue;
    if (calendarDays.some((day) => Math.abs(dayGap(day, filing.day)) <= SAME_QUARTER_DAYS)) continue;
    if (past.some((report) => Math.abs(dayGap(report.date, filing.day)) <= SAME_QUARTER_DAYS)) continue;
    const { move, basis } = measure(filing.day, filing.session);
    past.push({
      date: filing.day,
      session: filing.session,
      from: "filing",
      epsEstimate: null,
      epsActual: null,
      result: null,
      surprisePct: null,
      move,
      basis,
    });
  }
  past.sort((a, b) => b.date.localeCompare(a.date));

  const upcoming = events.find((item) => item.date >= today) ?? null;
  const next: NextReport | null = upcoming
    ? {
        date: upcoming.date,
        session: upcoming.session,
        epsEstimate: upcoming.epsEstimate,
        reported: upcoming.epsActual !== null,
        result: upcoming.epsActual !== null ? resultOf(upcoming) : null,
      }
    : null;

  const typical = typicalDailyMove(closes);
  return {
    past: past.slice(0, MAX_PAST),
    next,
    typicalDayPct: typical !== null ? Math.round(typical * 100) / 100 : null,
  };
}

/* ── What usually happens ──────────────────────────────────────────────── */

export type MoveStats = {
  /** Past reports with a measured move. */
  count: number;
  /** Size of a usual move in percent (no sign): the median with SMALL_SAMPLE or more, else the mean. Null with none. */
  usual: number | null;
  usualKind: "median" | "mean" | "single" | null;
  biggest: { pct: number; date: string; basis: "1d" | "2d" | null } | null;
  ups: number;
  downs: number;
  /** Reports with a result, and how many were beats and misses. */
  results: number;
  beats: number;
  misses: number;
  /** The usual move against a normal day. Only when every measured move is one session, so the two compare like for like. */
  vsNormalDay: number | null;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function usualSize(values: number[]): number {
  return values.length >= SMALL_SAMPLE ? median(values) : mean(values);
}

export function moveStats(past: PastReport[], typicalDayPct: number | null): MoveStats {
  const measured = past.filter((report): report is PastReport & { move: number } => isNum(report.move));
  const sizes = measured.map((report) => Math.abs(report.move));
  let biggest: MoveStats["biggest"] = null;
  for (const report of measured) {
    if (!biggest || Math.abs(report.move) > Math.abs(biggest.pct)) biggest = { pct: report.move, date: report.date, basis: report.basis };
  }
  const allOneDay = measured.length > 0 && measured.every((report) => report.basis === "1d");
  const withResult = past.filter((report) => report.result !== null);
  return {
    count: measured.length,
    usual: sizes.length ? Math.round(usualSize(sizes) * 100) / 100 : null,
    usualKind: sizes.length === 0 ? null : sizes.length === 1 ? "single" : sizes.length >= SMALL_SAMPLE ? "median" : "mean",
    biggest,
    ups: measured.filter((report) => report.move > 0).length,
    downs: measured.filter((report) => report.move < 0).length,
    results: withResult.length,
    beats: withResult.filter((report) => report.result === "beat").length,
    misses: withResult.filter((report) => report.result === "miss").length,
    vsNormalDay: allOneDay && isNum(typicalDayPct) && typicalDayPct > 0 ? Math.round((usualSize(sizes) / typicalDayPct) * 10) / 10 : null,
  };
}

/* ── The season ────────────────────────────────────────────────────────── */

export type SeasonStockInput = {
  ticker: string;
  name: string;
  kind: "holding" | "watching";
  /** Market value of the position, for holdings with a share count or an entered value. */
  value: number | null;
  /** A fund (ETF or mutual fund): it has no earnings of its own. */
  fund: boolean;
  history: StockHistory | null;
};

export type SeasonStock = {
  ticker: string;
  name: string;
  kind: "holding" | "watching";
  fund: boolean;
  /** Share of the valued holdings, 0 to 100, or null (watching, or no values). */
  weight: number | null;
  next: NextReport | null;
  /** The next report falls inside the planner's weeks. */
  inWindow: boolean;
  past: PastReport[];
  stats: MoveStats;
  typicalDayPct: number | null;
};

export type SeasonWeek = {
  /** Monday. */
  start: string;
  /** Friday. */
  end: string;
  stocks: SeasonStock[];
  /** Share of the valued holdings reporting this week, or null without values. */
  weight: number | null;
};

export type Season = {
  today: string;
  /** First and last day the planner covers. */
  from: string;
  to: string;
  weeks: SeasonWeek[];
  /** Everything reporting in the window, by date. */
  reporting: SeasonStock[];
  /** Holdings and watched stocks with no report in the window (funds last). */
  later: SeasonStock[];
  /** True when the holdings carry values, so shares of the portfolio can be shown. */
  weighted: boolean;
};

/** The planner's weeks: this one (the coming one on a weekend) and the next five, Monday to Friday; it runs from today. */
export function seasonWindow(today: string): { from: string; to: string; mondays: string[] } {
  const first = defaultWeekStart(today);
  const mondays = Array.from({ length: SEASON_WEEKS }, (_, index) => addDays(first, index * 7));
  // From today, so a report on a weekend day that is today still counts.
  return { from: today, to: addDays(mondays[mondays.length - 1]!, 4), mondays };
}

const SESSION_ORDER: Record<Session, number> = { bmo: 0, unknown: 1, amc: 2 };

export function buildSeason(inputs: SeasonStockInput[], today: string): Season {
  const { from, to, mondays } = seasonWindow(today);
  // One row per ticker (the first wins), before anything is summed.
  const seen = new Set<string>();
  const unique = inputs.filter((input) => {
    const ticker = input.ticker.toUpperCase();
    if (seen.has(ticker)) return false;
    seen.add(ticker);
    return true;
  });
  const total = unique.reduce((sum, input) => sum + (input.kind === "holding" && isNum(input.value) && input.value > 0 ? input.value : 0), 0);
  const stocks: SeasonStock[] = [];
  for (const input of unique) {
    const ticker = input.ticker.toUpperCase();
    const history = input.history;
    const next = history?.next ?? null;
    const typicalDayPct = history?.typicalDayPct ?? null;
    const past = history?.past ?? [];
    stocks.push({
      ticker,
      name: input.name || ticker,
      kind: input.kind,
      fund: input.fund,
      weight:
        input.kind === "holding" && total > 0 && isNum(input.value) && input.value > 0 ? Math.round((input.value / total) * 1000) / 10 : null,
      next,
      inWindow: Boolean(next && !input.fund && next.date >= from && next.date <= to),
      past,
      stats: moveStats(past, typicalDayPct),
      typicalDayPct,
    });
  }

  const byDate = (a: SeasonStock, b: SeasonStock) =>
    a.next!.date.localeCompare(b.next!.date) ||
    SESSION_ORDER[a.next!.session] - SESSION_ORDER[b.next!.session] ||
    (b.weight ?? -1) - (a.weight ?? -1) ||
    a.ticker.localeCompare(b.ticker);
  const reporting = stocks.filter((stock) => stock.inWindow).sort(byDate);
  const later = stocks
    .filter((stock) => !stock.inWindow)
    .sort(
      (a, b) =>
        Number(a.fund) - Number(b.fund) ||
        Number(a.kind === "watching") - Number(b.kind === "watching") ||
        (a.next && b.next ? a.next.date.localeCompare(b.next.date) : a.next ? -1 : b.next ? 1 : 0) ||
        (b.weight ?? -1) - (a.weight ?? -1) ||
        a.ticker.localeCompare(b.ticker),
    );

  const weighted = total > 0;
  const weeks: SeasonWeek[] = mondays.map((monday, index) => {
    const end = addDays(monday, 4);
    // The first week also takes a report dated today when today is a weekend day.
    const start = index === 0 && from < monday ? from : monday;
    const inWeek = reporting.filter((stock) => stock.next!.date >= start && stock.next!.date <= addDays(monday, 6));
    const share = inWeek.reduce((sum, stock) => sum + (stock.weight ?? 0), 0);
    return { start: monday, end, stocks: inWeek, weight: weighted ? Math.round(share * 10) / 10 : null };
  });

  return { today, from, to, weeks, reporting, later, weighted };
}

/* ── Words ─────────────────────────────────────────────────────────────── */

const SESSION_WORDS: Record<Session, string> = { bmo: "before the open", amc: "after the close", unknown: "" };

export function sessionWords(session: Session): string {
  return SESSION_WORDS[session];
}

/** "today", "tomorrow", "on Tuesday" within six days, "on Nov 20" beyond (lib/day-words.ts). */
export function whenWords(day: string, today: string): string {
  return onDayWords(day, today) || `on ${shortDay(day)}`;
}

/** "Nov 16 to 20", "Nov 30 to Dec 4". */
export function weekWords(start: string, end: string): string {
  return start.slice(5, 7) === end.slice(5, 7) ? `${shortDay(start)} to ${Number(end.slice(8, 10))}` : `${shortDay(start)} to ${shortDay(end)}`;
}

/** "this week", "next week", "the week of Nov 30". */
export function weekName(start: string, today: string): string {
  const current = defaultWeekStart(today);
  if (start === current) return weekdayIndex(today) >= 5 ? "next week" : "this week";
  if (start === addDays(current, 7) && weekdayIndex(today) < 5) return "next week";
  return `the week of ${shortDay(start)}`;
}

/** "about four times a normal day", "about twice a normal day", "about the size of a normal day". */
export function vsDayWords(ratio: number | null): string | null {
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) return null;
  if (ratio < 0.75) return "smaller than a normal day";
  if (ratio < 1.25) return "about the size of a normal day";
  if (ratio < 1.75) return "about one and a half times a normal day";
  if (ratio < 2.5) return "about twice a normal day";
  const times = Math.round(ratio);
  const word = ["", "", "", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][times];
  return `about ${word ?? times} times a normal day`;
}

/** "3.3× a normal day" for the compact label beside the move strip. */
export function vsDayShort(ratio: number | null): string | null {
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) return null;
  return `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1).replace(/\.0$/, "")}× a normal day`;
}

/** "Mar 6", or "Mar 6, 2025" when the report was in another year: the history reaches back years. */
export function reportDay(day: string, today: string): string {
  return day.slice(0, 4) === today.slice(0, 4) ? shortDay(day) : `${shortDay(day)}, ${day.slice(0, 4)}`;
}

function pctWord(value: number): string {
  // Whole numbers read better in a sentence once a move is big.
  return Math.abs(value) >= 10 ? `${Math.round(Math.abs(value))}%` : absPct(value);
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];

/**
 * "has moved 8.1% on a typical report", "moved 3.3% on average after its last
 * two reports", "fell 1.8% after its last report". Says "last" only when the
 * moves really are the latest reports; otherwise it names the report or the count.
 */
export function historyWords(stats: MoveStats, past: PastReport[], today: string): string | null {
  if (stats.count === 0 || stats.usual === null) return null;
  const latestMeasured = past.slice(0, stats.count).every((report) => isNum(report.move));
  if (stats.usualKind === "single") {
    const only = past.find((report) => isNum(report.move))!;
    return `${only.move! >= 0 ? "rose" : "fell"} ${pctWord(only.move!)} after its ${only === past[0] ? "last report" : `${reportDay(only.date, today)} report`}`;
  }
  if (stats.usualKind === "mean") {
    const count = NUMBER_WORDS[stats.count] ?? String(stats.count);
    return `moved ${pctWord(stats.usual)} on average ${latestMeasured ? `after its last ${count} reports` : `over ${count} past reports`}`;
  }
  return `has moved ${pctWord(stats.usual)} on a typical report`;
}

function pctOfPortfolio(weight: number): string {
  return weight >= 10 ? `${Math.round(weight)}%` : `${weight.toFixed(1).replace(/\.0$/, "")}%`;
}

function nameList(stocks: SeasonStock[], max = 3): string {
  return listNames(
    stocks.map((stock) => stock.name),
    max,
  );
}

/** The one to watch: the biggest expected hit to the portfolio, weight times the usual move. */
export function oneToWatch(stocks: SeasonStock[]): SeasonStock | null {
  const holdings = stocks.filter((stock) => stock.kind === "holding");
  if (holdings.length === 0) return null;
  const score = (stock: SeasonStock) => (stock.weight ?? 1) * (stock.stats.usual ?? 0);
  const ranked = [...holdings].sort((a, b) => score(b) - score(a) || (b.weight ?? 0) - (a.weight ?? 0));
  return ranked[0] ?? null;
}

export type SeasonReadOptions = { example: boolean };

/** The words that change between a person's own portfolio and the example. */
function voice(example: boolean) {
  return example
    ? {
        reporting: (n: number) => (n === 1 ? "One of the example's stocks reports" : `${countWord(n)} of the example's stocks report`),
        together: (n: number, pct: string) => `The ${countWord(n).toLowerCase()} that report are ${pct} of the example portfolio.`,
        none: "None of the stocks in the example portfolio report",
        noHoldings: "None of the example's holdings report",
        watchers: "the example watches",
        stocks: "the example's stocks",
      }
    : {
        reporting: (n: number) => (n === 1 ? "One of your stocks reports" : `${countWord(n)} of your stocks report`),
        together: (n: number, pct: string) => `The ${countWord(n).toLowerCase()} that report are ${pct} of your portfolio.`,
        none: "None of your stocks report",
        noHoldings: "None of your holdings report",
        watchers: "you watch",
        stocks: "your stocks",
      };
}

/**
 * The read: how many of the stocks report and when, the one to watch and why,
 * then up to three points. Plain sentences from the numbers above; a point
 * that the data cannot back is left out.
 */
export function buildSeasonRead(season: Season, options: SeasonReadOptions): TheRead | null {
  const { today } = season;
  const words = voice(options.example);
  const holdings = season.reporting.filter((stock) => stock.kind === "holding");
  const watching = season.reporting.filter((stock) => stock.kind === "watching");
  const lastDay = season.reporting.length ? season.reporting[season.reporting.length - 1]!.next!.date : null;
  const firstWeek = season.weeks[0]!;
  const span =
    lastDay && firstWeek.stocks.length === season.reporting.length
      ? weekName(firstWeek.start, today)
      : lastDay && dayGap(lastDay, today) < 14
        ? "in the next two weeks"
        : "in the next six weeks";

  const insights: Array<Insight | null> = [];
  let headline: string;
  const headlineTickers: string[] = [];

  if (holdings.length === 0) {
    const anyHoldings = season.later.some((stock) => stock.kind === "holding" && !stock.fund);
    const nextUp = season.later.find((stock) => stock.kind === "holding" && !stock.fund && stock.next);
    if (watching.length === 1) {
      headline = `${words.noHoldings} in the next six weeks, but one stock ${words.watchers} does: ${watchList(watching, today)}.`;
      headlineTickers.push(watching[0]!.ticker);
    } else if (watching.length > 1) {
      // Several watched names: the count leads, the list goes one line down so the headline stays short.
      headline = `${words.noHoldings} in the next six weeks, but ${countWord(watching.length).toLowerCase()} stocks ${words.watchers} do.`;
      insights.push({
        id: "watching",
        tone: "flat",
        text: `${countWord(watching.length)} stocks ${words.watchers} report: ${watchList(watching, today)}.`,
        tickers: watching.map((stock) => stock.ticker),
      });
    } else if (!anyHoldings && season.later.length === 0) {
      return null;
    } else {
      headline = `${words.none} in the next six weeks.`;
    }
    if (nextUp?.next) {
      insights.push({
        id: `next-${nextUp.ticker}`,
        tone: "flat",
        text: `${nextUp.ticker} is the next holding on the calendar, ${whenWords(nextUp.next.date, today)}${nextUp.next.session !== "unknown" ? `, ${sessionWords(nextUp.next.session)}` : ""}.`,
        tickers: [nextUp.ticker],
        leadName: nextUp.name,
      });
    }
    return { headline, insights: pickInsights(insights), headlineTickers };
  }

  // The headline is how many report and the one to watch; its share of the money and its past moves go one line down.
  const reportingShare = season.weighted ? holdings.reduce((sum, stock) => sum + (stock.weight ?? 0), 0) : null;
  const together = holdings.length > 1 && reportingShare !== null && reportingShare > 0 ? words.together(holdings.length, pctOfPortfolio(reportingShare)) : null;
  const first = `${words.reporting(holdings.length)} ${span}`;

  const watch = oneToWatch(holdings);
  let watchPoint: Insight | null = null;
  if (watch) {
    headlineTickers.push(watch.ticker);
    const when = `${whenWords(watch.next!.date, today)}${watch.next!.session !== "unknown" ? ` ${sessionWords(watch.next!.session)}` : ""}`;
    const history = historyWords(watch.stats, watch.past, today);
    const vsDay = watch.stats.usualKind === "single" ? null : vsDayWords(watch.stats.vsNormalDay);
    const moved = history ? `${history}${vsDay ? `, ${vsDay}` : ""}` : null;
    const weight = watch.weight !== null ? `is ${pctOfPortfolio(watch.weight)} of the portfolio` : null;
    headline =
      holdings.length === 1
        ? `${first}: ${watch.name}, ${when}.`
        : weight || moved
          ? `${first}. ${watch.name}, ${when}, is the one to watch.`
          : `${first}. ${watch.name} reports first, ${when}.`;
    // Starts with the ticker, which the read shows as the company's logo and name.
    const facts = weight && moved ? `${weight} and ${moved}` : weight ?? moved;
    if (facts) {
      watchPoint = {
        id: `watch-${watch.ticker}`,
        tone: "flat",
        text: `${watch.ticker} ${facts}.`,
        ...(together ? { soWhat: together } : {}),
        tickers: [watch.ticker],
        leadName: watch.name,
      };
    }
  } else {
    headline = `${first}.`;
  }
  if (!watchPoint && together) watchPoint = { id: "together", tone: "flat", text: together };

  // Point: the busy week, when one week carries more than one holding.
  const busy = season.weeks.filter((week) => week.stocks.some((stock) => stock.kind === "holding"));
  const holdingsIn = (week: SeasonWeek) => week.stocks.filter((stock) => stock.kind === "holding");
  const top = [...busy].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || holdingsIn(b).length - holdingsIn(a).length)[0];
  const topHoldings = top ? holdingsIn(top) : [];
  if (top && topHoldings.length >= 2) {
    const weekLabel = weekName(top.start, today);
    const share = top.weight !== null && top.weight > 0 ? `${pctOfPortfolio(top.weight)} of the portfolio reports` : `${countWord(topHoldings.length).toLowerCase()} of ${words.stocks} report`;
    // Names, not ticker chips: the rows below carry the tickers.
    insights.push({
      id: `week-${top.start}`,
      tone: "flat",
      text:
        busy.length === 1
          ? `Every report lands ${weekLabel} (${weekWords(top.start, top.end)}): ${nameList(topHoldings)}.`
          : `${capFirst(weekLabel)} is the busiest: ${share}, ${nameList(topHoldings)}.`,
    });
  }

  // Point: a beat that did not lift the stock, else the biggest past move among the reporters.
  const pattern = season.reporting.find((stock) => {
    const beats = stock.past.filter((report) => report.result === "beat" && isNum(report.move));
    return beats.length >= 2 && beats.some((report) => report.move! < 0);
  });
  if (pattern) {
    const beats = pattern.past.filter((report) => report.result === "beat" && isNum(report.move));
    const fell = beats.filter((report) => report.move! < 0).length;
    const all = beats.length === pattern.stats.results;
    insights.push({
      id: `beatfell-${pattern.ticker}`,
      tone: "down",
      text: `${pattern.ticker} beat estimates ${all ? `in ${beats.length === 2 ? "both" : `all ${beats.length}`} of the reports we have results for` : `${beats.length} times in the reports we have results for`}, and the stock still fell after ${fell === beats.length ? (beats.length === 2 ? "both" : "all of them") : fell === 1 ? "one of them" : `${fell} of them`}.`,
      tickers: [pattern.ticker],
      leadName: pattern.name,
      action: { label: "Past reports", href: `/calendar/earnings/${encodeURIComponent(pattern.ticker)}` },
    });
  } else {
    // Only a report from the last two quarters: a year-old move is history, not news (owner, Nov 11).
    const recent = (day: string) => Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`) <= 200 * 86_400_000;
    const swings = season.reporting
      .filter((stock) => stock.stats.biggest && recent(stock.stats.biggest.date) && stock.ticker !== watch?.ticker)
      .sort((a, b) => Math.abs(b.stats.biggest!.pct) - Math.abs(a.stats.biggest!.pct));
    const big = swings[0];
    if (big && Math.abs(big.stats.biggest!.pct) >= 4) {
      const biggest = big.stats.biggest!;
      // A two-session move is not compared with a one-day normal.
      const ratio = biggest.basis === "1d" && isNum(big.typicalDayPct) && big.typicalDayPct > 0 ? Math.abs(biggest.pct) / big.typicalDayPct : null;
      const vs = vsDayWords(ratio);
      insights.push({
        id: `swing-${big.ticker}`,
        tone: biggest.pct < 0 ? "down" : "up",
        text: `${big.ticker} ${biggest.pct < 0 ? "fell" : "rose"} ${pctWord(biggest.pct)} after its ${reportDay(biggest.date, today)} report, its biggest move after a report in our records${vs ? ` and ${vs}` : ""}, and reports again ${whenWords(big.next!.date, today)}.`,
        tickers: [big.ticker],
        leadName: big.name,
        action: { label: "Past reports", href: `/calendar/earnings/${encodeURIComponent(big.ticker)}` },
      });
    }
  }

  // Point: how much history the moves rest on. A caveat, so it always keeps its place.
  let sample: Insight | null = null;
  const thinStocks = season.reporting.filter((stock) => stock.stats.count < SMALL_SAMPLE);
  if (thinStocks.length > 0 && thinStocks.length * 2 >= season.reporting.length) {
    const counts = thinStocks.map((stock) => stock.stats.count);
    const fewest = Math.min(...counts);
    const most = Math.max(...counts);
    const none = thinStocks.filter((stock) => stock.stats.count === 0);
    const all = thinStocks.length === season.reporting.length;
    const who = all ? (thinStocks.length === 1 ? thinStocks[0]!.name : "each of these stocks") : nameList(thinStocks);
    const reports = (n: number) => `${countWord(n).toLowerCase()} past ${n === 1 ? "report" : "reports"}`;
    sample = {
      id: "sample",
      tone: "flat",
      text:
        most === 0
          ? `We have no measured moves after past reports for ${all ? (thinStocks.length === 1 ? thinStocks[0]!.name : "these stocks") : who} yet, so there is no history to go on.`
          : `We have ${fewest === most ? `only ${reports(most)}` : `at most ${reports(most)}`} for ${who}, so treat ${thinStocks.length === 1 ? "its" : "their"} past moves as a small sample.${none.length ? ` ${nameList(none)} ${none.length === 1 ? "has" : "have"} none.` : ""}`,
    };
  }

  if (watching.length > 0) {
    insights.push({
      id: "watching",
      tone: "flat",
      text: `${watching.length === 1 ? "One stock" : `${countWord(watching.length)} stocks`} ${words.watchers} ${watching.length === 1 ? "reports" : "report"} too: ${watchList(watching, today)}.`,
      tickers: watching.map((stock) => stock.ticker),
    });
  }

  // The numbers the headline left out come first, in a line of their own on top of the usual three points,
  // and the small-sample caveat always keeps its place among those three.
  const rest = pickInsights(insights, sample ? 2 : 3);
  return { headline, insights: pickInsights([watchPoint, ...rest, sample], 4), headlineTickers };
}

function watchList(stocks: SeasonStock[], today: string): string {
  const shown = stocks.slice(0, 3).map((stock) => `${stock.name} ${whenWords(stock.next!.date, today)}`);
  const rest = stocks.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} and ${rest} more` : listNames(shown, 3);
}

function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function capFirst(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
