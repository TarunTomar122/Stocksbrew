/**
 * Work that should finish but must not hold the page: a bookkeeping write, a
 * background re-check. Next 13.5 has no `after()`, so the promise is handed to
 * the platform's request context (what @vercel/functions' `waitUntil` wraps)
 * when there is one, which keeps a Vercel function alive until it settles;
 * elsewhere (next start, dev) the process simply keeps running.
 *
 * The work starts right away (it is already a promise). Its failure is logged
 * with `label` and never reaches the page.
 */
export function afterResponse(label: string, work: Promise<unknown>): void {
  const settled = work.then(
    () => undefined,
    (error: unknown) => {
      console.warn(`[after-response] ${label} failed:`, error instanceof Error ? error.message : error);
    },
  );
  const holder = (globalThis as Record<symbol, unknown>)[Symbol.for("@vercel/request-context")] as
    | { get?: () => { waitUntil?: (promise: Promise<unknown>) => void } | undefined }
    | undefined;
  try {
    holder?.get?.()?.waitUntil?.(settled);
  } catch {
    // No platform context: nothing to extend.
  }
}
