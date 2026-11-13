import { cache } from "react";

import type { ResultsReport } from "@/lib/call-evidence";
import type { AnomalyItem } from "@/lib/daily-anomalies";
import { localFirestoreFromEnv } from "@/lib/local-firestore";
import { sharedCache } from "@/lib/shared-cache";
import type { RedditTickerContext } from "@/lib/reddit-cues-shared";
import type { NewsArticle } from "@/lib/news";
import {
  SERVE_ALL_DOC,
  SERVE_COLLECTION,
  SERVE_PART_NAMES,
  dirtyField,
  hashSourcePaths,
  newsInWindow,
  partField,
  partVerdict,
  rawFromSeriesPart,
  serveDocId,
  serveDocIdFor,
  type BundlePartData,
  type CallsPartData,
  type NewsPartData,
  type PartVerdict,
  type SeriesPartData,
  type ServePart,
  type SnapshotRow,
  type ServePartName,
  type ServeStockDoc,
  type SnapshotPartData,
} from "@/lib/serve/stock-serve-shared";

/**
 * The stock page's serving doc, read once per request (docs/serving-docs.md). Off unless SERVE_DOCS=1, and only on
 * the LocalDB store (it proves parts current with the store's own document hashes).
 *
 * Two small reads, side by side: the serve doc itself (kept 60 seconds, see readServeDocs), and the hashes (no
 * bodies) of the source docs its "hash" parts were built from, read live on every request. Every part that cannot prove it is current comes back undefined, and the page reads that
 * part the old way. Any failure here is "nothing served", never an error.
 */

/** Read on every call, at run time (bracket access: never inlined at build), so /etc/tikrr/web.env turns it on or off. */
export function serveDocsOn(): boolean {
  return process.env["SERVE_DOCS"] === "1";
}

/** What the page may use, per part; undefined means "read it the old way". */
export type ServedStock = {
  /** The raw `tm_price_history_daily` doc (null: there is none). */
  seriesRaw?: Record<string, unknown> | null;
  snapshotRows?: SnapshotPartData["rows"];
  callRecords?: CallsPartData["records"];
  bundle?: BundlePartData;
  anomaly?: AnomalyItem | null;
  results?: ResultsReport[];
  reddit?: RedditTickerContext | null;
  news?: { days: number; limit: number; articles: NewsArticle[]; labels: Record<string, string> };
  /** Why each part was or was not used, for the timing log and tests. */
  verdicts: Partial<Record<ServePartName, PartVerdict>>;
};

type BatchDoc = { path: string; data?: Record<string, unknown>; hash?: string };

// A field no document has: the store answers each path with its hash and no body.
const NO_FIELDS = ["__serve_hash_only__"];

async function batchGet(paths: string[], select?: string[]): Promise<BatchDoc[]> {
  const client = localFirestoreFromEnv();
  if (!client || paths.length === 0) return [];
  const result = await client.read("/documents:batchGet", { method: "POST", body: select ? { paths, select } : { paths } });
  if (!result.ok) throw new Error(`serve read failed (${result.status})`);
  const parsed = JSON.parse(result.text) as { documents?: BatchDoc[] };
  return Array.isArray(parsed.documents) ? parsed.documents : [];
}

/**
 * The serve doc and the shared `_all` stamps, kept 60 seconds per instance (like the stored page view). Safe because
 * every "hash" part is still checked against the live hashes on each request, and a dirty stamp is seen at most 60
 * seconds late, inside the 2 to 15 minutes the old reads were already cached. Throws on a failed read, so a failure
 * is never kept.
 */
const readServeDocs = sharedCache(
  async (docPath: string, allPath: string): Promise<{ serve: ServeStockDoc | null; all: ServeStockDoc | null }> => {
    const docs = await batchGet([docPath, allPath]);
    return {
      serve: (docs.find((row) => row.path === docPath)?.data ?? null) as ServeStockDoc | null,
      all: (docs.find((row) => row.path === allPath)?.data ?? null) as ServeStockDoc | null,
    };
  },
  ["serve-stock-doc-v1"],
  { revalidate: 60 },
);

