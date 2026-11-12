import { cache } from "react";
import { unstable_cache } from "next/cache";
import { adminFirestore } from "@/lib/firebase-admin";
import { localFirestoreFromEnv } from "@/lib/local-firestore";
import { sharedCache } from "@/lib/shared-cache";
import type { DocumentData, DocumentReference } from "firebase-admin/firestore";
import type {
  DashboardView,
  MarketMoversDoc,
  SnapshotRow,
  StockIntelligence,
  LatestPrice,
  Instrument,
} from "@/lib/types";

const FIRESTORE_BATCH_GET_SIZE = 100;

export async function batchGetRefs<T>(
  refs: Array<DocumentReference<DocumentData>>,
): Promise<Map<string, T>> {
  const result = new Map<string, T>();
  for (let start = 0; start < refs.length; start += FIRESTORE_BATCH_GET_SIZE) {
    const chunk = refs.slice(start, start + FIRESTORE_BATCH_GET_SIZE);
    const docs = await adminFirestore.getAll(...chunk);
    for (const doc of docs) {
      if (doc.exists) result.set(doc.id, doc.data() as T);
    }
  }
  return result;
}

// ─── Active universe ──────────────────────────────────────────────────────────
// Universe IDs are legacy Firestore namespaces. In product language, US_universe
// is the current runtime_core, not the full search_catalog or coverage_catalog.
// See docs/stock-universes.md before changing this contract.
// Both functions are wrapped in React.cache so the Firestore config doc is read
// exactly once per server-render request regardless of how many lib functions
// call them. Without this, each of getStockIntelligenceDoc / getInstrumentViewDoc
// / getStockIntelPro / getSectorContextDoc fires its own independent read.

// Single cached fetch of the raw config doc - shared by both getters below.
// The doc names the live universe namespaces and only changes when a universe is
// rotated, yet it sat on the stock page's critical path (one store round trip
// before the intelligence, view and scorecard docs could be read). It is the
// same for everyone, so it is also kept for two minutes across requests
// (lib/shared-cache.ts). A failed read throws and is never kept.
const readUniverseConfigShared = sharedCache(
  async (): Promise<Record<string, string>> => {
    const doc = await adminFirestore.collection("tm_config").doc("active_universes").get();
    // Thrown, never kept: a missing doc would otherwise fail every universe lookup for the whole window.
    if (!doc.exists) throw new Error("tm_config/active_universes is missing");
    return doc.data() as Record<string, string>;
  },
  ["tm-config-active-universes-v1"],
  { revalidate: 120 },
);
const _getUniverseConfig = cache(() => readUniverseConfigShared());

function requireUniverse(config: Record<string, string>, key: string): string {
  const value = String(config[key] || "").trim();
  if (!value) {
    throw new Error(`Missing tm_config/active_universes key: ${key}`);
  }
  return value;
}

function resolveUniverse(config: Record<string, string>, market: "US" | "IN", type: "ai" | "price"): string {
  if (market === "US") {
    return requireUniverse(config, "US_universe");
  }
  return requireUniverse(config, `${market}_${type}_universe`);
}

export async function getAiUniverse(market: "US" | "IN" = "US"): Promise<string> {
  const data = await _getUniverseConfig();
  return resolveUniverse(data, market, "ai");
}

export async function getPriceUniverse(market: "US" | "IN" = "US"): Promise<string> {
  const data = await _getUniverseConfig();
  return resolveUniverse(data, market, "price");
}

export async function getActiveUniverses(): Promise<Record<"US_ai" | "IN_ai" | "US_price" | "IN_price", string>> {
  const data = await _getUniverseConfig();
  const usUniverse = requireUniverse(data, "US_universe");
  return {
    US_ai: usUniverse,
    US_price: usUniverse,
    IN_ai: requireUniverse(data, "IN_ai_universe"),
    IN_price: requireUniverse(data, "IN_price_universe"),
  };
}

// ─── Materialized dashboard view ─────────────────────────────────────────────

async function getDashboardViewUncached(market: "US" | "IN" = "US"): Promise<DashboardView | null> {
  const universe = await getPriceUniverse(market);
  const docId = `${market}__${universe}`;
  const doc = await adminFirestore.collection("tm_views_dashboard").doc(docId).get();
  if (!doc.exists) return null;
  return doc.data() as DashboardView;
}

const getDashboardViewCached = unstable_cache(
  getDashboardViewUncached,
  ["dashboard-view"],
  { revalidate: 120 },
);

export async function getDashboardView(market: "US" | "IN" = "US"): Promise<DashboardView | null> {
  return getDashboardViewCached(market);
}

// ─── Stock intelligence ───────────────────────────────────────────────────────

