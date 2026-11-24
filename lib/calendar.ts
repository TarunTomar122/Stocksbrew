import { sharedCache } from "@/lib/shared-cache";
import { unstable_cache } from "next/cache";

import {
  ESTIMATED_MARKET,
  addDays,
  byMarketCap,
  nextReport,
  normalizeAgentEvent,
  normalizeEarnings,
  todayET,
  withoutStaleEstimates,
  type CalendarItem,
  type EarningsItem,
  type Reaction,
} from "@/lib/calendar-shared";
import { earningsDayDocId, toReport } from "@/lib/earnings-day-shared";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";
import { adminFirestore } from "@/lib/firebase-admin";
import { getLatestPriceCores, getLatestPriceFundamentals, getMarketSnapshot } from "@/lib/firestore";
import { CALL_PLAIN } from "@/lib/plain-copy";
import type { PreEarningsIntelDoc } from "@/lib/pre-earnings-intel-shared";
import { typicalDailyMove } from "@/lib/calendar-insights";
import { getScreenerRows } from "@/lib/screener";
import { LAST_QUARTER_MAX_AGE_DAYS, earningsPageFacts, lastQuarterOf, type EarningsPageFacts, type LastQuarter, type LastQuarterRevenue } from "@/lib/seo/earnings-pages";
import { SEO_STOCK_PAGES } from "@/lib/seo/stock-pages";
import { readStockCallHistory } from "@/lib/stock-events";
import { callWord } from "@/lib/stock-chart";

/**
 * Server loaders for `/calendar`.
 *
 * - Earnings dates and results: `tm_earnings_events` (Nasdaq's calendar since
 *   2026-08-14, written by `backend/agentdata/earnings_calendar.py`).
 * - Economic releases, IPOs and ex-dividend dates: `tm_agent_calendar`
 *   (`backend/agentdata/calendar_events.py`).
 * - The stock's move on a report: `tm_agent_earnings_reactions`
 *   (`backend/agentdata/earnings_reactions.py`).
 *
 * Revenue estimates and option-implied moves are not stored anywhere, so the
 * calendar does not show them.
 */

const EARNINGS = "tm_earnings_events";
const AGENT_CALENDAR = "tm_agent_calendar";
const REACTIONS = "tm_agent_earnings_reactions";
/** Above this many reports in a range the older, whole-market rows are trimmed to covered symbols. */
const COVERED_ONLY_ABOVE = 600;
const PRE_READ_DAYS = 8;

type RawDoc = Record<string, unknown>;

async function queryRange(collection: string, field: string, from: string, to: string, market?: string, strict = false): Promise<RawDoc[]> {
  try {
    let ref = adminFirestore.collection(collection) as FirebaseFirestore.Query;
    if (market) ref = ref.where("market", "==", market);
    const snap = await ref.where(field, ">=", from).where(field, "<=", to).get();
    return snap.docs.map((doc) => doc.data() as RawDoc);
  } catch (error) {
    console.warn(`[calendar] ${collection} read failed:`, error);
    // The agenda itself must not turn a failed read into an empty week.
    if (strict) throw error;
    return [];
  }
}

/**
 * A stored reaction, unless its window ends today: the daily price series
 * carries the session in progress as its last bar, and a half-day price is not
 * the close the reaction is defined on.
 */
function toReaction(raw: RawDoc, today: string): Reaction | null {
  const pct = raw.pct;
  const toDate = String(raw.to_date ?? "");
  if (typeof pct !== "number" || !Number.isFinite(pct) || !toDate || toDate >= today) return null;
  // Only a time the job took from the company's 8-K; the calendar's own time is on the row already.
  const session = raw.session_source === "sec_8k" && (raw.session === "bmo" || raw.session === "amc") ? raw.session : undefined;
  return { pct, basis: raw.basis === "2d" ? "2d" : "1d", toDate, ...(session ? { session } : {}) };
}

