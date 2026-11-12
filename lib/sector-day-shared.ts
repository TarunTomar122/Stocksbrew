import { SECTOR_IDS, type MarketAsset } from "@/lib/markets-shared";
import { sectorSlug, type ScreenerRow, type SectorStat } from "@/lib/screener-shared";
import type { SnapshotRow } from "@/lib/types";

/**
 * One sector move for the day, everywhere (judges, Nov 12: Tech said +3.65% on the screener's "Today" tab, which was
 * yesterday's close in the nightly snapshot, and −0.70% on Market today, the sector fund live). A sector's day is its
 * sector fund's move (XLK for Technology, …), the figure Market today and Markets already show; the stocks under it
 * take their live quote from the price snapshot the stock pages are fed from. Pure; lib/sector-day.ts reads.
 */

/** Sector fund -> the screener's sector slug (lib/gics-sector.ts names through sectorSlug). */
export const SECTOR_FUND_SLUG: Record<string, string> = {
  xlk: "technology",
  xlf: "financials",
  xle: "energy",
  xlv: "health-care",
  xli: "industrials",
  xly: "consumer-discretionary",
  xlp: "consumer-staples",
  xlu: "utilities",
  xlb: "materials",
  xlre: "real-estate",
  xlc: "communication-services",
};

export type SectorFundDay = { fund: string; pct: number; asOf: string | null };

/** Each sector's fund move on its latest session, keyed by the screener's sector slug. */
export function sectorFundDays(assets: ReadonlyArray<Pick<MarketAsset, "id" | "change" | "as_of">>): Map<string, SectorFundDay> {
  const out = new Map<string, SectorFundDay>();
  for (const id of SECTOR_IDS) {
    const asset = assets.find((item) => item.id === id);
    const pct = asset?.change?.d1;
    const slug = SECTOR_FUND_SLUG[id];
    if (!asset || !slug || typeof pct !== "number" || !Number.isFinite(pct)) continue;
    out.set(slug, { fund: id.toUpperCase(), pct, asOf: asset.as_of ?? null });
  }
  return out;
}

const stampMs = (value: string | null | undefined) => {
  const ms = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
};

/**
 * The rows with each stock's day move, price and price time from the live price snapshot, where that quote is newer
 * than the row's own. The nightly screener row holds the close of the session before; the snapshot is refreshed
 * through the day.
 */
export function withLiveDayMoves(rows: readonly ScreenerRow[], live: readonly SnapshotRow[]): ScreenerRow[] {
  if (live.length === 0) return [...rows];
  const bySymbol = new Map<string, SnapshotRow>();
  for (const item of live) if (item?.symbol && item.market === "US") bySymbol.set(item.symbol.toUpperCase(), item);
  return rows.map((row) => {
    const quote = bySymbol.get(row.symbol.toUpperCase());
    const pct = quote?.price?.changePct;
    const at = stampMs(quote?.lastUpdated);
    if (!quote || at === null || typeof pct !== "number" || !Number.isFinite(pct)) return row;
    const own = stampMs(row.price_at);
    if (own !== null && own >= at) return row;
    const price = quote.price.current;
    return {
      ...row,
      day_pct: pct,
      price_at: quote.lastUpdated,
      ...(typeof price === "number" && Number.isFinite(price) && price > 0 ? { price } : {}),
    };
  });
}

/** The sector stats with each sector's day replaced by its fund's move, where the fund is known. */
export function withSectorFundDays(stats: readonly SectorStat[], funds: ReadonlyMap<string, SectorFundDay>): SectorStat[] {
  return stats.map((stat) => {
    const fund = funds.get(stat.slug) ?? funds.get(sectorSlug(stat.name));
    return fund ? { ...stat, change: { ...stat.change, day_pct: fund.pct } } : stat;
  });
}

/** When the day figures were measured: the newest sector fund's time, else the newest stock quote's. */
export function sectorDayStamp(funds: ReadonlyMap<string, SectorFundDay>, rows: readonly ScreenerRow[]): string | null {
  let best: { ms: number; iso: string } | null = null;
  const consider = (iso: string | null | undefined) => {
    const ms = stampMs(iso);
    if (ms !== null && iso && (!best || ms > best.ms)) best = { ms, iso };
  };
  for (const fund of funds.values()) consider(fund.asOf);
  if (!best) for (const row of rows) consider(row.price_at);
  return (best as { ms: number; iso: string } | null)?.iso ?? null;
}
