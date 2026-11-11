/**
 * A small hook into Next.js 13.5 internals, kept in one place so an upgrade
 * has one file to check. Server only. A no-op outside a Next render (jobs,
 * scripts, tests).
 *
 * Store reads stay out of Next's Data Cache without help from here: they go
 * through undici's own fetch, not the global one Next patches (see
 * localDbFetch in lib/local-firestore.ts).
 */
import { staticGenerationAsyncStorage } from "next/dist/client/components/static-generation-async-storage.external";

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
