import { cache } from "react";
import { adminFirestore } from "@/lib/firebase-admin";
import type {
  DashboardView,
  SnapshotRow,
  StockIntelligence,
  LatestPrice,
  Instrument,
} from "@/lib/types";

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

export async function getActiveUniverse(market: "US" | "IN" = "US"): Promise<string> {
  const data = await _getUniverseConfig();
  return data[market] ?? (market === "US" ? "us_test_12" : "in_test_5");
}

// Returns the price universe id — the broader universe used for price scraping,
// technicals, and intel-pro scoring (e.g. us_core_155 for US). Falls back to
// the active AI universe so callers always get a usable value.
export async function getPriceUniverse(market: "US" | "IN" = "US"): Promise<string> {
  const data = await _getUniverseConfig();
  const priceKey = `${market}_price_universe`;
  return data[priceKey] ?? data[market] ?? (market === "US" ? "us_core_155" : "in_core_150");
}

// ─── Materialized dashboard view ─────────────────────────────────────────────

export async function getDashboardView(market: "US" | "IN" = "US"): Promise<DashboardView | null> {
  const universe = await getActiveUniverse(market);
  const docId = `${market}__${universe}`;
  const doc = await adminFirestore.collection("tm_views_dashboard").doc(docId).get();
  if (!doc.exists) return null;
  return doc.data() as DashboardView;
}

// ─── Stock intelligence ───────────────────────────────────────────────────────

export async function getStockIntelligence(
  instrumentId: string,
  market: "US" | "IN" = "US",
): Promise<StockIntelligence | null> {
  const universe = await getActiveUniverse(market);
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
  const universe = await getActiveUniverse(market);
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
  const docs = await Promise.all(
    instrumentIds.map((id) => adminFirestore.collection("tm_latest_prices").doc(id).get()),
  );
  const result = new Map<string, LatestPrice>();
  for (const doc of docs) {
    if (doc.exists) {
      const data = doc.data() as LatestPrice;
      result.set(doc.id, data);
    }
  }
  return result;
}

// ─── Market price snapshots (full universe, camelCase price) ──────────────────

export const getMarketSnapshot = cache(async (
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
  return rows;
});

// ─── Instruments ─────────────────────────────────────────────────────────────

export async function getInstrument(instrumentId: string): Promise<Instrument | null> {
  const doc = await adminFirestore.collection("tm_instruments").doc(instrumentId).get();
  if (!doc.exists) return null;
  return doc.data() as Instrument;
}

export async function getInstruments(instrumentIds: string[]): Promise<Map<string, Instrument>> {
  const docs = await Promise.all(
    instrumentIds.map((id) => adminFirestore.collection("tm_instruments").doc(id).get()),
  );
  const result = new Map<string, Instrument>();
  for (const doc of docs) {
    if (doc.exists) {
      result.set(doc.id, doc.data() as Instrument);
    }
  }
  return result;
}
