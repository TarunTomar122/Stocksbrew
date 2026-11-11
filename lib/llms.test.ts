import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * llms.txt is what an AI engine reads about us. Its facts block is generated
 * from the files the product enforces; these tests fail when the words and
 * those files disagree, on both Free/Pro lines (PAYWALL_V2 off and on).
 */

const ROOT = path.resolve(__dirname, "..");

/** The module graph as the build sees it with PAYWALL_V2 set to `flag` ("" or "1", the values next.config.js inlines). */
async function loadWithFlag(flag: "" | "1") {
  vi.resetModules();
  vi.stubEnv("PAYWALL_V2", flag);
  const llms = await import("@/lib/llms");
  const entitlements = await import("@/lib/entitlements");
  const pricing = await import("@/lib/pricing");
  const brand = await import("@/lib/brand-copy");
  const plain = await import("@/lib/plain-copy");
  return { llms, entitlements, pricing, brand, plain };
}

function num(text: string, pattern: RegExp): number {
  const match = pattern.exec(text);
  expect(match, String(pattern)).not.toBeNull();
  return Number(match![1]);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("llms.txt facts", () => {
  it("reads the same PAYWALL_V2 value that next.config.js inlines into the build", async () => {
    for (const flag of ["", "1"] as const) {
      vi.stubEnv("PAYWALL_V2", flag);
      // next.config.js normalises the variable; the flag module must agree with what it inlines.
      const configPath = path.join(ROOT, "next.config.js");
      delete require.cache[require.resolve(configPath)];
      const config = require(configPath) as { env?: Record<string, string> };
      const { llms } = await loadWithFlag(flag);
      const flagModule = await import("@/lib/paywall-flag");
      expect(flagModule.PAYWALL_V2).toBe(config.env?.PAYWALL_V2 === "1");
      expect(llms.buildFactsMarkdown()).toContain(`full report (`);
    }
  });

  for (const flag of ["", "1"] as const) {
    it(`states the plans exactly as the entitlements table enforces them (PAYWALL_V2=${flag || "off"})`, async () => {
      const { llms, entitlements, pricing, brand, plain } = await loadWithFlag(flag);
      const features = entitlements.buildFeatures(flag === "1");
      const text = llms.buildFactsMarkdown();
      const free = text.slice(text.indexOf("- Free plan"), text.indexOf("- Pro:"));
      const pro = text.slice(text.indexOf("- Pro:"), text.indexOf("- Plans and limits"));

      const rule = (id: keyof typeof features, plan: "free" | "pro") => {
        const r = features[id][plan];
        if (r.kind !== "count" && r.kind !== "meter") throw new Error(`${String(id)} ${plan} is ${r.kind}, the facts need a number`);
        return r.max;
      };

      // Free
      expect(num(free, /on (\d+) stocks? you pick/)).toBe(rule("covered_stocks", "free"));
      expect(num(free, /(\d+) agents? running at a time/)).toBe(rule("agents", "free"));
      expect(num(free, /(\d+) questions a day in Ask/)).toBe(rule("ask", "free"));
      expect(num(free, /(\d+) long research reports a month/)).toBe(rule("deep_research", "free"));
      expect(num(free, /(\d+) price alerts? by email/)).toBe(rule("price_alerts", "free"));
      expect(features.stock_call.anon.kind).toBe("open");
      expect(free).toContain(features.agent_events.free.kind === "locked" ? "filings and news are Pro" : "filings and news as well");

      // Pro
      expect(num(pro, /\$(\d+) a month/)).toBe(pricing.US_PRO_MONTHLY);
      expect(num(pro, /\$(\d+) a year/)).toBe(pricing.US_PRO_YEARLY);
      expect(num(pro, /up to (\d+) agents/)).toBe(rule("agents", "pro"));
      expect(num(pro, /(\d+) questions a day in Ask/)).toBe(rule("ask", "pro"));
      expect(num(pro, /(\d+) long research reports a month/)).toBe(rule("deep_research", "pro"));
      expect(num(pro, /(\d+)-day free trial/)).toBe(pricing.US_PRO_TRIAL_DAYS);
      expect(features.covered_stocks.pro.kind).toBe("open");

      // The call and its coverage, in the words a reader sees.
      for (const word of Object.values(plain.CALL_PLAIN)) expect(text).toContain(word);
      expect(text).toContain(brand.CALL_COVERAGE);
      expect(text).toContain("not personal investment advice");
      expect(text).not.toMatch(/Infinity|NaN|undefined/);
    });
  }

  it("points at the pages that carry the same facts, with a real check date", async () => {
    const { llms } = await loadWithFlag("");
    const text = llms.buildFactsMarkdown();
    expect(text).toContain("https://www.stocksbrew.online/pricing");
    expect(text).toContain("https://www.stocksbrew.online/docs/start/free-vs-pro");
    expect(text).toContain(`checked on ${llms.FACTS_CHECKED}`);
    expect(llms.FACTS_CHECKED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Date.parse(`${llms.FACTS_CHECKED}T00:00:00Z`)).toBeLessThanOrEqual(Date.now() + 36 * 3600 * 1000);
  });

  it("every 'N-day trial' the app promises matches US_PRO_TRIAL_DAYS", async () => {
    const { pricing } = await loadWithFlag("");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        // Dev-only demos (app/dev, components/dev) are mock screens, not promises to a customer.
        if (name === "node_modules" || name === "dev" || name.startsWith(".")) continue;
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        // lib/compare-data.ts quotes other products' trials (Zacks has a 30-day one), not ours.
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== "compare-data.ts") files.push(full);
      }
    };
    for (const dir of ["app", "components", "lib"]) walk(path.join(ROOT, dir));
    const found: string[] = [];
    for (const file of files) {
      for (const match of readFileSync(file, "utf8").matchAll(/\b(\d+)-day (?:free )?trial/gi)) {
        found.push(`${path.relative(ROOT, file)}: ${match[0]}`);
        expect(Number(match[1]), `${path.relative(ROOT, file)} says "${match[0]}"`).toBe(pricing.US_PRO_TRIAL_DAYS);
      }
    }
    expect(found.length).toBeGreaterThan(0);
  });
});
