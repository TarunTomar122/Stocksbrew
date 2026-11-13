/**
 * What one page view costs the store, off by default.
 *
 * LOCALDB_TRACE=1 logs one line per server request once its store calls go
 * quiet: the route, how many LocalDB calls it made (reads and writes), how many
 * documents and bytes came back, the summed call time and the wall time from
 * the first call's start to the last call's end. LOCALDB_TRACE_FILE=<path>
 * appends the same record as JSON (one object per line) for tallying.
 *
 * A request is recognised by Next's static-generation store, the per-request
 * object Next keeps in AsyncLocalStorage (lib/next-render.ts reads the same
 * one). `unstable_cache` runs its callback in a copy of that object made with
 * object spread, so the trace record is kept on it as a plain property and the
 * copy carries the same record: reads inside a cache miss count towards the
 * page that caused them. Reads outside any request (jobs, scripts) are
 * grouped under "(no request)".
 *
 * Never on in production by default; it only reads timings and sizes, never
 * document contents.
 */

const TRACE_FILE = process.env.LOCALDB_TRACE_FILE?.trim() || "";
export const LOCALDB_TRACE_ON = process.env.LOCALDB_TRACE === "1" || Boolean(TRACE_FILE);

/** Quiet time after the last call before a request's line is written. */
const IDLE_MS = 400;
const TRACE_KEY = "__localdbTrace";

export type LocalDbTraceRecord = {
  /** Same id on a request's "(late)" lines, which repeat its totals with the calls that came after. */
  id: number;
  route: string;
  calls: number;
  reads: number;
  writes: number;
  docs: number;
  bytes: number;
  dbMs: number;
  spanMs: number;
  /** Per call kind ("batchGet", "query <collection>", ...): calls, docs, bytes. */
  kinds: Record<string, { calls: number; docs: number; bytes: number; ms: number }>;
};

type LiveTrace = LocalDbTraceRecord & {
  firstStart: number;
  lastEnd: number;
  timer: ReturnType<typeof setTimeout> | null;
  logged: number;
};

type StaticStore = { urlPathname?: string; [TRACE_KEY]?: LiveTrace };

const outsideRequest: { current?: LiveTrace } = {};
let nextId = 1;

function currentStore(): StaticStore | undefined {
  try {
    const getter = (fetch as unknown as { __nextGetStaticStore?: () => { getStore: () => StaticStore | undefined } })
      .__nextGetStaticStore;
    return getter?.()?.getStore();
  } catch {
    return undefined;
  }
}

function newTrace(route: string): LiveTrace {
  return { id: nextId++, route, calls: 0, reads: 0, writes: 0, docs: 0, bytes: 0, dbMs: 0, spanMs: 0, kinds: {}, firstStart: 0, lastEnd: 0, timer: null, logged: 0 };
}

function traceForCurrentRequest(): LiveTrace {
  const store = currentStore();
  if (!store) return (outsideRequest.current ??= newTrace("(no request)"));
  let trace = store[TRACE_KEY];
  if (!trace) {
    trace = newTrace(store.urlPathname || "(unknown)");
    // A plain, enumerable property on purpose: unstable_cache's `{...store}` copy must carry it.
    store[TRACE_KEY] = trace;
  }
  return trace;
}

/** Documents in a store answer: `"count":N` at the end of a list, 1 for a single document, else 0. */
export function documentsInResponse(text: string, status: number): number {
  if (status < 200 || status >= 300) return 0;
  const tail = /"count":(\d+)\}\s*$/.exec(text.slice(-32));
  if (tail) return Number(tail[1]);
  return text.startsWith('{"document":') ? 1 : 0;
}

/** The call's kind for the per-kind breakdown: the endpoint, plus the collection for queries and documents. */
export function describeCall(method: string, path: string, body: unknown): string {
  if (path === "/query") {
    const query = body as { collection?: string; collection_group?: boolean } | undefined;
    // A subcollection query names its parent document (tm_radar_inbox/<uid>/items): keep the collections only.
    return `query ${query?.collection ? collectionOf(query.collection) : "?"}${query?.collection_group ? " (group)" : ""}`;
  }
  if (path === "/documents:batchGet") {
    const paths = (body as { paths?: string[] } | undefined)?.paths || [];
    const collections = Array.from(new Set(paths.map((item) => collectionOf(item)))).sort();
    return `batchGet ${collections.join(",")}`;
  }
  if (path.startsWith("/documents/")) return `${method} ${collectionOf(decodeURIComponent(path.slice("/documents/".length)))}`;
  return `${method} ${path}`;
}

/** "users/abc/watchlist/x" -> "users/*\/watchlist": no ids in the log. */
function collectionOf(documentPath: string): string {
  return documentPath.split("/").filter(Boolean).filter((_, index) => index % 2 === 0).join("/*/");
}

function emit(trace: LiveTrace): void {
  trace.timer = null;
  trace.spanMs = trace.lastEnd - trace.firstStart;
  const late = trace.logged > 0 ? " (late)" : "";
  trace.logged += 1;
  const record: LocalDbTraceRecord = {
    id: trace.id,
    route: trace.route,
    calls: trace.calls,
    reads: trace.reads,
    writes: trace.writes,
    docs: trace.docs,
    bytes: trace.bytes,
    dbMs: Math.round(trace.dbMs),
    spanMs: Math.round(trace.spanMs),
    kinds: trace.kinds,
  };
  if (process.env.LOCALDB_TRACE === "1") {
    console.log(
      `[localdb-trace] #${record.id} ${record.route}${late} calls=${record.calls} (reads=${record.reads} writes=${record.writes}) docs=${record.docs} ` +
        `bytes=${record.bytes} db_ms=${record.dbMs} span_ms=${record.spanMs}`,
    );
  }
  if (TRACE_FILE) {
    const line = `${JSON.stringify({ at: new Date().toISOString(), late: trace.logged > 1, ...record })}\n`;
    import("node:fs").then((fs) => fs.appendFile(TRACE_FILE, line, () => {})).catch(() => {});
  }
}

/** Called by lib/local-firestore.ts after every store call when tracing is on. Never throws. */
export function traceLocalDbCall(call: {
  kind: string;
  write: boolean;
  docs: number;
  bytes: number;
  startedAt: number;
  endedAt: number;
}): void {
  try {
    const trace = traceForCurrentRequest();
    if (trace.calls === 0) trace.firstStart = call.startedAt;
    trace.firstStart = Math.min(trace.firstStart, call.startedAt);
    trace.lastEnd = Math.max(trace.lastEnd, call.endedAt);
    trace.calls += 1;
    if (call.write) trace.writes += 1;
    else trace.reads += 1;
    trace.docs += call.docs;
    trace.bytes += call.bytes;
    const ms = call.endedAt - call.startedAt;
    trace.dbMs += ms;
    const kind = (trace.kinds[call.kind] ??= { calls: 0, docs: 0, bytes: 0, ms: 0 });
    kind.calls += 1;
    kind.docs += call.docs;
    kind.bytes += call.bytes;
    kind.ms += Math.round(ms);
    if (trace.timer) clearTimeout(trace.timer);
    trace.timer = setTimeout(() => emit(trace), IDLE_MS);
    (trace.timer as { unref?: () => void }).unref?.();
  } catch {
    // Bookkeeping must never break a read.
  }
}
