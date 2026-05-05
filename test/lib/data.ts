import { Query } from "firebase-admin/firestore";

import { adminFirestore } from "@/lib/firebase-admin";

type JsonRecord = Record<string, unknown>;

function toPlain(value: unknown): unknown {
  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.map((item) => toPlain(item));
  }

  if (typeof value === "object") {
    if (value instanceof Date) {
      return value.toISOString();
    }

    const maybeTimestamp = value as { toDate?: () => Date };
    if (typeof maybeTimestamp.toDate === "function") {
      return maybeTimestamp.toDate().toISOString();
    }

    const out: JsonRecord = {};
    for (const [key, inner] of Object.entries(value as JsonRecord)) {
      out[key] = toPlain(inner);
    }
    return out;
  }

  return value;
}

function withId(id: string, data: unknown): JsonRecord {
  return {
    id,
    ...(toPlain(data) as JsonRecord),
  };
}

async function queryCount(query: Query): Promise<number | null> {
  try {
    const snapshot = await query.count().get();
    return snapshot.data().count;
  } catch {
    return null;
  }
}

type ActiveUsUniverses = {
  activePriceUniverse: string;
  activeAiUniverse: string;
  raw: unknown;
};

async function getActiveUsUniverses(): Promise<ActiveUsUniverses> {
  const doc = await adminFirestore.collection("tm_config").doc("active_universes").get();
  const data = doc.exists ? (doc.data() as JsonRecord) : {};
  const activeUnifiedUniverse = String(data.US_universe || "").trim();
  const activePriceUniverse = activeUnifiedUniverse;
  const activeAiUniverse = activeUnifiedUniverse;
  if (!activePriceUniverse || !activeAiUniverse) {
    throw new Error(
      "Missing active universe: expected US_universe in tm_config/active_universes",
    );
  }
  return {
    activePriceUniverse,
    activeAiUniverse,
    raw: toPlain(data),
  };
}

async function getActiveUsNamespaceRef() {
  const { activePriceUniverse, activeAiUniverse, raw } = await getActiveUsUniverses();
  return {
    activePriceUniverse,
    activeAiUniverse,
    activeUniversesRaw: raw,
    namespaceId: `US__${activeAiUniverse}`,
    namespaceRef: adminFirestore.collection("tm_news_runs").doc(`US__${activeAiUniverse}`),
  };
}

async function getMarketPriceRows(market = "US"): Promise<JsonRecord[]> {
  const shards = await adminFirestore
    .collection("market_price_snapshots")
    .doc(market)
    .collection("shards")
    .get();

  const sorted = shards.docs.sort((a, b) => a.id.localeCompare(b.id));
  const rows: JsonRecord[] = [];
  for (const doc of sorted) {
    const payload = (toPlain(doc.data()) as JsonRecord) || {};
    const shardRows = Array.isArray(payload.rows) ? payload.rows : [];
    for (const row of shardRows) {
      if (row && typeof row === "object") {
        rows.push(row as JsonRecord);
      }
    }
  }
  return rows;
}

async function resolveInstrumentId(docIdOrTicker: string): Promise<string | null> {
  const raw = String(docIdOrTicker || "").trim();
  if (!raw) return null;

  if (raw.startsWith("US_")) {
    const instrument = await adminFirestore.collection("tm_instruments").doc(raw).get();
    if (instrument.exists) return raw;
  }

  const ticker = raw.replace(/^US_/, "").toUpperCase();
  const byTicker = await adminFirestore
    .collection("tm_instruments")
    .where("market", "==", "US")
    .where("ticker", "==", ticker)
    .limit(1)
    .get();
  if (!byTicker.empty) {
    return byTicker.docs[0].id;
  }

  return null;
}

