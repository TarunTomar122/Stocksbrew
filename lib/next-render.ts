/**
 * Two small hooks into Next.js 13.5 internals, kept in one place so an
 * upgrade has one file to check. Server only. Both are no-ops outside a
 * Next render (jobs, scripts, tests).
 */
import { staticGenerationAsyncStorage } from "next/dist/client/components/static-generation-async-storage.external";

type FetchFn = typeof fetch;

/**
 * `fetch` without Next's Data Cache. Next patches the global fetch and, on a
 * page built for the CDN (the cached signed-out pages, lib/anon-view.ts),
 * would store every response in the Data Cache, which outlives deploys and
 * can hand a rebuild a store read of any age. `cache: "no-store"` is no way
 * out: it makes those pages render on every request again. Next keeps the
 * unpatched fetch on `globalThis._nextOriginalFetch` (next/dist/server/lib/patch-fetch.js).
 */
export function uncachedFetch(input: string, init?: RequestInit): Promise<Response> {
  const original = (globalThis as { _nextOriginalFetch?: FetchFn })._nextOriginalFetch;
  return (original ?? fetch)(input, init);
}

/** How long a copy built from failed reads is kept before the next request rebuilds it. */
const DEGRADED_REVALIDATE_SECONDS = 10;

/**
 * Called when a store read fails. If this render is building a cached page,
 * the copy is kept for seconds instead of a minute (or ten), so a blip does
 * not stick. Live renders are untouched.
 */
export function noteDegradedRender(): void {
  try {
    const store = staticGenerationAsyncStorage.getStore();
    if (!store?.isStaticGeneration) return;
    // 0 would mean "never cache"; leave that, and a shorter life, as they are.
    if (store.revalidate === 0) return;
    if (store.revalidate === undefined || store.revalidate === false || store.revalidate > DEGRADED_REVALIDATE_SECONDS) {
      store.revalidate = DEGRADED_REVALIDATE_SECONDS;
    }
  } catch {
    // Never let the bookkeeping break a read.
  }
}
