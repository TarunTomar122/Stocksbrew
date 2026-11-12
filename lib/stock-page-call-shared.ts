import type { CallWord } from "@/lib/stock-chart";
import type { ScreenerRow } from "@/lib/screener-shared";

/**
 * The stock page's own quote and call, as one small record other surfaces lay over their stored rows, so a stock
 * says the same price, today's move, call and call level everywhere (judges, Nov 12: compare's AMD card said "Buy
 * more below $508.58… today's $552.96" from last night's screener snapshot while the stock page said "$564… today's
 * $586"). Read by lib/stock-page-call.ts from the same documents as components/stock-page-stream.tsx. Pure.
 */
export type StockPageCall = {
  symbol: string;
  /** tm_latest_prices quote.current, as the stock page's header prints it. */
  price: number | null;
  /** When that quote was captured. */
  priceAt: string | null;
  dayPct: number | null;
  /** The live brief's call (directive_v2.stance), null when the stock page would show no read. */
  call: CallWord | null;
  zones: { addBelow: number | null; addAbove: number | null; trimAbove: number | null };
  /** When the brief was written. */
  callAt: string | null;
};

const usable = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

const newer = (a: string | null | undefined, b: string | null | undefined) => {
  const left = a ? Date.parse(a) : Number.NaN;
  const right = b ? Date.parse(b) : Number.NaN;
  if (!Number.isFinite(left)) return false;
  return !Number.isFinite(right) || left >= right;
};

/**
 * A screener row with the stock page's price, move, call and levels laid over it, and the fields worked out from
 * them (distance to the zones and where the price sits) redone the way backend/agentdata/screener.py does. A quote
 * older than the row's own price is left alone; a brief with no call leaves the row's call as it was. When the call
 * changed since the snapshot, the snapshot's reason (written for the old call) is dropped, as the stock page drops
 * a company reason that no longer matches its call (lib/stock-read.ts matchingCompanyReason).
 */
export function withStockPageCall(row: ScreenerRow, live: StockPageCall | null | undefined): ScreenerRow {
  if (!live) return row;
  const next: ScreenerRow = { ...row };
  if (usable(live.price) && newer(live.priceAt, row.price_at)) {
    next.price = live.price;
    if (live.priceAt) next.price_at = live.priceAt;
    if (typeof live.dayPct === "number" && Number.isFinite(live.dayPct)) next.day_pct = live.dayPct;
    else delete next.day_pct;
  }
  if (live.call) {
    if (row.call && live.call !== row.call) {
      delete next.call_reason;
      delete next.call_reason_source;
      delete next.call_change;
    }
    next.call = live.call;
    if (live.callAt) next.call_at = live.callAt;
    const { addBelow, addAbove, trimAbove } = live.zones;
    if (usable(addBelow)) next.add_below = Math.round(addBelow * 100) / 100;
    else delete next.add_below;
    if (usable(addAbove)) next.add_above = Math.round(addAbove * 100) / 100;
    else delete next.add_above;
    if (usable(trimAbove)) next.trim_above = Math.round(trimAbove * 100) / 100;
    else delete next.trim_above;
  }
  // Where the price sits, from whichever price and levels the row now holds. A row without levels (stripped for
  // this viewer, or a brief with none) keeps none.
  if (next.price !== row.price || next.add_below !== row.add_below || next.trim_above !== row.trim_above) {
    delete next.to_add_pct;
    delete next.to_trim_pct;
    delete next.zone;
    const price = usable(next.price) ? next.price : null;
    if (price !== null) {
      if (usable(next.add_below)) next.to_add_pct = Math.round((price / next.add_below - 1) * 10_000) / 100;
      if (usable(next.trim_above)) next.to_trim_pct = Math.round((next.trim_above / price - 1) * 10_000) / 100;
      if (usable(next.add_below) && price <= next.add_below) next.zone = "add";
      else if (usable(next.trim_above) && price >= next.trim_above) next.zone = "trim";
      else if (usable(next.add_below) || usable(next.trim_above)) next.zone = "between";
    }
  }
  return next;
}