export async function getUsContext(): Promise<{
  activeUniverse: string;
  activePriceUniverse: string;
  activeAiUniverse: string;
  activeUniverseRaw: unknown;
  marketsUs: unknown;
  tmViewsDashboardUs: unknown;
  counts: Record<string, number | null>;
}> {
  const { activePriceUniverse, activeAiUniverse, raw } = await getActiveUsUniverses();

  const [tmViewsDashboardDoc, marketContextDoc, instrumentsCount, latestPricesCount, stockIntelCount, sectorContextCount] = await Promise.all([
    adminFirestore.collection("tm_views_dashboard").doc(`US__${activeAiUniverse}`).get(),
    adminFirestore.collection("tm_news_runs").doc(`US__${activeAiUniverse}`).collection("market_context").doc("overview").get(),
    queryCount(adminFirestore.collection("tm_instruments").where("market", "==", "US")),
    queryCount(adminFirestore.collection("tm_latest_prices")),
    queryCount(adminFirestore.collection("tm_news_runs").doc(`US__${activeAiUniverse}`).collection("stock_intelligence")),
    queryCount(adminFirestore.collection("tm_news_runs").doc(`US__${activeAiUniverse}`).collection("sector_context")),
  ]);

  return {
    activeUniverse: activeAiUniverse,
    activePriceUniverse,
    activeAiUniverse,
    activeUniverseRaw: raw,
    marketsUs: toPlain(marketContextDoc.exists ? marketContextDoc.data() : null),
    tmViewsDashboardUs: toPlain(tmViewsDashboardDoc.exists ? tmViewsDashboardDoc.data() : null),
    counts: {
      tm_instruments_us: instrumentsCount,
      tm_latest_prices_total: latestPricesCount,
      tm_stock_intelligence: stockIntelCount,
      tm_sector_context: sectorContextCount,
    },
  };
}

export async function getMarketUsDoc(): Promise<unknown> {
  const { namespaceRef } = await getActiveUsNamespaceRef();
  const [marketContextDoc, namespaceDoc] = await Promise.all([
    namespaceRef.collection("market_context").doc("overview").get(),
    namespaceRef.get(),
  ]);
  return toPlain({
    namespace: namespaceDoc.exists ? namespaceDoc.data() : null,
    market_context: marketContextDoc.exists ? marketContextDoc.data() : null,
  });
}

export async function getViewDocs(): Promise<{ tmViewsDashboardUs: unknown; activeUniverse: string }> {
  const { activeAiUniverse } = await getActiveUsUniverses();
  const tmDoc = await adminFirestore.collection("tm_views_dashboard").doc(`US__${activeAiUniverse}`).get();

  return {
    tmViewsDashboardUs: toPlain(tmDoc.exists ? tmDoc.data() : null),
    activeUniverse: activeAiUniverse,
  };
}

export async function listUsStocks(limit = 80): Promise<JsonRecord[]> {
  const [instrumentsSnapshot, priceRows, { namespaceRef }] = await Promise.all([
    adminFirestore.collection("tm_instruments").where("market", "==", "US").limit(limit).get(),
    getMarketPriceRows("US"),
    getActiveUsNamespaceRef(),
  ]);

  const stockIntelSnapshot = await namespaceRef.collection("stock_intelligence").get();

  const priceById = new Map<string, JsonRecord>();
  for (const row of priceRows) {
    const instrumentId = String(row.instrument_id || "");
    if (instrumentId) priceById.set(instrumentId, row);
  }

  const intelById = new Map<string, JsonRecord>();
  for (const doc of stockIntelSnapshot.docs) {
    intelById.set(doc.id, (toPlain(doc.data()) as JsonRecord) || {});
  }

  return instrumentsSnapshot.docs
    .map((doc) => {
      const instrument = (toPlain(doc.data()) as JsonRecord) || {};
      const pricePayload = priceById.get(doc.id) || {};
      const quote = ((pricePayload.quote as JsonRecord) || {}) as JsonRecord;
      const intel = intelById.get(doc.id) || {};
      return {
        id: doc.id,
        symbol: instrument.ticker,
        ticker: instrument.ticker,
        name: instrument.name,
        exchange: instrument.exchange,
        sector: instrument.sector,
        market: instrument.market,
        lastUpdated: pricePayload.captured_at,
        runType: pricePayload.session_phase,
        price: {
          current: quote.current,
          changePct: quote.day_change_pct,
          volume: quote.volume,
        },
        sentiment: {
          label: intel.overall_label,
          overall: intel.overall_score,
        },
        headline: intel.headline || "",
        thesis: intel.today_brief || "",
        keyPoints: Array.isArray(intel.key_points) ? intel.key_points : [],
        timeline: Array.isArray(intel.timeline) ? intel.timeline : [],
        visualCards: intel.visual_cards || {},
        visualSummary: intel.visual_summary || {},
        dataQuality: intel.data_quality || {},
        comparativeContext: intel.comparative_context || {},
        runContext: intel.run_context || {},
      };
    })
    .sort((a, b) => String(a.symbol || a.id).localeCompare(String(b.symbol || b.id)));
}

