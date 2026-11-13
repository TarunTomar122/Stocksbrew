import { anomalyFromTickerDoc } from "@/lib/daily-anomalies";
import { adminFirestore } from "@/lib/firebase-admin";
import { getLatestPriceHistory } from "@/lib/firestore";
import { localFirestoreFromEnv } from "@/lib/local-firestore";
import { readNewsForTickerStrict } from "@/lib/news";
import { redditContextFromDoc, type RedditTickerContextDoc } from "@/lib/reddit-cues";
import { resultsReportsFromDoc } from "@/lib/call-evidence-data";
import { getScreenerSnapshotStrict } from "@/lib/screener";
import { readStockCallHistory } from "@/lib/stock-events";
import { readToneLabelsStrict } from "@/components/stock-report/news-tone";
import {
  SERVE_ALL_DOC,
  SERVE_COLLECTION,
  SERVE_PARTS,
  SERVE_PART_NAMES,
  SERVE_SCHEMA,
  changeRecords,
  dirtyField,
  hashSourcePaths,
  partField,
  partVerdict,
  seriesPartFromRaw,
  NEWS_DAYS,
  NEWS_LIMIT,
  serveDocId,
  serveDocIdFor,
  snapshotRows,
  usInstrumentIdFor,
  type ServePart,
  type ServePartName,
  type ServeStockDoc,
} from "@/lib/serve/stock-serve-shared";

/**
 * Builds `tm_serve_stock/{TICKER}` parts from today's collections, with the same reads and the same pure transforms
 * the stock page uses (docs/serving-docs.md). Run by scripts/run-serve-docs.ts.
 *
 * Every read here throws on failure instead of answering "no data", so a failed read never becomes a stored part:
 * that stock's parts are skipped and keep whatever they had (which then proves itself stale or not on its own).
 * Writes go only to `tm_serve_stock`, merged by part, so each part replaces only itself.
 */

type FullDoc = { path: string; data?: Record<string, unknown>; hash?: string };

async function batchGetFull(paths: string[], select?: string[]): Promise<Map<string, FullDoc>> {
  const client = localFirestoreFromEnv();
  if (!client) throw new Error("serve docs need the LocalDB store (LOCALDB_URL and LOCALDB_API_TOKEN)");
  const out = new Map<string, FullDoc>();
  for (let start = 0; start < paths.length; start += 300) {
    const chunk = paths.slice(start, start + 300);
    const result = await client.read("/documents:batchGet", { method: "POST", body: select ? { paths: chunk, select } : { paths: chunk } });
    if (!result.ok) throw new Error(`batch read failed (${result.status})`);
    const parsed = JSON.parse(result.text) as { documents?: FullDoc[] };
    for (const doc of parsed.documents ?? []) if (doc && typeof doc.path === "string") out.set(doc.path, doc);
  }
  return out;
}

function part<T>(name: ServePartName, builtAt: string, data: T, asOf: string | null, src?: Record<string, string | null>): ServePart<T> {
  return { v: SERVE_PARTS[name].v, built_at: builtAt, as_of: asOf, ...(src ? { src } : {}), data };
}

const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/** The parts asked for, built for one US stock. Throws when any read fails. */
export async function buildStockParts(
  stock: CoveredStock,
  wanted: ReadonlySet<ServePartName>,
): Promise<{ id: string; instrumentId: string; parts: Partial<Record<ServePartName, ServePart<unknown>>> }> {
  const { ticker, instrumentId } = stock;
  const id = serveDocIdFor(instrumentId);
  if (!id || !serveDocId(ticker)) throw new Error("bad ticker");
  // Taken before any read: a writer that marks a part dirty after this moment makes the part stale, never the
  // other way round (docs/serving-docs.md, "dirty").
  const builtAt = new Date().toISOString();
  const sources = hashSourcePaths(ticker, instrumentId);
  const hashNames = (["series", "bundle", "anomaly", "results", "reddit"] as const).filter((name) => wanted.has(name));
  const docs = hashNames.length ? await batchGetFull(hashNames.flatMap((name) => sources[name])) : new Map<string, FullDoc>();
  const src = (name: (typeof hashNames)[number]) =>
    Object.fromEntries(sources[name].map((path) => [path, docs.get(path)?.hash ?? null])) as Record<string, string | null>;
  const body = (path: string) => docs.get(path)?.data ?? null;
  const parts: Partial<Record<ServePartName, ServePart<unknown>>> = {};

  if (wanted.has("series")) {
    const raw = body(sources.series[0]!);
    parts.series = part("series", builtAt, raw ? seriesPartFromRaw(raw) : null, text(raw?.last_date) ?? text(raw?.fetched_at), src("series"));
  }
  if (wanted.has("bundle")) {
    const [jobPath, stabilityPath] = sources.bundle as [string, string];
    const job = body(jobPath);
    const stability = body(stabilityPath);
    parts.bundle = part("bundle", builtAt, { onDemandJob: job, callStability: stability }, text(stability?.updated_at) ?? text(job?.updated_at), src("bundle"));
  }
  if (wanted.has("anomaly")) {
    const anomaly = anomalyFromTickerDoc(body(sources.anomaly[0]!) as Parameters<typeof anomalyFromTickerDoc>[0]);
    parts.anomaly = part("anomaly", builtAt, anomaly, text((anomaly as { price_as_of?: unknown } | null)?.price_as_of), src("anomaly"));
  }
  if (wanted.has("results")) {
    const reports = resultsReportsFromDoc(body(sources.results[0]!) ?? undefined);
    parts.results = part("results", builtAt, reports, reports[0]?.date ?? null, src("results"));
  }
  if (wanted.has("reddit")) {
    const raw = body(sources.reddit[0]!);
    const context = raw ? redditContextFromDoc(raw as RedditTickerContextDoc, ticker.trim().toUpperCase()) : null;
    parts.reddit = part("reddit", builtAt, context, context?.generated_at || null, src("reddit"));
  }
  if (wanted.has("snapshot")) {
    // Not hash-checked (the quote on this doc changes all day); the price writer stamps `dirty_snapshot` whenever
    // it changes the window (backend/serve_docs.py), and writes the part itself.
    const data = await getLatestPriceHistory(instrumentId);
    parts.snapshot = part("snapshot", builtAt, { rows: snapshotRows(data?.history_window) }, text(data?.captured_at));
  }
  if (wanted.has("calls")) {
    const records = changeRecords(await readStockCallHistory(instrumentId));
    parts.calls = part("calls", builtAt, { records }, records[records.length - 1]?.date ?? null);
  }
  if (wanted.has("news")) {
    const articles = await readNewsForTickerStrict("US", ticker, NEWS_DAYS, NEWS_LIMIT);
    const labels = await readToneLabelsStrict(articles);
    parts.news = part("news", builtAt, { days: NEWS_DAYS, limit: NEWS_LIMIT, articles, labels }, articles[0]?.published_at ?? null);
  }
  return { id, instrumentId, parts };
}