export type CalendarRange = {
  items: CalendarItem[];
  /** Newest capture time among the earnings rows. */
  earningsAsOf: string | null;
  /** When the economic, IPO and dividend rows were last refreshed. */
  agentAsOf: string | null;
  /** How many earnings rows were dropped because we do not cover the symbol (old whole-market rows). */
  uncoveredDropped: number;
  /** True when the agenda could not be read; the page says so instead of "Nothing scheduled". */
  failed?: boolean;
};

async function loadRangeUncached(from: string, to: string, today: string): Promise<CalendarRange> {
  const [earningsRaw, agentRaw, reactionsRaw, snapshot] = await Promise.all([
    queryRange(EARNINGS, "event_date", from, to, "US", true),
    queryRange(AGENT_CALENDAR, "date", from, to, undefined, true),
    from <= today ? queryRange(REACTIONS, "event_date", from, to) : Promise.resolve([] as RawDoc[]),
    getMarketSnapshot("US").catch(() => []),
  ]);

  let earnings = earningsRaw.map((raw) => normalizeEarnings(raw)).filter((item): item is EarningsItem => item !== null);
  let uncoveredDropped = 0;
  if (earnings.length > COVERED_ONLY_ABOVE && snapshot.length) {
    const covered = new Set(snapshot.map((row) => String(row.symbol ?? "").toUpperCase()));
    const kept = earnings.filter((item) => covered.has(item.ticker));
    uncoveredDropped = earnings.length - kept.length;
    earnings = kept;
  }

  const reactions = new Map<string, Reaction>();
  for (const raw of reactionsRaw) {
    const reaction = toReaction(raw, today);
    if (reaction) reactions.set(`${String(raw.ticker ?? "").toUpperCase()}_${String(raw.event_date ?? "")}`, reaction);
  }

  const tickers = [...new Set(earnings.map((item) => item.ticker))];
  // Pre-earnings reads are written in the week before a report, so only the next few days can have one.
  const readHorizon = addDays(today, PRE_READ_DAYS);
  const [caps, preReads] = await Promise.all([
    loadMarketCaps(tickers),
    loadPreReadDates(earnings.filter((item) => item.date >= today && item.date <= readHorizon).map((item) => item.ticker)),
  ]);

  let earningsAsOf = "";
  for (const raw of earningsRaw) {
    const captured = typeof raw.captured_at === "string" ? raw.captured_at : "";
    if (captured > earningsAsOf) earningsAsOf = captured;
  }

  for (const item of earnings) {
    item.marketCap = caps.get(item.ticker) ?? null;
    item.reaction = reactions.get(item.id) ?? null;
    item.hasPreRead = preReads.get(item.ticker) === item.date;
  }

  const agent = agentRaw.map(normalizeAgentEvent).filter((item): item is NonNullable<typeof item> => item !== null);
  let agentAsOf = "";
  for (const raw of agentRaw) {
    const captured = typeof raw.captured_at === "string" ? raw.captured_at : "";
    if (captured > agentAsOf) agentAsOf = captured;
  }

  return {
    items: [...earnings, ...agent],
    earningsAsOf: earningsAsOf || null,
    agentAsOf: agentAsOf || null,
    uncoveredDropped,
  };
}

/**
 * Market value per ticker, used to put the biggest reporters first. The
 * screener's compact universe snapshot has it for every covered stock; the
 * per-stock price documents are far heavier, so they are only a fallback for
 * a short list.
 */
async function loadMarketCaps(tickers: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!tickers.length) return out;
  const rows = await getScreenerRows(tickers).catch(() => new Map());
  for (const [symbol, row] of rows) {
    const cap = (row as { market_cap?: number }).market_cap;
    if (typeof cap === "number" && Number.isFinite(cap) && cap > 0) out.set(symbol, cap);
  }
  if (out.size === 0 && tickers.length <= 60) {
    const fundamentals = await getLatestPriceFundamentals(tickers.map((ticker) => `US_${ticker}`)).catch(() => new Map());
    for (const ticker of tickers) {
      const cap = fundamentals.get(`US_${ticker}`)?.fundamentals?.market_cap;
      if (typeof cap === "number" && Number.isFinite(cap) && cap > 0) out.set(ticker, cap);
    }
  }
  return out;
}