async function loadServedStockUncached(ticker: string, instrumentId: string): Promise<ServedStock | null> {
  const id = serveDocIdFor(instrumentId);
  if (!serveDocsOn() || !id || !serveDocId(ticker) || !localFirestoreFromEnv()) return null;
  // Both reads at once: the sources a part may name are known from the stock alone (hashSourcePaths).
  const expected = [...new Set(Object.values(hashSourcePaths(ticker, instrumentId)).flat())].sort();
  const docPath = `${SERVE_COLLECTION}/${id}`;
  const allPath = `${SERVE_COLLECTION}/${SERVE_ALL_DOC}`;
  const [{ serve, all }, hashRows] = await Promise.all([readServeDocs(docPath, allPath), batchGet(expected, NO_FIELDS)]);
  if (!serve || serve.instrument_id !== instrumentId) return null;
  const checked = new Set(expected);
  const hashes = new Map<string, string>();
  for (const row of hashRows) if (row.hash && checked.has(row.path)) hashes.set(row.path, row.hash);
  const now = Date.now();
  const verdicts: ServedStock["verdicts"] = {};
  const fresh = <T,>(name: ServePartName): T | undefined => {
    const verdict = partVerdict(serve, name, now, hashes, checked, all);
    verdicts[name] = verdict;
    return verdict === "fresh" ? ((serve[partField(name)] as ServePart<T>).data) : undefined;
  };
  const out: ServedStock = { verdicts };
  const series = fresh<SeriesPartData | null>("series");
  if (series !== undefined) out.seriesRaw = series === null ? null : rawFromSeriesPart(series);
  const snapshot = fresh<SnapshotPartData>("snapshot");
  if (snapshot && Array.isArray(snapshot.rows)) out.snapshotRows = snapshot.rows;
  const calls = fresh<CallsPartData>("calls");
  if (calls && Array.isArray(calls.records)) out.callRecords = calls.records;
  const bundle = fresh<BundlePartData>("bundle");
  if (bundle) out.bundle = bundle;
  const anomaly = fresh<AnomalyItem | null>("anomaly");
  if (anomaly !== undefined) out.anomaly = anomaly;
  const results = fresh<ResultsReport[]>("results");
  if (Array.isArray(results)) out.results = results;
  const reddit = fresh<RedditTickerContext | null>("reddit");
  if (reddit !== undefined) out.reddit = reddit;
  const news = fresh<NewsPartData>("news");
  if (news && Array.isArray(news.articles)) {
    out.news = { days: news.days, limit: news.limit, articles: newsInWindow(news.articles, news.days, now), labels: news.labels ?? {} };
  }
  for (const name of SERVE_PART_NAMES) if (!(name in verdicts)) verdicts[name] = partVerdict(serve, name, now, hashes, checked, all);
  // SERVE_DOCS_LOG=1: one line per page with what was served and why the rest was not (no data, just verdicts).
  if (process.env.SERVE_DOCS_LOG === "1") {
    console.log(`[serve] ${id} ${SERVE_PART_NAMES.map((name) => `${name}=${verdicts[name]}`).join(" ")}`);
  }
  return out;
}

/**
 * Only the served price window (the `snapshot` part) of one stock: a masked read of its serve doc and the `_all`
 * stamps, ~8 KB instead of the ~120 KB price doc. For pages that show a stock's recent closes without the rest of
 * the stock page (the landing's demo card). The rows still need today's quote on their end, from the price doc's
 * own quote fields. Undefined when serving is off, the part cannot be proven fresh (partVerdict), or a read fails.
 */
export async function loadServedSnapshotRows(ticker: string, instrumentId: string): Promise<SnapshotRow[] | undefined> {
  const id = serveDocIdFor(instrumentId);
  if (!serveDocsOn() || !id || !serveDocId(ticker) || !localFirestoreFromEnv()) return undefined;
  try {
    const docPath = `${SERVE_COLLECTION}/${id}`;
    const allPath = `${SERVE_COLLECTION}/${SERVE_ALL_DOC}`;
    const docs = await batchGet([docPath, allPath], ["schema", "instrument_id", partField("snapshot"), dirtyField("snapshot")]);
    const serve = (docs.find((row) => row.path === docPath)?.data ?? null) as ServeStockDoc | null;
    const all = (docs.find((row) => row.path === allPath)?.data ?? null) as ServeStockDoc | null;
    if (!serve || serve.instrument_id !== instrumentId) return undefined;
    // A "dirty" part: no source hashes to check, only the age and the writers' stamps.
    if (partVerdict(serve, "snapshot", Date.now(), null, undefined, all) !== "fresh") return undefined;
    const rows = (serve[partField("snapshot")] as ServePart<SnapshotPartData>).data?.rows;
    return Array.isArray(rows) ? rows : undefined;
  } catch {
    return undefined;
  }
}

// React's request cache only exists in the server-components build; elsewhere (tests, scripts) read each time.
const perRequest: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

/** A serve read slower than this is given up on: the page reads the old way rather than wait. */
const SERVE_READ_TIMEOUT_MS = 1500;

/** The served parts for one stock, once per request; null when serving is off, the doc is missing or a read failed. */
export const getServedStock = perRequest(async (ticker: string, instrumentId: string): Promise<ServedStock | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      loadServedStockUncached(ticker, instrumentId),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("serve read timed out")), SERVE_READ_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.warn("[serve] stock serving doc unavailable:", error instanceof Error ? error.message : "unknown error");
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
});