/** Writes the parts into the stock's serve doc, each part replacing only itself. */
export async function writeStockParts(id: string, instrumentId: string, parts: Partial<Record<ServePartName, ServePart<unknown>>>): Promise<number> {
  const fields: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(parts)) fields[partField(name as ServePartName)] = value;
  if (!Object.keys(fields).length) return 0;
  await adminFirestore
    .collection(SERVE_COLLECTION)
    .doc(id)
    .set({ schema: SERVE_SCHEMA, ticker: id, market: "US", instrument_id: instrumentId, ...fields }, { merge: true });
  return JSON.stringify(fields).length;
}

export type CoveredStock = { ticker: string; instrumentId: string };

/** A stock named on the command line: its house instrument id from the ticker. */
export function stockFromTicker(ticker: string): CoveredStock {
  const upper = ticker.trim().toUpperCase();
  return { ticker: upper, instrumentId: usInstrumentIdFor(upper) };
}

/** The covered US stocks (the screener's rows) with their instrument ids. Throws when the snapshot cannot be read. */
export async function coveredStocks(): Promise<CoveredStock[]> {
  const snapshot = await getScreenerSnapshotStrict("US");
  if (!snapshot) throw new Error("screener snapshot unavailable");
  const byId = new Map<string, CoveredStock>();
  for (const row of snapshot.rows) {
    if (row.benchmark || row.uncovered) continue;
    const ticker = row.symbol.trim().toUpperCase();
    const instrumentId = (row.instrument_id?.trim().toUpperCase() || usInstrumentIdFor(ticker));
    if (serveDocId(ticker) && serveDocIdFor(instrumentId)) byId.set(instrumentId, { ticker, instrumentId });
  }
  return [...byId.values()].sort((a, b) => a.instrumentId.localeCompare(b.instrumentId));
}

/**
 * For each ticker, the parts that would not be used now (missing, old, dirty, changed, expired), from the stored
 * docs' meta and one hash read. The same rule the page applies (partVerdict), so the job rebuilds exactly what pages
 * would otherwise read the old way.
 */
export async function staleParts(stocks: readonly CoveredStock[], wanted: ReadonlySet<ServePartName>): Promise<Map<CoveredStock, Set<ServePartName>>> {
  const known = stocks.flatMap((stock) => {
    const id = serveDocIdFor(stock.instrumentId);
    return id ? [{ stock, id }] : [];
  });
  const ids = known.map((item) => item.id);
  const metaFields = ["schema", "instrument_id", ...SERVE_PART_NAMES.flatMap((name) => [
    `${partField(name)}.v`,
    `${partField(name)}.built_at`,
    `${partField(name)}.src`,
    dirtyField(name),
  ])];
  const allPath = `${SERVE_COLLECTION}/${SERVE_ALL_DOC}`;
  const served = await batchGetFull([...ids.map((id) => `${SERVE_COLLECTION}/${id}`), allPath], metaFields);
  const all = (served.get(allPath)?.data ?? null) as ServeStockDoc | null;
  const allSources = known.flatMap(({ stock }) => Object.values(hashSourcePaths(stock.ticker, stock.instrumentId)).flat());
  const hashRows = await batchGetFull(allSources, ["__serve_hash_only__"]);
  const hashes = new Map<string, string>();
  for (const [path, row] of hashRows) if (row.hash) hashes.set(path, row.hash);
  const checked = new Set(allSources);
  const now = Date.now();
  const out = new Map<CoveredStock, Set<ServePartName>>();
  for (const { stock, id } of known) {
    const meta = (served.get(`${SERVE_COLLECTION}/${id}`)?.data ?? null) as ServeStockDoc | null;
    // The meta read leaves out each part's data; partVerdict only needs to know a part is there.
    const doc = meta && meta.instrument_id === stock.instrumentId ? withPresentData(meta) : null;
    const stale = new Set<ServePartName>();
    for (const name of wanted) if (partVerdict(doc, name, now, hashes, checked, all) !== "fresh") stale.add(name);
    if (stale.size) out.set(stock, stale);
  }
  return out;
}

function withPresentData(meta: ServeStockDoc): ServeStockDoc {
  const doc: ServeStockDoc = { ...meta };
  for (const name of SERVE_PART_NAMES) {
    const stored = meta[partField(name)];
    if (stored && typeof stored === "object") doc[partField(name)] = { ...stored, data: true };
  }
  return doc;
}