export async function getStockIntelligence(
  instrumentId: string,
  market: "US" | "IN" = "US",
): Promise<StockIntelligence | null> {
  const universe = await getAiUniverse(market);
  const ns = `${market}__${universe}`;
  const doc = await adminFirestore
    .collection("tm_news_runs")
    .doc(ns)
    .collection("stock_intelligence")
    .doc(instrumentId)
    .get();
  if (!doc.exists) return null;
  return doc.data() as StockIntelligence;
}

export async function getAllStockIntelligence(
  market: "US" | "IN" = "US",
): Promise<StockIntelligence[]> {
  const universe = await getAiUniverse(market);
  const ns = `${market}__${universe}`;
  const snap = await adminFirestore
    .collection("tm_news_runs")
    .doc(ns)
    .collection("stock_intelligence")
    .get();
  return snap.docs.map((d) => d.data() as StockIntelligence);
}

// ─── Latest prices ────────────────────────────────────────────────────────────

export async function getLatestPrice(instrumentId: string): Promise<LatestPrice | null> {
  const doc = await adminFirestore.collection("tm_latest_prices").doc(instrumentId).get();
  if (!doc.exists) return null;
  return doc.data() as LatestPrice;
}

export async function getLatestPriceHistory(
  instrumentId: string,
): Promise<Pick<LatestPrice, "history_window" | "quote" | "captured_at" | "updated_at"> | null> {
  const local = localFirestoreFromEnv();
  if (!local) return getLatestPrice(instrumentId);
  const snapshot = (await local.getAllSelected(
    [local.collection("tm_latest_prices").doc(instrumentId)],
    ["history_window", "quote", "captured_at", "updated_at"],
  ))[0];
  return snapshot?.exists
    ? snapshot.data() as Pick<LatestPrice, "history_window" | "quote" | "captured_at" | "updated_at">
    : null;
}

export async function getLatestPrices(instrumentIds: string[]): Promise<Map<string, LatestPrice>> {
  return batchGetRefs<LatestPrice>(
    instrumentIds.map((id) => adminFirestore.collection("tm_latest_prices").doc(id)),
  );
}

export type LatestPriceQuote = Pick<
  LatestPrice,
  "ticker" | "currency" | "captured_at" | "updated_at" | "quote"
>;

const LATEST_PRICE_QUOTE_FIELDS = ["ticker", "currency", "captured_at", "updated_at", "quote"];

export async function getLatestPriceQuotes(
  instrumentIds: string[],
): Promise<Map<string, LatestPriceQuote>> {
  const local = localFirestoreFromEnv();
  if (!local) {
    return batchGetRefs<LatestPriceQuote>(
      instrumentIds.map((id) => adminFirestore.collection("tm_latest_prices").doc(id)),
    );
  }
  const snapshots = await local.getAllSelected(
    instrumentIds.map((id) => local.collection("tm_latest_prices").doc(id)),
    LATEST_PRICE_QUOTE_FIELDS,
  );
  const result = new Map<string, LatestPriceQuote>();
  for (const snapshot of snapshots) {
    if (snapshot.exists) result.set(snapshot.id, snapshot.data() as LatestPriceQuote);
  }
  return result;
}

export async function getLatestPriceFundamentals(
  instrumentIds: string[],
): Promise<Map<string, Pick<LatestPrice, "fundamentals">>> {
  const local = localFirestoreFromEnv();
  if (!local) {
    return batchGetRefs<Pick<LatestPrice, "fundamentals">>(
      instrumentIds.map((id) => adminFirestore.collection("tm_latest_prices").doc(id)),
    );
  }
  const snapshots = await local.getAllSelected(
    instrumentIds.map((id) => local.collection("tm_latest_prices").doc(id)),
    ["fundamentals"],
  );
  const result = new Map<string, Pick<LatestPrice, "fundamentals">>();
  for (const snapshot of snapshots) {
    if (snapshot.exists) result.set(snapshot.id, snapshot.data() as Pick<LatestPrice, "fundamentals">);
  }
  return result;
}

export type LatestPriceCore = Pick<
  LatestPrice,
  | "instrument_id"
  | "ticker"
  | "market"
  | "currency"
  | "captured_at"
  | "updated_at"
  | "session_phase"
  | "quote"
  | "fundamentals"
  | "analyst_consensus"
  | "provider_metadata"
>;

const LATEST_PRICE_CORE_FIELDS = [
  "instrument_id",
  "ticker",
  "market",
  "currency",
  "captured_at",
  "updated_at",
  "session_phase",
  "quote",
  "fundamentals",
  "analyst_consensus",
  "provider_metadata",
];

export async function getLatestPriceCores(
  instrumentIds: string[],
): Promise<Map<string, LatestPriceCore>> {
  const local = localFirestoreFromEnv();
  if (!local) {
    return batchGetRefs<LatestPriceCore>(
      instrumentIds.map((id) => adminFirestore.collection("tm_latest_prices").doc(id)),
    );
  }
  const snapshots = await local.getAllSelected(
    instrumentIds.map((id) => local.collection("tm_latest_prices").doc(id)),
    LATEST_PRICE_CORE_FIELDS,
  );
  const result = new Map<string, LatestPriceCore>();
  for (const snapshot of snapshots) {
    if (snapshot.exists) result.set(snapshot.id, snapshot.data() as LatestPriceCore);
  }
  return result;
}

