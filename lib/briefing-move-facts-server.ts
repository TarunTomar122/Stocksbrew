import type { Briefing } from "@/lib/briefing";
import { moveFacts, type CloseSeries } from "@/lib/briefing-move-facts";
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
/** Most stocks read for one briefing; the cards past it go without a price fact. */
const MAX_STOCKS = 12;
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
  // Only Worth knowing shows them (components/briefing/briefing-view.tsx), and its stocks come from `also_today`.
  const moves = new Map<string, { pct: number; day: string; exactDay: boolean }>();
  for (const item of briefing.also_today) {
    const ticker = item.ticker?.trim().toUpperCase();
    if (!ticker || moves.has(ticker) || item.day_change_pct == null || !Number.isFinite(item.day_change_pct)) continue;
    const quoted = etDayOfStamp(item.price_as_of ?? null);
    const day = quoted ?? etDayOfStamp(item.as_of) ?? briefing.date;
    moves.set(ticker, { pct: item.day_change_pct, day, exactDay: quoted !== null });
  }
  const tickers = [...moves.keys()].slice(0, MAX_STOCKS);
  if (tickers.length === 0) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), BUDGET_MS);
  });
  try {
    // Each stock against the one deadline: a slow read leaves only its own card without a fact.
    const series = await Promise.all(
      tickers.map((ticker) =>
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
    const out: Record<string, string[]> = {};
    tickers.forEach((ticker, index) => {
      const move = moves.get(ticker)!;
      const closes = series[index];
      const facts = closes && closes !== "late" ? moveFacts(move.pct, closes, move.day, { exactDay: move.exactDay }) : [];
      if (facts.length > 0) out[ticker] = facts;
    });
    return Object.keys(out).length > 0 ? out : undefined;
  } finally {
    clearTimeout(timer);
  }
}
