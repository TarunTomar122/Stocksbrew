import { adminFirestore } from "@/lib/firebase-admin";

/**
 * Radar scoreboard — turns the append-only directive-history ledger
 * (`tm_directive_history/{INSTRUMENT_ID}/calls/{YYYY-MM-DD}`) into a track
 * record for a user's tracked stocks.
 *
 * Two layers:
 *  1. LIVE — every directive is logged with the price it was issued at, so we
 *     can measure how each *current* call is doing since we made it, using the
 *     live price. This is always available and needs no scoring job.
 *  2. RESOLVED — once the outcomes job attaches a measured horizon (7d/30d/1d)
 *     we can also report a hit rate and streak. This layers in when present.
 */

const PREFERRED_HORIZONS = ["7d", "30d", "1d"] as const;

const BULLISH_STANCES = new Set(["accumulate", "buy", "add"]);
const BEARISH_STANCES = new Set(["trim", "avoid", "sell", "reduce"]);
const DIRECTIONAL_STANCES = new Set([...BULLISH_STANCES, ...BEARISH_STANCES]);

const MAX_OPEN_CALL_AGE_DAYS = 120;

export type Direction = "bullish" | "bearish" | "neutral";

type RawCall = {
  stance: string;
  direction: Direction;
  date: string;
  priceAtCall: number | null;
  outcome: { horizon: string; returnPct: number; relativePct: number | null } | null;
};

export type OpenCall = {
  ticker: string;
  stance: string;
  direction: Direction;
  entryDate: string;
  entryPrice: number;
  currentPrice: number;
  sinceCallPct: number; // signed in the call's favor
};

export type ResolvedCall = {
  ticker: string;
  stance: string;
  direction: Direction;
  date: string;
  horizon: string;
  returnPct: number;
  correct: boolean;
};

export type RadarScoreboard = {
  // live
  openCalls: number;
  greenCalls: number;
  avgSinceCallPct: number | null;
  bestOpen: OpenCall | null;
  openReceipts: OpenCall[];
  // resolved
  resolved: number;
  hits: number;
  hitRate: number | null;
  streak: number;
  bestResolved: ResolvedCall | null;
  resolvedReceipts: ResolvedCall[];
  // meta
  pendingCount: number;
  hasLive: boolean;
  hasResolved: boolean;
  hasData: boolean;
};

const EMPTY: RadarScoreboard = {
  openCalls: 0,
  greenCalls: 0,
  avgSinceCallPct: null,
  bestOpen: null,
  openReceipts: [],
  resolved: 0,
  hits: 0,
  hitRate: null,
  streak: 0,
  bestResolved: null,
  resolvedReceipts: [],
  pendingCount: 0,
  hasLive: false,
  hasResolved: false,
  hasData: false,
};

function tickerFromInstrumentId(instrumentId: string): string {
  const parts = instrumentId.split("_");
  return parts.length > 1 ? parts.slice(1).join("_") : instrumentId;
}

function directionForStance(stance: string): Direction {
  if (BULLISH_STANCES.has(stance)) return "bullish";
  if (BEARISH_STANCES.has(stance)) return "bearish";
  return "neutral";
}

function inFavor(direction: Direction, returnPct: number): number {
  return direction === "bearish" ? -returnPct : returnPct;
}

function daysBetween(iso: string): number {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
  if (!Number.isFinite(d.getTime())) return Infinity;
  return Math.abs(Date.now() - d.getTime()) / 86_400_000;
}

function pickOutcome(
  outcomes: Record<string, unknown> | undefined,
): { horizon: string; returnPct: number; relativePct: number | null } | null {
  if (!outcomes || typeof outcomes !== "object") return null;
  for (const key of PREFERRED_HORIZONS) {
    const raw = (outcomes as Record<string, unknown>)[key];
    if (!raw || typeof raw !== "object") continue;
    const value = raw as Record<string, unknown>;
    const ret = value.return_pct;
    if (typeof ret !== "number" || !Number.isFinite(ret)) continue;
    const rel = value.relative_return_pct;
    return {
      horizon: key,
      returnPct: ret,
      relativePct: typeof rel === "number" && Number.isFinite(rel) ? rel : null,
    };
  }
  return null;
}

