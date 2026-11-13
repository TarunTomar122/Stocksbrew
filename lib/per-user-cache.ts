import { createHash } from "node:crypto";

/**
 * A short in-memory cache for one person's heavy derived data (their built
 * briefing, say), so opening the same page again within a minute skips the
 * reads behind it. Server only.
 *
 * Safety rules, enforced here rather than left to callers:
 *  - every entry belongs to one uid: the uid is part of the key, and a value
 *    is only ever returned to a lookup with that same uid. An empty uid is refused.
 *  - the caller's `key` must change whenever an input changes (use
 *    `fingerprint` over the inputs), so an edit shows on the next request,
 *    not after the cache runs out.
 *  - failed loads are never kept, and `keep` can refuse a result (a degraded
 *    read) so it is built again next time.
 *  - it lives in one server instance's memory: nothing is shared across
 *    instances or written anywhere, and it is gone on the next deploy.
 *
 * Values are shared by that person's requests inside the window: treat them as
 * read-only.
 */
export type PerUserCache<T> = {
  get(uid: string, key: string, load: () => Promise<T>): Promise<T>;
  /** Whether an entry for this uid (under any key) is still inside its window: a `get` for them will likely be a hit. */
  has(uid: string): boolean;
  /** For tests. */
  size(): number;
};

type Entry<T> = { uid: string; at: number; value: Promise<T> };

export function perUserCache<T>(options: {
  ttlMs: number;
  /** Most entries kept at once; the oldest goes first. */
  max: number;
  /** Return false to not keep this result (it is still returned to this caller). */
  keep?: (value: T) => boolean;
  now?: () => number;
}): PerUserCache<T> {
  const entries = new Map<string, Entry<T>>();
  const now = options.now ?? Date.now;
  const slot = (uid: string, key: string) => `${uid}\u0000${key}`;

  return {
    get(uid, key, load) {
      if (!uid) throw new Error("perUserCache: a uid is required");
      const id = slot(uid, key);
      const hit = entries.get(id);
      if (hit && hit.uid === uid && now() - hit.at < options.ttlMs) return hit.value;
      if (hit) entries.delete(id);
      const value = load();
      const entry: Entry<T> = { uid, at: now(), value };
      entries.set(id, entry);
      while (entries.size > options.max) {
        const oldest = entries.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      const drop = () => {
        if (entries.get(id) === entry) entries.delete(id);
      };
      value.then((result) => {
        if (options.keep && !options.keep(result)) drop();
      }, drop);
      return value;
    },
    has(uid) {
      if (!uid) return false;
      const at = now();
      for (const entry of entries.values()) if (entry.uid === uid && at - entry.at < options.ttlMs) return true;
      return false;
    },
    size() {
      return entries.size;
    },
  };
}

/** A short stable digest of JSON-safe inputs, for cache keys. Key order matters, so build the object the same way each time. */
export function fingerprint(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value) ?? "undefined").digest("base64url");
}
