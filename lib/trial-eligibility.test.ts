import { describe, expect, it } from "vitest";

import { isTrialEligible } from "@/lib/trial-eligibility";

describe("isTrialEligible", () => {
  it("allows brand-new users", () => {
    expect(isTrialEligible(null)).toBe(true);
    expect(isTrialEligible({})).toBe(true);
  });

  it("denies after explicit trial consumption", () => {
    expect(isTrialEligible({ hasUsedTrial: true })).toBe(false);
  });

  it("denies users who ever subscribed (backfill without hasUsedTrial)", () => {
    expect(isTrialEligible({ subscribedAt: "2026-01-01T00:00:00.000Z" })).toBe(false);
    expect(isTrialEligible({ subscriptionId: "sub_abc" })).toBe(false);
  });

  it("denies churned users with a stale subscription id", () => {
    expect(
      isTrialEligible({
        subscriptionId: "sub_old",
        subscribedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });
});
