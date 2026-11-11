/**
 * A small in-memory stand-in for the document store, for the import and
 * thesis tests: docs by path, nested collections, and a transaction that
 * applies its writes at the end with the same top-level replace-on-merge
 * that LocalDB has (a map written with merge replaces the stored map; it is
 * not deep-merged). Test-only.
 */

export type MemoryStore = {
  docs: Map<string, Record<string, unknown>>;
  writes: Array<{ path: string; data: Record<string, unknown> }>;
  fail: boolean;
};

export function createMemoryStore(): MemoryStore {
  return { docs: new Map(), writes: [], fail: false };
}

type Ref = { path: string; id: string; get: () => Promise<Snap>; set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>; collection: (name: string) => Collection };
type Snap = { exists: boolean; id: string; data: () => Record<string, unknown> | undefined };
type Collection = { doc: (id: string) => Ref };

function apply(store: MemoryStore, path: string, data: Record<string, unknown>, merge: boolean) {
  store.writes.push({ path, data });
  // Top-level fields only, like LocalDB: nested maps are replaced whole.
  store.docs.set(path, merge ? { ...(store.docs.get(path) ?? {}), ...data } : { ...data });
}

export function memoryFirestore(store: MemoryStore) {
  const ref = (path: string): Ref => ({
    path,
    id: path.split("/").pop()!,
    async get() {
      if (store.fail) throw new Error("store down");
      const data = store.docs.get(path);
      return { exists: data !== undefined, id: path.split("/").pop()!, data: () => (data ? structuredClone(data) : undefined) };
    },
    async set(data, options) {
      if (store.fail) throw new Error("store down");
      apply(store, path, data, Boolean(options?.merge));
    },
    collection: (name: string) => collection(`${path}/${name}`),
  });
  const collection = (path: string): Collection => ({ doc: (id: string) => ref(`${path}/${id}`) });
  return {
    collection,
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      if (store.fail) throw new Error("store down");
      const pending: Array<[string, Record<string, unknown>, boolean]> = [];
      const result = await fn({
        get: (r: Ref) => r.get(),
        set: (r: Ref, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          pending.push([r.path, data, Boolean(options?.merge)]);
        },
        // Firestore's update replaces each named top-level field whole, the same as LocalDB's merge.
        update: (r: Ref, data: Record<string, unknown>) => {
          pending.push([r.path, data, true]);
        },
      });
      for (const [path, data, merge] of pending) apply(store, path, data, merge);
      return result;
    },
  };
}
