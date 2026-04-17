import { adminFirestore } from "@/lib/firebase-admin";

import type {
  DashboardPayload,
  MarketPageContext,
  PortfolioBriefData,
  StockList,
  Stock,
  MarketOverview,
  Sector,
  RunsMeta,
} from "./api-types";

type MarketKey = "us" | "india";
type FirestoreMarket = "US" | "IN";

type StockMeta = {
  name?: string;
  sector?: string;
  cap?: string;
  exchange?: string;
  currency?: string;
  logo?: string;
};

type SectorMeta = {
  name?: string;
  icon?: string;
  stocks?: string[];
};

type ScheduleRun = {
  id: string;
  label: string;
  time: string;
  tz: string;
};

type EvalUniverseBlock = {
  symbols?: string[];
  sectorIds?: string[];
  lastUpdated?: string;
};

type EvalUniverseMeta = {
  US?: EvalUniverseBlock;
  IN?: EvalUniverseBlock;
  updatedAtServer?: string;
};

const JUNK_HEADLINE_PATTERNS = [
  "stock price, news, quote",
  "stock price, quote and news",
  "stock price, quote & history",
  "stock price, quote, news",
  "quote and news",
  "quote & history",
  "forecast and price target",
];

function toFirestoreMarket(market: string): FirestoreMarket {
  return market.toLowerCase() === "india" || market.toUpperCase() === "IN" ? "IN" : "US";
}

function toAppMarket(market: FirestoreMarket): MarketKey {
  return market === "IN" ? "india" : "us";
}

function marketDocId(market: string): FirestoreMarket {
  return toFirestoreMarket(market);
}

function stockDocId(symbol: string, market: FirestoreMarket): string {
  return `${market}_${symbol.toUpperCase()}`;
}

function toNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toTimestamp(value: unknown): number {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isJunkHeadline(value: unknown): boolean {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return true;
  return JUNK_HEADLINE_PATTERNS.some((pattern) => text.includes(pattern));
}

function isFreshEnough(lastUpdated: string, referenceTime: string, maxAgeHours = 36): boolean {
  const updatedAt = toTimestamp(lastUpdated);
  const reference = toTimestamp(referenceTime);
  if (!updatedAt || !reference) return true;
  return updatedAt >= reference - maxAgeHours * 60 * 60 * 1000;
}

function pickMarketStocks(meta: Record<string, Record<string, StockMeta>>, market: FirestoreMarket): Record<string, StockMeta> {
  return market === "IN" ? (meta.india || {}) : (meta.us || {});
}

function inferTrend(current: number, previous: number): "improving" | "worsening" | "stable" {
  if (current > previous) return "improving";
  if (current < previous) return "worsening";
  return "stable";
}

function inferTechnicalTrend(label: string): "bullish" | "bearish" | "neutral" {
  const normalized = label.toLowerCase();
  if (normalized.includes("bull")) return "bullish";
  if (normalized.includes("bear")) return "bearish";
  return "neutral";
}

function deriveUpside(targetPrice: number, currentPrice: number): number {
  if (!currentPrice) return 0;
  return ((targetPrice - currentPrice) / currentPrice) * 100;
}

function stockNameFromDoc(symbol: string, meta?: StockMeta): string {
  return meta?.name || symbol;
}

function makeNewsId(symbol: string, idx: number): string {
  return `${symbol.toLowerCase()}-news-${String(idx + 1).padStart(3, "0")}`;
}

function hasUsableStockData(raw: Record<string, unknown>): boolean {
  const price = (raw.price as Record<string, unknown> | undefined) || {};
  const bottomLine = String(raw.bottomLine || "").trim().toLowerCase();
  return toNumber(price.current) > 0 && bottomLine !== "no stock briefing available yet.";
}

function nextRunFromSchedule(runs: ScheduleRun[]): string {
  if (!runs.length) {
    return new Date().toISOString();
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const candidates = runs
    .map((run) => {
      const iso = `${today}T${run.time}:00+05:30`;
      return { run, date: new Date(iso) };
    })
    .filter((item) => !Number.isNaN(item.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const nextToday = candidates.find((item) => item.date.getTime() > now.getTime());
  if (nextToday) {
    return nextToday.date.toISOString();
  }

  const first = candidates[0];
  if (!first) {
    return now.toISOString();
  }
  const next = new Date(first.date);
  next.setDate(next.getDate() + 1);
  return next.toISOString();
}

// ---------------------------------------------------------------------------
// Request-level cache for meta documents.
// Next.js server components run in a single request context, but our helper
// functions call getStocksMeta(), getSectorsMeta(), getEvalUniverseMeta()
// multiple times within one page render. This cache deduplicates those reads
// so each meta doc is fetched at most ONCE per request.
// ---------------------------------------------------------------------------
const _metaCache = new Map<string, Promise<unknown>>();

async function getMetaDoc<T>(id: string): Promise<T | null> {
  if (_metaCache.has(id)) {
    return _metaCache.get(id) as Promise<T | null>;
  }
  const promise = adminFirestore
    .collection("meta")
    .doc(id)
    .get()
    .then((doc) => (doc.exists ? (doc.data() as T) : null));
  _metaCache.set(id, promise);
  return promise;
}

async function getStocksMeta(): Promise<Record<string, Record<string, StockMeta>>> {
  return (await getMetaDoc<Record<string, Record<string, StockMeta>>>("stocks")) || { us: {}, india: {} };
}

async function getSectorsMeta(): Promise<Record<string, Record<string, SectorMeta>>> {
  return (await getMetaDoc<Record<string, Record<string, SectorMeta>>>("sectors")) || { us: {}, india: {} };
}

async function getScheduleMeta(): Promise<{ runs?: ScheduleRun[] }> {
  return (await getMetaDoc<{ runs?: ScheduleRun[] }>("schedule")) || {};
}

async function getEvalUniverseMeta(): Promise<EvalUniverseMeta> {
  return (await getMetaDoc<EvalUniverseMeta>("tikrrEvalUniverse")) || {};
}

function getEvalBlock(meta: EvalUniverseMeta, market: FirestoreMarket): EvalUniverseBlock | null {
  return (meta[market] as EvalUniverseBlock | undefined) || null;
}

function mapStock(symbol: string, market: FirestoreMarket, raw: Record<string, unknown>, meta?: StockMeta): Stock {
  const price = (raw.price as Record<string, unknown> | undefined) || {};
  const sentiment = (raw.sentiment as Record<string, unknown> | undefined) || {};
  const technicals = (raw.technicals as Record<string, unknown> | undefined) || {};
  const analystConsensus = (raw.analystConsensus as Record<string, unknown> | undefined) || {};
  const news = Array.isArray(raw.news)
    ? (raw.news as Record<string, unknown>[]).filter((item) => !isJunkHeadline(item.title))
    : [];
  const lastUpdated = String(raw.lastUpdated || raw.updatedAtServer || new Date().toISOString());
  const overall = toNumber(sentiment.overall, 0);
  const previous = toNumber(sentiment.previous, overall);
  const currentPrice = toNumber(price.current, 0);
  const targetPrice = toNumber(analystConsensus.targetPrice, 0);

  return {
    market: toAppMarket(market),
    symbol,
    name: stockNameFromDoc(symbol, meta),
    exchange: String(meta?.exchange || raw.exchange || ""),
    sector: String(meta?.sector || raw.sector || ""),
    cap: String(meta?.cap || ""),
    currency: String(meta?.currency || raw.currency || ""),
    logo: String(meta?.logo || ""),
    lastUpdated,
    runType: String(raw.runType || "manual"),
    price: {
      current: currentPrice,
      open: toNumber(price.open),
      high: toNumber(price.high),
      low: toNumber(price.low),
      previousClose: toNumber(price.previousClose),
      change: toNumber(price.change),
      changePct: toNumber(price.changePct),
      volume: toNumber(price.volume),
      avgVolume: toNumber(price.avgVolume),
    },
    sentiment: {
      overall,
      previous,
      trend: inferTrend(overall, previous),
      drivers: Array.isArray(sentiment.drivers) ? sentiment.drivers.map(String) : [],
    },
    news: news.map((item, idx) => ({
      id: String(item.id || makeNewsId(symbol, idx)),
      timestamp: String(item.timestamp || lastUpdated),
      title: String(item.title || ""),
      source: String(item.source || ""),
      summary: String(item.summary || ""),
      sentiment: toNumber(item.sentiment),
      category: String(item.category || "news"),
    })),
    highlights: {
      positive: Array.isArray((raw.highlights as Record<string, unknown> | undefined)?.positive)
        ? ((raw.highlights as Record<string, unknown>).positive as unknown[]).map(String)
        : [],
      negative: Array.isArray((raw.highlights as Record<string, unknown> | undefined)?.negative)
        ? ((raw.highlights as Record<string, unknown>).negative as unknown[]).map(String)
        : [],
      neutral: Array.isArray((raw.highlights as Record<string, unknown> | undefined)?.neutral)
        ? ((raw.highlights as Record<string, unknown>).neutral as unknown[]).map(String)
        : [],
    },
    technicals: {
      rsi14: toNumber(technicals.rsi14),
      sma50: toNumber(technicals.sma50),
      sma200: toNumber(technicals.sma200),
      fiftyTwoWeekHigh: toNumber(technicals.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: toNumber(technicals.fiftyTwoWeekLow),
      fromHigh: String(technicals.fromHigh || ""),
      trend: inferTechnicalTrend(String(technicals.trend || "neutral")),
    },
    analystConsensus: {
      rating: String(analystConsensus.rating || "N/A"),
      targetPrice,
      upside: toNumber(analystConsensus.upside, deriveUpside(targetPrice, currentPrice)),
      numAnalysts: toNumber(analystConsensus.numAnalysts),
    },
    earnings: {
      date: ((raw.earnings as Record<string, unknown> | undefined)?.date as string) || null,
      epsEstimate: toNumber((raw.earnings as Record<string, unknown> | undefined)?.epsEstimate) || null,
    },
    streak: {
      days: toNumber((raw.streak as Record<string, unknown> | undefined)?.days),
      direction: (String((raw.streak as Record<string, unknown> | undefined)?.direction || "flat") as "up" | "down" | "flat"),
    },
    recentCloses: Array.isArray(raw.recentCloses)
      ? raw.recentCloses.map((v: unknown) => toNumber(v))
      : [],
    catalysts: Array.isArray(raw.catalysts) ? raw.catalysts.map(String) : [],
    bottomLine: String(raw.bottomLine || "No stock briefing available yet."),
  };
}

export async function getStockList(): Promise<StockList> {
  const meta = await getStocksMeta();
  return {
    us: Object.keys(meta.us || {}).sort(),
    india: Object.keys(meta.india || {}).sort(),
  };
}

export async function getStock(symbol: string, market?: string): Promise<Stock | null> {
  const [stocksMeta, evalUniverseMeta] = await Promise.all([getStocksMeta(), getEvalUniverseMeta()]);
  const normalizedSymbol = symbol.toUpperCase();
  const marketsToTry: FirestoreMarket[] = market ? [toFirestoreMarket(market)] : ["US", "IN"];

  for (const fsMarket of marketsToTry) {
    const evalSymbols = new Set((getEvalBlock(evalUniverseMeta, fsMarket)?.symbols || []).map((item) => item.toUpperCase()));
    if (evalSymbols.size > 0 && !evalSymbols.has(normalizedSymbol)) {
      continue;
    }
    const doc = await adminFirestore.collection("stocks").doc(stockDocId(normalizedSymbol, fsMarket)).get();
    if (!doc.exists) {
      continue;
    }
    const raw = doc.data() as Record<string, unknown>;
    if (!hasUsableStockData(raw)) {
      continue;
    }
    const meta = pickMarketStocks(stocksMeta, fsMarket)[normalizedSymbol];
    return mapStock(normalizedSymbol, fsMarket, raw, meta);
  }
  return null;
}

export async function getStocksForMarket(market: string, referenceTime?: string): Promise<Stock[]> {
  const [stocksMeta, evalUniverseMeta] = await Promise.all([getStocksMeta(), getEvalUniverseMeta()]);
  const fsMarket = toFirestoreMarket(market);
  const marketMeta = pickMarketStocks(stocksMeta, fsMarket);
  const evalSymbols = new Set((getEvalBlock(evalUniverseMeta, fsMarket)?.symbols || []).map((symbol) => symbol.toUpperCase()));
  const snapshot = await adminFirestore.collection("stocks").where("market", "==", fsMarket).get();

  const rows = snapshot.docs
    .map((doc) => {
      const raw = (doc.data() as Record<string, unknown>) || {};
      const symbol = String(raw.symbol || doc.id.replace(`${fsMarket}_`, "")).toUpperCase();
      if (evalSymbols.size > 0 && !evalSymbols.has(symbol)) {
        return null;
      }
      const mapped = mapStock(symbol, fsMarket, raw, marketMeta[symbol]);
      if (!hasUsableStockData(raw)) {
        return null;
      }
      if (referenceTime && !isFreshEnough(mapped.lastUpdated, referenceTime)) {
        return null;
      }
      return mapped;
    })
    .filter((row): row is Stock => Boolean(row))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  return rows;
}

export async function getMarket(market: string): Promise<MarketOverview | null> {
  const docId = marketDocId(market);
  const doc = await adminFirestore.collection("markets").doc(docId).get();
  if (!doc.exists) {
    return null;
  }
  const raw = doc.data() as Record<string, unknown>;
  const globalCues = (raw.globalCues as Record<string, Record<string, unknown>> | undefined) || {};

  return {
    market: toAppMarket(docId),
    lastUpdated: String(raw.lastUpdated || raw.updatedAtServer || new Date().toISOString()),
    runType: String(raw.runType || "manual"),
    indices: Array.isArray(raw.indices)
      ? (raw.indices as Record<string, unknown>[]).map((item) => ({
          name: String(item.name || ""),
          value: toNumber(item.value),
          change: toNumber(item.change),
          changePct: toNumber(item.changePct),
        }))
      : [],
    sentiment: {
      overall: toNumber((raw.sentiment as Record<string, unknown> | undefined)?.overall),
      label: String((raw.sentiment as Record<string, unknown> | undefined)?.label || "Neutral"),
      drivers: Array.isArray((raw.sentiment as Record<string, unknown> | undefined)?.drivers)
        ? (((raw.sentiment as Record<string, unknown>).drivers) as unknown[])
            .map(String)
            .filter((headline) => !isJunkHeadline(headline))
        : [],
    },
    topMovers: {
      gainers: Array.isArray((raw.topMovers as Record<string, unknown> | undefined)?.gainers)
        ? (((raw.topMovers as Record<string, unknown>).gainers) as Record<string, unknown>[]).map((item) => ({
            symbol: String(item.symbol || ""),
            changePct: toNumber(item.changePct),
          }))
        : [],
      losers: Array.isArray((raw.topMovers as Record<string, unknown> | undefined)?.losers)
        ? (((raw.topMovers as Record<string, unknown>).losers) as Record<string, unknown>[]).map((item) => ({
            symbol: String(item.symbol || ""),
            changePct: toNumber(item.changePct),
          }))
        : [],
    },
    globalCues: {
      oil: { value: toNumber(globalCues.oil?.value), change: toNumber(globalCues.oil?.change) },
      gold: { value: toNumber(globalCues.gold?.value), change: toNumber(globalCues.gold?.change) },
      dxy: { value: toNumber(globalCues.dxy?.value), change: toNumber(globalCues.dxy?.change) },
      vix: { value: toNumber(globalCues.vix?.value), change: toNumber(globalCues.vix?.change) },
      usTenYear: { value: toNumber(globalCues.usTenYear?.value), change: toNumber(globalCues.usTenYear?.change) },
    },
    keyHeadlines: Array.isArray(raw.keyHeadlines)
      ? raw.keyHeadlines.map(String).filter((headline) => !isJunkHeadline(headline))
      : [],
    bottomLine: String(raw.bottomLine || "No market briefing available yet."),
    briefOverview: raw.briefOverview ? String(raw.briefOverview) : undefined,
    briefGlobalForces: raw.briefGlobalForces ? String(raw.briefGlobalForces) : undefined,
    briefOutlook: raw.briefOutlook ? String(raw.briefOutlook) : undefined,
  };
}

export async function getSector(sectorId: string): Promise<Sector | null> {
  const [sectorsMeta, doc] = await Promise.all([
    getSectorsMeta(),
    adminFirestore.collection("sectors").doc(sectorId).get(),
  ]);
  if (!doc.exists) {
    return null;
  }
  const raw = doc.data() as Record<string, unknown>;
  const market = sectorId.startsWith("india-") ? "india" : "us";
  const meta = (market === "india" ? sectorsMeta.india : sectorsMeta.us)?.[sectorId] || {};
  return mapSector(sectorId, raw, meta);
}

function mapSector(sectorId: string, raw: Record<string, unknown>, meta: SectorMeta): Sector {
  const market = sectorId.startsWith("india-") ? "india" : "us";
  const sentiment = (raw.sentiment as Record<string, unknown> | undefined) || {};
  const performance = (raw.performance as Record<string, unknown> | undefined) || {};
  const overall = toNumber(sentiment.overall);
  const previous = toNumber(sentiment.previous, overall);
  return {
    id: sectorId,
    name: String(meta.name || sectorId),
    market,
    lastUpdated: String(raw.lastUpdated || raw.updatedAtServer || new Date().toISOString()),
    sentiment: {
      overall,
      label: String(sentiment.label || "Neutral"),
      previous,
      trend: inferTrend(overall, previous),
    },
    performance: {
      changePct: toNumber(performance.changePct),
      vsMarket: String(performance.vsMarket || "flat"),
    },
    topMovers: {
      gainers: Array.isArray((raw.topMovers as Record<string, unknown> | undefined)?.gainers)
        ? (((raw.topMovers as Record<string, unknown>).gainers) as Record<string, unknown>[]).map((item) => ({
            symbol: String(item.symbol || ""),
            changePct: toNumber(item.changePct),
          }))
        : [],
      losers: Array.isArray((raw.topMovers as Record<string, unknown> | undefined)?.losers)
        ? (((raw.topMovers as Record<string, unknown>).losers) as Record<string, unknown>[]).map((item) => ({
            symbol: String(item.symbol || ""),
            changePct: toNumber(item.changePct),
          }))
        : [],
    },
    drivers: Array.isArray(raw.drivers) ? raw.drivers.map(String) : [],
    stocks: Array.isArray(meta.stocks) ? meta.stocks : [],
    bottomLine: String(raw.bottomLine || "No sector briefing available yet."),
    briefAnalysis: raw.briefAnalysis ? String(raw.briefAnalysis) : undefined,
    briefOutlook: raw.briefOutlook ? String(raw.briefOutlook) : undefined,
  };
}

export async function getSectorsForMarket(market: string, referenceTime?: string): Promise<Sector[]> {
  const [sectorsMeta, evalUniverseMeta] = await Promise.all([getSectorsMeta(), getEvalUniverseMeta()]);
  const appMarket = market.toLowerCase() === "india" ? "india" : "us";
  const marketSectors = appMarket === "india" ? (sectorsMeta.india || {}) : (sectorsMeta.us || {});
  const fsMarket = toFirestoreMarket(market);
  const evalSectorIds = new Set((getEvalBlock(evalUniverseMeta, fsMarket)?.sectorIds || []).map(String));
  const sectorIds = Object.keys(marketSectors)
    .filter((sectorId) => evalSectorIds.size === 0 || evalSectorIds.has(sectorId))
    .sort();

  if (sectorIds.length === 0) return [];

  // Batch fetch all sector docs in parallel instead of N+1 individual reads
  const sectorDocs = await Promise.all(
    sectorIds.map((id) => adminFirestore.collection("sectors").doc(id).get()),
  );

  return sectorDocs
    .map((doc, i) => {
      if (!doc.exists) return null;
      const sectorId = sectorIds[i];
      const raw = doc.data() as Record<string, unknown>;
      const meta = marketSectors[sectorId] || {};
      const sector = mapSector(sectorId, raw, meta);
      if (referenceTime && !isFreshEnough(sector.lastUpdated, referenceTime)) return null;
      return sector;
    })
    .filter((row): row is Sector => Boolean(row));
}

/**
 * Stocks, sectors, and optional market overview for layout chrome on stock/sector pages.
 * Does not write to Firestore (unlike getDashboardPayload).
 */
export async function getMarketPageContext(market: string): Promise<MarketPageContext> {
  const [runsMeta, view] = await Promise.all([getRunsMeta(market), getMarket(market)]);
  const refTime = view?.lastUpdated;
  const [stocks, sectors] = await Promise.all([
    getStocksForMarket(market, refTime),
    getSectorsForMarket(market, refTime),
  ]);
  return { view, stocks, sectors, runsMeta };
}

export async function getPortfolioBrief(market: string): Promise<PortfolioBriefData | null> {
  const fsMarket = toFirestoreMarket(market);
  const doc = await adminFirestore.collection("portfolio_briefs").doc(`${fsMarket}_default`).get();
  if (!doc.exists) return null;
  const data = doc.data() as Record<string, unknown>;

  const narrative = String(data.narrative || "").trim();
  // Fall back: if no narrative and no movers, there's no brief
  const rawMovers = Array.isArray(data.movers) ? data.movers : [];
  const rawSignals = Array.isArray(data.signals) ? data.signals : [];
  const rawTiles = Array.isArray(data.tiles) ? data.tiles : [];
  if (!narrative && rawMovers.length === 0 && rawSignals.length === 0) return null;

  return {
    narrative,
    movers: rawMovers.map((m: Record<string, unknown>) => ({
      ticker: String(m.ticker || ""),
      oneLiner: String(m.one_liner || ""),
      vibe: (m.vibe as "up" | "down" | "wild") || "wild",
    })),
    signals: rawSignals.map((s: Record<string, unknown>) => ({
      tag: String(s.tag || ""),
      headline: String(s.headline || ""),
      body: String(s.body || ""),
      detail: String(s.detail || ""),
      vibe: (s.vibe as "positive" | "negative" | "neutral") || "neutral",
    })),
    blindSpotTitle: String(data.blind_spot_title || "").trim(),
    blindSpotBody: String(data.blind_spot_body || "").trim(),
    tiles: rawTiles.map((t: Record<string, unknown>) => ({
      ticker: String(t.ticker || ""),
      micro: String(t.micro || ""),
      vibe: (t.vibe as "up" | "down" | "wild") || "wild",
    })),
  };
}

export async function getDashboardPayload(market: string): Promise<DashboardPayload | null> {
  const fsMarket = toFirestoreMarket(market);

  // Kick off ALL fetches in parallel — market view, stocks, sectors, runsMeta, and portfolio brief
  const [view, stocks, sectors, runsMeta, portfolioBrief] = await Promise.all([
    getMarket(market),
    getStocksForMarket(market),
    getSectorsForMarket(market),
    getRunsMeta(market),
    getPortfolioBrief(market),
  ]);

  if (!view) {
    return null;
  }

  return {
    view,
    stocks,
    sectors,
    runsMeta,
    portfolioBrief: portfolioBrief || undefined,
  };
}

export async function getRunsMeta(market: string = "us"): Promise<RunsMeta> {
  const [scheduleMeta, lastRunMeta, evalUniverseMeta] = await Promise.all([
    getScheduleMeta(),
    getMetaDoc<Record<string, Record<string, unknown>>>("lastRun"),
    getEvalUniverseMeta(),
  ]);

  const fsMarket = toFirestoreMarket(market);
  const marketBlock = (lastRunMeta?.[fsMarket] || {}) as Record<string, unknown>;
  const latest = (marketBlock.latest || {}) as Record<string, unknown>;
  const runs = Array.isArray(scheduleMeta.runs) ? scheduleMeta.runs : [];

  return {
    lastRun: String(latest.completedAt || latest.startedAt || new Date().toISOString()),
    lastType: String(latest.runType || "unknown"),
    nextRun: nextRunFromSchedule(runs),
    schedule: {
      preMarket: runs.find((run) => run.id === "pre_market")?.time || "",
      marketOpen: runs.find((run) => run.id === "market_open")?.time || "",
      midday: runs.find((run) => run.id === "midday")?.time || "",
      marketClose: runs.find((run) => run.id === "market_close")?.time || "",
    },
    stockCount: {
      us: getEvalBlock(evalUniverseMeta, "US")?.symbols?.length || 0,
      india: getEvalBlock(evalUniverseMeta, "IN")?.symbols?.length || 0,
    },
    status: String(latest.status || "unknown"),
  };
}
