import { surprise, surpriseFrom, type ToneWord } from "@/lib/tone";

/**
 * Pure helpers for `/calendar`: week and month math on plain YYYY-MM-DD days,
 * the event shapes, URL filters and the per-day buckets. Days are handled as
 * strings and UTC arithmetic so no viewer's timezone can shift an event.
 */

/* ── Days ──────────────────────────────────────────────────────────────── */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function toMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** A real calendar day as YYYY-MM-DD, or null. Rejects 2026-02-31. */
export function parseDay(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!DAY_RE.test(value)) return null;
  const ms = toMs(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) return null;
  return value;
}

export function addDays(day: string, count: number): string {
  return new Date(toMs(day) + count * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(day: string): number {
  return (new Date(toMs(day)).getUTCDay() + 6) % 7;
}

/** The Monday of the week that holds `day`. */
export function weekStart(day: string): string {
  return addDays(day, -weekdayIndex(day));
}

/** The week to open by default: this one, or the coming one when today is a weekend. */
export function defaultWeekStart(today: string): string {
  return weekdayIndex(today) >= 5 ? addDays(weekStart(today), 7) : weekStart(today);
}

/** Monday to Friday of the week starting on `monday`. */
export function weekDays(monday: string): string[] {
  return [0, 1, 2, 3, 4].map((offset) => addDays(monday, offset));
}

/** New York's calendar day for an instant. */
export function todayET(now: number | Date = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(now),
  );
}

export function parseMonth(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!MONTH_RE.test(value)) return null;
  const month = Number(value.slice(5));
  return month >= 1 && month <= 12 ? value : null;
}

export function shiftMonth(month: string, count: number): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5)) - 1 + count;
  const date = new Date(Date.UTC(year, index, 1));
  return date.toISOString().slice(0, 7);
}

export function monthBounds(month: string): { first: string; last: string } {
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  return { first, last };
}

export type MonthCell = { day: string; inMonth: boolean };

/** Weeks of weekdays (Mon to Fri) that cover the month. Cells outside the month are flagged. */
export function monthGrid(month: string): MonthCell[][] {
  const { first, last } = monthBounds(month);
  const weeks: MonthCell[][] = [];
  for (let monday = weekStart(first); monday <= last; monday = addDays(monday, 7)) {
    const cells = weekDays(monday).map((day) => ({ day, inMonth: day >= first && day <= last }));
    if (cells.some((cell) => cell.inMonth)) weeks.push(cells);
  }
  return weeks;
}

function parts(day: string): { year: number; month: number; date: number } {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)), date: Number(day.slice(8, 10)) };
}

/** "Nov 9 to 13, 2026", or "Nov 30 to Dec 4, 2026" across a month end. */
export function fmtWeekRange(monday: string): string {
  const start = parts(monday);
  const end = parts(addDays(monday, 4));
  const left = `${MONTHS[start.month - 1]} ${start.date}`;
  const right = start.month === end.month ? `${end.date}` : `${MONTHS[end.month - 1]} ${end.date}`;
  return `${left} to ${right}, ${end.year}`;
}

