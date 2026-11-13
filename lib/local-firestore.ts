import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

import { noteDegradedRender } from "@/lib/next-render";

/** How long one store call may take before it fails. Override with LOCALDB_TIMEOUT_MS. */
const REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.LOCALDB_TIMEOUT_MS) || 25_000);

type LocalDocumentPayload = {
  path: string;
  data?: Record<string, unknown>;
  hash?: string;
};

type LocalSnapshotPayload = { document?: LocalDocumentPayload };

function transformValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(transformValue);
  if (!value || typeof value !== "object") return value;

  const object = value as Record<string, unknown>;
  const name = (value as { constructor?: { name?: string } }).constructor?.name || "";
  if (name === "NumericIncrementTransform") {
    return { __localdb_transform__: "increment", value: object.operand };
  }
  if (name === "ArrayUnionTransform") {
    return { __localdb_transform__: "array_union", values: object.elements };
  }
  if (name === "ArrayRemoveTransform") {
    return { __localdb_transform__: "array_remove", values: object.elements };
  }
  if (name === "DeleteTransform") return { __localdb_transform__: "delete" };
  if (name === "ServerTimestampTransform") {
    return { __localdb_transform__: "server_timestamp" };
  }
  if (value instanceof Date) return value.toISOString();
  return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, transformValue(item)]));
}

// Request timing, off by default. LOCALDB_TIMING=1 logs one line per store
// request to the server console; LOCALDB_TIMING_FILE=<path> appends the same
// lines to a file. Each line: method, what was read, status, milliseconds,
// and how many other store requests were already in flight when it started
// (0 on every line of a run means the reads ran one after another).
const TIMING_FILE = process.env.LOCALDB_TIMING_FILE?.trim() || "";
const TIMING_ON = process.env.LOCALDB_TIMING === "1" || Boolean(TIMING_FILE);
let inFlight = 0;

function describeRequest(path: string, body: unknown): string {
  if (path === "/query") {
    const query = body as { collection?: string; collection_group?: boolean; filters?: unknown[]; limit?: number; select?: string[] };
    return `query ${query.collection}${query.collection_group ? " (group)" : ""} filters=${JSON.stringify(query.filters || [])} limit=${query.limit ?? "none"}${query.select ? ` select=${query.select.length}` : ""}`;
  }
  if (path === "/documents:batchGet") {
    const paths = (body as { paths?: string[] }).paths || [];
    return `batchGet ${paths.length} docs [${paths.slice(0, 3).join(", ")}${paths.length > 3 ? ", ..." : ""}]`;
  }
  return decodeURIComponent(path);
}

function logTiming(method: string, what: string, status: string, ms: number, concurrent: number): void {
  const line = `[localdb] ${new Date().toISOString()} ${method} ${what} ${status} ${ms.toFixed(0)}ms concurrent=${concurrent}`;
  if (process.env.LOCALDB_TIMING === "1") console.log(line);
  if (TIMING_FILE) {
    // Loaded on demand so the module stays free of Node imports when timing is off.
    import("node:fs").then((fs) => fs.appendFile(TIMING_FILE, `${line}\n`, () => {})).catch(() => {});
  }
}

// How many store requests run at once from this process. An older store
// server had an accept queue of 5: past about six requests in flight, the
// extra connections waited a full second to be picked up (12 parallel reads
// took ~240 ms capped at 6 and ~1200 ms uncapped). The current server
// (backend/localdb/server.py) queues 128 and says so in an
// `X-LocalDB-Backlog` header, so the cap starts at the old safe 6 and rises
// to 16 once a response carries that header. LOCALDB_MAX_CONCURRENCY pins the
// cap to a fixed number instead.
const LEGACY_MAX_IN_FLIGHT = 6;
const DEFAULT_MAX_IN_FLIGHT = 16;
const PINNED_MAX_IN_FLIGHT = Number.parseInt(process.env.LOCALDB_MAX_CONCURRENCY || "", 10);
let maxInFlight = PINNED_MAX_IN_FLIGHT > 0 ? PINNED_MAX_IN_FLIGHT : LEGACY_MAX_IN_FLIGHT;
let slotsInUse = 0;
const slotWaiters: Array<() => void> = [];

