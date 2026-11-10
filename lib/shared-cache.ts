import { unstable_cache } from "next/cache";

/**
 * `unstable_cache` for data that is the same for every visitor, safe to call
 * from anywhere.
 *
 * Two rules for the function you pass in:
 *  - it must THROW when the read fails or comes back unusable, and the caller
 *    catches. Whatever it returns is served to everyone for `revalidate`
 *    seconds, so a swallowed error becomes "no data" for the whole site.
 *  - it must not depend on who is asking. Per-person data belongs in React
 *    `cache` (one request), never here.
 *
 * Results are stored as JSON: return plain objects and arrays, not Maps,
 * Sets or Dates.
 *
 * Outside a Next request (vitest, scripts) there is no cache to use, so the
 * function simply runs.
 */
export function sharedCache<Args extends unknown[], Result>(
  load: (...args: Args) => Promise<Result>,
  keyParts: string[],
  options: { revalidate: number; tags?: string[] },
): (...args: Args) => Promise<Result> {
  const cached = unstable_cache(load, keyParts, options);
  return async (...args: Args): Promise<Result> => {
    try {
      return await cached(...args);
    } catch (error) {
      if (error instanceof Error && error.message.includes("incrementalCache missing")) return load(...args);
      throw error;
    }
  };
}