export async function getStockDoc(docId: string): Promise<unknown> {
  const instrumentId = await resolveInstrumentId(docId);
  if (!instrumentId) return null;

  const { activeAiUniverse, namespaceRef } = await getActiveUsNamespaceRef();

  const [instrumentDoc, latestPriceDoc, stockIntelDoc, instrumentViewDoc] = await Promise.all([
    adminFirestore.collection("tm_instruments").doc(instrumentId).get(),
    adminFirestore.collection("tm_latest_prices").doc(instrumentId).get(),
    namespaceRef.collection("stock_intelligence").doc(instrumentId).get(),
    adminFirestore.collection("tm_views_instrument").doc(`${instrumentId}__${activeAiUniverse}`).get(),
  ]);
  const instrumentData = (instrumentDoc.exists ? (instrumentDoc.data() as JsonRecord) : {}) || {};
  const latestPriceData = (latestPriceDoc.exists ? (latestPriceDoc.data() as JsonRecord) : {}) || {};
  const stockIntelData = (stockIntelDoc.exists ? (stockIntelDoc.data() as JsonRecord) : {}) || {};
  const instrumentViewData = (instrumentViewDoc.exists ? (instrumentViewDoc.data() as JsonRecord) : {}) || {};
  const latestQuoteData = (latestPriceData.quote && typeof latestPriceData.quote === "object")
    ? (latestPriceData.quote as JsonRecord)
    : {};

  return toPlain({
    instrument_id: instrumentId,
    active_universe: activeAiUniverse,
    instrument: instrumentDoc.exists ? instrumentData : null,
    latest_price: latestPriceDoc.exists ? latestPriceData : null,
    stock_intelligence: stockIntelDoc.exists ? stockIntelData : null,
    instrument_view: instrumentViewDoc.exists ? instrumentViewData : null,
    symbol: instrumentData.ticker,
    name: instrumentData.name,
    price: latestQuoteData,
    sentiment: {
      label: stockIntelData.overall_label,
      overall: stockIntelData.overall_score,
    },
    news: Array.isArray(stockIntelData.timeline) ? stockIntelData.timeline : [],
    catalysts: Array.isArray(stockIntelData.key_points) ? stockIntelData.key_points : [],
    lastUpdated: latestPriceData.captured_at,
  });
}

export async function getStockHistory(docId: string, limit = 20): Promise<JsonRecord[]> {
  const instrumentId = await resolveInstrumentId(docId);
  if (!instrumentId) return [];

  try {
    const ordered = await adminFirestore
      .collection("tm_price_snapshots")
      .doc(instrumentId)
      .collection("points")
      .orderBy("captured_at", "desc")
      .limit(limit)
      .get();
    return ordered.docs.map((doc) => withId(doc.id, doc.data()));
  } catch {
    const fallback = await adminFirestore
      .collection("tm_price_snapshots")
      .doc(instrumentId)
      .collection("points")
      .limit(limit)
      .get();
    return fallback.docs.map((doc) => withId(doc.id, doc.data()));
  }
}

