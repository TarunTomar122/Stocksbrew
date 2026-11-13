import { todayET } from "@/lib/calendar-shared";
import { loadTickerEarnings } from "@/lib/earnings-season-data";
import { adminFirestore } from "@/lib/firebase-admin";
import { parseExtendedDoc } from "@/lib/extended-quotes";
import { localFirestoreFromEnv } from "@/lib/local-firestore";
import { getPremarketMovers } from "@/lib/premarket";
import { shortCompanyName } from "@/lib/plain-copy";
import { sharedCache } from "@/lib/shared-cache";

import { buildResult, daysApart, eventFromDoc, isOvernight, nyDayOf, previousTradingDay, reactionDay, type LiveQuote, type PremarketQuote, type PriceMeta, type ResultEvent } from "./build";
import { RESULTS_DAYS, type ResultRead, type ResultSummary } from "./types";
import { briefingResultFact, summarize } from "./words";

/**
 * Results night loaders. Cached reads only; nothing here calls a model.
 *
 * - `recentEvents`: one query of `tm_earnings_events` for the reported rows of the last two weeks, shared by every
 *   reader (ten minutes; actuals land after the close, around 18:00 New York).
 * - `readResult`: one stock's read, built from one cached batch (two minutes): its report history and moves
 *   (lib/earnings-season-data.ts, itself cached), the price history's freshness, the live quote, the steady call
 *   and the release the earnings day job read. The pre-market quote is the shared cached snapshot.
 *
 * A stock with no report in the window costs nothing past the shared list.
 */

const EVENTS = "tm_earnings_events";
/** How far back the shared list reaches: the stock page's ten days and the inbox's two weeks. */
const LIST_DAYS = 14;
/** Most stocks read in full for one person (the inbox, the briefing, the planner). */
const MAX_STOCKS = 20;

const EVENT_FIELDS = ["ticker", "company", "event_date", "market", "time", "reported_eps", "estimated_eps", "eps_estimate", "actuals_source", "actuals_captured_at", "captured_at"];

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type Snap = { exists: boolean; id: string; data(): unknown };

/** Documents by path, only `fields` read back on LocalDB. */
async function readSelected(paths: string[], fields: string[]): Promise<Snap[]> {
  if (paths.length === 0) return [];
  const local = localFirestoreFromEnv();
  if (local) {
    const refs = paths.map((path) => {
      const cut = path.lastIndexOf("/");
      return local.collection(path.slice(0, cut)).doc(path.slice(cut + 1));
    });
    return (await local.getAllSelected(refs, fields)) as unknown as Snap[];
  }
  return (await adminFirestore.getAll(...paths.map((path) => adminFirestore.doc(path)))) as unknown as Snap[];
}

const docKey = (ticker: string) => ticker.toUpperCase().replace(/\//g, "-");

/* ── the shared list ────────────────────────────────────────────────────── */

async function readRecentEventsUncached(since: string, today: string): Promise<ResultEvent[]> {
  // Up to today only: the calendar holds months of reports still ahead, which the list drops anyway.
  const query = adminFirestore.collection(EVENTS).where("event_date", ">=", since).where("event_date", "<", shiftDay(today, 1)) as unknown as {
    select?: (fields: string[]) => { get(): Promise<{ docs: Array<{ data(): unknown }> }> };
    get(): Promise<{ docs: Array<{ data(): unknown }> }>;
  };
  const snap = localFirestoreFromEnv() && query.select ? await query.select(EVENT_FIELDS).get() : await query.get();
  const byKey = new Map<string, ResultEvent>();
  for (const doc of snap.docs) {
    const event = eventFromDoc(doc.data() as Record<string, unknown>);
    if (!event || event.date > today) continue;
    byKey.set(`${event.ticker}:${event.date}`, event);
  }
  return [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date) || a.ticker.localeCompare(b.ticker));
}

// Dropped by an earnings or price write (lib/revalidate-targets.ts "results" tag).
const recentEventsCached = sharedCache(readRecentEventsUncached, ["results-recent-events-v4"], { revalidate: 600, tags: ["results"] });

/**
 * Results night is switched on by RESULTS_NIGHT=1 (set in Vercel Production). Without it every loader answers empty,
 * so the stock page, inbox, briefing and earnings season show nothing from it.
 */
export function resultsNightOn(): boolean {
  return process.env.RESULTS_NIGHT === "1";
}

/** Report rows from the last two weeks up to today, newest first; a row whose EPS is not posted yet has `eps: null`. */
export async function recentEvents(today: string = todayET()): Promise<ResultEvent[]> {
  if (!resultsNightOn()) return [];
  return recentEventsCached(shiftDay(today, -LIST_DAYS), today);
}

/** Each ticker's newest report on or after `since`. */
function newestPerTicker(events: ResultEvent[], tickers: Set<string> | null, since: string): Map<string, ResultEvent> {
  const out = new Map<string, ResultEvent>();
  for (const event of events) {
    if (event.date < since || (tickers && !tickers.has(event.ticker)) || out.has(event.ticker)) continue;
    out.set(event.ticker, event);
  }
  return out;
}

