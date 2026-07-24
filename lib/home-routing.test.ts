import { describe, expect, it } from "vitest";

import { signedInHomeDestination } from "@/lib/home-routing";

describe("signedInHomeDestination", () => {
  it("sends signed-in root visits directly to Radar", () => {
    expect(signedInHomeDestination(true)).toBe("/watchlist");
  });

  it("keeps signed-out root visits on the public landing page", () => {
    expect(signedInHomeDestination(false)).toBeNull();
  });
});