export async function listUsSectors(): Promise<JsonRecord[]> {
  const { namespaceRef } = await getActiveUsNamespaceRef();
  const snapshot = await namespaceRef.collection("sector_context").get();
  return snapshot.docs
    .map((doc) => {
      const row = (toPlain(doc.data()) as JsonRecord) || {};
      return {
        id: row.sector_id || doc.id,
        name: row.sector_label || row.sector_id || doc.id,
        lastUpdated: row.generated_at || row.as_of || null,
        sentiment: {
          label: row.today_label || "mixed",
          overall: row.today_score,
        },
        performance: {
          changePct: row.day_change_pct || 0,
          vsMarket: row.flow_direction || "flat",
        },
        drivers: row.today_key_points || [],
        raw: row,
      };
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export async function getSectorDoc(sectorId: string): Promise<unknown> {
  const sectors = await listUsSectors();
  return toPlain(sectors.find((sector) => String(sector.id) === sectorId) || null);
}

export async function getSectorHistory(_sectorId: string, _limit = 20): Promise<JsonRecord[]> {
  return [];
}

export async function listUsInstruments(limit = 120): Promise<JsonRecord[]> {
  const snapshot = await adminFirestore
    .collection("tm_instruments")
    .where("market", "==", "US")
    .limit(limit)
    .get();

  return snapshot.docs
    .map((doc) => withId(doc.id, doc.data()))
    .sort((a, b) => String(a.ticker || a.id).localeCompare(String(b.ticker || b.id)));
}

export async function searchUsData(query: string): Promise<{
  query: string;
  stocks: JsonRecord[];
  instruments: JsonRecord[];
  sectors: JsonRecord[];
}> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return { query, stocks: [], instruments: [], sectors: [] };
  }

  const [stocks, instruments, sectors] = await Promise.all([
    listUsStocks(500),
    listUsInstruments(500),
    listUsSectors(),
  ]);

  const includes = (...values: unknown[]) =>
    values.some((value) => String(value ?? "").toLowerCase().includes(normalized));

  return {
    query,
    stocks: stocks.filter((row) => {
      const price = row.price && typeof row.price === "object" ? (row.price as JsonRecord) : {};
      return includes(row.id, row.symbol, row.name, row.exchange, price.current);
    }),
    instruments: instruments.filter((row) =>
      includes(row.id, row.ticker, row.name, row.sector, row.exchange),
    ),
    sectors: sectors.filter((row) => {
      const sentiment = row.sentiment && typeof row.sentiment === "object" ? (row.sentiment as JsonRecord) : {};
      return includes(row.id, row.name, sentiment.label);
    }),
  };
}

export async function getInstrumentBundle(instrumentId: string): Promise<{
  instrument: unknown;
  latestPrice: unknown;
  fundamentals: unknown;
  instrumentView: unknown;
  pricePoints: JsonRecord[];
  stockIntelligence: unknown;
  activeUniverse: string;
  activePriceUniverse: string;
  activeAiUniverse: string;
}> {
  const { activePriceUniverse, activeAiUniverse, namespaceRef } = await getActiveUsNamespaceRef();

  const [
    instrumentDoc,
    latestPriceDoc,
    fundamentalsDoc,
    instrumentViewDoc,
    stockIntelDoc,
  ] = await Promise.all([
    adminFirestore.collection("tm_instruments").doc(instrumentId).get(),
    adminFirestore.collection("tm_latest_prices").doc(instrumentId).get(),
    adminFirestore.collection("tm_fundamental_snapshots").doc(instrumentId).get(),
    adminFirestore.collection("tm_views_instrument").doc(`${instrumentId}__${activeAiUniverse}`).get(),
    namespaceRef.collection("stock_intelligence").doc(instrumentId).get(),
  ]);

  const pointsSnapshot = await adminFirestore
    .collection("tm_price_snapshots")
    .doc(instrumentId)
    .collection("points")
    .orderBy("captured_at", "desc")
    .limit(40)
    .get();

  return {
    instrument: toPlain(instrumentDoc.exists ? instrumentDoc.data() : null),
    latestPrice: toPlain(latestPriceDoc.exists ? latestPriceDoc.data() : null),
    fundamentals: toPlain(fundamentalsDoc.exists ? fundamentalsDoc.data() : null),
    instrumentView: toPlain(instrumentViewDoc.exists ? instrumentViewDoc.data() : null),
    pricePoints: pointsSnapshot.docs.map((doc) => withId(doc.id, doc.data())),
    stockIntelligence: toPlain(stockIntelDoc.exists ? stockIntelDoc.data() : null),
    activeUniverse: activeAiUniverse,
    activePriceUniverse,
    activeAiUniverse,
  };
}

export async function getUsNewsNamespace(): Promise<{
  namespaceId: string;
  namespaceDoc: unknown;
  articles: JsonRecord[];
  enrichments: JsonRecord[];
  stockIntelligence: JsonRecord[];
  marketContext: unknown;
  sectorContext: JsonRecord[];
  runSummaries: JsonRecord[];
}> {
  const { namespaceId, namespaceRef } = await getActiveUsNamespaceRef();

  const [namespaceDoc, articlesSnap, enrichmentsSnap, stockIntelSnap, marketContextDoc, sectorContextSnap, runSummariesSnap] =
    await Promise.all([
      namespaceRef.get(),
      namespaceRef.collection("articles").limit(25).get(),
      namespaceRef.collection("enrichments").limit(25).get(),
      namespaceRef.collection("stock_intelligence").limit(25).get(),
      namespaceRef.collection("market_context").doc("overview").get(),
      namespaceRef.collection("sector_context").limit(25).get(),
      namespaceRef.collection("market_run_summaries").orderBy("date", "desc").limit(15).get(),
    ]);

  return {
    namespaceId,
    namespaceDoc: toPlain(namespaceDoc.exists ? namespaceDoc.data() : null),
    articles: articlesSnap.docs.map((doc) => withId(doc.id, doc.data())),
    enrichments: enrichmentsSnap.docs.map((doc) => withId(doc.id, doc.data())),
    stockIntelligence: stockIntelSnap.docs.map((doc) => withId(doc.id, doc.data())),
    marketContext: toPlain(marketContextDoc.exists ? marketContextDoc.data() : null),
    sectorContext: sectorContextSnap.docs.map((doc) => withId(doc.id, doc.data())),
    runSummaries: runSummariesSnap.docs.map((doc) => withId(doc.id, doc.data())),
  };
}

export function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
