import { unstable_cache } from "next/cache";

import { getLatestPriceQuotes } from "@/lib/firestore";
import { etDay, fin, median } from "@/lib/insight-format";
import { getScreenerSnapshot } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";

/**
 * Server-side baselines the page reads compare against: the S&P 500's live
 * move (SPY), the live median move of a sector or industry, the S&P 500's
 * sector weights, and each stock's sector from the screener snapshot. All
 * read-only and cached; anything that fails comes back empty, so a read
 * simply loses the insight that needed it.
 */

export type MarketDay = { pct: number; day: string | null; capturedAt: string | null };

async function readMarketDay(): Promise<MarketDay | null> {
  const quotes = await getLatestPriceQuotes(["US_SPY"]);
  const spy = quotes.get("US_SPY");
  const value = spy?.quote?.day_change_pct;
  if (!fin(value)) return null;
  return { pct: value, day: etDay(spy?.captured_at), capturedAt: spy?.captured_at ?? null };
}

const getMarketDayCached = unstable_cache(readMarketDay, ["insight-market-day-v1"], { revalidate: 120 });

/** SPY's live day change, with the New York day of the quote. */
export async function getMarketDay(): Promise<MarketDay | null> {
  return getMarketDayCached().catch(() => null);
}

export type GroupKind = "sector" | "industry";
type GroupQuote = { symbol: string; pct: number; day: string | null };

const GROUP_SIZE = 25;
/** An industry needs this many covered names to be a fair baseline; otherwise the sector is used. */
const MIN_INDUSTRY = 6;

function idFor(row: ScreenerRow): string {
  return row.instrument_id || `US_${row.symbol}`;
}

async function readGroupQuotes(kind: GroupKind, name: string): Promise<GroupQuote[]> {
  const snapshot = await getScreenerSnapshot();
  if (!snapshot) return [];
  const members = snapshot.rows
    .filter((row) => (kind === "sector" ? row.sector : row.industry) === name)
    .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))
    .slice(0, GROUP_SIZE);
  if (members.length === 0) return [];
  const quotes = await getLatestPriceQuotes(members.map(idFor));
  const out: GroupQuote[] = [];
  for (const row of members) {
    const quote = quotes.get(idFor(row));
    const pct = quote?.quote?.day_change_pct;
    if (fin(pct)) out.push({ symbol: row.symbol, pct, day: etDay(quote?.captured_at) });
  }
  return out;
}

const getGroupQuotesCached = unstable_cache(readGroupQuotes, ["insight-group-quotes-v1"], { revalidate: 300 });

export type GroupMove = { kind: GroupKind; name: string; medianPct: number; count: number };

/**
 * The live median move of a group's 25 largest covered names on `day`,
 * leaving `exclude` out. Null when fewer than 5 names quote on that day.
 */
export async function getGroupMove(kind: GroupKind, name: string, day: string | null, exclude?: string): Promise<GroupMove | null> {
  if (!name) return null;
  const quotes = await getGroupQuotesCached(kind, name).catch(() => [] as GroupQuote[]);
  const sameDay = quotes.filter((quote) => quote.symbol !== exclude && (!day || quote.day === day));
  if (sameDay.length < 5) return null;
  const value = median(sameDay.map((quote) => quote.pct));
  return value === null ? null : { kind, name, medianPct: value, count: sameDay.length };
}

/** The group a stock is best compared with: its industry when we cover enough of it, else its sector. */
export async function getStockGroup(symbol: string): Promise<{ kind: GroupKind; name: string } | null> {
  const snapshot = await getScreenerSnapshot().catch(() => null);
  const row = snapshot?.rows.find((item) => item.symbol === symbol);
  if (!snapshot || !row) return null;
  if (row.industry) {
    const size = snapshot.rows.filter((item) => item.industry === row.industry).length;
    if (size >= MIN_INDUSTRY) return { kind: "industry", name: row.industry };
  }
  return row.sector ? { kind: "sector", name: row.sector } : null;
}

export type SnapshotFacts = {
  /** Ticker to sector, from the screener snapshot. */
  sectorOf: Record<string, string>;
  /** S&P 500 sector weights by market value, percent. Empty when the snapshot has no index tags. */
  spSectorWeights: Record<string, number>;
  /** Close day the snapshot's prices are from. */
  priceDay: string | null;
};

/** Sector per ticker and the S&P 500's sector weights, both from the screener snapshot. */
export async function getSnapshotFacts(symbols: readonly string[]): Promise<SnapshotFacts> {
  const snapshot = await getScreenerSnapshot().catch(() => null);
  const sectorOf: Record<string, string> = {};
  const spSectorWeights: Record<string, number> = {};
  if (!snapshot) return { sectorOf, spSectorWeights, priceDay: null };
  const wanted = new Set(symbols.map((symbol) => symbol.toUpperCase()));
  let total = 0;
  for (const row of snapshot.rows) {
    if (wanted.has(row.symbol) && row.sector) sectorOf[row.symbol] = row.sector;
    if (row.sector && row.indexes?.includes("S&P 500") && fin(row.market_cap) && row.market_cap > 0) {
      spSectorWeights[row.sector] = (spSectorWeights[row.sector] ?? 0) + row.market_cap;
      total += row.market_cap;
    }
  }
  if (total > 0) for (const key of Object.keys(spSectorWeights)) spSectorWeights[key] = (spSectorWeights[key]! / total) * 100;
  return { sectorOf, spSectorWeights, priceDay: snapshot.meta.price_history_to ?? null };
}
