/**
 * Server loaders for multi-asset market coverage. The documents are written by
 * `backend/agentdata/markets.py`; `tm_markets_meta/latest` names the ids of the
 * current run, so an asset that was dropped stops showing without a delete.
 */
import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import {
  buildMarketsOverview,
  type ChangeMode,
  type EtfHolding,
  type MarketAsset,
  type MarketAssetClass,
  type MarketChange,
  type MarketSeries,
  type MarketsData,
  type MarketsOverview,
  type PredictionHistorySeries,
  type PredictionMarket,
  type PredictionOutcome,
  type TreasuryCurve,
  type VolCurve,
} from "@/lib/markets-shared";

const ASSET_CLASSES: MarketAssetClass[] = ["index", "etf", "rate", "commodity", "fx", "crypto", "option"];
const REVALIDATE_SECONDS = 300;

type Raw = Record<string, unknown>;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => num(item) !== null) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function records(value: unknown): Raw[] {
  return Array.isArray(value)
    ? value.filter((item): item is Raw => typeof item === "object" && item !== null)
    : [];
}

function changeOf(value: unknown): MarketChange {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Raw;
  return { d1: num(raw.d1), w1: num(raw.w1), m1: num(raw.m1), ytd: num(raw.ytd), y1: num(raw.y1) };
}

export function normalizeAsset(raw: Raw | undefined | null): MarketAsset | null {
  if (!raw) return null;
  const id = str(raw.id);
  const assetClass = ASSET_CLASSES.find((item) => item === raw.class);
  const price = num(raw.price);
  const name = str(raw.name);
  const asOf = str(raw.as_of);
  if (!id || !assetClass || price === null || !name || !asOf) return null;
  const mode: ChangeMode = raw.change_mode === "bps" || raw.change_mode === "abs" ? raw.change_mode : "pct";
  const structure = raw.structure as MarketAsset["structure"] | undefined;
  const holdings: EtfHolding[] = records(raw.holdings).flatMap((item) => {
    const weight = num(item.weight_pct);
    const holdingName = str(item.name);
    return weight !== null && holdingName ? [{ symbol: str(item.symbol), name: holdingName, weight_pct: weight }] : [];
  });
  return {
    id,
    class: assetClass,
    group: str(raw.group),
    name,
    symbol: str(raw.symbol) ?? id.toUpperCase(),
    price,
    prev_close: num(raw.prev_close),
    unit: str(raw.unit) ?? "USD",
    change_mode: mode,
    change: changeOf(raw.change),
    high_1y: num(raw.high_1y),
    high_1y_date: str(raw.high_1y_date),
    low_1y: num(raw.low_1y),
    low_1y_date: str(raw.low_1y_date),
    spark: numbers(raw.spark),
    spark_start: str(raw.spark_start),
    spark_end: str(raw.spark_end),
    source: str(raw.source) ?? "",
    source_name: str(raw.source_name) ?? "",
    source_url: str(raw.source_url) ?? "",
    as_of: asOf,
    order: num(raw.order) ?? 0,
    contract: str(raw.contract),
    curve: records(raw.curve).flatMap((item) => {
      const pointPrice = num(item.price);
      const label = str(item.label);
      return pointPrice !== null && label ? [{ label, months_out: num(item.months_out) ?? 0, price: pointPrice }] : [];
    }),
    structure: structure && typeof structure === "object" && typeof structure.state === "string" ? structure : null,
    market_cap: num(raw.market_cap),
    volume_24h: num(raw.volume_24h),
    ath: num(raw.ath),
    ath_date: str(raw.ath_date),
    image: str(raw.image),
    tenor: str(raw.tenor),
    expense_ratio_pct: num(raw.expense_ratio_pct),
    total_assets: num(raw.total_assets),
    yield_pct: num(raw.yield_pct),
    fund_family: str(raw.fund_family),
    category: str(raw.category),
    holdings,
    holdings_weight_pct: num(raw.holdings_weight_pct),
    sectors: records(raw.sectors).flatMap((item) => {
      const weight = num(item.weight_pct);
      const sector = str(item.sector);
      return weight !== null && sector ? [{ sector, weight_pct: weight }] : [];
    }),
    profile_source_name: str(raw.profile_source_name),
    profile_source_url: str(raw.profile_source_url),
    profile_as_of: str(raw.profile_as_of),
    call_volume: num(raw.call_volume),
    put_volume: num(raw.put_volume),
    average_20d: num(raw.average_20d),
    daily_only: raw.daily_only === true,
  };
}