/** Raise the cap once the server shows it queues connections rather than dropping them. */
function noteServerBacklog(response: Response): void {
  if (PINNED_MAX_IN_FLIGHT > 0 || maxInFlight >= DEFAULT_MAX_IN_FLIGHT) return;
  const backlog = Number.parseInt(response.headers.get("x-localdb-backlog") || "", 10);
  if (!(backlog >= 64)) return;
  maxInFlight = DEFAULT_MAX_IN_FLIGHT;
  // Start whoever is queued for the new slots.
  while (slotsInUse < maxInFlight && slotWaiters.length) {
    slotsInUse += 1;
    slotWaiters.shift()!();
  }
}

async function withSlot<T>(run: () => Promise<T>): Promise<T> {
  if (slotsInUse >= maxInFlight) {
    // The finishing request hands its slot straight to the next waiter.
    await new Promise<void>((resolve) => slotWaiters.push(resolve));
  } else {
    slotsInUse += 1;
  }
  try {
    return await run();
  } finally {
    const next = slotWaiters.shift();
    if (next) next();
    else slotsInUse -= 1;
  }
}

/** For tests: the current cap and queue. */
export function localDbConcurrencyForTests(): { max: number; inUse: number; waiting: number } {
  return { max: maxInFlight, inUse: slotsInUse, waiting: slotWaiters.length };
}

// Store requests go through undici's own fetch and a connection pool of their
// own, for two reasons:
// - Keep-alive. Node's global fetch drops a connection after 4 s idle, so a
//   page view more than 4 s after the last one paid a new TCP + TLS handshake
//   to the VPS on its first read (~400 ms instead of ~110 ms from a laptop).
//   This pool keeps idle connections for 60 s, below the store server's 150 s
//   (backend/localdb/server.py) and Caddy's 5 minute idle timeout, so the
//   client is the side that closes them.
// - Next's Data Cache. Next patches the global fetch and, on a page built for
//   the CDN (the cached signed-out pages, lib/anon-view.ts), would keep every
//   response in its Data Cache, which outlives deploys. undici's fetch is not
//   the global one, so Next never sees these requests.
// undici's fetch is paired with undici's own Agent on purpose: handing an
// Agent from the npm package to Node's built-in fetch breaks whenever the two
// undici majors drift apart (an undici 6 Agent fails on Node 26's fetch).
const KEEPALIVE_IDLE_MS = 60_000;
let storeAgent: Agent | undefined;

/** The options of the store connection pool, for tests. */
export const LOCALDB_AGENT_OPTIONS = {
  keepAliveTimeout: KEEPALIVE_IDLE_MS,
  // The in-flight cap (see withSlot) plus a few spare: a read frees its slot
  // before its body is fully read, so a few more sockets can be busy at once.
  connections: Math.max(DEFAULT_MAX_IN_FLIGHT, PINNED_MAX_IN_FLIGHT || 0) + 4,
} as const;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
let fetchForTests: FetchLike | undefined;

/** For tests: answer store requests with `fetch` instead of the network; no argument restores the network. */
export function setLocalDbFetchForTests(fetch?: FetchLike): void {
  fetchForTests = fetch;
}

/** One request to the store over the shared keep-alive pool. Server only. */
export function localDbFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (fetchForTests) return fetchForTests(url, init);
  storeAgent ??= new Agent(LOCALDB_AGENT_OPTIONS);
  // undici's Response has the same shape as the global one; only its TypeScript type differs.
  return undiciFetch(url, { ...(init as UndiciRequestInit), dispatcher: storeAgent }) as unknown as Promise<Response>;
}

/**
 * A pooled connection the server dropped (a store or Caddy restart) while it
 * sat idle here. Reads change nothing, so a read that hits one is sent once
 * more on a fresh connection; writes are not, as they may have landed.
 */
function isStaleConnection(error: unknown): boolean {
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return code === "UND_ERR_SOCKET" || code === "ECONNRESET" || code === "EPIPE";
}

