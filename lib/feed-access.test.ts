import { describe, expect, it } from "vitest";

import { redactScannerItemsAfterLimit, resolveFeedAccess } from "@/lib/feed-access";

describe("feed access", () => {
  it("gives a signed-in free account a real unlock over anonymous browsing", () => {
    expect(resolveFeedAccess({ signedIn: false, isSubscribed: false }).fullItemLimit).toBe(4);
    expect(resolveFeedAccess({ signedIn: true, isSubscribed: false }).fullItemLimit).toBe(6);
    expect(resolveFeedAccess({ signedIn: true, isSubscribed: true }).fullItemLimit).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("redacts independently after the allowance on each side of the tape", () => {
    const rows = [
      ...Array.from({ length: 7 }, (_, index) => ({
        changePct: index + 1,
        headline: `up-${index}`,
      })),
      ...Array.from({ length: 7 }, (_, index) => ({
        changePct: -(index + 1),
        headline: `down-${index}`,
      })),
    ];

    const redacted = redactScannerItemsAfterLimit(rows, 6);
    expect(redacted[5]?.headline).toBe("up-5");
    expect(redacted[6]?.headline).toBeUndefined();
    expect(redacted[12]?.headline).toBe("down-5");
    expect(redacted[13]?.headline).toBeUndefined();
  });
});
