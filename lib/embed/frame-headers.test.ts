import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// The same matcher Next 13.5 builds for next.config.js headers (server/lib/router-utils/filesystem.js buildCustomRoute).
const require = createRequire(import.meta.url);
const { getPathMatch } = require("next/dist/shared/lib/router/utils/path-match") as {
  getPathMatch: (source: string, options: Record<string, unknown>) => (pathname: string) => false | object;
};
const nextConfig = require("../../next.config.js") as { headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>> };

async function headersFor(pathname: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const rule of await nextConfig.headers()) {
    const match = getPathMatch(rule.source, { strict: true, removeUnnamedParams: true, sensitive: false });
    if (match(pathname)) for (const header of rule.headers) out[header.key] = header.value;
  }
  return out;
}

describe("frame policy (next.config.js headers)", () => {
  it("lets any site frame the stock widget", async () => {
    for (const path of ["/embed/stock/NVDA", "/embed/stock/BRK.B/dark", "/embed"]) {
      const headers = await headersFor(path);
      expect(headers["Content-Security-Policy"], path).toBeUndefined();
      expect(headers["X-Content-Type-Options"], path).toBe("nosniff");
    }
  });

  it("keeps every other page framed only by our own sites", async () => {
    for (const path of ["/", "/stock/NVDA", "/widgets", "/embedded", "/embeds/stock/NVDA", "/docs/embed", "/profile", "/admin"]) {
      expect((await headersFor(path))["Content-Security-Policy"], path).toBe("frame-ancestors 'self' https://rankinpublic.xyz");
    }
  });
});