// Identical reads that overlap in time share one round trip. Only the raw
// response text is shared, and every caller parses its own copy, so nobody
// can see another caller's mutations. Nothing is kept once the read settles.
type ReadResult = { status: number; ok: boolean; text: string };
const readsInFlight = new Map<string, Promise<ReadResult>>();

function encodePath(path: string): string {
  return encodeURIComponent(path);
}

/**
 * Keep only `fields` of `data`, the way Firestore's select and getAll
 * fieldMask do: a dotted path keeps that nested value under the same nesting,
 * and a field the document lacks is left out. Every server version takes a
 * `select` on batch reads and queries (backend/localdb/server.py); the current
 * one applies it inside SQLite, older ones after a whole read. Projecting the
 * answer here as well costs nothing on an already-projected answer and gives
 * callers the same shape from any server, including one that ignored it.
 */
export function projectFields(data: Record<string, unknown> | undefined, fields: readonly string[]): Record<string, unknown> | undefined {
  if (!data) return data;
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field === "__name__") continue;
    const parts = field.split(".");
    let value: unknown = data;
    let found = true;
    for (const part of parts) {
      if (!value || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, part)) {
        found = false;
        break;
      }
      value = (value as Record<string, unknown>)[part];
    }
    if (!found) continue;
    let target = out;
    for (const part of parts.slice(0, -1)) {
      const child = target[part];
      if (!child || typeof child !== "object" || Array.isArray(child)) target[part] = {};
      target = target[part] as Record<string, unknown>;
    }
    target[parts.at(-1)!] = value;
  }
  return out;
}

/** Field paths from `select("a", "b")` (Firestore) or `select(["a", "b"])` (the older adapter form). */
function fieldList(fields: ReadonlyArray<string | readonly string[]>): string[] {
  const out = fields.flatMap((field) => (Array.isArray(field) ? field : [field])) as unknown[];
  for (const field of out) {
    if (typeof field !== "string" || !field) throw new Error("LocalDB select takes field paths as strings");
  }
  return out as string[];
}

/** Firestore's getAll read options. Only `fieldMask` is used. */
export type LocalReadOptions = { fieldMask?: readonly string[] };

function isReadOptions(value: unknown): value is LocalReadOptions {
  return Boolean(value) && typeof value === "object" && !(value instanceof LocalDocumentReference);
}

export class LocalDocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  readonly ref: LocalDocumentReference;
  private readonly payload: LocalDocumentPayload;

  constructor(ref: LocalDocumentReference, payload?: LocalDocumentPayload) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = Boolean(payload);
    this.payload = payload || { path: ref.path };
  }

  data(): Record<string, unknown> | undefined {
    return this.payload.data;
  }
}

export class LocalQuerySnapshot {
  readonly docs: LocalDocumentSnapshot[];

  constructor(docs: LocalDocumentSnapshot[]) {
    this.docs = docs;
  }

  get empty(): boolean {
    return this.docs.length === 0;
  }

  get size(): number {
    return this.docs.length;
  }

  forEach(callback: (doc: LocalDocumentSnapshot) => void): void {
    this.docs.forEach(callback);
  }
}

type QueryFilter = { field: string; op: string; value: unknown };
type QueryOrder = { field: string; direction: string };

const QUERY_OPERATORS: Record<string, string> = {
  "==": "==",
  "!=": "!=",
  "<": "<",
  "<=": "<=",
  ">": ">",
  ">=": ">=",
  in: "in",
  "not-in": "not-in",
  not_in: "not-in",
  "array-contains": "array-contains",
  array_contains: "array-contains",
  "array-contains-any": "array-contains-any",
  array_contains_any: "array-contains-any",
};

function normalizeQueryOperator(op: string): string {
  return QUERY_OPERATORS[op] || op;
}

export class LocalDocumentReference {
  readonly id: string;

  constructor(private readonly client: LocalFirestore, readonly path: string) {
    this.id = path.split("/").at(-1) || "";
  }

  collection(collectionId: string): LocalCollectionReference {
    return new LocalCollectionReference(this.client, `${this.path}/${collectionId}`);
  }

