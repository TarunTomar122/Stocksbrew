import { describe, expect, it } from "vitest";

import { callMeaning } from "./call-line";

describe("callMeaning", () => {
  it("goes on from the chip when the action starts with the call word", () => {
    expect(callMeaning("Buy more", "Buy more on a dip, not here")).toBe("on a dip, not here");
    expect(callMeaning("Keep", "Keep what you own, don't buy more now")).toBe("what you own, don't buy more now");
    expect(callMeaning("Keep", "Keep — for now")).toBe("for now");
    expect(callMeaning("Sell some", "Sell some: it ran too far")).toBe("it ran too far");
  });

  it("keeps a line that does not start with the word, whole", () => {
    expect(callMeaning("Sell some", "Don't buy more at this price")).toBe("Don't buy more at this price");
    expect(callMeaning("Keep", "Keeping it is fine")).toBe("Keeping it is fine");
  });

  it("is null when the action is only the word, or there is no action", () => {
    expect(callMeaning("Keep", "Keep.")).toBeNull();
    expect(callMeaning("Keep", null)).toBeNull();
    expect(callMeaning(null, "We'd keep it")).toBe("We'd keep it");
  });
});
