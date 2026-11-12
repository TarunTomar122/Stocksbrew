import { describe, expect, it } from "vitest";

import { absoluteDay, capitalize, dayPossessive, daysFromToday, dayWords, etDayOf, etToday, onDayWords, stampWords, weekdayName } from "./day-words";

// Thursday, Nov 12 2026.
const TODAY = "2026-11-12";

describe("etDayOf", () => {
  it("keeps a plain day as it is", () => {
    expect(etDayOf("2026-11-11")).toBe("2026-11-11");
  });

  it("turns a timestamp into its New York day, not the UTC one", () => {
    // 9:30 PM ET on Nov 11 is already Nov 12 in UTC.
    expect(etDayOf("2026-11-12T02:30:00Z")).toBe("2026-11-11");
    expect(etDayOf("2026-11-12T05:30:00Z")).toBe("2026-11-12");
    expect(etDayOf(new Date("2026-11-12T15:00:00Z"))).toBe("2026-11-12");
  });

  it("rejects what is not a day", () => {
    expect(etDayOf(null)).toBeNull();
    expect(etDayOf("")).toBeNull();
    expect(etDayOf("soon")).toBeNull();
    expect(etDayOf("2026-13-01")).toBeNull();
    expect(etDayOf("Nov 11")).toBeNull();
    // Not real days, and a time with no zone.
    expect(etDayOf("2026-11-31")).toBeNull();
    expect(etDayOf("2026-02-29")).toBeNull();
    expect(etDayOf("2028-02-29")).toBe("2028-02-29");
    expect(etDayOf("2026-11-12T01:00:00")).toBeNull();
    expect(etDayOf("2026-11-12T01:00:00+00:00")).toBe("2026-11-11");
  });
});

describe("etToday", () => {
  it("is the New York day, which lags UTC in the evening", () => {
    expect(etToday(Date.parse("2026-11-13T03:00:00Z"))).toBe("2026-11-12");
    expect(etToday(Date.parse("2026-11-13T06:00:00Z"))).toBe("2026-11-13");
  });
});

describe("dayWords", () => {
  it("says today, yesterday and tomorrow", () => {
    expect(dayWords("2026-11-12", TODAY)).toBe("today");
    expect(dayWords("2026-11-11", TODAY)).toBe("yesterday");
    expect(dayWords("2026-11-13", TODAY)).toBe("tomorrow");
  });

  it("names the weekday within the last six days", () => {
    expect(dayWords("2026-11-10", TODAY)).toBe("Tuesday");
    expect(dayWords("2026-11-09", TODAY)).toBe("Monday");
    expect(dayWords("2026-11-06", TODAY)).toBe("Friday");
  });

  it("says the date a week or more back", () => {
    expect(dayWords("2026-11-05", TODAY)).toBe("Nov 5");
    expect(dayWords("2026-11-03", TODAY)).toBe("Nov 3");
    expect(dayWords("2026-10-30", TODAY)).toBe("Oct 30");
  });

  it("names the weekday within six days ahead, and the date past that", () => {
    expect(dayWords("2026-11-14", TODAY)).toBe("Saturday");
    expect(dayWords("2026-11-17", TODAY)).toBe("Tuesday");
    expect(dayWords("2026-11-18", TODAY)).toBe("Wednesday");
    expect(dayWords("2026-11-19", TODAY)).toBe("Nov 19");
    expect(dayWords("2026-12-10", TODAY)).toBe("Dec 10");
  });

  it("means the calendar day before by yesterday, not the last trading day", () => {
    // Monday morning: Friday's close is "Friday", Sunday is "yesterday".
    expect(dayWords("2026-11-13", "2026-11-16")).toBe("Friday");
    expect(dayWords("2026-11-15", "2026-11-16")).toBe("yesterday");
    // Saturday: the Friday close is yesterday's.
    expect(dayWords("2026-11-13", "2026-11-14")).toBe("yesterday");
  });

  it("names the last close by its weekday after a market holiday", () => {
    // The Friday after Thanksgiving (Thu Nov 26): Wednesday was the last full session.
    expect(dayWords("2026-11-25", "2026-11-27")).toBe("Wednesday");
    // Monday after New Year's Day (Fri Jan 1 2027): the last close was Thursday Dec 31.
    expect(dayWords("2026-12-31", "2027-01-04")).toBe("Thursday");
  });

  it("adds the year only when it is not this year", () => {
    expect(dayWords("2026-12-31", "2027-01-01")).toBe("yesterday");
    expect(dayWords("2026-12-28", "2027-01-04")).toBe("Dec 28, 2026");
    expect(dayWords("2025-11-12", TODAY)).toBe("Nov 12, 2025");
    expect(dayWords("2027-01-02", "2026-12-31")).toBe("Saturday");
    expect(dayWords("2027-01-08", "2026-12-31")).toBe("Jan 8, 2027");
  });

  it("reads a timestamp by its New York day", () => {
    // 9:30 PM ET yesterday, already today in UTC.
    expect(dayWords("2026-11-12T02:30:00Z", TODAY)).toBe("yesterday");
    expect(dayWords("2026-11-12T14:30:00.000Z", TODAY)).toBe("today");
  });

  it("is empty for anything that is not a day", () => {
    expect(dayWords(null, TODAY)).toBe("");
    expect(dayWords("", TODAY)).toBe("");
    expect(dayWords("not a day", TODAY)).toBe("");
    expect(dayWords("2026-11-11", "garbage")).toBe("");
  });

  it("defaults today to the New York day now", () => {
    expect(dayWords(etToday())).toBe("today");
  });
});

