/**
 * "react" for the scheduled jobs (scripts/jobs.config.ts). The app's server
 * code wraps loaders in React's `cache`, which only exists inside Next's own
 * React build; plain React 18.2 under vite-node has none, so every job that
 * imported lib/watchlist.ts died at import. Here `cache` is a pass-through:
 * a batch job has no request to memoise for, and a cache shared across every
 * user it walks would be wrong anyway.
 */
// @ts-expect-error React's types use `export =`; at run time the package has named exports, and they pass through.
export * from "react";

export function cache<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}
