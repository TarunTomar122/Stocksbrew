import { describe, expect, it } from "vitest";

import { missingShares, sharesPromptWords } from "./shares-prompt";

describe("the My stocks shares prompt", () => {
  it("counts holdings without a share count", () => {
    expect(missingShares([{ shares: 3 }, { shares: null }, { shares: 0 }])).toEqual({ missing: 2, total: 3 });
  });

  it("says nothing when every holding has shares, or there are none", () => {
    expect(sharesPromptWords(0, 5)).toBeNull();
    expect(sharesPromptWords(0, 0)).toBeNull();
  });

  it("says what is missing in a full sentence", () => {
    expect(sharesPromptWords(6, 6)).toBe("None of your 6 holdings has a share count yet, so we cannot show what they are worth or what you made.");
    expect(sharesPromptWords(1, 1)).toBe("Your holding has no share count yet, so we cannot show what it is worth or what you made on it.");
    expect(sharesPromptWords(3, 9)).toBe("3 of your 9 holdings have no share count, so your value and gain leave them out.");
    expect(sharesPromptWords(1, 9)).toBe("1 of your 9 holdings has no share count, so your value and gain leave it out.");
  });
});