  async get(): Promise<LocalDocumentSnapshot> {
    const response = await this.client.read(`/documents/${encodePath(this.path)}`);
    if (response.status === 404) return new LocalDocumentSnapshot(this);
    if (!response.ok) throw new Error(`LocalDB read failed (${response.status})`);
    return new LocalDocumentSnapshot(this, (JSON.parse(response.text) as LocalSnapshotPayload).document);
  }

  async set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void> {
    await this.client.write(`/documents/${encodePath(this.path)}`, {
      method: "PUT",
      body: { data: transformValue(data), merge: Boolean(options?.merge) },
    });
  }

  async create(data: Record<string, unknown>): Promise<void> {
    await this.client.write(`/documents/${encodePath(this.path)}`, {
      method: "PUT",
      body: { data: transformValue(data), create: true },
    });
  }

  async update(data: Record<string, unknown>): Promise<void> {
    await this.set(data, { merge: true });
  }

  async delete(): Promise<void> {
    await this.client.write(`/documents/${encodePath(this.path)}`, { method: "DELETE" });
  }
}

export class LocalQuery {
  constructor(
    protected readonly client: LocalFirestore,
    readonly collectionPath: string,
    protected readonly filters: QueryFilter[] = [],
    protected readonly orders: QueryOrder[] = [],
    protected readonly limitCount?: number,
    protected readonly selected?: string[],
    protected readonly group = false,
  ) {}

  where(field: string, op: string, value: unknown): LocalQuery {
    return new LocalQuery(
      this.client,
      this.collectionPath,
      [...this.filters, { field, op: normalizeQueryOperator(op), value: transformValue(value) }],
      this.orders,
      this.limitCount,
      this.selected,
      this.group,
    );
  }

  orderBy(field: string, direction = "ASCENDING"): LocalQuery {
    return new LocalQuery(this.client, this.collectionPath, this.filters, [...this.orders, { field, direction }], this.limitCount, this.selected, this.group);
  }

  limit(count: number): LocalQuery {
    return new LocalQuery(this.client, this.collectionPath, this.filters, this.orders, count, this.selected, this.group);
  }

  /** Only these fields of each document, like Firestore's `select("a", "b.c")`; an array is accepted too. */
  select(...fields: Array<string | readonly string[]>): LocalQuery {
    return new LocalQuery(this.client, this.collectionPath, this.filters, this.orders, this.limitCount, fieldList(fields), this.group);
  }

  async get(): Promise<LocalQuerySnapshot> {
    const response = await this.client.read("/query", {
      method: "POST",
      body: {
        collection: this.collectionPath,
        collection_group: this.group,
        filters: this.filters,
        orders: this.orders,
        limit: this.limitCount,
        // `select()` with no fields means "ids only"; Firestore sends __name__ for it too.
        select: this.selected?.length === 0 ? ["__name__"] : this.selected,
      },
    });
    if (!response.ok) throw new Error(`LocalDB query failed (${response.status})`);
    const body = JSON.parse(response.text) as { documents?: LocalDocumentPayload[] };
    const selected = this.selected;
    return new LocalQuerySnapshot((body.documents || []).map((document) => new LocalDocumentSnapshot(
      new LocalDocumentReference(this.client, document.path),
      selected ? { ...document, data: projectFields(document.data, selected) } : document,
    )));
  }

  stream(): Promise<LocalQuerySnapshot> {
    return this.get();
  }
}

export class LocalCollectionReference extends LocalQuery {
  document(documentId: string): LocalDocumentReference {
    return new LocalDocumentReference(this.client, `${this.collectionPath}/${documentId}`);
  }

  doc(documentId: string): LocalDocumentReference {
    return this.document(documentId);
  }

  async add(data: Record<string, unknown>): Promise<{ id: string; path: string }> {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    const ref = this.document(id);
    await ref.set(data);
    return ref;
  }
}

type LocalOperation = {
  op: "set" | "update" | "create" | "delete";
  path: string;
  data?: Record<string, unknown>;
  merge?: boolean;
};

export class LocalWriteBatch {
  private readonly operations: LocalOperation[] = [];

  constructor(private readonly client: LocalFirestore) {}

  set(ref: LocalDocumentReference, data: Record<string, unknown>, options?: { merge?: boolean }): this {
    this.operations.push({ op: "set", path: ref.path, data: transformValue(data) as Record<string, unknown>, merge: Boolean(options?.merge) });
    return this;
  }