/** ticker -> the report date its stored pre-earnings read was written for. */
async function loadPreReadDates(tickers: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(tickers)].slice(0, 80);
  if (!unique.length) return out;
  try {
    const refs = unique.map((ticker) => adminFirestore.collection("tm_pre_earnings_intel").doc(`US__US_${ticker}__upcoming`));
    const snaps = await adminFirestore.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data() as { ticker?: string; event_date?: string };
      const ticker = String(data.ticker ?? "").toUpperCase();
      const date = String(data.event_date ?? "").slice(0, 10);
      if (ticker && date) out.set(ticker, date);
    }
  } catch (error) {
    console.warn("[calendar] pre-earnings read lookup failed:", error);
  }
  return out;
}

// sharedCache: a read that throws is never cached, so a failed read is retried on the next request.
const loadRangeCached = sharedCache(loadRangeUncached, ["calendar-range-v3"], { revalidate: 600 });

/** Everything on the calendar between two days (inclusive). `today` is New York's day, used to decide what is past. */
export async function loadCalendarRange(from: string, to: string, today: string): Promise<CalendarRange> {
  try {
    return await loadRangeCached(from, to, today);
  } catch {
    return { items: [], earningsAsOf: null, agentAsOf: null, uncoveredDropped: 0, failed: true };
  }
}

/* ── One company ───────────────────────────────────────────────────────── */

export type EarningsDetail = {
  ticker: string;
  name: string;
  /** Every report we hold for this company, oldest first, with results and reactions where known. */
  events: EarningsItem[];
  quote: { price: number | null; dayPct: number | null; marketCap: number | null; asOf: string | null } | null;
  /** The stored pre-earnings read and the report date it was written for. Null when none exists. */
  preRead: PreEarningsIntelDoc | null;
  /** The stored write-up of the last report we covered. */
  postRead: EarningsIntelDoc | null;
  /** The last report that has happened, while it is recent (lib/seo/earnings-pages.ts), with its revenue when read. */
  lastQuarter: LastQuarter | null;
  /**
   * The company's latest report that has happened, from our table or, when the table missed it, from its results 8-K
   * on SEC (tm_earnings_history). `inTable` says whether the table holds its figures; `filingUrl` is the release on SEC.
   */
  latestReport: LatestReport | null;
  /** The newest report in our table that has happened, and its release on SEC, when that is not `latestReport`. */
  tableReportFiling: { date: string; url: string } | null;
  /** Revenue from the latest report's release, when it was read (tm_earnings_day). */
  latestRevenue: LastQuarterRevenue | null;
  /** Our call going into the latest report, in the reader's words. Calls are free on every plan (lib/entitlements.ts). */
  callAtReport: { word: string; date: string } | null;
};

export type LatestReport = { date: string; session: EarningsItem["session"]; filingUrl: string | null; inTable: boolean };

/** Two report days this close are the same report (the calendar can be a day or two off the 8-K). */
const SAME_REPORT_DAYS = 3;

function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

type Release = { date: string; url: string; session: EarningsItem["session"] };

