import { describe, expect, it } from "vitest";

import {
  priceSkipsSession,
  countdownParts,
  countdownTickMs,
  etWallTimeToUtcMs,
  formatCountdown,
  formatNextOpenLabel,
  formatNextOpenPhrase,
  getMarketSessionState,
} from "@/lib/market-session";
import { getMarketStatusBannerCopy } from "@/lib/market-status-copy";

/** Build a Date for an ET wall-clock time so tests don't depend on the host TZ. */
function et(y: number, m: number, d: number, hh: number, mm: number): Date {
  return new Date(etWallTimeToUtcMs(y, m, d, hh, mm));
}

describe("market session state", () => {
  it("reads premarket before the bell with an accurate countdown", () => {
    const state = getMarketSessionState(et(2026, 9, 9, 8, 0)); // Wed
    expect(state.kind).toBe("premarket");
    expect(state.msToOpen).toBe(90 * 60 * 1000);
    expect(state.countdown).toBe("1h 30m");
  });

  it("reads open during regular hours", () => {
    expect(getMarketSessionState(et(2026, 9, 9, 9, 31)).kind).toBe("open");
    expect(getMarketSessionState(et(2026, 9, 9, 12, 0)).kind).toBe("open");
    expect(getMarketSessionState(et(2026, 9, 9, 15, 59)).kind).toBe("open");
  });

  it("reads afterhours after the close", () => {
    expect(getMarketSessionState(et(2026, 9, 9, 16, 1)).kind).toBe("afterhours");
    expect(getMarketSessionState(et(2026, 9, 9, 19, 59)).kind).toBe("afterhours");
  });

  it("reads overnight on weeknights and counts to the morning open", () => {
    const state = getMarketSessionState(et(2026, 9, 9, 23, 0)); // Wed 23:00
    expect(state.kind).toBe("overnight");
    expect(state.msToOpen).toBe(10.5 * 60 * 60 * 1000);
  });

  it("reads weekend on friday night, saturday and sunday", () => {
    expect(getMarketSessionState(et(2026, 9, 11, 21, 0)).kind).toBe("weekend"); // Fri night
    expect(getMarketSessionState(et(2026, 9, 12, 12, 0)).kind).toBe("weekend"); // Sat
    const sunday = getMarketSessionState(et(2026, 9, 13, 12, 0));
    expect(sunday.kind).toBe("weekend");
    expect(sunday.msToOpen).toBe(21.5 * 60 * 60 * 1000); // Mon 9:30 open
  });

  it("reads holidays with a name and skips them for the next open", () => {
    const thanksgiving = getMarketSessionState(et(2026, 11, 26, 10, 0));
    expect(thanksgiving.kind).toBe("holiday");
    expect(thanksgiving.holidayName).toBe("Thanksgiving");

    // The night before a holiday should target Friday's open, not Thursday.
    const eve = getMarketSessionState(et(2026, 11, 25, 21, 0)); // Wed 21:00
    expect(eve.msToOpen).toBe(36.5 * 60 * 60 * 1000);
  });

  it("honors observed July 4th", () => {
    const observed = getMarketSessionState(et(2026, 7, 3, 10, 0)); // Friday
    expect(observed.kind).toBe("holiday");
    expect(observed.holidayName).toBe("Independence Day (observed)");
  });

  it("counts across the DST change correctly", () => {
    // DST ends Sun Nov 1 2026 at 2:00 ET; Monday's open is still 9:30 local.
    const sunday = getMarketSessionState(et(2026, 11, 1, 12, 0));
    expect(sunday.kind).toBe("weekend");
    expect(sunday.msToOpen).toBe(21.5 * 60 * 60 * 1000);
  });

  it("formats countdowns by scale", () => {
    expect(formatCountdown(47 * 60 * 1000 + 12_000)).toBe("47:12");
    expect(formatCountdown(9 * 3_600_000 + 12 * 60_000)).toBe("9h 12m");
    expect(formatCountdown(2 * 86_400_000 + 14 * 3_600_000)).toBe("2d 14h");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});

describe("market status copy", () => {
  it("uses absolute ET-to-UTC conversion", () => {
    // 9:30 ET on 2026-09-09 (EDT) is 13:30 UTC.
    expect(etWallTimeToUtcMs(2026, 9, 9, 9, 30)).toBe(Date.UTC(2026, 8, 9, 13, 30));
    // 9:30 ET on 2026-12-09 (EST) is 14:30 UTC.
    expect(etWallTimeToUtcMs(2026, 12, 9, 9, 30)).toBe(Date.UTC(2026, 11, 9, 14, 30));
  });

  it("resolves exact session boundary seconds", () => {
    expect(getMarketSessionState(et(2026, 9, 9, 9, 29)).kind).toBe("premarket");
    expect(getMarketSessionState(et(2026, 9, 9, 9, 30)).kind).toBe("open");
    expect(getMarketSessionState(et(2026, 9, 9, 15, 59)).kind).toBe("open");
    expect(getMarketSessionState(et(2026, 9, 9, 16, 0)).kind).toBe("afterhours");
    expect(getMarketSessionState(et(2026, 9, 9, 19, 59)).kind).toBe("afterhours");
    expect(getMarketSessionState(et(2026, 9, 9, 20, 0)).kind).toBe("overnight");
    expect(getMarketSessionState(et(2026, 9, 11, 20, 0)).kind).toBe("weekend");
  });

  it("skips a holiday before the bell", () => {
    // Thanksgiving 08:00 should target Friday's open.
    const state = getMarketSessionState(et(2026, 11, 26, 8, 0));
    expect(state.kind).toBe("holiday");
    expect(state.msToOpen).toBe(25.5 * 60 * 60 * 1000);
  });

  it("computes holidays for any year, not a fixed table", () => {
    expect(getMarketSessionState(et(2028, 12, 25, 10, 0)).holidayName).toBe("Christmas Day");
    // Jan 1 2028 is a Saturday, so NYSE observes it Friday Dec 31 2027.
    expect(getMarketSessionState(et(2027, 12, 31, 10, 0)).holidayName).toBe("New Year's Day (observed)");
    // Good Friday 2030: Easter Mar 31 2030, so Apr 19 2030 is a holiday.
    expect(getMarketSessionState(et(2030, 4, 19, 10, 0)).kind).toBe("holiday");
  });

  it("returns the right banner copy per state", () => {
    expect(getMarketStatusBannerCopy(getMarketSessionState(et(2026, 9, 12, 12, 0)))?.headline).toContain("touch some grass");
    expect(getMarketStatusBannerCopy(getMarketSessionState(et(2026, 9, 13, 12, 0)))?.headline).toContain("Still Sunday");
    const fridayNight = getMarketStatusBannerCopy(getMarketSessionState(et(2026, 9, 11, 21, 0)));
    expect(fridayNight?.state).toBe("weekend_friday");
    expect(fridayNight?.headline).toBe("Markets are closed for the weekend.");
    const holiday = getMarketStatusBannerCopy(getMarketSessionState(et(2026, 11, 26, 12, 0)));
    expect(holiday?.headline).toContain("Thanksgiving");
    expect(getMarketStatusBannerCopy(getMarketSessionState(et(2026, 9, 9, 8, 0)))?.state).toBe("premarket");
    expect(getMarketStatusBannerCopy(getMarketSessionState(et(2026, 9, 9, 17, 0)))?.state).toBe("afterhours");
    expect(getMarketStatusBannerCopy(getMarketSessionState(et(2026, 9, 9, 12, 0)))).toBeNull();
    expect(getMarketStatusBannerCopy(getMarketSessionState(et(2026, 9, 9, 22, 0)))).toBeNull();
  });
});

describe("countdown clock helpers", () => {
  it("splits milliseconds into clock parts", () => {
    const ms = ((2 * 24 + 14) * 3600 + 3 * 60 + 9) * 1000;
    expect(countdownParts(ms)).toEqual({ days: 2, hours: 14, minutes: 3, seconds: 9 });
    expect(countdownParts(-500)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it("phrases the next open as a sentence tail", () => {
    expect(formatNextOpenPhrase(et(2026, 9, 9, 8, 0))).toBe("at 9:30 AM ET");
    expect(formatNextOpenPhrase(et(2026, 9, 13, 12, 0))).toBe("Monday, Sep 14 at 9:30 AM ET");
  });

  it("labels the next open in ET", () => {
    // Sunday noon ET -> Monday's open with the date.
    expect(formatNextOpenLabel(et(2026, 9, 13, 12, 0))).toBe("Monday, Sep 14, 9:30 AM ET");
    // Same-day premarket -> just the time.
    expect(formatNextOpenLabel(et(2026, 9, 9, 8, 0))).toBe("9:30 AM ET");
    // Friday night -> Monday with the date.
    expect(formatNextOpenLabel(et(2026, 9, 11, 21, 0))).toBe("Monday, Sep 14, 9:30 AM ET");
  });
});

describe("countdown cadence", () => {
  it("ticks fast under an hour, slower beyond", () => {
    expect(countdownTickMs(30 * 60_000)).toBe(1_000);
    expect(countdownTickMs(9 * 3_600_000)).toBe(15_000);
    expect(countdownTickMs(2 * 86_400_000)).toBe(300_000);
  });

  it("always ticks every second when a seconds cell is visible", () => {
    expect(countdownTickMs(2 * 86_400_000, true)).toBe(1_000);
    expect(countdownTickMs(9 * 3_600_000, true)).toBe(1_000);
  });
});

describe("priceSkipsSession", () => {
  // Thu Nov 12 2026: EST, so 1:28 PM ET is 18:28 UTC.
  const midday = new Date("2026-11-12T18:28:00Z");

  it("is true mid-session for a price from before today's open", () => {
    expect(priceSkipsSession("2026-11-11T20:59:00Z", midday)).toBe(true);
    expect(priceSkipsSession("2026-11-12T14:29:00Z", midday)).toBe(true);
  });

  it("is false for a price from today's session, or a time it cannot read", () => {
    expect(priceSkipsSession("2026-11-12T18:00:00Z", midday)).toBe(false);
    expect(priceSkipsSession("2026-11-12T14:31:00Z", midday)).toBe(false);
    expect(priceSkipsSession(null, midday)).toBe(false);
    expect(priceSkipsSession("not a time", midday)).toBe(false);
  });

  it("says nothing before the first hourly batches land, after the close, or on a weekend", () => {
    expect(priceSkipsSession("2026-11-11T20:59:00Z", new Date("2026-11-12T15:30:00Z"))).toBe(false); // 10:30 ET
    expect(priceSkipsSession("2026-11-11T20:59:00Z", new Date("2026-11-12T21:30:00Z"))).toBe(false); // 4:30 PM ET
    expect(priceSkipsSession("2026-11-13T20:59:00Z", new Date("2026-11-14T17:00:00Z"))).toBe(false); // Saturday
  });
});
