import { unstable_cache } from "next/cache";
import { cache } from "react";

import { benchmarkForDay, quoteDay } from "@/lib/benchmark-day";
import { todayET } from "@/lib/calendar-shared";
import type { AnomalyItem } from "@/lib/daily-anomalies";
import { adminFirestore } from "@/lib/firebase-admin";
import { getMarketsData } from "@/lib/markets";
import { getScreenerSnapshot, isCompleteSnapshot, withFreshEarningsGap } from "@/lib/screener";
import { sectorSlug, type ScreenerRow } from "@/lib/screener-shared";
import {
  INSIDER_WINDOW_DAYS,
  MOVE_SITEMAP_DAYS,
  buildPairs,
  dayMinus,
  isConfirmedMove,
  isIsoDay,
  moveSources,
  type StockPair,
} from "@/lib/seo/families";
import { TOP_STOCK_TICKERS, stockHasCurrentRead } from "@/lib/seo/stock-pages";

/**
 * Server loaders for the programmatic page families. Everything comes from
 * stored data: the screener snapshot (one row per covered stock), the daily
 * mover documents with their researched reasons, and Form 4 trades. Each
 * loader fails soft: a store error means fewer pages, never a broken one.
 */

/* ── Coverage ─────────────────────────────────────────────────────────── */

export type Coverage = {
  rows: ScreenerRow[];
  bySymbol: Map<string, ScreenerRow>;
  /** The S&P 500 (SPY) row, for "against the market" comparisons. */
  spy: ScreenerRow | null;
  /** The day the stocks are priced on (their quotes, else the last close in the history), YYYY-MM-DD. */
  priceDay: string | null;
  generatedAt: string | null;
};

// React's request cache only exists in the server-components build; elsewhere (tests, scripts) read each time.
const perRequest: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

/** Deduped per request: a stock page asks for it from its metadata and two link rows. */
export const getCoverage = perRequest(async (): Promise<Coverage> => {
  // A failed or empty read must not look like "this page does not exist": the
  // pages would answer 404 and search engines would drop them. Throwing gives a
  // 500 instead, which crawlers retry; sitemap callers already catch it.
  const [snapshot, markets] = await Promise.all([getScreenerSnapshot(), getMarketsData().catch(() => null)]);
  const rows = (snapshot?.rows ?? []).filter((row) => !row.benchmark && !row.uncovered);
  if (rows.length === 0) throw new Error("coverage_unavailable");
  // Stocks are priced from the latest quotes; the history (and the SPY row built from it) can end a day earlier.
  const priceDay = quoteDay(rows, snapshot?.meta.price_history_to ?? null);
  const sp500 = markets?.assets.find((asset) => asset.id === "sp500") ?? null;
  return {
    rows,
    bySymbol: new Map(rows.map((row) => [row.symbol.toUpperCase(), row])),
    spy: benchmarkForDay(snapshot?.extras.find((row) => row.symbol === "SPY") ?? null, priceDay, sp500),
    priceDay,
    generatedAt: snapshot?.meta.generated_at ?? null,
  };
});

/**
 * One stock's place in the coverage: its row, the pair pages it is in (best
 * first, up to three) and the other stock's name in each. What a stock page
 * needs for its index rule and its "compare with" links, cached under its own
 * small key so the page does not read the whole snapshot.
 */
export type StockFamily = {
  row: ScreenerRow | null;
  pairs: StockPair[];
  names: Record<string, string>;
};

const FAMILY_PAIRS = 3;

async function readStockFamily(symbol: string): Promise<StockFamily> {
  const [snapshot, coverage] = await Promise.all([getScreenerSnapshot(), getCoverage()]);
  // A partial snapshot would cache "not covered" (and a noindex) for this stock; throwing keeps it out of the cache.
  if (!isCompleteSnapshot(snapshot)) throw new Error("coverage_unavailable");
  const row = coverage.bySymbol.get(symbol) ?? null;
  if (!row) return { row: null, pairs: [], names: {} };
  const pairs = pairsFor(stockPairs(coverage), symbol).slice(0, FAMILY_PAIRS);
  const names: Record<string, string> = {};
  for (const pair of pairs) {
    const other = pair.a === symbol ? pair.b : pair.a;
    const name = coverage.bySymbol.get(other)?.name;
    if (name) names[other] = name;
  }
  return { row, pairs, names };
}

// As fresh as the snapshot's own meta entry (lib/screener.ts).
const getStockFamilyCached = unstable_cache(readStockFamily, ["stock-family-v1"], { revalidate: 300 });

/** Throws when the coverage cannot be read, like getCoverage. Deduped per request. */
export const getStockFamily = perRequest(async (symbol: string): Promise<StockFamily> => {
  const family = await getStockFamilyCached(symbol.trim().toUpperCase());
  // The earnings gap counts from New York's today, which can be later than when the entry was cached.
  return family.row ? { ...family, row: withFreshEarningsGap(family.row, todayET()) } : family;
});

