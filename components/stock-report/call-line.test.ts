import { describe, expect, it } from "vitest";

import { callMeaning } from "./call-line";

describe("callMeaning", () => {
  it("says a known action another way when it starts with the call word, as a full sentence", () => {
    expect(callMeaning("Keep", "Keep what you own, don't buy more now")).toBe("Keep what you own, but don't buy more for now.");
    expect(callMeaning("Buy more", "Buy more on a dip, not here")).toBe("Wait for a dip before adding.");
    expect(callMeaning("Sell some", "Sell some if it rises")).toBe("Take some profit if the price rises.");
  });

  it("goes on from the chip in sentence case for any other action that starts with the word", () => {
    expect(callMeaning("Keep", "Keep — for now")).toBe("For now.");
    expect(callMeaning("Sell some", "Sell some: it ran too far")).toBe("It ran too far.");
  });

  it("keeps a line that does not start with the word, whole, as a sentence", () => {
    expect(callMeaning("Sell some", "Don't buy more at this price")).toBe("Don't buy more at this price.");
    expect(callMeaning("Keep", "Keeping it is fine")).toBe("Keeping it is fine.");
    expect(callMeaning("Keep", "We'd keep it, not buy more")).toBe("We'd keep it, not buy more.");
  });

  it("is null when the action is only the word, or there is no action", () => {
    expect(callMeaning("Keep", "Keep.")).toBeNull();
    expect(callMeaning("Keep", null)).toBeNull();
    expect(callMeaning(null, "We'd keep it")).toBe("We'd keep it.");
  });
});
