import { usHoldings } from "@/lib/markets-insights";
import type { MarketAsset, MarketsData, MarketsOverview, PredictionMarket } from "@/lib/markets-shared";

import { ROW_SPARK_WIDTH, sparkValues, TILE_SPARK_WIDTH } from "./widgets";

/**
 * The markets data the overview's cards draw, cut down for the browser
 * (overview-client.tsx renders the cards there):
 * - each sparkline thinned to the points its width draws, to six significant digits, so the line comes out the same;
 * - the fields the cards never read emptied: fund holdings past the three US names the takeaways
 *   quote, fund profiles and sector weights, futures curves, source links, the prediction markets'
 *   rules and details;
 * - every field still at its empty value (null, "", [], false) left out, and put back by `unpackMarkets`.
 * Ninety-odd assets with forty fields each were mostly empty keys. The detail pages keep the full data.
 */
export type PackedMarkets = {
  as_of: string | null;
  assets: Array<Partial<MarketAsset>>;
  predictions: Array<Partial<PredictionMarket>>;
  treasury: MarketsData["treasury"];
  volCurve: MarketsData["volCurve"];
};

/** The empty value of every asset field that can be left out. Required fields are always sent. */
const ASSET_EMPTY: Partial<MarketAsset> = {
  group: null,
  prev_close: null,
  high_1y: null,
  high_1y_date: null,
  low_1y: null,
  low_1y_date: null,
  spark: [],
  spark_start: null,
  spark_end: null,
  source_url: "",
  contract: null,
  curve: [],
  structure: null,
  market_cap: null,
  volume_24h: null,
  ath: null,
  ath_date: null,
  image: null,
  tenor: null,
  expense_ratio_pct: null,
  total_assets: null,
  yield_pct: null,
  fund_family: null,
  category: null,
  holdings: [],
  holdings_weight_pct: null,
  sectors: [],
  profile_source_name: null,
  profile_source_url: null,
  profile_as_of: null,
  call_volume: null,
  put_volume: null,
  average_20d: null,
  daily_only: false,
};

/** Asset fields no overview card, reading or takeaway reads (checked against widgets, overview-sections and lib/markets-*). */
const ASSET_UNUSED = [
  "prev_close",
  "spark_start",
  "spark_end",
  "source_url",
  "contract",
  "curve",
  "market_cap",
  "image",
  "expense_ratio_pct",
  "total_assets",
  "yield_pct",
  "fund_family",
  "category",
  "holdings_weight_pct",
  "sectors",
  "profile_source_name",
  "profile_source_url",
  "profile_as_of",
  "call_volume",
  "put_volume",
] as const satisfies ReadonlyArray<keyof typeof ASSET_EMPTY>;

const PREDICTION_EMPTY: Partial<PredictionMarket> = {
  source_url: "",
  detail: "",
  outcomes: [],
  volume: null,
  volume_24h: null,
  close_time: null,
  implied_range: null,
  rules: null,
  rules_outcome: null,
  settlement_sources: [],
  has_history: false,
};

const PREDICTION_UNUSED = ["source_url", "detail", "rules", "rules_outcome", "settlement_sources"] as const satisfies ReadonlyArray<
  keyof typeof PREDICTION_EMPTY
>;

function isEmptyValue(value: unknown): boolean {
  return value === null || value === "" || value === false || (Array.isArray(value) && value.length === 0);
}

/** Leaves out every field listed in `empty` whose value is empty, after emptying the `unused` ones. */
function pack<T extends object>(item: T, empty: Partial<T>, unused: ReadonlyArray<keyof T>): Partial<T> {
  const out: Partial<T> = {};
  const skip = new Set<keyof T>(unused);
  for (const key of Object.keys(item) as Array<keyof T>) {
    if (skip.has(key)) continue;
    const value = item[key];
    if (key in empty && isEmptyValue(value)) continue;
    out[key] = value;
  }
  return out;
}

export function packMarkets(data: MarketsData): PackedMarkets {
  return {
    as_of: data.as_of,
    assets: data.assets.map((asset) => {
      const keep = new Set(usHoldings(asset));
      return pack(
        {
          ...asset,
          // Six significant digits: a 52px line moves by far less than the tenth of a pixel it is drawn to.
          spark: sparkValues(asset.spark, ROW_SPARK_WIDTH).map((value) => Number(value.toPrecision(6))),
          // Only the holdings `usHoldings` reads, in their order, and only their symbols: the takeaways name stocks by
          // ticker, and no overview card shows a holding's name or weight.
          holdings: asset.holdings
            .filter((holding) => keep.has((holding.symbol ?? "").replace("-", ".")))
            .map((holding) => ({ symbol: holding.symbol, name: "", weight_pct: 0 })),
        },
        ASSET_EMPTY,
        ASSET_UNUSED,
      );
    }),
    predictions: data.predictions.map((market) => pack(market, PREDICTION_EMPTY, PREDICTION_UNUSED)),
    treasury: data.treasury,
    volCurve: data.volCurve,
  };
}

/** Back to `MarketsData`, every left-out field at its empty value. Runs in the browser. */
export function unpackMarkets(packed: PackedMarkets): MarketsData {
  return {
    as_of: packed.as_of,
    assets: packed.assets.map((asset) => ({ ...ASSET_EMPTY, ...asset }) as MarketAsset),
    predictions: packed.predictions.map((market) => ({ ...PREDICTION_EMPTY, ...market }) as PredictionMarket),
    treasury: packed.treasury,
    volCurve: packed.volCurve,
  };
}

/** The overview (ticker strip, readings, featured market) with the same cuts. */
export function compactOverview(overview: MarketsOverview): MarketsOverview {
  return {
    as_of: overview.as_of,
    tiles: overview.tiles.map((tile) => ({ ...tile, spark: sparkValues(tile.spark, TILE_SPARK_WIDTH) })),
    readings: overview.readings,
    prediction: overview.prediction ? ({ ...PREDICTION_EMPTY, ...pack(overview.prediction, PREDICTION_EMPTY, PREDICTION_UNUSED) } as PredictionMarket) : null,
  };
}
