import { describe, expect, it } from "vitest";

import { etClock, etDayOfStamp, newestStamp, oldestStamp, pricedAt } from "@/lib/quote-time";

describe("quote time", () => {
  it("picks the newest instant whatever the offset spelling", () => {
    expect(newestStamp(["2026-11-11T14:56:00+00:00", "2026-11-11T20:03:00Z", null, "nope", "2026-11-11T20:02:00+00:00"])).toBe("2026-11-11T20:03:00Z");
    // A later string that is an earlier instant does not win.
    expect(newestStamp(["2026-11-11T15:00:00-05:00", "2026-11-11T19:59:00Z"])).toBe("2026-11-11T15:00:00-05:00");
    expect(newestStamp([])).toBeNull();
    expect(newestStamp([undefined, ""])).toBeNull();
    expect(oldestStamp(["2026-11-11T20:03:00Z", "2026-11-11T14:56:00+00:00", null])).toBe("2026-11-11T14:56:00+00:00");
  });

  it("ignores a bare day, which is no quote time", () => {
    expect(etClock("2026-11-11")).toBeNull();
    expect(etDayOfStamp("2026-11-11")).toBeNull();
    expect(oldestStamp(["2026-11-11", "2026-11-11T20:03:00Z"])).toBe("2026-11-11T20:03:00Z");
  });

  it("reads a stamp in New York time", () => {
    expect(etClock("2026-11-11T14:56:00+00:00")).toBe("9:56 AM ET");
    expect(etClock("bad")).toBeNull();
    // 1 AM UTC on Nov 12 is still Nov 11 in New York.
    expect(etDayOfStamp("2026-11-12T01:00:00Z")).toBe("2026-11-11");
  });

  it("says when a day's moves were priced, not when they were researched", () => {
    // CRWV, NBIS and SNDK on Nov 11: priced at 9:55-9:56 AM, researched at 9:58 AM.
    expect(pricedAt(["2026-11-11T14:56:00+00:00", "2026-11-11T14:56:00+00:00"], "2026-11-11")).toBe("9:56 AM ET");
    // Moves priced a minute apart are dated by the earlier one.
    expect(pricedAt(["2026-11-11T14:56:00+00:00", "2026-11-11T14:55:00+00:00"], "2026-11-11")).toBe("9:55 AM ET");
    // A quote from another day says nothing about this one.
    expect(pricedAt(["2026-11-10T20:59:00Z", null], "2026-11-11")).toBeNull();
  });
});
