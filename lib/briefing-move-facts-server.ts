import type { Briefing } from "@/lib/briefing";
import { monthChange, moveFacts, type CloseSeries } from "@/lib/briefing-move-facts";
import { adminFirestore } from "@/lib/firebase-admin";
import { noteDegradedRender } from "@/lib/next-render";
import { etDayOfStamp } from "@/lib/quote-time";
import { sharedCache } from "@/lib/shared-cache";

/**
 * Reads the daily closes behind the briefing's price facts (./briefing-move-facts.ts): one shared cached read per
 * stock of `tm_price_history_daily/{TICKER}`, cut to the last three years so the cached copy stays small.
 */

const PRICES = "tm_price_history_daily";
/** About three years of sessions: enough for "its biggest gain since …" and the 120-session normal day. */
const KEEP_SESSIONS = 760;
/** Most stocks read for one briefing (the moving ones first); the stocks past it go without a price fact. */
const MAX_STOCKS = 20;
/** How long the page waits for the closes before the cards go without them. */
const BUDGET_MS = 1500;

async function readClosesUncached(ticker: string): Promise<CloseSeries | null> {
  const snap = await adminFirestore.collection(PRICES).doc(ticker.replace(/\//g, "-")).get();
  if (!snap.exists) return null;
  const raw = snap.data() as { dates?: unknown; closes?: unknown };
  const dates = Array.isArray(raw.dates) ? raw.dates : [];
  const closes = Array.isArray(raw.closes) ? raw.closes : [];
  const n = Math.min(dates.length, closes.length);
  const out: CloseSeries = { dates: [], closes: [] };
  for (let index = Math.max(0, n - KEEP_SESSIONS); index < n; index += 1) {
    const date = dates[index];
    const close = closes[index];
    if (typeof date === "string" && typeof close === "number" && Number.isFinite(close) && close > 0) {
      out.dates.push(date.slice(0, 10));
      out.closes.push(close);
    }
  }
  return out;
}

// The series gains one close a day; a few hours of staleness changes nothing a card says.
const readCloses = sharedCache(readClosesUncached, ["briefing-move-closes-v1"], { revalidate: 6 * 3600 });

/**
 * For each stock in the briefing with a move: its price facts, most telling first (the cards pick the first one no
 * other card says). Within BUDGET_MS, else nothing: a slow read never holds up the briefing. Today's briefing only.
 */
export async function briefingMoveFacts(briefing: Briefing): Promise<Record<string, string[]> | undefined> {
  // Worth knowing's cards (its stocks come from `also_today`), then the quiet stocks in the side rail, which get one
  // short fact each (lib/briefing-move-facts.ts quietFacts).
  const moves = new Map<string, MoveToMeasure>();
  for (const item of briefing.also_today) {
    const ticker = item.ticker?.trim().toUpperCase();
    if (!ticker || moves.has(ticker) || item.day_change_pct == null || !Number.isFinite(item.day_change_pct)) continue;
    const quoted = etDayOfStamp(item.price_as_of ?? null);
    const day = quoted ?? etDayOfStamp(item.as_of) ?? briefing.date;
    moves.set(ticker, { pct: item.day_change_pct, day, exactDay: quoted !== null, price: item.price ?? null });
  }
  // A quiet stock carries no quote time of its own: the portfolio's price time stands in (a guess without one).
  const quietQuoted = etDayOfStamp(briefing.portfolio?.as_of ?? null);
  const quietDay = quietQuoted ?? briefing.date;
  for (const name of briefing.quiet?.names ?? []) {
    const ticker = name.ticker?.trim().toUpperCase();
    if (!ticker || moves.has(ticker) || name.day_change_pct == null || !Number.isFinite(name.day_change_pct)) continue;
    moves.set(ticker, { pct: name.day_change_pct, day: quietDay, exactDay: quietQuoted !== null, price: name.price ?? null });
  }
  return stockMoveFacts(moves);
}

/**
 * One stock's move to measure: its percent, the day it closed there, whether that day is known (a quote time), and
 * its price on that day, which ends its month (lib/briefing-move-facts.ts monthChange) as on My stocks.
 */
type MoveToMeasure = { pct: number; day: string; exactDay: boolean; price?: number | null };

/** The S&P 500 fund whose sessions count every stock's month, as on My stocks (lib/portfolio-data.ts BENCHMARK_SYMBOL). */
const BENCHMARK = "SPY";

/** The last close before `day`, for a month's end when the move has no price of its own. */
function closeBefore(series: CloseSeries, day: string): number | null {
  for (let i = Math.min(series.dates.length, series.closes.length) - 1; i >= 0; i--) {
    if (series.dates[i]! < day) return series.closes[i]!;
  }
  return null;
}

/**
 * Price facts for each stock's move, most telling first (lib/briefing-move-facts.ts), from its cached closes, for the
 * briefing's cards. Within BUDGET_MS, else nothing for the late ones.
 */
async function stockMoveFacts(moves: ReadonlyMap<string, MoveToMeasure>): Promise<Record<string, string[]> | undefined> {
  const tickers = [...moves.keys()].slice(0, MAX_STOCKS);
  if (tickers.length === 0) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), BUDGET_MS);
  });
  try {
    // Each stock against the one deadline: a slow read leaves only its own card without a fact.
    const series = await Promise.all(
      [...tickers, BENCHMARK].map((ticker) =>
        Promise.race([
          readCloses(ticker).catch((error) => {
            console.warn(`[briefing] closes for ${ticker} failed:`, error instanceof Error ? error.message : error);
            return null;
          }),
          late,
        ]),
      ),
    );
    // Too slow: the cached signed-out copy built without some facts is not kept for long (lib/next-render.ts).
    if (series.includes("late")) noteDegradedRender();
    const spy = series[tickers.length];
    const benchmark = spy && spy !== "late" ? spy : null;
    const out: Record<string, string[]> = {};
    tickers.forEach((ticker, index) => {
      const move = moves.get(ticker)!;
      const closes = series[index];
      if (!closes || closes === "late") return;
      // The month My stocks shows (monthChange): SPY's sessions, ending at the move's own price. Without SPY, no month
      // at all rather than a second way of counting it.
      const before = closeBefore(closes, move.day);
      const now = typeof move.price === "number" && move.price > 0 ? move.price : before !== null ? before * (1 + move.pct / 100) : null;
      const month = benchmark ? monthChange(closes, benchmark, move.day, now) : null;
      const facts = moveFacts(move.pct, closes, move.day, { exactDay: move.exactDay, month });
      if (facts.length > 0) out[ticker] = facts;
    });
    return Object.keys(out).length > 0 ? out : undefined;
  } finally {
    clearTimeout(timer);
  }
}