/** Stock pages that pass the index rule today (see stockHasCurrentRead), in ticker order. */
export function indexableStockSymbols(coverage: Coverage, today: string = todayET()): string[] {
  return coverage.rows
    .filter((row) => stockHasCurrentRead(row, today))
    .map((row) => row.symbol.toUpperCase())
    .sort();
}

/* ── Stock against stock ──────────────────────────────────────────────── */

/**
 * Well-known rivals whose stored industry label is too broad to pair them
 * (both are filed under the sector's name). They still have to share a sector.
 */
export const HAND_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["NVDA", "AMD"],
  ["KO", "PEP"],
  ["JPM", "BAC"],
  ["JPM", "WFC"],
  ["BAC", "WFC"],
  ["LLY", "NVO"],
  ["XOM", "CVX"],
  ["V", "MA"],
];

export function stockPairs(coverage: Coverage): StockPair[] {
  return buildPairs(coverage.rows, { priority: TOP_STOCK_TICKERS, hand: HAND_PAIRS });
}

export function pairsFor(pairs: readonly StockPair[], symbol: string): StockPair[] {
  const upper = symbol.toUpperCase();
  return pairs.filter((pair) => pair.a === upper || pair.b === upper);
}

/* ── Why a stock moved ────────────────────────────────────────────────── */

export type ExplainedMove = {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  day: string;
  /** The change when the reason was researched, from the stored mover row. */
  pct: number;
  price: number | null;
  previousClose: number | null;
  volume: number | null;
  priceAsOf: string | null;
  researchedAt: string | null;
  headline: string;
  why: string | null;
  cause: string | null;
  confidence: string | null;
  sources: Array<{ title: string; url: string }>;
};

type AnomalyDoc = { date?: string; market?: string; anomalies?: AnomalyItem[] };

function toMove(row: AnomalyItem, day: string): ExplainedMove | null {
  if (!isConfirmedMove(row)) return null;
  const pct = typeof row.day_change_pct === "number" && Number.isFinite(row.day_change_pct) ? row.day_change_pct : null;
  if (pct === null || !row.ticker) return null;
  const explanation = row.move_explanation!;
  const name = String(row.name ?? "").trim();
  return {
    ticker: row.ticker.toUpperCase(),
    name: name && name.toUpperCase() !== row.ticker.toUpperCase() ? name : null,
    sector: row.sector || null,
    industry: row.industry || null,
    day,
    pct,
    price: typeof row.price === "number" ? row.price : null,
    previousClose: typeof row.previous_close === "number" ? row.previous_close : null,
    volume: typeof row.volume === "number" ? row.volume : null,
    priceAsOf: row.price_as_of ?? null,
    researchedAt: row.narrative_as_of ?? null,
    headline: String(explanation.headline ?? "").trim(),
    why: String(explanation.why_it_matters ?? "").trim() || null,
    cause: String(explanation.cause_type ?? "").trim() || null,
    confidence: String(explanation.confidence ?? "").trim() || null,
    sources: moveSources(row),
  };
}

/** Explained moves from one or more stored day documents, one per ticker and day (the latest research wins). */
function collectMoves(docs: Array<{ id: string; data: AnomalyDoc }>, onlyDay?: string): ExplainedMove[] {
  const byKey = new Map<string, ExplainedMove>();
  for (const { id, data } of docs) {
    if (!id.startsWith("US__")) continue;
    const day = String(data.date ?? "").slice(0, 10);
    if (!isIsoDay(day) || (onlyDay && day !== onlyDay)) continue;
    for (const row of data.anomalies ?? []) {
      const move = row ? toMove(row, day) : null;
      if (!move) continue;
      const key = `${move.ticker}|${day}`;
      const held = byKey.get(key);
      if (!held || (move.researchedAt ?? "") > (held.researchedAt ?? "")) byKey.set(key, move);
    }
  }
  return [...byKey.values()].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
}

async function readMovesDay(day: string): Promise<ExplainedMove[]> {
  const collection = adminFirestore.collection("tm_daily_anomalies");
  const [dated, latest] = await Promise.all([collection.doc(`US__${day}`).get(), collection.doc("US__latest").get()]);
  const docs: Array<{ id: string; data: AnomalyDoc }> = [];
  if (dated.exists) docs.push({ id: dated.id, data: dated.data() as AnomalyDoc });
  if (latest.exists) docs.push({ id: latest.id, data: latest.data() as AnomalyDoc });
  return collectMoves(docs, day);
}

const getMovesDayCached = unstable_cache(readMovesDay, ["explained-moves-day-v1"], { revalidate: 300 });

