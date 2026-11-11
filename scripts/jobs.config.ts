import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/**
 * The vite-node config for the TypeScript jobs the VPS runs on a schedule
 * (backend/agentdata/schedule.py): scripts/run-agent-jobs.ts and
 * scripts/run-reason-checks.ts. Same "@" alias as the app, plus two stand-ins
 * for what only exists inside a Next server (React's `cache` and
 * `unstable_cache`), see scripts/jobs-runtime/.
 *
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/run-agent-jobs.ts --dry
 */
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const REACT_SHIM = here("./jobs-runtime/react.ts");
const NEXT_CACHE_SHIM = here("./jobs-runtime/next-cache.ts");

function jobsRuntime(): Plugin {
  return {
    name: "stocksbrew-jobs-runtime",
    enforce: "pre",
    resolveId(id, importer) {
      // The shim itself re-exports the real React, so its own import resolves normally.
      // (React's exports map has no "./index.js", so the shim cannot name the file directly.)
      if (id === "react" && importer?.split("?")[0] !== REACT_SHIM) return REACT_SHIM;
      if (id === "next/cache") return NEXT_CACHE_SHIM;
      return null;
    },
  };
}

export default defineConfig({
  plugins: [jobsRuntime()],
  resolve: {
    alias: { "@": here("../") },
  },
});
