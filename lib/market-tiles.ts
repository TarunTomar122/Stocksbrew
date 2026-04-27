import type { DashboardView } from "@/lib/types";

export type TileKind = "index" | "sector" | "macro" | "stock";

export type MarketTile = {
  id: string;
  label: string;
  sublabel?: string;
  price: number;
  changePct: number;
  series: number[];
  kind: TileKind;
  currency?: string; // "₹" | "$" | "" — prefix shown before the price
  mocked?: boolean;
};

/**
 * Derive the display currency prefix from the instrument ID.
 *
 * - IN_IDX_*  → ₹  (NSE index, priced in rupees)
 * - IN_IDX_VIX / US_MAC_VIX → "" (volatility is a pure number, no $/₹)
 * - *_MAC_GOLD/SILVER/OIL  → $  (global commodity futures, USD quoted)
 * - US_IDX_*  → ""  (SPX/NDX are index points, convention is no prefix)
 */
function deriveCurrency(id: string): string {
  if (id === "IN_IDX_VIX" || id === "US_MAC_VIX") return "";
  if (id.startsWith("IN_IDX_")) return "₹";
  if (id.endsWith("_GOLD") || id.endsWith("_SILVER") || id.endsWith("_OIL")) return "$";
  return "";
}

export function buildMarketTiles(view: DashboardView | null): MarketTile[] {
  if (!view?.market_tiles?.length) return [];
  return view.market_tiles.map((tile) => ({
    id: tile.id,
    label: tile.label,
    sublabel: tile.sublabel,
    price: tile.value,
    changePct: tile.change_pct,
    series: tile.series.length > 0 ? tile.series : [tile.value, tile.value],
    kind: tile.type,
    currency: deriveCurrency(tile.id),
  }));
}