async function loadInstrumentCalls(instrumentId: string): Promise<RawCall[]> {
  const docId = instrumentId.trim().toUpperCase();
  if (!docId) return [];
  const snap = await adminFirestore
    .collection("tm_directive_history")
    .doc(docId)
    .collection("calls")
    .orderBy("generated_at", "desc")
    .limit(60)
    .get()
    .catch(() => null);
  if (!snap) return [];

  return snap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const stance = String(data.stance || "").trim().toLowerCase();
    return {
      stance,
      direction: directionForStance(stance),
      date: String(data.generated_at || doc.id).slice(0, 10),
      priceAtCall:
        typeof data.price_at_call === "number" && Number.isFinite(data.price_at_call)
          ? data.price_at_call
          : null,
      outcome: pickOutcome(data.outcomes as Record<string, unknown> | undefined),
    };
  });
}

/** Find the entry of the current stance streak: walk back while stance holds. */
function openCallFor(instrumentId: string, calls: RawCall[], currentPrice: number | null): OpenCall | null {
  if (calls.length === 0 || currentPrice === null) return null;
  const latest = calls[0]; // most recent first
  if (!DIRECTIONAL_STANCES.has(latest.stance)) return null;

  let entry = latest;
  for (const call of calls) {
    if (call.stance !== latest.stance) break;
    if (call.priceAtCall !== null) entry = call; // keep walking to the earliest same-stance call
  }
  if (entry.priceAtCall === null || entry.priceAtCall <= 0) return null;
  if (daysBetween(entry.date) > MAX_OPEN_CALL_AGE_DAYS) return null;

  const rawReturn = ((currentPrice - entry.priceAtCall) / entry.priceAtCall) * 100;
  return {
    ticker: tickerFromInstrumentId(instrumentId),
    stance: latest.stance,
    direction: latest.direction,
    entryDate: entry.date,
    entryPrice: entry.priceAtCall,
    currentPrice,
    sinceCallPct: inFavor(latest.direction, rawReturn),
  };
}

export async function buildRadarScoreboard(
  instrumentIds: string[],
  options: { pendingCount?: number; currentPriceById?: Record<string, number | null> } = {},
): Promise<RadarScoreboard> {
  const ids = [...new Set(instrumentIds.map((id) => id.trim().toUpperCase()).filter(Boolean))].slice(0, 60);
  const pendingCount = Math.max(0, options.pendingCount ?? 0);
  if (ids.length === 0) return { ...EMPTY, pendingCount };

  const prices = options.currentPriceById ?? {};
  const perInstrument = await Promise.all(ids.map(loadInstrumentCalls));

  const openCalls: OpenCall[] = [];
  const resolvedCalls: ResolvedCall[] = [];

  ids.forEach((id, i) => {
    const calls = perInstrument[i];
    if (calls.length === 0) return;

    const open = openCallFor(id, calls, prices[id] ?? null);
    if (open) openCalls.push(open);

    for (const call of calls) {
      if (!call.outcome || call.direction === "neutral") continue;
      resolvedCalls.push({
        ticker: tickerFromInstrumentId(id),
        stance: call.stance,
        direction: call.direction,
        date: call.date,
        horizon: call.outcome.horizon,
        returnPct: call.outcome.returnPct,
        correct: inFavor(call.direction, call.outcome.returnPct) > 0,
      });
    }
  });

  // ── Live aggregates ────────────────────────────────────────────────
  const green = openCalls.filter((c) => c.sinceCallPct > 0).length;
  const avgSince =
    openCalls.length > 0
      ? openCalls.reduce((a, c) => a + c.sinceCallPct, 0) / openCalls.length
      : null;
  const bestOpen = [...openCalls].sort((a, b) => b.sinceCallPct - a.sinceCallPct)[0] ?? null;

  // ── Resolved aggregates ────────────────────────────────────────────
  resolvedCalls.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const hits = resolvedCalls.filter((c) => c.correct).length;
  let streak = 0;
  for (const c of resolvedCalls) {
    if (c.correct) streak += 1;
    else break;
  }
  const bestResolved =
    [...resolvedCalls]
      .filter((c) => c.correct)
      .sort((a, b) => inFavor(b.direction, b.returnPct) - inFavor(a.direction, a.returnPct))[0] ?? null;

  const hasLive = openCalls.length > 0;
  const hasResolved = resolvedCalls.length > 0;

  return {
    openCalls: openCalls.length,
    greenCalls: green,
    avgSinceCallPct: avgSince,
    bestOpen,
    openReceipts: [...openCalls].sort((a, b) => b.sinceCallPct - a.sinceCallPct).slice(0, 8),
    resolved: resolvedCalls.length,
    hits,
    hitRate: resolvedCalls.length > 0 ? hits / resolvedCalls.length : null,
    streak,
    bestResolved,
    resolvedReceipts: resolvedCalls.filter((c) => c.correct).slice(0, 8),
    pendingCount,
    hasLive,
    hasResolved,
    hasData: hasLive || hasResolved,
  };
}
