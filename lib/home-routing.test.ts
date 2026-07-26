import { describe, expect, it } from "vitest";

import { signedInHomeDestination } from "@/lib/home-routing";

describe("signedInHomeDestination", () => {
  it("keeps signed-in root visits on the public landing page", () => {
    expect(signedInHomeDestination(true)).toBeNull();
  });

  it("keeps signed-out root visits on the public landing page", () => {
    expect(signedInHomeDestination(false)).toBeNull();
  });
});