export function fmtMonth(month: string): string {
  return `${MONTHS_LONG[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
}

/** "Mon" / "Monday". */
export function weekdayName(day: string, long = false): string {
  return (long ? WEEKDAYS_LONG : WEEKDAYS)[weekdayIndex(day)]!;
}

/** "Nov 9". */
export function fmtShortDay(day: string): string {
  const { month, date } = parts(day);
  return `${MONTHS[month - 1]} ${date}`;
}

/** "Today", "Tomorrow", "Yesterday", "in 3 days", "5 days ago". */
export function relativeDay(day: string, today: string): string {
  const gap = Math.round((toMs(day) - toMs(today)) / 86_400_000);
  if (gap === 0) return "Today";
  if (gap === 1) return "Tomorrow";
  if (gap === -1) return "Yesterday";
  return gap > 0 ? `in ${gap} days` : `${-gap} days ago`;
}

/** "8:30 AM" from "08:30". */
export function fmtTimeET(time: string | null | undefined): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time ?? "");
  if (!match) return "";
  const hour = Number(match[1]);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

/* ── Events ────────────────────────────────────────────────────────────── */

export type CalendarType = "earnings" | "ipo" | "economic" | "dividend";

export const CALENDAR_TYPES: Array<{ id: CalendarType; label: string }> = [
  { id: "earnings", label: "Earnings" },
  { id: "economic", label: "Economy" },
  { id: "ipo", label: "IPOs" },
  { id: "dividend", label: "Dividends" },
];

export type Session = "bmo" | "amc" | "unknown";

export const SESSION_LABEL: Record<Session, string> = {
  bmo: "Before the market opens",
  amc: "After the market closes",
  unknown: "Time not confirmed",
};

export type Reaction = { pct: number; basis: "1d" | "2d"; toDate: string };

export type EarningsItem = {
  kind: "earnings";
  id: string;
  date: string;
  ticker: string;
  company: string;
  session: Session;
  epsEstimate: number | null;
  epsActual: number | null;
  surprisePct: number | null;
  surpriseLabel: "beat" | "miss" | "in-line" | "reported" | null;
  fiscalEnding: string;
  marketCap: number | null;
  reaction: Reaction | null;
  /** True when a pre-earnings read exists for this exact report date. */
  hasPreRead: boolean;
};

export type EconomicItem = {
  kind: "economic";
  id: string;
  date: string;
  timeEt: string | null;
  title: string;
  period: string;
  importance: "high" | "normal";
  sourceName: string;
  sourceUrl: string;
};

export type IpoItem = {
  kind: "ipo";
  id: string;
  date: string;
  ticker: string | null;
  company: string;
  status: "expected" | "priced";
  exchange: string;
  priceLow: number | null;
  priceHigh: number | null;
  shares: number | null;
  offerAmount: number | null;
};

export type DividendItem = {
  kind: "dividend";
  id: string;
  date: string;
  ticker: string;
  company: string;
  amount: number;
  annualAmount: number | null;
  paymentDate: string | null;
};

export type CalendarItem = EarningsItem | EconomicItem | IpoItem | DividendItem;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function sessionOf(raw: unknown): Session {
  const value = str(raw).toLowerCase();
  return value === "bmo" || value === "amc" ? value : "unknown";
}

/** A `tm_earnings_events` document as a calendar row. Null for other markets, retired dates and broken rows. */
export function normalizeEarnings(raw: Record<string, unknown>): EarningsItem | null {
  const date = parseDay(str(raw.event_date).slice(0, 10));
  const ticker = str(raw.ticker).toUpperCase();
  if (!date || !ticker || str(raw.market) !== "US") return null;
  const epsActual = num(raw.reported_eps);
  const epsEstimate = num(raw.eps_estimate) ?? num(raw.estimated_eps);
  let label = str(raw.surprise_label).toLowerCase();
  let surprisePct = epsActual === null ? null : num(raw.eps_surprise_pct);
  // The stored surprise can be measured against a different estimate than the one we show beside it
  // ("$1.08 vs $1.17 expected", labelled a beat). When they contradict, the numbers on the page win.
  if (epsActual !== null && epsEstimate !== null && epsEstimate !== 0) {
    const gap = epsActual - epsEstimate;
    if ((label === "beat" && gap < 0) || (label === "miss" && gap > 0)) {
      label = gap > 0 ? "beat" : "miss";
      surprisePct = Math.round((gap / Math.abs(epsEstimate)) * 1000) / 10;
    }
  }
  return {
    kind: "earnings",
    id: `${ticker}_${date}`,
    date,
    ticker,
    company: str(raw.company) || ticker,
    session: sessionOf(raw.time),
    epsEstimate,
    epsActual,
    surprisePct,
    surpriseLabel:
      epsActual === null ? null : label === "beat" || label === "miss" || label === "in-line" || label === "reported" ? label : "reported",
    fiscalEnding: str(raw.fiscal_date_ending),
    marketCap: null,
    reaction: null,
    hasPreRead: false,
  };
}

/** A `tm_agent_calendar` document as a calendar row. */
export function normalizeAgentEvent(raw: Record<string, unknown>): EconomicItem | IpoItem | DividendItem | null {
  const date = parseDay(str(raw.date));
  const id = str(raw.id);
  if (!date || !id || raw.superseded === true) return null;
  const kind = str(raw.kind);
  if (kind === "economic") {
    const title = str(raw.title);
    if (!title) return null;
    return {
      kind,
      id,
      date,
      timeEt: /^\d{2}:\d{2}$/.test(str(raw.time_et)) ? str(raw.time_et) : null,
      title,
      period: str(raw.period),
      importance: str(raw.importance) === "high" ? "high" : "normal",
      sourceName: str(raw.source_name),
      sourceUrl: str(raw.source_url),
    };
  }
  if (kind === "ipo") {
    const company = str(raw.company) || str(raw.title);
    if (!company) return null;
    return {
      kind,
      id,
      date,
      ticker: str(raw.ticker).toUpperCase() || null,
      company,
      status: str(raw.status) === "priced" ? "priced" : "expected",
      exchange: str(raw.exchange),
      priceLow: num(raw.price_low),
      priceHigh: num(raw.price_high),
      shares: num(raw.shares),
      offerAmount: num(raw.offer_amount),
    };
  }
  if (kind === "dividend") {
    const ticker = str(raw.ticker).toUpperCase();
    const amount = num(raw.amount);
    if (!ticker || amount === null || amount <= 0) return null;
    return {
      kind,
      id,
      date,
      ticker,
      company: str(raw.company) || ticker,
      amount,
      annualAmount: num(raw.annual_amount),
      paymentDate: parseDay(str(raw.payment_date)),
    };
  }
  return null;
}

/** The ticker a row belongs to, when it has one. */
export function itemTicker(item: CalendarItem): string | null {
  return item.kind === "economic" ? null : item.ticker;
}

/* ── Filters in the URL ────────────────────────────────────────────────── */

export type CalendarView = "week" | "month" | "list";

export type CalendarFilters = {
  view: CalendarView;
  type: CalendarType | null;
  mine: boolean;
  /** Monday of the week shown (week view). */
  week: string;
  /** YYYY-MM shown (month view). */
  month: string;
  /** First day shown (list view). */
  from: string;
  /** A single day to open (list view), or null. */
  day: string | null;
};

type ParamValue = string | string[] | undefined;

function first(value: ParamValue): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export const LIST_SPAN_DAYS = 21;

export function parseCalendarFilters(params: Record<string, ParamValue> | undefined, today: string): CalendarFilters {
  const viewRaw = first(params?.view).toLowerCase();
  const day = parseDay(first(params?.day));
  // A single day only makes sense as a list.
  const view: CalendarView = day ? "list" : viewRaw === "month" || viewRaw === "list" ? viewRaw : "week";
  const typeRaw = first(params?.type).toLowerCase();
  const weekParam = parseDay(first(params?.w));
  return {
    view,
    type: CALENDAR_TYPES.find((entry) => entry.id === typeRaw)?.id ?? null,
    mine: first(params?.mine) === "1",
    week: weekParam ? weekStart(weekParam) : defaultWeekStart(today),
    month: parseMonth(first(params?.m)) ?? today.slice(0, 7),
    from: parseDay(first(params?.from)) ?? today,
    day,
  };
}

/** The calendar URL for these filters, leaving defaults out. `today` decides what counts as a default. */
export function calendarHref(filters: CalendarFilters, today: string, patch: Partial<CalendarFilters> = {}): string {
  const next = { ...filters, ...patch };
  const query = new URLSearchParams();
  if (next.view !== "week") query.set("view", next.view);
  if (next.type) query.set("type", next.type);
  if (next.mine) query.set("mine", "1");
  if (next.view === "week" && next.week !== defaultWeekStart(today)) query.set("w", next.week);
  if (next.view === "month" && next.month !== today.slice(0, 7)) query.set("m", next.month);
  if (next.view === "list") {
    if (next.day) query.set("day", next.day);
    else if (next.from !== today) query.set("from", next.from);
  }
  const text = query.toString();
  return text ? `/calendar?${text}` : "/calendar";
}

/** The first and last day a view needs loaded. */
export function viewRange(filters: CalendarFilters): { from: string; to: string } {
  if (filters.view === "month") {
    const weeks = monthGrid(filters.month);
    return { from: weeks[0]![0]!.day, to: weeks[weeks.length - 1]![4]!.day };
  }
  if (filters.view === "list") {
    if (filters.day) return { from: filters.day, to: filters.day };
    return { from: filters.from, to: addDays(filters.from, LIST_SPAN_DAYS - 1) };
  }
  // The weekend after the week is loaded too, so the odd Saturday report is not lost.
  return { from: filters.week, to: addDays(filters.week, 6) };
}

export function filterItems(
  items: CalendarItem[],
  filters: Pick<CalendarFilters, "type" | "mine">,
  mine: ReadonlySet<string> | null = null,
): CalendarItem[] {
  return items.filter((item) => {
    if (filters.type && item.kind !== filters.type) return false;
    if (filters.mine && mine) {
      const ticker = itemTicker(item);
      if (!ticker || !mine.has(ticker)) return false;
    }
    return true;
  });
}

/* ── Per-day buckets ───────────────────────────────────────────────────── */

/** Biggest company first; names without a market cap after, alphabetically. */
export function byMarketCap(a: EarningsItem, b: EarningsItem): number {
  if (a.marketCap !== null && b.marketCap !== null && a.marketCap !== b.marketCap) return b.marketCap - a.marketCap;
  if (a.marketCap === null && b.marketCap !== null) return 1;
  if (a.marketCap !== null && b.marketCap === null) return -1;
  return a.ticker.localeCompare(b.ticker);
}

export type DayBuckets = {
  day: string;
  economic: EconomicItem[];
  earnings: Record<Session, EarningsItem[]>;
  ipos: IpoItem[];
  dividends: DividendItem[];
  total: number;
};

export function emptyDay(day: string): DayBuckets {
  return { day, economic: [], earnings: { bmo: [], amc: [], unknown: [] }, ipos: [], dividends: [], total: 0 };
}

/** Rows split by day and, inside a day, by kind and report session, each in reading order. */
export function bucketByDay(items: CalendarItem[]): Map<string, DayBuckets> {
  const days = new Map<string, DayBuckets>();
  for (const item of items) {
    let bucket = days.get(item.date);
    if (!bucket) {
      bucket = emptyDay(item.date);
      days.set(item.date, bucket);
    }
    bucket.total += 1;
    if (item.kind === "earnings") bucket.earnings[item.session].push(item);
    else if (item.kind === "economic") bucket.economic.push(item);
    else if (item.kind === "ipo") bucket.ipos.push(item);
    else bucket.dividends.push(item);
  }
  for (const bucket of days.values()) {
    bucket.economic.sort(
      (a, b) =>
        Number(b.importance === "high") - Number(a.importance === "high") ||
        (a.timeEt ?? "99").localeCompare(b.timeEt ?? "99") ||
        a.title.localeCompare(b.title),
    );
    for (const session of ["bmo", "amc", "unknown"] as const) bucket.earnings[session].sort(byMarketCap);
    bucket.ipos.sort((a, b) => (b.offerAmount ?? 0) - (a.offerAmount ?? 0) || a.company.localeCompare(b.company));
    bucket.dividends.sort((a, b) => a.ticker.localeCompare(b.ticker));
  }
  return days;
}

export function earningsCount(bucket: DayBuckets): number {
  return bucket.earnings.bmo.length + bucket.earnings.amc.length + bucket.earnings.unknown.length;
}

/** The biggest reporters of a day, across sessions. */
export function topReporters(bucket: DayBuckets, limit = 3): EarningsItem[] {
  return [...bucket.earnings.bmo, ...bucket.earnings.amc, ...bucket.earnings.unknown].sort(byMarketCap).slice(0, limit);
}

/** 0 (nothing) to 4 (the busiest day shown), for the month heat. */
export function heatLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.45) return 3;
  if (ratio > 0.2) return 2;
  return 1;
}

/* ── Formatting ────────────────────────────────────────────────────────── */

/** "$1.24", "−$0.12". Empty string when unknown, so nothing fake is printed. */
export function fmtEps(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return `${value < 0 ? "−" : ""}$${Math.abs(value).toFixed(2)}`;
}

/** "$11 to $13", "$10", or "" when no range is given. */
export function fmtIpoPrice(low: number | null, high: number | null): string {
  const money = (value: number) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
  if (low === null && high === null) return "";
  if (low !== null && high !== null && low !== high) return `${money(low)} to ${money(high)}`;
  return money((low ?? high) as number);
}

/** "2 sessions" basis explained for a tooltip. */
export function reactionBasisLabel(reaction: Reaction, session: Session): string {
  if (reaction.basis === "2d") return "Close before the report to the close after it (two sessions; the report time was not given)";
  return session === "amc" ? "Close on the report day to the next close" : "Prior close to the close on the report day";
}

/* ── One company's reports ─────────────────────────────────────────────── */

export type ReportSummary = {
  /** The next report on or after today that has no result yet. */
  next: EarningsItem | null;
  /** The most recent report with a result. */
  last: EarningsItem | null;
  reported: number;
  beats: number;
  misses: number;
  /** Mean absolute stock move across reports with a measured reaction, and how many. */
  avgAbsMove: number | null;
  moves: number;
};

export function summarizeReports(events: EarningsItem[], today: string): ReportSummary {
  const ordered = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const withResult = ordered.filter((item) => item.epsActual !== null);
  const measured = ordered.filter((item) => item.reaction !== null);
  return {
    next: ordered.find((item) => item.date >= today && item.epsActual === null) ?? null,
    last: withResult[withResult.length - 1] ?? null,
    reported: withResult.length,
    beats: withResult.filter((item) => resultWord(item)?.tone === "up").length,
    misses: withResult.filter((item) => resultWord(item)?.tone === "down").length,
    avgAbsMove: measured.length
      ? measured.reduce((sum, item) => sum + Math.abs((item.reaction as Reaction).pct), 0) / measured.length
      : null,
    moves: measured.length,
  };
}

const STORED_RESULT: Partial<Record<NonNullable<EarningsItem["surpriseLabel"]>, ToneWord>> = {
  beat: { tone: "up", word: "Beat" },
  miss: { tone: "down", word: "Missed" },
  "in-line": { tone: "flat", word: "In line" },
};

/**
 * Beat, missed or in line. The two EPS figures decide when both are there, on
 * lib/tone's ±1% band (the backend's surprise_label line): a stored label can
 * come from a different EPS basis ($1.08 against $1.17 stored as a "beat"), and
 * the figures are what the row prints. Without them, the stored label, then the
 * stored surprise. The calendar read (lib/calendar-insights surpriseOf) counts
 * with this, so the chips and the read on one page never disagree.
 */
export function resultWord(item: Pick<EarningsItem, "epsActual" | "epsEstimate" | "surprisePct" | "surpriseLabel">): ToneWord | null {
  if (item.epsActual === null) return null;
  const stored = item.surpriseLabel ? STORED_RESULT[item.surpriseLabel] : undefined;
  return surpriseFrom(item.epsActual, item.epsEstimate) ?? stored ?? surprise(item.surprisePct);
}

/**
 * The surprise in percent the row should print: from the two EPS figures when
 * both are there (so it never contradicts the result word), else the stored one.
 */
export function surprisePctOf(item: Pick<EarningsItem, "epsActual" | "epsEstimate" | "surprisePct">): number | null {
  if (item.epsActual !== null && item.epsEstimate !== null && item.epsEstimate !== 0 && Number.isFinite(item.epsActual) && Number.isFinite(item.epsEstimate)) {
    return ((item.epsActual - item.epsEstimate) / Math.abs(item.epsEstimate)) * 100;
  }
  return item.surprisePct !== null && Number.isFinite(item.surprisePct) ? item.surprisePct : null;
}
