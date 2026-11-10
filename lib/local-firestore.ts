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

// The store sits behind a small accept queue: past about six requests in
// flight at once, the extra connections wait a full second to be picked up
// (measured: 12 parallel reads took ~240 ms capped at 6 and ~1200 ms
// uncapped). Queueing the overflow here is far cheaper than that second.
// LOCALDB_MAX_CONCURRENCY overrides the cap once the server allows more.
const MAX_IN_FLIGHT = Math.max(1, Number.parseInt(process.env.LOCALDB_MAX_CONCURRENCY || "", 10) || 6);
let slotsInUse = 0;
const slotWaiters: Array<() => void> = [];

async function withSlot<T>(run: () => Promise<T>): Promise<T> {
  if (slotsInUse >= MAX_IN_FLIGHT) {
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

// Identical reads that overlap in time share one round trip. Only the raw
// response text is shared, and every caller parses its own copy, so nobody
// can see another caller's mutations. Nothing is kept once the read settles.
type ReadResult = { status: number; ok: boolean; text: string };
const readsInFlight = new Map<string, Promise<ReadResult>>();

function encodePath(path: string): string {
  return encodeURIComponent(path);
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

  select(fields: string[]): LocalQuery {
    return new LocalQuery(this.client, this.collectionPath, this.filters, this.orders, this.limitCount, fields, this.group);
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
        select: this.selected,
      },
    });
    if (!response.ok) throw new Error(`LocalDB query failed (${response.status})`);
    const body = JSON.parse(response.text) as { documents?: LocalDocumentPayload[] };
    return new LocalQuerySnapshot((body.documents || []).map((document) => new LocalDocumentSnapshot(
      new LocalDocumentReference(this.client, document.path),
      document,
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
      for (const document of payload.documents || []) documents.set(document.path, document);
    }
    return refs.map((ref) => new LocalDocumentSnapshot(ref, documents.get(ref.path)));
  }

  async getAll(...refs: LocalDocumentReference[]): Promise<LocalDocumentSnapshot[]> {
    return this.batchGet(refs);
  }

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

  async request(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
    const send = () => withSlot(() => fetch(`${this.baseUrl}${path}`, {
      method: init.method || "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      // A stalled store must not hold this request (and every one queued
      // behind it for a slot) until the serverless function times out.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }));
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
      const response = await this.request(path, init);
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
  getAll: (...refs: LocalDocumentReference[]) => Promise<LocalDocumentSnapshot[]>;
  batch: () => LocalWriteBatch;
  runTransaction: <T>(callback: (transaction: LocalTransaction) => Promise<T>) => Promise<T>;
};

export function localFirestoreFromEnv(): LocalFirestore | null {
  const baseUrl = process.env.LOCALDB_URL?.trim().replace(/\/+$/, "");
  const token = process.env.LOCALDB_API_TOKEN?.trim();
  return baseUrl && token ? new LocalFirestore(baseUrl, token) : null;
}
