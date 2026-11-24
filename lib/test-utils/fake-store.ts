/**
 * An in-memory stand-in for the Firestore-shaped document store, for tests that run real code over
 * `adminFirestore`: get, set (with merge), update, where/limit queries and transactions. FieldValue
 * sentinels (increment and the like) are stored as they are; nothing here interprets them.
 */

type Doc = Record<string, unknown>;

export type FakeStore = ReturnType<typeof createFakeStore>;

export function createFakeStore() {
  const docs = new Map<string, Doc>();

  function write(path: string, data: Doc, merge: boolean) {
    const current = docs.get(path);
    docs.set(path, merge && current ? { ...current, ...data } : { ...data });
  }

  function ref(collection: string, id: string) {
    const path = `${collection}/${id}`;
    return {
      id,
      path,
      async get() {
        const data = docs.get(path);
        return { exists: data !== undefined, id, data: () => (data ? { ...data } : undefined) };
      },
      async set(data: Doc, options?: { merge?: boolean }) {
        write(path, data, Boolean(options?.merge));
      },
      async update(data: Doc) {
        if (!docs.has(path)) throw new Error(`no document ${path}`);
        write(path, data, true);
      },
      async delete() {
        docs.delete(path);
      },
    };
  }

  function query(collection: string, filters: Array<[string, unknown]>, max: number) {
    return {
      where(field: string, _op: string, value: unknown) {
        return query(collection, [...filters, [field, value]], max);
      },
      limit(n: number) {
        return query(collection, filters, n);
      },
      async get() {
        const prefix = `${collection}/`;
        const out = [...docs.entries()]
          .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
          .filter(([, data]) => filters.every(([field, value]) => data[field] === value))
          .slice(0, max)
          .map(([path, data]) => ({ id: path.slice(prefix.length), data: () => ({ ...data }) }));
        return { docs: out, empty: out.length === 0, size: out.length };
      },
    };
  }

  const firestore = {
    collection(collection: string) {
      return {
        doc: (id: string) => ref(collection, id),
        ...query(collection, [], Number.POSITIVE_INFINITY),
      };
    },
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const tx = {
        get: (r: ReturnType<typeof ref>) => r.get(),
        set: (r: ReturnType<typeof ref>, data: Doc, options?: { merge?: boolean }) => {
          write(r.path, data, Boolean(options?.merge));
        },
        update: (r: ReturnType<typeof ref>, data: Doc) => {
          write(r.path, data, true);
        },
      };
      return fn(tx);
    },
  };

  return { docs, firestore };
}