  update(ref: LocalDocumentReference, data: Record<string, unknown>): this {
    this.operations.push({ op: "update", path: ref.path, data: transformValue(data) as Record<string, unknown>, merge: true });
    return this;
  }

  create(ref: LocalDocumentReference, data: Record<string, unknown>): this {
    this.operations.push({ op: "create", path: ref.path, data: transformValue(data) as Record<string, unknown> });
    return this;
  }

  delete(ref: LocalDocumentReference): this {
    this.operations.push({ op: "delete", path: ref.path });
    return this;
  }

  async commit(): Promise<void> {
    await this.client.write("/documents:batchWrite", { method: "POST", body: { operations: this.operations } });
  }
}

export class LocalTransaction {
  private readonly reads = new Map<string, string | null>();
  private readonly operations: LocalOperation[] = [];

  constructor(private readonly client: LocalFirestore) {}

  async get(ref: LocalDocumentReference): Promise<LocalDocumentSnapshot> {
    const snapshot = await ref.get();
    this.reads.set(ref.path, snapshot.exists ? ((snapshot as unknown as { payload?: { hash?: string } }).payload?.hash || null) : null);
    return snapshot;
  }

  set(ref: LocalDocumentReference, data: Record<string, unknown>, options?: { merge?: boolean }): this {
    this.operations.push({ op: "set", path: ref.path, data: transformValue(data) as Record<string, unknown>, merge: Boolean(options?.merge) });
    return this;
  }

  update(ref: LocalDocumentReference, data: Record<string, unknown>): this {
    this.operations.push({ op: "update", path: ref.path, data: transformValue(data) as Record<string, unknown>, merge: true });
    return this;
  }

  create(ref: LocalDocumentReference, data: Record<string, unknown>): this {
    this.operations.push({ op: "create", path: ref.path, data: transformValue(data) as Record<string, unknown> });
    return this;
  }

  delete(ref: LocalDocumentReference): this {
    this.operations.push({ op: "delete", path: ref.path });
    return this;
  }

  async commit(): Promise<void> {
    await this.client.write("/transactions:commit", {
      method: "POST",
      body: { reads: Object.fromEntries(this.reads), operations: this.operations },
    });
  }
}

export class LocalFirestore {
  constructor(private readonly baseUrl: string, private readonly token: string) {}

  collection(collectionPath: string): LocalCollectionReference {
    return new LocalCollectionReference(this, collectionPath);
  }

  collectionGroup(collectionId: string): LocalQuery {
    return new LocalQuery(this, collectionId, [], [], undefined, undefined, true);
  }

  private async batchGet(
    refs: LocalDocumentReference[],
    select?: string[],
  ): Promise<LocalDocumentSnapshot[]> {
    const documents = new Map<string, LocalDocumentPayload>();
    const chunkSize = select ? 500 : 100;
    for (let start = 0; start < refs.length; start += chunkSize) {
      const chunk = refs.slice(start, start + chunkSize);
      const response = await this.read("/documents:batchGet", {
        method: "POST",
        body: { paths: chunk.map((ref) => ref.path), ...(select ? { select } : {}) },
      });
      if (!response.ok) throw new Error(`LocalDB batch read failed (${response.status})`);
      const payload = JSON.parse(response.text) as { documents?: LocalDocumentPayload[] };
      for (const document of payload.documents || []) {
        documents.set(document.path, select ? { ...document, data: projectFields(document.data, select) } : document);
      }
    }
    return refs.map((ref) => new LocalDocumentSnapshot(ref, documents.get(ref.path)));
  }

  /**
   * Documents by reference, like Firestore's `getAll(...refs, { fieldMask })`:
   * a trailing options object with `fieldMask` reads only those fields.
   */
  async getAll(...refsOrOptions: Array<LocalDocumentReference | LocalReadOptions>): Promise<LocalDocumentSnapshot[]> {
    const last = refsOrOptions.at(-1);
    const options = isReadOptions(last) ? last : undefined;
    const refs = (options ? refsOrOptions.slice(0, -1) : refsOrOptions) as LocalDocumentReference[];
    return this.batchGet(refs, options?.fieldMask ? fieldList([options.fieldMask]) : undefined);
  }

