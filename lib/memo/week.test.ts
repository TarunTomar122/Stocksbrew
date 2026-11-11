import { describe, expect, it } from "vitest";

import { sinceCloseWords, weekMoveWords } from "@/lib/memo/week";

describe("the memo week's words", () => {
  it("says 'so far' while the week runs and plain 'this week' once it is done", () => {
    expect(weekMoveWords(false)).toBe("so far this week");
    expect(weekMoveWords(true)).toBe("this week");
  });

  it("names the close a running week is measured from", () => {
    expect(sinceCloseWords("2026-11-06", false)).toBe("since Friday's close");
    // Good Friday closed the market: the week runs from Thursday's close.
    expect(sinceCloseWords("2026-04-02", false)).toBe("since Thursday's close");
  });

  it("says nothing extra for a finished week or an unknown day", () => {
    expect(sinceCloseWords("2026-11-06", true)).toBe("");
    expect(sinceCloseWords(null, false)).toBe("");
    expect(sinceCloseWords("not a day", false)).toBe("");
  });
});
