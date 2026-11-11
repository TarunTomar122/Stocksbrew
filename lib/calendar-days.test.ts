import { describe, expect, it } from "vitest";

import { dayDiff, daysUntilET, weekWordFor } from "@/lib/calendar-shared";
import { withFreshEarningsGap } from "@/lib/screener";

describe("one New York day boundary", () => {
  it("counts from New York's day, not UTC's, late in the evening", () => {
    // 10:53 PM in New York on Nov 10 is already Nov 11 in UTC; NVDA reports Nov 17.
    const lateEvening = Date.parse("2026-11-11T03:53:00Z");
    expect(daysUntilET("2026-11-17", lateEvening)).toBe(7);
    expect(daysUntilET("2026-11-17", Date.parse("2026-11-11T15:00:00Z"))).toBe(6);
    expect(daysUntilET("not a day", lateEvening)).toBeNull();
    expect(dayDiff("2026-11-10", "2026-11-17T21:00:00Z")).toBe(7);
  });

  it("names the week by the calendar: next Tuesday is next week, even inside seven days", () => {
    expect(weekWordFor("2026-11-13", "2026-11-10")).toBe("this week");
    expect(weekWordFor("2026-11-17", "2026-11-10")).toBe("next week");
    expect(weekWordFor("2026-11-30", "2026-11-10")).toBeNull();
    expect(weekWordFor("2026-11-09", "2026-11-10")).toBeNull();
    // On a Saturday, Monday is next week.
    expect(weekWordFor("2026-11-16", "2026-11-14")).toBe("next week");
  });

  it("recounts the screener's stored days to earnings against today", () => {
    const row = { symbol: "NVDA", earnings_date: "2026-11-17", earnings_in_days: 6 } as Parameters<typeof withFreshEarningsGap>[0];
    expect(withFreshEarningsGap(row, "2026-11-10").earnings_in_days).toBe(7);
    expect(withFreshEarningsGap(row, "2026-11-18").earnings_in_days).toBeUndefined();
    expect(withFreshEarningsGap(row, "2026-11-11")).toBe(row);
  });
});
