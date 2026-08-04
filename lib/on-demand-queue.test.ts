import { describe, expect, it } from "vitest";

import { ON_DEMAND_INTEL_TTL_MS, isOnDemandIntelFresh } from "@/lib/stock-demand-policy";

describe("on-demand intelligence freshness", () => {
  const now = Date.parse("2026-08-04T12:00:00.000Z");

  it("requires both useful brief text and a current timestamp", () => {
    expect(
      isOnDemandIntelFresh(
        { today_brief: "Fresh, sourced brief.", generated_at: "2026-08-04T08:00:00.000Z" },
        now,
      ),
    ).toBe(true);
    expect(
      isOnDemandIntelFresh({ today_brief: "", generated_at: "2026-08-04T08:00:00.000Z" }, now),
    ).toBe(false);
    expect(isOnDemandIntelFresh({ today_brief: "Missing timestamp" }, now)).toBe(false);
  });

  it("expires old briefs at the configured TTL", () => {
    expect(
      isOnDemandIntelFresh(
        { headline: "Old brief", generated_at: new Date(now - ON_DEMAND_INTEL_TTL_MS).toISOString() },
        now,
      ),
    ).toBe(false);
  });

  it("does not accept future-dated content", () => {
    expect(
      isOnDemandIntelFresh(
        { body: "Future brief", generated_at: "2026-08-05T08:00:00.000Z" },
        now,
      ),
    ).toBe(false);
  });
});