describe("onDayWords", () => {
  it("puts 'on' before a weekday or a date only", () => {
    expect(onDayWords("2026-11-12", TODAY)).toBe("today");
    expect(onDayWords("2026-11-11", TODAY)).toBe("yesterday");
    expect(onDayWords("2026-11-13", TODAY)).toBe("tomorrow");
    expect(onDayWords("2026-11-09", TODAY)).toBe("on Monday");
    expect(onDayWords("2026-11-17", TODAY)).toBe("on Tuesday");
    expect(onDayWords("2026-11-03", TODAY)).toBe("on Nov 3");
    expect(onDayWords("2025-11-03", TODAY)).toBe("on Nov 3, 2025");
    expect(onDayWords(null, TODAY)).toBe("");
  });
});

describe("dayPossessive", () => {
  it("is a possessive within the week and 'the' plus the date before", () => {
    expect(dayPossessive("2026-11-12", TODAY)).toBe("today's");
    expect(dayPossessive("2026-11-11", TODAY)).toBe("yesterday's");
    expect(dayPossessive("2026-11-13", "2026-11-16")).toBe("Friday's");
    expect(dayPossessive("2026-11-03", TODAY)).toBe("the Nov 3");
    expect(dayPossessive("", TODAY)).toBe("");
  });
});

describe("stampWords", () => {
  const NOW = Date.parse("2026-11-12T15:00:00Z"); // 10 AM ET, Thursday

  it("shows only the time for today", () => {
    expect(stampWords("2026-11-12T14:41:00Z", NOW)).toBe("9:41 AM ET");
  });

  it("puts the day in words before the time on other days", () => {
    expect(stampWords("2026-11-11T20:59:00Z", NOW)).toBe("yesterday, 3:59 PM ET");
    expect(stampWords("2026-11-09T21:05:00Z", NOW)).toBe("Monday, 4:05 PM ET");
    expect(stampWords("2026-11-03T21:05:00Z", NOW)).toBe("Nov 3, 4:05 PM ET");
    expect(stampWords("2025-11-03T21:05:00Z", NOW)).toBe("Nov 3, 2025, 4:05 PM ET");
  });

  it("uses the New York day, not the UTC one, near midnight", () => {
    // 11:30 PM ET on Nov 11 is Nov 12 in UTC: still yesterday.
    expect(stampWords("2026-11-12T04:30:00Z", NOW)).toBe("yesterday, 11:30 PM ET");
  });

  it("says a plain day without a time", () => {
    expect(stampWords("2026-11-11", NOW)).toBe("yesterday");
  });

  it("is empty without a usable time", () => {
    expect(stampWords(null, NOW)).toBe("");
    expect(stampWords("later", NOW)).toBe("");
  });
});

describe("small pieces", () => {
  it("counts calendar days", () => {
    expect(daysFromToday("2026-11-11", TODAY)).toBe(-1);
    expect(daysFromToday("2026-11-19", TODAY)).toBe(7);
    // Across the DST change (Nov 1 2026) the count stays whole.
    expect(daysFromToday("2026-10-31", "2026-11-02")).toBe(-2);
    expect(daysFromToday("2026-11-02", "2026-10-31")).toBe(2);
    expect(daysFromToday("x", TODAY)).toBeNull();
  });

  it("formats the absolute day", () => {
    expect(absoluteDay("2026-11-03", TODAY)).toBe("Nov 3");
    expect(absoluteDay("2025-11-03", TODAY)).toBe("Nov 3, 2025");
    expect(absoluteDay("2026-11-03")).toBe("Nov 3, 2026");
    expect(absoluteDay(null)).toBe("");
  });

  it("names weekdays and capitalizes", () => {
    expect(weekdayName("2026-11-12")).toBe("Thursday");
    expect(capitalize("yesterday")).toBe("Yesterday");
    expect(capitalize("")).toBe("");
  });
});
