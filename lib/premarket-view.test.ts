import { describe, expect, it } from "vitest";

import { currentOpeningReport } from "@/lib/premarket-view";
import type { OpeningReport } from "@/lib/premarket-opening";
import type { PremarketMovers } from "@/lib/premarket";

const report = { generated_at: "2026-07-21T09:00:00Z" } as OpeningReport;
const movers = { generated_at: "2026-07-21T09:05:00Z" } as PremarketMovers;

describe("currentOpeningReport", () => {
  it("rejects a cached report older than the live mover snapshot", () => {
    expect(currentOpeningReport(report, movers)).toBeNull();
  });

  it("keeps a report generated after the mover snapshot", () => {
    const fresh = { ...report, generated_at: "2026-07-21T09:06:00Z" };
    expect(currentOpeningReport(fresh, movers)).toBe(fresh);
  });
});