export function normalizePrediction(raw: Raw | undefined | null): PredictionMarket | null {
  if (!raw) return null;
  const id = str(raw.id);
  const question = str(raw.question);
  if (!id || !question) return null;
  const outcomes: PredictionOutcome[] = records(raw.outcomes).flatMap((item) => {
    const probability = num(item.probability);
    const label = str(item.label);
    if (probability === null || !label) return [];
    return [{ label, probability, strike: num(item.strike), change_24h: num(item.change_24h) }];
  });
  if (outcomes.length === 0) return null;
  const kinds = ["binary", "exclusive", "ladder", "multi"] as const;
  const range = raw.implied_range as { low?: unknown; high?: unknown } | undefined;
  const low = num(range?.low);
  const high = num(range?.high);
  return {
    id,
    source: str(raw.source) ?? "",
    source_name: str(raw.source_name) ?? "",
    source_url: str(raw.source_url) ?? "",
    topic: str(raw.topic) ?? "economy",
    question,
    detail: str(raw.detail) ?? "",
    kind: kinds.find((kind) => kind === raw.kind) ?? "multi",
    outcomes,
    outcome_count: num(raw.outcome_count) ?? outcomes.length,
    volume: num(raw.volume),
    volume_24h: num(raw.volume_24h),
    volume_unit: raw.volume_unit === "usd" ? "usd" : "contracts",
    close_time: str(raw.close_time),
    as_of: str(raw.as_of) ?? "",
    implied_range: low !== null && high !== null ? { low, high } : null,
    order: num(raw.order) ?? 0,
    rules: str(raw.rules),
    rules_outcome: str(raw.rules_outcome),
    settlement_sources: records(raw.settlement_sources).flatMap((item) => {
      const name = str(item.name);
      const url = str(item.url);
      return name && url && /^https?:\/\//.test(url) ? [{ name, url }] : [];
    }),
    has_history: raw.has_history === true,
  };
}

function normalizeTreasury(raw: Raw | undefined | null): TreasuryCurve | null {
  if (!raw) return null;
  const date = str(raw.date);
  const points = records(raw.points).flatMap((item) => {
    const value = num(item.value);
    const tenor = str(item.tenor);
    if (value === null || !tenor) return [];
    return [
      {
        tenor,
        label: str(item.label) ?? tenor,
        months: num(item.months) ?? 0,
        asset_id: str(item.asset_id),
        value,
        value_1m_ago: num(item.value_1m_ago),
        value_1y_ago: num(item.value_1y_ago),
      },
    ];
  });
  if (!date || points.length < 2) return null;
  return {
    date,
    date_1m_ago: str(raw.date_1m_ago),
    date_1y_ago: str(raw.date_1y_ago),
    points,
    spread_2s10s_bps: num(raw.spread_2s10s_bps),
    spread_3m10y_bps: num(raw.spread_3m10y_bps),
    source_name: str(raw.source_name) ?? "US Treasury",
    source_url: str(raw.source_url) ?? "",
    as_of: str(raw.as_of) ?? date,
  };
}

function normalizeVolCurve(raw: Raw | undefined | null): VolCurve | null {
  if (!raw) return null;
  const date = str(raw.date);
  const points = records(raw.points).flatMap((item) => {
    const value = num(item.value);
    const label = str(item.label);
    const days = num(item.days);
    if (value === null || !label || days === null) return [];
    return [
      {
        label,
        symbol: str(item.symbol) ?? label,
        days,
        asset_id: str(item.asset_id),
        value,
        value_1m_ago: num(item.value_1m_ago),
      },
    ];
  });
  if (!date || points.length < 3) return null;
  return {
    date,
    points,
    state: raw.state === "inverted" || raw.state === "normal" ? raw.state : null,
    vix_to_vix3m: num(raw.vix_to_vix3m),
    source_name: str(raw.source_name) ?? "Cboe",
    source_url: str(raw.source_url) ?? "",
    as_of: str(raw.as_of) ?? date,
  };
}

const EMPTY: MarketsData = { as_of: null, assets: [], predictions: [], treasury: null, volCurve: null };