/** Results releases from a tm_earnings_history doc that have happened, newest first. */
function releasesOf(reports: unknown, today: string): Release[] {
  if (!Array.isArray(reports)) return [];
  const out: Release[] = [];
  for (const raw of reports) {
    const report = raw as { date?: unknown; url?: unknown; release?: unknown; session?: unknown };
    const date = typeof report.date === "string" ? report.date.slice(0, 10) : "";
    const url = typeof report.url === "string" ? report.url : "";
    if (!date || date > today || report.release === false || !/^https:\/\/www\.sec\.gov\//.test(url)) continue;
    out.push({ date, url, session: report.session === "bmo" || report.session === "amc" ? report.session : "unknown" });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** The latest report: the table's newest past one, or a newer release the table missed. */
export function latestReportOf(events: EarningsItem[], releases: Release[], today: string): LatestReport | null {
  const done = events
    .filter((item) => !item.estimated && (item.date < today || (item.date === today && item.epsActual !== null)))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const newest = releases[0];
  if (done && (!newest || newest.date <= done.date || daysApart(newest.date, done.date) <= SAME_REPORT_DAYS)) {
    const filing = releases.find((release) => daysApart(release.date, done.date) <= SAME_REPORT_DAYS);
    return { date: done.date, session: done.session, filingUrl: filing?.url ?? null, inTable: true };
  }
  return newest ? { date: newest.date, session: newest.session, filingUrl: newest.url, inTable: false } : null;
}

/**
 * The call that stood going into a report: the last one written before the report day, or on it for a report after
 * the close (calls are written during the session).
 */
export function callBefore(records: ReadonlyArray<{ date: string; stance: string }>, report: Pick<EarningsItem, "date" | "session">): { word: string; date: string } | null {
  let found: { word: string; date: string } | null = null;
  for (const record of records) {
    const day = record.date.slice(0, 10);
    if (day > report.date || (day === report.date && report.session !== "amc")) continue;
    const word = callWord(record.stance);
    if (word && (!found || day >= found.date)) found = { word: CALL_PLAIN[word], date: day };
  }
  return found;
}

function revenueOf(data: unknown): LastQuarterRevenue | null {
  const report = toReport(data);
  const value = report?.revenue?.value;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const yoy = report?.revenue?.yoy_pct;
  return { value, yoyPct: typeof yoy === "number" && Number.isFinite(yoy) ? yoy : null };
}

/** `strict`: a failed read throws instead of reading as "none on file" (full research needs the difference). */
async function loadDetailUncached(ticker: string, today: string, strict = false): Promise<EarningsDetail | null> {
  const instrumentId = `US_${ticker}`;
  const soft = <T,>(read: Promise<T>, fallback: T): Promise<T> => (strict ? read : read.catch(() => fallback));
  const [eventSnap, reactionSnap, cores, preSnap, postSnap] = await Promise.all([
    soft(adminFirestore.collection(EARNINGS).where("ticker", "==", ticker).get(), null),
    soft(adminFirestore.collection(REACTIONS).where("ticker", "==", ticker).get(), null),
    soft(getLatestPriceCores([instrumentId]), new Map() as Awaited<ReturnType<typeof getLatestPriceCores>>),
    soft(adminFirestore.collection("tm_pre_earnings_intel").doc(`US__${instrumentId}__upcoming`).get(), null),
    soft(adminFirestore.collection("tm_earnings_intel").doc(`US__${instrumentId}__latest`).get(), null),
  ]);

  // Our estimated next day comes along (said "expected" wherever it shows), unless it has passed or a date was announced.
  const events = withoutStaleEstimates(
    (eventSnap?.docs ?? []).map((doc) => normalizeEarnings(doc.data() as RawDoc, { estimates: true })).filter((item): item is EarningsItem => item !== null),
    today,
  ).sort((a, b) => a.date.localeCompare(b.date));
  const core = cores.get(instrumentId);
  if (!events.length && !core) return null;

  const reactions = new Map<string, Reaction>();
  for (const doc of reactionSnap?.docs ?? []) {
    const raw = doc.data() as RawDoc;
    const reaction = toReaction(raw, today);
    if (reaction) reactions.set(String(raw.event_date ?? ""), reaction);
  }
  const cap = core?.fundamentals?.market_cap;
  const marketCap = typeof cap === "number" && Number.isFinite(cap) && cap > 0 ? cap : null;
  for (const item of events) {
    item.reaction = reactions.get(item.date) ?? null;
    item.marketCap = marketCap;
  }

  const pre = preSnap?.exists ? ({ ...(preSnap.data() as PreEarningsIntelDoc), doc_id: preSnap.id } as PreEarningsIntelDoc) : null;
  const post = postSnap?.exists ? (postSnap.data() as EarningsIntelDoc) : null;
  const providerName = (core?.provider_metadata as { name?: string } | undefined)?.name;

  // What changed last quarter: its revenue, its release on SEC and our call going in. Always soft: none of the three
  // may turn the page (or full research, which reads this strictly) into an error.
  const [historySnap, calls] = await Promise.all([
    adminFirestore.collection("tm_earnings_history").doc(ticker).get().catch(() => null),
    readStockCallHistory(instrumentId).catch(() => []),
  ]);
  const releases = releasesOf(historySnap?.exists ? (historySnap.data() as RawDoc | undefined)?.reports : null, today);
  const latestReport = latestReportOf(events, releases, today);
  const lastItem = lastQuarterOf(events, today)?.item ?? null;
  // Revenue for the latest report (shown) and for the table's last quarter (the index rule); usually the same day.
  const revenueDays = [...new Set([latestReport?.date, lastItem?.date].filter((day): day is string => Boolean(day)))];
  const daySnaps = await Promise.all(
    revenueDays.map((day) => adminFirestore.collection("tm_earnings_day").doc(earningsDayDocId(ticker, day)).get().catch(() => null)),
  );
  const revenueBy = new Map(revenueDays.map((day, index) => [day, daySnaps[index]?.exists ? revenueOf(daySnaps[index]!.data()) : null]));
  const lastQuarter = lastQuarterOf(events, today, (date) => revenueBy.get(date) ?? null);
  // The table's own newest report, when the latest one came from SEC alone: its result is in the table, its link here.
  const tableDone = latestReport && !latestReport.inTable ? latestReportOf(events, [], today) : null;
  const tableRelease = tableDone ? releases.find((release) => daysApart(release.date, tableDone.date) <= SAME_REPORT_DAYS) : undefined;

  return {
    ticker,
    name: providerName || events[events.length - 1]?.company || ticker,
    events,
    quote: core
      ? {
          price: typeof core.quote?.current === "number" ? core.quote.current : null,
          dayPct: typeof core.quote?.day_change_pct === "number" ? core.quote.day_change_pct : null,
          marketCap,
          asOf: core.captured_at ?? core.updated_at ?? null,
        }
      : null,
    preRead: pre?.report?.headline && pre.event_date ? pre : null,
    postRead: post?.report?.headline && post.event_date ? post : null,
    lastQuarter,
    latestReport,
    tableReportFiling: tableDone && tableRelease ? { date: tableDone.date, url: tableRelease.url } : null,
    latestRevenue: latestReport ? revenueBy.get(latestReport.date) ?? null : null,
    callAtReport: latestReport ? callBefore(calls, latestReport) : null,
  };
}

const loadDetailCached = unstable_cache(loadDetailUncached, ["calendar-earnings-detail-v4"], { revalidate: 300 });

export function loadEarningsDetail(ticker: string, today: string = todayET()): Promise<EarningsDetail | null> {
  return loadDetailCached(ticker.trim().toUpperCase(), today);
}

/** The same detail, read fresh, where any failed read throws (full research tells an outage from "no reports"). */
export function loadEarningsDetailStrict(ticker: string, today: string = todayET()): Promise<EarningsDetail | null> {
  return loadDetailUncached(ticker.trim().toUpperCase(), today, true);
}

/* ── Reports ahead, and the earnings pages' index facts ───────────────── */

/** How far ahead "reports ahead" and the earnings sitemap look. Our estimates reach about four months out. */
export const AHEAD_DAYS = 200;

/** Announced and estimated reports between two days, estimates that cannot stand dropped. Throws on a failed read. */
async function readReportsAhead(from: string, to: string, today: string): Promise<EarningsItem[]> {
  const [confirmed, estimated] = await Promise.all([
    queryRange(EARNINGS, "event_date", from, to, "US", true),
    queryRange(EARNINGS, "event_date", from, to, ESTIMATED_MARKET, true),
  ]);
  const items = [...confirmed, ...estimated]
    .map((raw) => normalizeEarnings(raw, { estimates: true }))
    .filter((item): item is EarningsItem => item !== null);
  return withoutStaleEstimates(items, today);
}

export type ReportAhead = Pick<EarningsItem, "ticker" | "company" | "date" | "session" | "marketCap" | "estimated">;

async function loadReportsAheadUncached(from: string, today: string, limit: number): Promise<{ confirmed: ReportAhead[]; expected: ReportAhead[] }> {
  const items = await readReportsAhead(from, addDays(today, AHEAD_DAYS), today);
  // Each company once, at its next report (an announced date before our estimate).
  const byTicker = new Map<string, EarningsItem[]>();
  for (const item of items) byTicker.set(item.ticker, [...(byTicker.get(item.ticker) ?? []), item]);
  const next = [...byTicker.values()].map((rows) => nextReport(rows, from)).filter((item): item is EarningsItem => item !== null);
  const caps = await loadMarketCaps(next.map((item) => item.ticker));
  for (const item of next) item.marketCap = caps.get(item.ticker) ?? null;
  // The biggest companies, each once (GOOG and GOOGL are one report), then in date order so the list reads as a calendar.
  const pick = (rows: EarningsItem[]): ReportAhead[] => {
    const seen = new Set<string>();
    const biggest = rows
      .filter((item) => item.marketCap !== null)
      .sort(byMarketCap)
      .filter((item) => {
        const company = item.company.toLowerCase().replace(/\b(class [a-z]|inc\.?|corp\.?|corporation|co\.?)\b|[^a-z0-9]/g, "");
        if (seen.has(company)) return false;
        seen.add(company);
        return true;
      })
      .slice(0, limit);
    return biggest
      .sort((a, b) => a.date.localeCompare(b.date) || byMarketCap(a, b))
      .map(({ ticker, company, date, session, marketCap, estimated }) => ({ ticker, company, date, session, marketCap, ...(estimated ? { estimated } : {}) }));
  };
  return { confirmed: pick(next.filter((item) => !item.estimated)), expected: pick(next.filter((item) => item.estimated)) };
}

const loadReportsAheadCached = sharedCache(loadReportsAheadUncached, ["calendar-reports-ahead-v2"], { revalidate: 1800 });

/**
 * The biggest companies' next reports from `from` on, split into announced dates and our estimates, `limit` of each,
 * biggest first. For /calendar's links to the busiest earnings pages. Empty on a failed read.
 */
export async function loadReportsAhead(from: string, today: string, limit = 12): Promise<{ confirmed: ReportAhead[]; expected: ReportAhead[] }> {
  try {
    return await loadReportsAheadCached(from, today, limit);
  } catch (error) {
    console.warn("[calendar] reports ahead read failed:", error);
    return { confirmed: [], expected: [] };
  }
}

/**
 * Index facts for every covered stock's earnings page, for the sitemap: the same rows the page reads (its next report,
 * announced or estimated, and its last quarter with reaction and revenue), put through the same `earningsPageFacts`.
 * Throws on a failed read so the sitemap can say it is short.
 */
export async function loadEarningsPageFacts(today: string): Promise<Map<string, EarningsPageFacts>> {
  const since = addDays(today, -LAST_QUARTER_MAX_AGE_DAYS);
  const [ahead, behind, reactionsRaw, dayReports] = await Promise.all([
    readReportsAhead(today, addDays(today, AHEAD_DAYS), today),
    queryRange(EARNINGS, "event_date", since, addDays(today, -1), "US", true),
    queryRange(REACTIONS, "event_date", since, today, undefined, true),
    adminFirestore.collection("tm_earnings_day").where("event_date", ">=", since).get(),
  ]);
  const reactions = new Map<string, Reaction>();
  for (const raw of reactionsRaw) {
    const reaction = toReaction(raw, today);
    if (reaction) reactions.set(`${String(raw.ticker ?? "").toUpperCase()}_${String(raw.event_date ?? "")}`, reaction);
  }
  const revenue = new Map<string, LastQuarterRevenue>();
  for (const doc of dayReports.docs) {
    const report = toReport(doc.data());
    const value = report ? revenueOf(doc.data()) : null;
    if (report && value) revenue.set(`${report.ticker}_${report.event_date}`, value);
  }
  const byTicker = new Map<string, EarningsItem[]>();
  for (const item of [...ahead, ...behind.map((raw) => normalizeEarnings(raw)).filter((item): item is EarningsItem => item !== null)]) {
    if (byTicker.get(item.ticker)?.some((known) => known.id === item.id)) continue;
    item.reaction = reactions.get(item.id) ?? null;
    byTicker.set(item.ticker, [...(byTicker.get(item.ticker) ?? []), item]);
  }
  const out = new Map<string, EarningsPageFacts>();
  for (const stock of SEO_STOCK_PAGES) {
    const events = byTicker.get(stock.ticker) ?? [];
    out.set(stock.ticker, earningsPageFacts(stock.ticker, events, today, (date) => revenue.get(`${stock.ticker}_${date}`) ?? null));
  }
  return out;
}

/* ── History behind the read ───────────────────────────────────────────── */

export type ReportContext = {
  /** The stock's move on its last report we hold, close to close. */
  last: (Reaction & { eventDate: string }) | null;
  /** Its average absolute daily move over the last 120 sessions, in percent: what a normal day looks like. */
  typicalDayPct: number | null;
};

async function loadReportContextUncached(tickers: string[], today: string): Promise<Record<string, ReportContext>> {
  const unique = [...new Set(tickers.map((ticker) => ticker.toUpperCase()))].slice(0, 8);
  const out: Record<string, ReportContext> = {};
  if (!unique.length) return out;
  const [reactionSnaps, priceSnaps] = await Promise.all([
    Promise.all(unique.map((ticker) => adminFirestore.collection(REACTIONS).where("ticker", "==", ticker).get().catch(() => null))),
    adminFirestore.getAll(...unique.map((ticker) => adminFirestore.collection("tm_price_history_daily").doc(ticker))).catch(() => []),
  ]);
  // Every read failed: throw so the miss is not cached as "no history".
  if (reactionSnaps.every((snap) => snap === null) && priceSnaps.length === 0) throw new Error("report_context_unavailable");
  const typical = new Map<string, number | null>();
  for (const snap of priceSnaps) {
    if (!snap.exists) continue;
    const closes = (snap.data() as { closes?: unknown }).closes;
    typical.set(snap.id.toUpperCase(), Array.isArray(closes) ? typicalDailyMove(closes.filter((value): value is number => typeof value === "number")) : null);
  }
  unique.forEach((ticker, index) => {
    let last: ReportContext["last"] = null;
    for (const doc of reactionSnaps[index]?.docs ?? []) {
      const raw = doc.data() as RawDoc;
      const reaction = toReaction(raw, today);
      const eventDate = String(raw.event_date ?? "");
      if (reaction && eventDate < today && (!last || eventDate > last.eventDate)) last = { ...reaction, eventDate };
    }
    out[ticker] = { last, typicalDayPct: typical.get(ticker) ?? null };
  });
  return out;
}

const loadReportContextCached = sharedCache(loadReportContextUncached, ["calendar-report-context-v1"], { revalidate: 1800 });

/** For the read: each company's last earnings move and what a normal day looks like for it. Empty on failure. */
export async function loadReportContext(tickers: string[], today: string): Promise<Record<string, ReportContext>> {
  try {
    return await loadReportContextCached([...tickers].sort(), today);
  } catch (error) {
    console.warn("[calendar] report context read failed:", error);
    return {};
  }
}