  /** `getAll(...refs, { fieldMask: select })` with the refs as an array. */
  async getAllSelected(refs: LocalDocumentReference[], select: string[]): Promise<LocalDocumentSnapshot[]> {
    return this.batchGet(refs, select);
  }

  batch(): LocalWriteBatch {
    return new LocalWriteBatch(this);
  }

  async runTransaction<T>(callback: (transaction: LocalTransaction) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const transaction = new LocalTransaction(this);
      try {
        const result = await callback(transaction);
        await transaction.commit();
        return result;
      } catch (error) {
        lastError = error;
        if (!(error instanceof Error) || !error.message.includes("transaction conflict")) throw error;
      }
    }
    throw lastError;
  }

  async request(path: string, init: { method?: string; body?: unknown; retryStale?: boolean } = {}): Promise<Response> {
    const attempt = (signal: AbortSignal) => localDbFetch(`${this.baseUrl}${path}`, {
      method: init.method || "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal,
    });
    const sendWithRetry = () => {
      // A stalled store must not hold this request (and every one queued
      // behind it for a slot) until the serverless function times out.
      const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      return attempt(signal).catch((error: unknown) => {
        if (!init.retryStale || !isStaleConnection(error)) throw error;
        return attempt(signal);
      });
    };
    const send = () => withSlot(() => sendWithRetry().then(
      (response) => {
        noteServerBacklog(response);
        if (response.status >= 500) noteDegradedRender();
        return response;
      },
      (error: unknown) => {
        // A timeout or dropped connection: a cached page built now is missing data.
        noteDegradedRender();
        throw error;
      },
    ));
    if (!TIMING_ON) return send();
    const startedAt = performance.now();
    const inFlightAtStart = inFlight;
    inFlight += 1;
    let status = "error";
    try {
      const response = await send();
      status = String(response.status);
      return response;
    } finally {
      inFlight -= 1;
      logTiming(init.method || "GET", describeRequest(path, init.body), status, performance.now() - startedAt, inFlightAtStart);
    }
  }

  /** A read (document, batch read or query), shared with any identical read already in flight. */
  async read(path: string, init: { method?: string; body?: unknown } = {}): Promise<ReadResult> {
    const key = `${this.baseUrl} ${init.method || "GET"} ${path} ${init.body ? JSON.stringify(init.body) : ""}`;
    const pending = readsInFlight.get(key);
    if (pending) return pending;
    const started = (async (): Promise<ReadResult> => {
      const response = await this.request(path, { ...init, retryStale: true });
      return { status: response.status, ok: response.ok, text: await response.text() };
    })();
    readsInFlight.set(key, started);
    const forget = () => {
      if (readsInFlight.get(key) === started) readsInFlight.delete(key);
    };
    started.then(forget, forget);
    return started;
  }

  async write(path: string, init: { method: string; body?: unknown }): Promise<void> {
    // A read that starts after this write must see it, so it may not join a
    // read that was already in flight.
    readsInFlight.clear();
    const response = await this.request(path, init);
    // And again once it has landed: a read that began while the write was in
    // flight may have been answered from before it.
    readsInFlight.clear();
    if (response.ok) return;
    let message = `LocalDB request failed (${response.status})`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
}

export type FirestoreLike = {
  collection: (collectionPath: string) => LocalCollectionReference;
  collectionGroup: (collectionId: string) => LocalQuery;
  getAll: (...refsOrOptions: Array<LocalDocumentReference | LocalReadOptions>) => Promise<LocalDocumentSnapshot[]>;
  batch: () => LocalWriteBatch;
  runTransaction: <T>(callback: (transaction: LocalTransaction) => Promise<T>) => Promise<T>;
};

export function localFirestoreFromEnv(): LocalFirestore | null {
  const baseUrl = process.env.LOCALDB_URL?.trim().replace(/\/+$/, "");
  const token = process.env.LOCALDB_API_TOKEN?.trim();
  return baseUrl && token ? new LocalFirestore(baseUrl, token) : null;
}