/** New York wall clock as HHMM (9:30 is 930). */
function nyClock(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get("hour") * 100 + get("minute");
}

const positive = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);

/* ── one stock ──────────────────────────────────────────────────────────── */

async function readResultUncached(ticker: string, date: string, today: string): Promise<ResultRead | null> {
  const events = await recentEvents(today);
  const event = events.find((row) => row.ticker === ticker && row.date === date);
  if (!event) return null;
  const key = docKey(ticker);
  const [earnings, snaps, premarket] = await Promise.all([
    loadTickerEarnings([ticker], today),
    readSelected(
      [`tm_price_history_daily/${key}`, `tm_latest_prices/US_${key}`, `tm_call_stability/US_${key}`, `tm_earnings_day/${key}__${date}`, `tm_extended_quotes/${key}`],
      // The last eight are the extended quote's (tm_extended_quotes): the after-hours or pre-market move before the open.
      ["last_date", "fetched_at", "quote", "captured_at", "call", "session", "changes", "updated_at", "ticker", "event_date", "revenue", "guidance", "filing", "period", "read", "reaction", "eps", "generated_at", "price", "change_pct", "regular_close", "regular_close_at", "as_of", "post", "pre", "earnings"],
    ),
    getPremarketMovers("US").catch((error: unknown) => ({ failed: error }) as const),
  ]);
  const history = earnings.get(ticker);
  // A failed history read throws, so a read without its usual move is never what everyone gets for two minutes.
  if (!history) throw new Error(`results: no earnings history read for ${ticker}`);
  const [priceSnap, quoteSnap, stabilitySnap, releaseSnap, extendedSnap] = snaps;
  const priceDoc = priceSnap?.exists ? (priceSnap.data() as Record<string, unknown>) : null;
  const priceMeta: PriceMeta | null = priceDoc
    ? { lastDate: typeof priceDoc.last_date === "string" ? priceDoc.last_date : null, fetchedAt: typeof priceDoc.fetched_at === "string" ? priceDoc.fetched_at : null }
    : null;
  const quoteDoc = quoteSnap?.exists ? (quoteSnap.data() as { quote?: { day_change_pct?: unknown; captured_at?: unknown; current?: unknown }; captured_at?: unknown }) : null;
  const pct = quoteDoc?.quote?.day_change_pct;
  const capturedAt = quoteDoc?.captured_at ?? quoteDoc?.quote?.captured_at;
  const quote: LiveQuote | null = typeof pct === "number" && Number.isFinite(pct) && typeof capturedAt === "string" ? { pct, capturedAt, price: positive(quoteDoc?.quote?.current) } : null;
  const extended = extendedSnap?.exists ? parseExtendedDoc(extendedSnap.data()) : null;
  let needsMove = false;
  if (premarket && "failed" in premarket) {
    // The pre-market quote is the move only before the open on the reaction day; then a failed read must not be
    // cached for everyone as a read with no move. Any other time the read does not use it, and neither does it when
    // the stored extended quote already has this morning's pre-market print (pickMove takes the newer of the two):
    // the stock is not dropped from the briefing on the very morning after its report.
    const now = new Date();
    if (event.session !== "unknown" && reactionDay(event.date, event.session) === today && nyClock(now) < 930) {
      if (!(extended?.session === "pre" && nyDayOf(extended.asOf) === today)) throw new Error(`results: pre-market read failed for ${ticker}`);
      // The stored print stands in for it; buildResult still decides whether that print fits (below).
      needsMove = true;
    }
  }
  const pre = premarket && !("failed" in premarket) ? premarket : null;
  const prePct = pre?.by_ticker?.[ticker]?.pre_market_change_pct;
  const premarketQuote: PremarketQuote | null =
    pre && typeof prePct === "number" && Number.isFinite(prePct)
      ? { pct: prePct, date: String(pre.date ?? "").slice(0, 10), at: pre.generated_at ?? null, price: positive(pre.by_ticker?.[ticker]?.pre_market_price) }
      : null;
  const read = buildResult({
    event,
    today,
    now: new Date(),
    history: history.history,
    priceMeta,
    quote,
    premarket: premarketQuote,
    extended,
    stability: stabilitySnap?.exists ? (stabilitySnap.data() as Record<string, unknown>) : null,
    release: releaseSnap?.exists ? (releaseSnap.data() as Record<string, unknown>) : null,
  });
  // The stored print did not fit this report (another close, a stale clock): no moveless read cached for everyone.
  if (needsMove && read && !read.move) throw new Error(`results: pre-market read failed for ${ticker}`);
  return read;
}

const readResultCached = sharedCache(readResultUncached, ["results-read-v4"], { revalidate: 120, tags: ["results"] });