async function loadMarketsData(): Promise<MarketsData> {
  const metaSnap = await adminFirestore.collection("tm_markets_meta").doc("latest").get();
  if (!metaSnap.exists) return EMPTY;
  const meta = (metaSnap.data() ?? {}) as Raw;
  const assetIds = strings(meta.asset_ids).slice(0, 400);
  const predictionIds = strings(meta.prediction_ids).slice(0, 100);

  const refs = [
    ...assetIds.map((id) => adminFirestore.collection("tm_market_assets").doc(id)),
    ...predictionIds.map((id) => adminFirestore.collection("tm_prediction_markets").doc(id)),
    adminFirestore.collection("tm_markets_curves").doc("treasury"),
    adminFirestore.collection("tm_markets_curves").doc("vix"),
  ];
  const snaps = await adminFirestore.getAll(...refs);
  const docs = snaps.map((snap) => (snap.exists ? (snap.data() as Raw) : null));

  const assets = docs
    .slice(0, assetIds.length)
    .map(normalizeAsset)
    .filter((asset): asset is MarketAsset => asset !== null)
    .sort((a, b) => a.order - b.order);
  const predictions = docs
    .slice(assetIds.length, assetIds.length + predictionIds.length)
    .map(normalizePrediction)
    .filter((market): market is PredictionMarket => market !== null)
    // A market whose close time has passed is waiting on its result, not trading.
    .filter((market) => !market.close_time || Date.parse(market.close_time) > Date.now())
    .sort((a, b) => a.order - b.order);

  return {
    as_of: str(meta.as_of),
    assets,
    predictions,
    treasury: normalizeTreasury(docs[docs.length - 2]),
    volCurve: normalizeVolCurve(docs[docs.length - 1]),
  };
}

// A failed read must not be cached: `unstable_cache` stores whatever the
// function returns, so returning "empty" on an error would show "not
// available" to everyone for the whole revalidate window. The cached function
// throws instead, and the wrapper turns a throw into empty for this request only.
const getMarketsDataCached = unstable_cache(loadMarketsData, ["markets-data-v3"], {
  revalidate: REVALIDATE_SECONDS,
  tags: ["markets"],
});

/** Everything the markets pages show, in one cached read. Never throws: a store outage reads as empty, for that request only. */
export async function getMarketsData(): Promise<MarketsData> {
  try {
    const data = await getMarketsDataCached();
    if (data.assets.length > 0) return data;
    // An empty result that got cached (the store answered with nothing): read it again, uncached.
    return await loadMarketsData();
  } catch (error) {
    console.error("markets_load_failed", error);
    return EMPTY;
  }
}

/** The slim cut for the landing grid and the briefing: seven tiles, the readings, one Fed market. */
export async function getMarketsOverview(): Promise<MarketsOverview> {
  return buildMarketsOverview(await getMarketsData());
}

/** About a year of daily values for one asset's chart. Null when there is no series. */
export const getMarketSeries = async (assetId: string): Promise<MarketSeries | null> => {
  try {
    // The cached function throws on a failed read so the failure is never cached.
    return await unstable_cache(
      async (): Promise<MarketSeries | null> => {
        const snap = await adminFirestore.collection("tm_markets_series").doc(assetId).get();
        if (!snap.exists) return null;
        const raw = (snap.data() ?? {}) as Raw;
        const dates = strings(raw.dates);
        const values = numbers(raw.values);
        if (dates.length < 2 || dates.length !== values.length) return null;
        return { dates, values };
      },
      ["markets-series-v2", assetId],
      { revalidate: REVALIDATE_SECONDS, tags: ["markets"] },
    )();
  } catch (error) {
    console.error("markets_series_load_failed", assetId, error);
    return null;
  }
};

/** Daily probability history of a prediction market's leading outcomes. Empty when the venue has none. */
export const getPredictionHistory = async (marketId: string): Promise<PredictionHistorySeries[]> => {
  try {
    // The cached function throws on a failed read so the failure is never cached.
    return await unstable_cache(
      async (): Promise<PredictionHistorySeries[]> => {
        const snap = await adminFirestore.collection("tm_prediction_history").doc(marketId).get();
        if (!snap.exists) return [];
        const raw = (snap.data() ?? {}) as Raw;
        return records(raw.series).flatMap((item) => {
          const label = str(item.label);
          const dates = strings(item.dates);
          const values = numbers(item.values);
          return label && dates.length >= 2 && dates.length === values.length ? [{ label, dates, values }] : [];
        });
      },
      ["markets-prediction-history-v2", marketId],
      { revalidate: REVALIDATE_SECONDS, tags: ["markets"] },
    )();
  } catch (error) {
    console.error("markets_prediction_history_load_failed", marketId, error);
    return [];
  }
};
