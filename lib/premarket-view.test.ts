import { describe, expect, it } from "vitest";

import { currentOpeningReport } from "@/lib/premarket-view";
import type { OpeningReport } from "@/lib/premarket-opening";
import type { PremarketMovers } from "@/lib/premarket";

const report = {
  generated_at: "2026-07-21T09:00:00Z",
  source_movers_generated_at: "2026-07-21T09:00:00Z",
  premarket: { generated_at: "2026-07-21T09:00:00Z" },
} as OpeningReport;
const movers = { generated_at: "2026-07-21T09:05:00Z" } as PremarketMovers;

describe("currentOpeningReport", () => {
  it("rejects a cached report older than the live mover snapshot", () => {
    expect(currentOpeningReport(report, movers)).toBeNull();
  });

  it("rejects a newer report built from a different mover snapshot", () => {
    const mismatched = { ...report, generated_at: "2026-07-21T09:06:00Z" };
    expect(currentOpeningReport(mismatched, movers)).toBeNull();
  });

  it("keeps a report generated from the exact mover snapshot", () => {
    const fresh = {
      ...report,
      generated_at: "2026-07-21T09:06:00Z",
      source_movers_generated_at: movers.generated_at,
    };
    expect(currentOpeningReport(fresh, movers)).toBe(fresh);
  });
});
