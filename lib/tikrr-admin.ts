import { adminFirestore } from "@/lib/firebase-admin";
import { getMarket, getRunsMeta, getSectorsForMarket, getStocksForMarket } from "@/lib/api";

export type TikrrMarket = "US" | "IN";
export type TikrrRunType = "pre_market" | "market_open" | "midday" | "market_close";

type JsonObject = Record<string, unknown>;

function nowIso(): string {
  return new Date().toISOString();
}

function readApiKey(): string {
  const value = process.env.TIKRR_API_KEY?.trim() || process.env.TIKRR_SECRET_KEY?.trim() || "";
  if (!value) {
    throw new Error("Set TIKRR_API_KEY or TIKRR_SECRET_KEY");
  }
  return value;
}

export function assertTikrrApiKey(apiKey: unknown): void {
  if (typeof apiKey !== "string" || apiKey.trim() !== readApiKey()) {
    throw new Error("Invalid apiKey");
  }
}

export function normalizeMarket(value: unknown): TikrrMarket {
  const market = String(value || "").trim().toUpperCase();
  if (market !== "US" && market !== "IN") {
    throw new Error("market must be US or IN");
  }
  return market;
}

export function normalizeSymbol(value: unknown): string {
  const symbol = String(value || "").trim().toUpperCase();
  if (!symbol) {
    throw new Error("symbol is required");
  }
  return symbol;
}

export function normalizeSectorId(value: unknown): string {
  const sectorId = String(value || "").trim();
  if (!sectorId) {
    throw new Error("sectorId is required");
  }
  return sectorId;
}

export function normalizeRunType(value: unknown): TikrrRunType {
  const runType = String(value || "").trim();
  if (!["pre_market", "market_open", "midday", "market_close"].includes(runType)) {
    throw new Error("runType is invalid");
  }
  return runType as TikrrRunType;
}

export function stockDocId(market: TikrrMarket, symbol: string): string {
  return `${market}_${symbol}`;
}

function historyDocId(runType: string, lastUpdated?: unknown): string {
  const stamp = String(lastUpdated || nowIso()).replace(/[^0-9TZ]/g, "");
  return `${runType}__${stamp}`;
}

function scrubUndefined<T extends JsonObject>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function saveMaterializedDashboardView(market: TikrrMarket): Promise<void> {
  const marketKey = market === "IN" ? "india" : "us";
  const [view, stocks, sectors, runsMeta] = await Promise.all([
    getMarket(marketKey),
    getStocksForMarket(marketKey),
    getSectorsForMarket(marketKey),
    getRunsMeta(marketKey),
  ]);

  if (!view) return;

  await adminFirestore.collection("views_dashboard").doc(market).set(scrubUndefined({
    view,
    stocks,
    sectors,
    runsMeta,
    updatedAtServer: nowIso(),
  }));
}

export async function saveStockLatestAndHistory(args: {
  market: TikrrMarket;
  symbol: string;
  runType: TikrrRunType;
  data: JsonObject;
}): Promise<string> {
  const docId = stockDocId(args.market, args.symbol);
  const latestRef = adminFirestore.collection("stocks").doc(docId);
  const payload = scrubUndefined({
    symbol: args.symbol,
    market: args.market,
    ...args.data,
    docId,
    updatedAtServer: nowIso(),
  });
  await latestRef.set(payload);
  await latestRef
    .collection("history")
    .doc(historyDocId(args.runType, args.data.lastUpdated))
    .set(payload);
  return docId;
}

export async function saveMarketLatestAndHistory(args: {
  market: TikrrMarket;
  runType: TikrrRunType;
  data: JsonObject;
}): Promise<void> {
  const latestRef = adminFirestore.collection("markets").doc(args.market);
  const payload = scrubUndefined({
    market: args.market,
    ...args.data,
    updatedAtServer: nowIso(),
  });
  await latestRef.set(payload);
  await latestRef
    .collection("history")
    .doc(historyDocId(args.runType, args.data.lastUpdated))
    .set(payload);
}

export async function saveSectorLatestAndHistory(args: {
  sectorId: string;
  runType: TikrrRunType;
  data: JsonObject;
}): Promise<void> {
  const latestRef = adminFirestore.collection("sectors").doc(args.sectorId);
  const payload = scrubUndefined({
    sectorId: args.sectorId,
    ...args.data,
    updatedAtServer: nowIso(),
  });
  await latestRef.set(payload);
  await latestRef
    .collection("history")
    .doc(historyDocId(args.runType, args.data.lastUpdated))
    .set(payload);
}

export async function saveRunStatus(args: {
  market: TikrrMarket;
  runType: TikrrRunType;
  payload: JsonObject;
}): Promise<void> {
  const docId = `${args.market}__${args.runType}`;
  const latestPayload = scrubUndefined({
    ...args.payload,
    market: args.market,
    runType: args.runType,
    updatedAtServer: nowIso(),
  });

  const latestRef = adminFirestore.collection("meta_run_status").doc(docId);
  await latestRef.set(latestPayload);
  await latestRef
    .collection("history")
    .doc(historyDocId(args.runType, args.payload.completedAt || args.payload.startedAt))
    .set(latestPayload);

  await adminFirestore.collection("meta").doc("lastRun").set({
    [args.market]: {
      [args.runType]: latestPayload,
      latest: latestPayload,
    },
    updatedAtServer: nowIso(),
  }, { merge: true });
}
