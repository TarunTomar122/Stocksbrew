import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PRO_VALUE_PILLARS } from "@/lib/subscribe-benefits";

const PRODUCT_COPY_FILES = [
  "components/landing-faq.tsx",
  "components/pro-plan-picker.tsx",
  "components/pro-welcome-panel.tsx",
  "components/radar-next/starter-picks.tsx",
  "components/radar-next/states.tsx",
  "components/stock-smart-alerts-rail.tsx",
  "components/subscribe-pricing.tsx",
  "components/terminal-landing-faq.tsx",
  "components/terminal-landing-hero-copy.tsx",
  "components/terminal-landing-pro-section.tsx",
  "components/terminal-landing-testimonials.tsx",
  "components/tier-cta.tsx",
  "components/track-button.tsx",
  "lib/brand-copy.ts",
  "lib/subscribe-benefits.ts",
] as const;

describe("Pro product language", () => {
  it("stays centered on the three Pro outcomes", () => {
    expect(PRO_VALUE_PILLARS.map((pillar) => pillar.id)).toEqual(["calls", "target", "radar"]);
  });

  it("does not use em dashes in product copy", () => {
    const emDash = String.fromCodePoint(0x2014);
    for (const file of PRODUCT_COPY_FILES) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).not.toContain(emDash);
    }
  });
});
