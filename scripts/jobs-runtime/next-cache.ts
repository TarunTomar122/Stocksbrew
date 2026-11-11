/**
 * "next/cache" for the scheduled jobs (scripts/jobs.config.ts). Outside a
 * Next server `unstable_cache` throws ("incrementalCache missing"), so this
 * stands in for it inside one job process, the way Next's data cache behaves
 * in the app: one entry per key parts plus arguments, shared by every caller,
 * kept for `revalidate` seconds (for the whole run when it is false or left
 * out). As in Next, the call that fills an entry gets the value itself and
 * later calls get a JSON copy, so nobody can change what another caller sees.
 * A failed call is not kept. Nothing outlives the process.
 *
 * The revalidation calls have no cache to clear here and do nothing.
 */
type Entry = { json: string; expires: number };

const entries = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();

export function unstable_cache<T extends (...args: never[]) => Promise<unknown>>(
  fn: T,
  keyParts?: string[],
  options?: { revalidate?: number | false; tags?: string[] },
): T {
  const prefix = JSON.stringify(keyParts ?? [fn.toString()]);
  const ttlMs = typeof options?.revalidate === "number" ? options.revalidate * 1000 : Number.POSITIVE_INFINITY;
  const cached = async (...args: Parameters<T>) => {
    // Keyed on JSON, like Next: arguments that do not survive JSON (a Map, a Date, undefined in an
    // array) can collide. The cached loaders in lib/ take strings and numbers.
    const key = `${prefix}${JSON.stringify(args)}`;
    const hit = entries.get(key);
    if (hit && hit.expires > Date.now()) return JSON.parse(hit.json);
    const inFlight = pending.get(key);
    if (inFlight) return inFlight.then((value) => (value === undefined ? value : JSON.parse(JSON.stringify(value))));
    const call = fn(...args);
    pending.set(key, call);
    try {
      const value = await call;
      if (value !== undefined) entries.set(key, { json: JSON.stringify(value), expires: Date.now() + ttlMs });
      return value;
    } finally {
      pending.delete(key);
    }
  };
  return cached as unknown as T;
}

export function revalidateTag(_tag: string): void {}

export function revalidatePath(_path: string, _type?: "layout" | "page"): void {}

export function unstable_noStore(): void {}

/** For tests: forget every entry. */
export function clearJobsCacheForTests(): void {
  entries.clear();
  pending.clear();
}
