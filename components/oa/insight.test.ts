import { describe, expect, it } from "vitest";

import { stripLeadingTicker } from "./insight";

describe("stripLeadingTicker", () => {
  it("drops a labelled ticker and capitalises", () => {
    expect(stripLeadingTicker("SMR: our call moved to Hold", "SMR")).toBe("Our call moved to Hold");
    expect(stripLeadingTicker("VST — is in its add zone", "VST")).toBe("Is in its add zone");
  });
  it("drops a ticker used as the subject", () => {
    expect(stripLeadingTicker("SMR rose 7% today", "SMR")).toBe("rose 7% today");
  });
  it("leaves other sentences alone", () => {
    expect(stripLeadingTicker("SMRT rose", "SMR")).toBe("SMRT rose");
    expect(stripLeadingTicker("Chips led, with SMR up", "SMR")).toBe("Chips led, with SMR up");
    expect(stripLeadingTicker("SMR", "SMR")).toBe("SMR");
  });
});