/** One stock's read for one report, or null. Throws when a store read fails. */
export function readResult(ticker: string, date: string, today: string = todayET()): Promise<ResultRead | null> {
  if (!resultsNightOn()) return Promise.resolve(null);
  return readResultCached(ticker.toUpperCase(), date, today);
}

/** The stock's newest report from the last RESULTS_DAYS days, read in full, or null. */
export async function latestResultFor(ticker: string, today: string = todayET()): Promise<ResultRead | null> {
  if (!resultsNightOn()) return null;
  const upper = ticker.toUpperCase();
  const event = newestPerTicker(await recentEvents(today), new Set([upper]), shiftDay(today, -RESULTS_DAYS)).get(upper);
  return event ? readResult(upper, event.date, today) : null;
}

/**
 * Full reads for these tickers' reports since `days` days ago (newest report per stock), with the stocks whose read
 * failed. A caller that caches what it builds (the inbox) must not keep a list with a stock missing as if it were whole.
 */
export async function resultsForChecked(
  tickers: readonly string[],
  options: { days?: number; since?: string; today?: string } = {},
): Promise<{ reads: ResultRead[]; failed: string[] }> {
  if (!resultsNightOn()) return { reads: [], failed: [] };
  const today = options.today ?? todayET();
  const wanted = new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean));
  if (wanted.size === 0) return { reads: [], failed: [] };
  const since = options.since ?? shiftDay(today, -(options.days ?? RESULTS_DAYS));
  const events = [...newestPerTicker(await recentEvents(today), wanted, since).values()].slice(0, MAX_STOCKS);
  const failed: string[] = [];
  const reads = await Promise.all(
    events.map((event) =>
      readResult(event.ticker, event.date, today).catch((error) => {
        console.warn(`[results] ${event.ticker} ${event.date} read failed:`, error instanceof Error ? error.message : error);
        failed.push(event.ticker);
        return null;
      }),
    ),
  );
  return { reads: reads.filter((read): read is ResultRead => read !== null), failed };
}

/** Full reads for these tickers' reports since `days` days ago (newest report per stock). Failed reads are left out. */
export async function resultsFor(tickers: readonly string[], options: { days?: number; since?: string; today?: string } = {}): Promise<ResultRead[]> {
  return (await resultsForChecked(tickers, options)).reads;
}

/** Summaries by ticker for these stocks' reports in the last `days` days: the planner and the inbox. */
export async function resultSummaries(tickers: readonly string[], options: { days?: number; since?: string; today?: string } = {}): Promise<Record<string, ResultSummary>> {
  if (!resultsNightOn()) return {};
  const today = options.today ?? todayET();
  const reads = await resultsFor(tickers, { ...options, today });
  const out: Record<string, ResultSummary> = {};
  for (const read of reads) {
    const summary = summarize(read, shortCompanyName(read.company) || read.ticker, today);
    if (summary) out[read.ticker] = summary;
  }
  return out;
}

/**
 * The briefing's facts: held stocks that reported overnight (after the last session's close, or before today's open),
 * by ticker. "Beat by 18%, and the move is bigger than usual on results".
 * A report from before the last session's open is not overnight: that session already traded it.
 */
export async function overnightResultFacts(tickers: readonly string[], today: string = todayET()): Promise<Record<string, string>> {
  if (!resultsNightOn()) return {};
  const wanted = new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean));
  if (wanted.size === 0) return {};
  // Only reports that can be overnight are read in full. A report with no time on the last trading day is read too:
  // the company's filing may place it after the close (buildResult), and the check below runs on that.
  const last = previousTradingDay(today);
  const events = [...newestPerTicker(await recentEvents(today), wanted, last).values()]
    .filter((event) => isOvernight(event.date, event.session, today) || (event.date === last && event.session === "unknown"))
    .slice(0, MAX_STOCKS);
  const reads = await Promise.all(
    events.map((event) =>
      readResult(event.ticker, event.date, today).catch((error) => {
        console.warn(`[results] ${event.ticker} ${event.date} overnight read failed:`, error instanceof Error ? error.message : error);
        return null;
      }),
    ),
  );
  const out: Record<string, string> = {};
  for (const read of reads) {
    if (!read || !isOvernight(read.reportDate, read.session, today)) continue;
    const fact = briefingResultFact(read, today);
    if (fact) out[read.ticker] = fact;
  }
  return out;
}

/**
 * Every covered stock that reported in the last `days` days (two by default), newest first, with what it reported
 * against the estimate. Light: the shared list only (no moves, no calls); `readResult` gives a stock's full read.
 */
export async function listRecentResults(options: { days?: number; today?: string } = {}): Promise<ResultEvent[]> {
  if (!resultsNightOn()) return [];
  const today = options.today ?? todayET();
  const since = shiftDay(today, -(options.days ?? 2));
  return (await recentEvents(today)).filter((event) => event.date >= since && event.eps !== null && daysApart(event.date, today) >= 0);
}