/** The explained moves of one trading day, largest first. Empty when the day has none or the store cannot be read. */
export async function getMovesDay(day: string): Promise<ExplainedMove[]> {
  if (!isIsoDay(day)) return [];
  return getMovesDayCached(day).catch(() => []);
}

export type MoveRef = Pick<ExplainedMove, "ticker" | "name" | "day" | "pct" | "headline" | "researchedAt">;

async function readRecentMoves(since: string, includeLatest: boolean): Promise<MoveRef[]> {
  const collection = adminFirestore.collection("tm_daily_anomalies");
  const [snap, latest] = await Promise.all([
    collection.where("date", ">=", since).get(),
    includeLatest ? collection.doc("US__latest").get() : Promise.resolve(null),
  ]);
  // The dated documents only: `US__latest` also carries a date and is added below when wanted.
  const docs = snap.docs.filter((doc) => doc.id !== "US__latest").map((doc) => ({ id: doc.id, data: doc.data() as AnomalyDoc }));
  if (latest?.exists) docs.push({ id: latest.id, data: latest.data() as AnomalyDoc });
  return collectMoves(docs)
    .filter((move) => move.day >= since)
    .map(({ ticker, name, day, pct, headline, researchedAt }) => ({ ticker, name, day, pct, headline, researchedAt }));
}

const getRecentMovesCached = unstable_cache(readRecentMoves, ["explained-moves-recent-v2"], { revalidate: 1800 });

/**
 * Every explained move of the last MOVE_SITEMAP_DAYS days, newest day first.
 * With `archivedOnly` (the sitemap), only moves already kept in a dated
 * document (tm_daily_anomalies/US__YYYY-MM-DD): the live `US__latest` feed is
 * replaced every session, so its pages are only listed once archived.
 */
export async function getRecentMoves(today: string = todayET(), options: { archivedOnly?: boolean } = {}): Promise<MoveRef[]> {
  const moves = await getRecentMovesCached(dayMinus(today, MOVE_SITEMAP_DAYS), !options.archivedOnly).catch(() => [] as MoveRef[]);
  return [...moves].sort((a, b) => b.day.localeCompare(a.day) || Math.abs(b.pct) - Math.abs(a.pct));
}

/* ── Sectors ──────────────────────────────────────────────────────────── */

export type SectorGroup = { slug: string; name: string; rows: ScreenerRow[] };

/** Covered stocks grouped by sector, largest sector first. */
export function sectorGroups(coverage: Coverage): SectorGroup[] {
  const groups = new Map<string, SectorGroup>();
  for (const row of coverage.rows) {
    if (!row.sector) continue;
    const slug = sectorSlug(row.sector);
    if (!slug) continue;
    const group = groups.get(slug) ?? { slug, name: row.sector, rows: [] };
    group.rows.push(row);
    groups.set(slug, group);
  }
  const cap = (group: SectorGroup) => group.rows.reduce((sum, row) => sum + (row.market_cap ?? 0), 0);
  return [...groups.values()].sort((a, b) => cap(b) - cap(a));
}

/* ── Insiders ─────────────────────────────────────────────────────────── */

export type InsiderCount = { symbol: string; trades: number; lastFiled: string };

async function readInsiderCounts(since: string): Promise<InsiderCount[]> {
  type Row = { symbol?: unknown; filing_date?: unknown; filed_at?: unknown };
  let rows: Row[];
  try {
    // LocalDB takes the field list as one array (lib/local-firestore.ts).
    const query = adminFirestore.collection("tm_insider_trades") as unknown as {
      select(fields: string[]): { get(): Promise<{ docs: Array<{ data(): unknown }> }> };
    };
    rows = (await query.select(["symbol", "filing_date", "filed_at"]).get()).docs.map((doc) => doc.data() as Row);
  } catch {
    rows = (await adminFirestore.collection("tm_insider_trades").limit(10000).get()).docs.map((doc) => doc.data() as Row);
  }
  const counts = new Map<string, InsiderCount>();
  for (const row of rows) {
    const symbol = typeof row.symbol === "string" ? row.symbol.toUpperCase() : "";
    const day = String((typeof row.filing_date === "string" && row.filing_date) || row.filed_at || "").slice(0, 10);
    if (!symbol || !isIsoDay(day) || day < since) continue;
    const held = counts.get(symbol) ?? { symbol, trades: 0, lastFiled: day };
    held.trades += 1;
    if (day > held.lastFiled) held.lastFiled = day;
    counts.set(symbol, held);
  }
  return [...counts.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

const getInsiderCountsCached = unstable_cache(readInsiderCounts, ["insider-counts-v1"], { revalidate: 3600 });

/** Open-market Form 4 trades per stock in the insider window, with the last filing day. */
export async function getInsiderCounts(today: string = todayET()): Promise<InsiderCount[]> {
  return getInsiderCountsCached(dayMinus(today, INSIDER_WINDOW_DAYS)).catch(() => [] as InsiderCount[]);
}
