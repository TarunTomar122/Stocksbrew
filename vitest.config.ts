import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    // The CLI package has its own node:test suite (npm test in packages/stocksbrew-cli).
    exclude: [...configDefaults.exclude, "packages/**"],
  },
});
