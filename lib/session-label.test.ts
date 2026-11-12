import { describe, expect, it } from "vitest";

import { etWallTimeToUtcMs } from "@/lib/market-session";
import { currentSessionDay, dayLabelFor, sessionDayOf, sessionLabel } from "@/lib/session-label";

function et(y: number, m: number, d: number, hh: number, mm: number): Date {
  return new Date(etWallTimeToUtcMs(y, m, d, hh, mm));
}

describe("sessionDayOf", () => {
  it("puts a stamp after the bell in that day's session", () => {
    expect(sessionDayOf(et(2026, 11, 11, 17, 51))).toBe("2026-11-11"); // the screener's 5:51 PM build
    expect(sessionDayOf(et(2026, 11, 12, 9, 30))).toBe("2026-11-12");
    expect(sessionDayOf("2026-11-12T20:59:00+00:00")).toBe("2026-11-12");
  });

  it("puts a stamp before the bell, on a weekend or a holiday, in the last session that ran", () => {
    expect(sessionDayOf(et(2026, 11, 12, 8, 0))).toBe("2026-11-11");
    expect(sessionDayOf(et(2026, 11, 14, 12, 0))).toBe("2026-11-13"); // Saturday -> Friday
    expect(sessionDayOf(et(2026, 11, 16, 9, 0))).toBe("2026-11-13"); // Monday premarket -> Friday
    expect(sessionDayOf(et(2026, 11, 26, 12, 0))).toBe("2026-11-25"); // Thanksgiving -> Wednesday
  });

  it("reads a plain day as that session, or the trading day before a shut one", () => {
    expect(sessionDayOf("2026-11-10")).toBe("2026-11-10");
    expect(sessionDayOf("2026-11-15")).toBe("2026-11-13"); // Sunday
    expect(sessionDayOf(null)).toBeNull();
    expect(sessionDayOf("not a day")).toBeNull();
  });
});

describe("sessionLabel", () => {
  const thursdayAfternoon = et(2026, 11, 12, 15, 3);

  it("says today only for today's session", () => {
    const label = sessionLabel("2026-11-12T19:00:00Z", thursdayAfternoon)!;
    expect(label).toMatchObject({ day: "2026-11-12", label: "Today", isToday: true, isCurrentSession: true });
  });

  it("says yesterday for the screener built after yesterday's close", () => {
    const label = sessionLabel(et(2026, 11, 11, 17, 51), thursdayAfternoon)!;
    expect(label).toMatchObject({ day: "2026-11-11", label: "Yesterday", isToday: false, isCurrentSession: false });
  });

  it("calls Friday's close the current session over the weekend, but never today", () => {
    const sunday = et(2026, 11, 15, 12, 0);
    const label = sessionLabel(et(2026, 11, 13, 16, 0), sunday)!;
    expect(label).toMatchObject({ label: "Friday", isCurrentSession: true, isToday: false });
    expect(currentSessionDay(sunday)).toBe("2026-11-13");
  });

  it("before the bell, yesterday's close is the current session and says yesterday", () => {
    const morning = et(2026, 11, 12, 8, 0);
    expect(sessionLabel(et(2026, 11, 11, 16, 0), morning)).toMatchObject({ label: "Yesterday", isCurrentSession: true, isToday: false });
  });

  it("names older sessions by weekday, then by date", () => {
    expect(sessionLabel("2026-11-10", thursdayAfternoon)?.label).toBe("Tuesday");
    expect(sessionLabel("2026-11-03", thursdayAfternoon)?.label).toBe("Nov 3");
  });
});

describe("dayLabelFor", () => {
  const now = et(2026, 11, 12, 15, 3);
  it("keeps the today label for today's data and swaps in the real day otherwise", () => {
    expect(dayLabelFor("2026-11-12T19:00:00Z", "Today", now)).toBe("Today");
    expect(dayLabelFor(et(2026, 11, 11, 17, 51), "Today", now)).toBe("Yesterday");
    expect(dayLabelFor(et(2026, 11, 11, 17, 51), "Up today", now, (label) => `Up ${label.words}`)).toBe("Up yesterday");
  });
  it("keeps the today label when there is nothing to judge by", () => {
    expect(dayLabelFor(null, "Today", now)).toBe("Today");
  });
});