const getLatestPriceCoreUncached = async (instrumentId: string): Promise<LatestPriceCore | null> => {
  return (await getLatestPriceCores([instrumentId])).get(instrumentId) ?? null;
};

export const getLatestPriceCore = cache(getLatestPriceCoreUncached);

export type Near52WeekViewRow = {
  instrumentId: string;
  market: "US" | "IN";
  ticker: string;
  name: string;
  price: number;
  changePct?: number;
  week52High: number;
  week52Low: number;
  updatedAt?: string;
};

const getNear52WeekViewUncached = async (
  market: "US" | "IN" = "US",
): Promise<Near52WeekViewRow[] | null> => {
  const doc = await adminFirestore.collection("tm_views_near_52_week").doc(market).get();
  if (!doc.exists) return null;
  const rows = (doc.data() as { rows?: unknown } | undefined)?.rows;
  if (!Array.isArray(rows)) return null;
  return rows.filter((row): row is Near52WeekViewRow => {
    if (!row || typeof row !== "object") return false;
    const item = row as Record<string, unknown>;
    return (
      typeof item.instrumentId === "string" &&
      typeof item.ticker === "string" &&
      typeof item.name === "string" &&
      typeof item.price === "number" &&
      typeof item.week52High === "number" &&
      typeof item.week52Low === "number"
    );
  });
};

const getNear52WeekViewCached = unstable_cache(
  getNear52WeekViewUncached,
  ["near-52-week-view"],
  { revalidate: 60 },
);

export async function getNear52WeekView(
  market: "US" | "IN" = "US",
): Promise<Near52WeekViewRow[] | null> {
  return getNear52WeekViewCached(market);
}

// ─── Market price snapshots (full universe, camelCase price) ──────────────────

const getMarketSnapshotUncached = async (
  market: "US" | "IN" = "US",
): Promise<SnapshotRow[]> => {
  const snap = await adminFirestore
    .collection("market_price_snapshots")
    .doc(market)
    .collection("shards")
    .get();
  const rows: SnapshotRow[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as { rows?: SnapshotRow[] };
    if (Array.isArray(data.rows)) rows.push(...data.rows);
  }
  if (rows.length > 0) return rows;
  // Backward compatibility for legacy snapshots with parent `rows`.
  const latest = await adminFirestore
    .collection("market_price_snapshots")
    .doc(market)
    .get();
  if (latest.exists) {
    const payload = latest.data() as { rows?: SnapshotRow[] };
    if (Array.isArray(payload.rows)) return payload.rows;
  }
  return rows;
};

const getMarketSnapshotCached = unstable_cache(
  getMarketSnapshotUncached,
  ["market-snapshot"],
  { revalidate: 60 },
);

export const getMarketSnapshot = cache(getMarketSnapshotCached);

const getMarketMoversUncached = async (
  market: "US" | "IN" = "US",
): Promise<MarketMoversDoc | null> => {
  const doc = await adminFirestore.collection("tm_market_movers").doc(market).get();
  if (!doc.exists) return null;
  return doc.data() as MarketMoversDoc;
};

const getMarketMoversCached = unstable_cache(
  getMarketMoversUncached,
  ["market-movers"],
  { revalidate: 60 },
);

export const getMarketMovers = cache(getMarketMoversCached);

const getPriceCoreOverridesUncached = async (
  market: "US" | "IN" = "US",
): Promise<string[]> => {
  const doc = await adminFirestore.collection("tm_config").doc("price_core_overrides").get();
  if (!doc.exists) return [];
  const data = doc.data() as Record<string, unknown>;
  const values = data?.[market];
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => String(item || "").trim().toUpperCase())
    .filter(Boolean);
};

const getPriceCoreOverridesCached = unstable_cache(
  getPriceCoreOverridesUncached,
  ["price-core-overrides"],
  { revalidate: 60 },
);

export const getPriceCoreOverrides = cache(getPriceCoreOverridesCached);

// ─── Instruments ─────────────────────────────────────────────────────────────

const getInstrumentUncached = async (instrumentId: string): Promise<Instrument | null> => {
  const doc = await adminFirestore.collection("tm_instruments").doc(instrumentId).get();
  if (!doc.exists) return null;
  return doc.data() as Instrument;
};

export const getInstrument = cache(getInstrumentUncached);

export async function getInstruments(instrumentIds: string[]): Promise<Map<string, Instrument>> {
  return batchGetRefs<Instrument>(
    instrumentIds.map((id) => adminFirestore.collection("tm_instruments").doc(id)),
  );
}
