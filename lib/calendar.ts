import { sharedCache } from "@/lib/shared-cache";
import { unstable_cache } from "next/cache";

import {
  addDays,
  normalizeAgentEvent,
  normalizeEarnings,
  todayET,
  type CalendarItem,
  type EarningsItem,
  type Reaction,
} from "@/lib/calendar-shared";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";
import { adminFirestore } from "@/lib/firebase-admin";
import { getLatestPriceCores, getLatestPriceFundamentals, getMarketSnapshot } from "@/lib/firestore";
import type { PreEarningsIntelDoc } from "@/lib/pre-earnings-intel-shared";
import { typicalDailyMove } from "@/lib/calendar-insights";
import { getScreenerRows } from "@/lib/screener";

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

  let earnings = earningsRaw.map(normalizeEarnings).filter((item): item is EarningsItem => item !== null);
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
};

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

  const events = (eventSnap?.docs ?? [])
    .map((doc) => normalizeEarnings(doc.data() as RawDoc))
    .filter((item): item is EarningsItem => item !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
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
  };
}

const loadDetailCached = unstable_cache(loadDetailUncached, ["calendar-earnings-detail-v2"], { revalidate: 300 });

export function loadEarningsDetail(ticker: string, today: string = todayET()): Promise<EarningsDetail | null> {
  return loadDetailCached(ticker.trim().toUpperCase(), today);
}

/** The same detail, read fresh, where any failed read throws (full research tells an outage from "no reports"). */
export function loadEarningsDetailStrict(ticker: string, today: string = todayET()): Promise<EarningsDetail | null> {
  return loadDetailUncached(ticker.trim().toUpperCase(), today, true);
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
