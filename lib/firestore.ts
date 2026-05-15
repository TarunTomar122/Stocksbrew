import { cache } from "react";
import { unstable_cache } from "next/cache";
import { adminFirestore } from "@/lib/firebase-admin";
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
// Both functions are wrapped in React.cache so the Firestore config doc is read
// exactly once per server-render request regardless of how many lib functions
// call them. Without this, each of getStockIntelligenceDoc / getInstrumentViewDoc
// / getStockIntelPro / getSectorContextDoc fires its own independent read.

// Single cached fetch of the raw config doc — shared by both getters below.
const _getUniverseConfig = cache(async (): Promise<Record<string, string>> => {
  const doc = await adminFirestore.collection("tm_config").doc("active_universes").get();
  return doc.exists ? (doc.data() as Record<string, string>) : {};
});

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

export async function getLatestPrices(instrumentIds: string[]): Promise<Map<string, LatestPrice>> {
  return batchGetRefs<LatestPrice>(
    instrumentIds.map((id) => adminFirestore.collection("tm_latest_prices").doc(id)),
  );
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

// ─── Instruments ─────────────────────────────────────────────────────────────

export async function getInstrument(instrumentId: string): Promise<Instrument | null> {
  const doc = await adminFirestore.collection("tm_instruments").doc(instrumentId).get();
  if (!doc.exists) return null;
  return doc.data() as Instrument;
}

export async function getInstruments(instrumentIds: string[]): Promise<Map<string, Instrument>> {
  return batchGetRefs<Instrument>(
    instrumentIds.map((id) => adminFirestore.collection("tm_instruments").doc(id)),
  );
}
