import { getMacroStrip } from "@/lib/macro";
import { getHomeView } from "@/lib/home-view";
import type { MarketTileDoc, SnapshotRow } from "@/lib/types";

export const HERO_INDEX_ORDER: Record<"US" | "IN", string[]> = {
  US: ["US_IDX_SPX", "US_IDX_NDX", "US_MAC_VIX", "US_MAC_GOLD", "US_MAC_OIL"],
  IN: ["IN_IDX_NIFTY50", "IN_IDX_BANKNIFTY", "IN_IDX_VIX", "IN_MAC_GOLD", "IN_MAC_OIL"],
};

export type HeroIndex = {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
};

function instrumentIdFor(row: SnapshotRow): string {
  const raw = row as SnapshotRow & { instrument_id?: string };
  return String(raw.instrumentId || raw.instrument_id || "").trim();
}

export function heroIndicesFromSnapshot(
  rows: SnapshotRow[],
  market: "US" | "IN",
): HeroIndex[] {
  const byId = new Map<string, SnapshotRow>();
  for (const row of rows) {
    const id = instrumentIdFor(row);
    if (id) byId.set(id, row);
  }

  return mapOrderedIds(byId, market, (row) => ({
    ticker: row.symbol || instrumentIdFor(row),
    name: row.name || row.symbol || instrumentIdFor(row),
    price: row.price?.current ?? 0,
    changePct: row.price?.changePct ?? 0,
  }));
}

function heroIndicesFromMarketTiles(
  tiles: MarketTileDoc[] | undefined,
  market: "US" | "IN",
): HeroIndex[] {
  if (!tiles?.length) return [];
  const byId = new Map(tiles.map((tile) => [tile.id, tile]));
  return mapOrderedIds(byId, market, (tile) => ({
    ticker: tile.label,
    name: tile.label,
    price: tile.value,
    changePct: tile.change_pct,
  }));
}

function mapOrderedIds<T>(
  byId: Map<string, T>,
  market: "US" | "IN",
  toHero: (row: T) => HeroIndex,
): HeroIndex[] {
  return HERO_INDEX_ORDER[market]
    .map((id) => {
      const row = byId.get(id);
      if (!row) return null;
      const mapped = toHero(row);
      if (!Number.isFinite(mapped.price) || mapped.price <= 0) return null;
      return mapped;
    })
    .filter((row): row is HeroIndex => Boolean(row));
}

export async function getHeroIndices(market: "US" | "IN" = "US"): Promise<HeroIndex[]> {
  const view = await getHomeView(market).catch(() => null);

  const fromSnapshot = heroIndicesFromSnapshot(view?.market_snapshot_rows ?? [], market);
  if (fromSnapshot.length > 0) return fromSnapshot.slice(0, 5);

  const fromTiles = heroIndicesFromMarketTiles(view?.dashboard?.market_tiles, market);
  if (fromTiles.length > 0) return fromTiles.slice(0, 5);

  // Fast path: 5–6 tm_latest_prices docs (never scan the full universe snapshot).
  const macro = await getMacroStrip(market).catch(() => []);
  const byId = new Map(macro.map((row) => [row.instrument_id, row]));
  const fromMacro = HERO_INDEX_ORDER[market]
    .map((id) => {
      const row = byId.get(id);
      if (!row || typeof row.price !== "number" || row.price <= 0) return null;
      return {
        ticker: row.ticker,
        name: row.ticker,
        price: row.price,
        changePct: row.day_change_pct ?? 0,
      } satisfies HeroIndex;
    })
    .filter((row): row is HeroIndex => Boolean(row));

  return fromMacro.slice(0, 5);
}
