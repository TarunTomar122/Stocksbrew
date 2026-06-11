import { getInstruments } from "@/lib/firestore";
import { getUserDoc } from "@/lib/watchlist";
import { getWatchlistView, overlayLatestPrices, type WatchlistRow } from "@/lib/watchlist-view";

export type RadarRowsPayload = {
  uid: string;
  tracked: string[];
  rows: WatchlistRow[];
  watchlistPositions: Record<string, "holding" | "watchlist">;
  builtAt?: string;
};

/** Load tracked watchlist rows with profile overrides and fresh prices. */
export async function loadRadarRowsForUser(uid: string): Promise<RadarRowsPayload | null> {
  const userDoc = await getUserDoc(uid);
  if (!userDoc) return null;

  const tracked = Array.isArray(userDoc.tracked_stocks) ? userDoc.tracked_stocks : [];
  const watchlistView = await getWatchlistView(uid).catch(() => null);
  const radar = userDoc.radar_v1 || {};
  const materializedRows = (watchlistView?.rows || radar.rows || []) as WatchlistRow[];
  const watchlistPositions =
    userDoc.watchlist_positions && typeof userDoc.watchlist_positions === "object"
      ? (userDoc.watchlist_positions as Record<string, "holding" | "watchlist">)
      : {};
  const watchlistHoldings =
    userDoc.watchlist_holdings && typeof userDoc.watchlist_holdings === "object"
      ? (userDoc.watchlist_holdings as Record<
          string,
          {
            quantity?: number | null;
            market_value?: number | null;
            average_cost?: number | null;
            source?: string;
            updated_at?: string;
          }
        >)
      : {};

  const trackedSet = new Set(tracked);
  const materializedById = new Map(
    materializedRows
      .filter((row) => trackedSet.has(row.instrument_id))
      .map((row) => [row.instrument_id, row] as const),
  );
  const missingMaterializedIds = tracked.filter((instrumentId) => !materializedById.has(instrumentId));
  const fallbackInstruments = missingMaterializedIds.length
    ? await getInstruments(missingMaterializedIds).catch(() => new Map())
    : new Map();

  const rowsBase = tracked
    .map((instrumentId) => {
      const materialized = materializedById.get(instrumentId);
      const profileHolding = watchlistHoldings[instrumentId];
      const holdingOverride: WatchlistRow["holding"] =
        watchlistPositions[instrumentId] === "holding" && profileHolding
          ? {
              quantity: profileHolding.quantity ?? null,
              market_value: profileHolding.market_value ?? null,
              average_cost: profileHolding.average_cost ?? null,
              source: profileHolding.source,
              updated_at: profileHolding.updated_at,
              portfolio_weight_pct:
                (materialized?.holding?.portfolio_weight_pct as number | null | undefined) ?? null,
            }
          : undefined;

      if (materialized) {
        return {
          ...materialized,
          position_type: watchlistPositions[instrumentId] === "holding" ? "holding" : "watchlist",
          holding: holdingOverride ?? materialized.holding,
        } as WatchlistRow;
      }

      const fallback = fallbackInstruments.get(instrumentId);
      const ticker = fallback?.ticker || instrumentId.split("_").slice(1).join("_");
      const market = instrumentId.startsWith("IN_") ? "IN" : "US";
      return {
        instrument_id: instrumentId,
        ticker,
        logo_url: null,
        position_type: watchlistPositions[instrumentId] === "holding" ? "holding" : "watchlist",
        market,
        sector_label: fallback?.sector || "",
        industry_label: fallback?.industry || "",
        currency: market === "IN" ? "INR" : "USD",
        price: null,
        day_change_pct: null,
        day_change_abs: null,
        scores: {
          overall: null,
          verdict: null,
          valuation: null,
          growth: null,
          quality: null,
          momentum: null,
        },
        alerts: [],
        catalysts: [],
        brief_tile: {
          micro: "Price and analysis are syncing.",
          vibe: "wild",
          source: "rules",
        },
        coverage_status: "score_pending",
        has_intel_pro: false,
      } as WatchlistRow;
    })
    .filter((row): row is WatchlistRow => Boolean(row));

  const rows = await overlayLatestPrices(rowsBase).catch(() => rowsBase);
  const builtAt =
    typeof watchlistView?.built_at === "string"
      ? watchlistView.built_at
      : typeof radar.built_at === "string"
        ? radar.built_at
        : undefined;

  return {
    uid,
    tracked,
    rows,
    watchlistPositions,
    builtAt,
  };
}
