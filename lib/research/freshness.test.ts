import { describe, expect, it } from "vitest";

import { SHARED_REPORT_MAX_AGE_DAYS, chooseSharedPath, strictTime, isSharedReportFresh, sharedReportFreshness, type FreshnessSignals } from "./freshness";

const none: FreshnessSignals = { latestEarningsDay: null, filingsAt: [], latestCallChangeDay: null };
// Written Thursday Nov 12, 2026 at 1:17 PM New York time.
const WRITTEN = "2026-11-12T18:17:11.000Z";
const at = (iso: string) => new Date(iso);

describe("sharedReportFreshness", () => {
  it("is fresh inside the window with nothing new since", () => {
    expect(sharedReportFreshness(WRITTEN, none, at("2026-11-13T10:00:00Z"))).toEqual({ fresh: true, reason: "fresh" });
    expect(SHARED_REPORT_MAX_AGE_DAYS).toBe(14);
  });

  it("goes stale after 14 days, to the minute", () => {
    expect(isSharedReportFresh(WRITTEN, none, at("2026-11-26T18:17:00Z"))).toBe(true);
    expect(sharedReportFreshness(WRITTEN, none, at("2026-11-26T18:18:00Z")).reason).toBe("too_old");
  });

  it("needs to be written after the latest earnings day, not on it", () => {
    expect(isSharedReportFresh(WRITTEN, { ...none, latestEarningsDay: "2026-11-05" }, at("2026-11-13T10:00:00Z"))).toBe(true);
    expect(sharedReportFreshness(WRITTEN, { ...none, latestEarningsDay: "2026-11-12" }, at("2026-11-13T10:00:00Z")).reason).toBe("earnings");
    expect(sharedReportFreshness(WRITTEN, { ...none, latestEarningsDay: "2026-11-13" }, at("2026-11-14T10:00:00Z")).reason).toBe("earnings");
  });

  it("goes stale on a 10-Q, 10-K or 8-K filed after it was written", () => {
    expect(isSharedReportFresh(WRITTEN, { ...none, filingsAt: ["2026-11-05T23:13:56+00:00"] }, at("2026-11-13T10:00:00Z"))).toBe(true);
    expect(sharedReportFreshness(WRITTEN, { ...none, filingsAt: ["2026-11-12T20:00:00Z"] }, at("2026-11-13T10:00:00Z")).reason).toBe("filing");
    // A filing known only by its day counts from that whole day.
    expect(sharedReportFreshness(WRITTEN, { ...none, filingsAt: ["2026-11-12"] }, at("2026-11-13T10:00:00Z")).reason).toBe("filing");
    expect(isSharedReportFresh(WRITTEN, { ...none, filingsAt: ["2026-11-11"] }, at("2026-11-13T10:00:00Z"))).toBe(true);
  });

  it("goes stale when our call changed on or after the day it was written", () => {
    expect(isSharedReportFresh(WRITTEN, { ...none, latestCallChangeDay: "2026-11-11" }, at("2026-11-13T10:00:00Z"))).toBe(true);
    expect(sharedReportFreshness(WRITTEN, { ...none, latestCallChangeDay: "2026-11-12" }, at("2026-11-13T10:00:00Z")).reason).toBe("call");
  });

  it("reads the written day in New York, not UTC", () => {
    // 9 PM New York on Nov 5 is Nov 6 in UTC; earnings on Nov 5 came before it was written the same New York day.
    expect(sharedReportFreshness("2026-11-06T02:00:00Z", { ...none, latestEarningsDay: "2026-11-05" }, at("2026-11-07T10:00:00Z")).reason).toBe("earnings");
  });

  it("refuses bad or future dates", () => {
    expect(sharedReportFreshness("not a date", none, at("2026-11-13T10:00:00Z")).reason).toBe("bad_date");
    expect(sharedReportFreshness("2026-11-14T10:00:00Z", none, at("2026-11-13T10:00:00Z")).reason).toBe("future");
    expect(isSharedReportFresh("2026-11-13T10:01:00Z", none, at("2026-11-13T10:00:00Z"))).toBe(true);
  });
});

describe("chooseSharedPath", () => {
  const shared = { created_at: "2026-11-12T18:17:11.000Z" };
  const held = (created_at: string, key = "20261101T100000Z") => ({ key, ticker: "MP", status: "ready", created_at });

  it("runs anew when there is no fresh shared copy", () => {
    expect(chooseSharedPath({ ticker: "MP", forceFresh: false, shared: null, held: [] })).toEqual({ kind: "run" });
    expect(chooseSharedPath({ ticker: "MP", forceFresh: true, shared: null, held: [held("2026-09-01T10:00:00.000Z")] })).toEqual({ kind: "run" });
  });

  it("first ask: opens the copy they already hold, else hands the shared one over", () => {
    expect(chooseSharedPath({ ticker: "MP", forceFresh: false, shared, held: [held(shared.created_at, "20261113T090000Z")] })).toEqual({ kind: "theirs", key: "20261113T090000Z" });
    expect(chooseSharedPath({ ticker: "MP", forceFresh: false, shared, held: [] })).toEqual({ kind: "handover" });
  });

  it("run it again: hands over a shared copy newer than every report they hold on the stock", () => {
    expect(chooseSharedPath({ ticker: "MP", forceFresh: true, shared, held: [held("2026-09-01T10:00:00.000Z"), { ...held("2026-11-12T20:00:00.000Z"), ticker: "NVDA" }] })).toEqual({ kind: "handover" });
    expect(chooseSharedPath({ ticker: "MP", forceFresh: true, shared, held: [] })).toEqual({ kind: "handover" });
    // A failed run of theirs that is newer does not count; only finished reports do.
    expect(chooseSharedPath({ ticker: "MP", forceFresh: true, shared, held: [{ ...held("2026-11-12T20:00:00.000Z"), status: "failed" }] })).toEqual({ kind: "handover" });
  });

  it("run it again: runs anew when they already hold the shared copy or something newer", () => {
    expect(chooseSharedPath({ ticker: "MP", forceFresh: true, shared, held: [held(shared.created_at)] })).toEqual({ kind: "run" });
    expect(chooseSharedPath({ ticker: "MP", forceFresh: true, shared, held: [held("2026-11-12T20:00:00.000Z")] })).toEqual({ kind: "run" });
  });
});

describe("unreadable signals and the run's start", () => {
  const now = at("2026-11-13T10:00:00Z");
  it("any record with a date we cannot read makes the copy stale", () => {
    expect(sharedReportFreshness(WRITTEN, { ...none, unreadable: true }, now).reason).toBe("unreadable");
    expect(sharedReportFreshness(WRITTEN, { ...none, latestEarningsDay: "Nov 5" }, now).reason).toBe("unreadable");
    expect(sharedReportFreshness(WRITTEN, { ...none, filingsAt: ["yesterday"] }, now).reason).toBe("unreadable");
    expect(sharedReportFreshness(WRITTEN, { ...none, filingsAt: ["2026-02-30"] }, now).reason).toBe("unreadable");
    expect(sharedReportFreshness(WRITTEN, { ...none, latestCallChangeDay: "soon" }, now).reason).toBe("unreadable");
  });

  it("is measured from when the run started reading: a filing that landed mid-run makes it stale", () => {
    const started = "2026-11-12T18:17:11.000Z";
    // Filed one minute after the run started, before it finished at 18:19.
    expect(sharedReportFreshness(started, { ...none, filingsAt: ["2026-11-12T18:18:11Z"] }, now).reason).toBe("filing");
  });
});

describe("strictTime", () => {
  it("reads real days and zoned ISO times only", () => {
    expect(strictTime("2026-11-05")).toMatchObject({ day: "2026-11-05", plain: true });
    expect(strictTime("2026-11-05T23:13:56+00:00")).toMatchObject({ day: "2026-11-05", plain: false });
    for (const bad of ["2026-02-30", "2026-02-30T10:00:00Z", "Nov 5 2026", "2026-11-05 10:00", "2026-11-05T10:00:00", "", null, 5]) {
      expect(strictTime(bad), String(bad)).toBeNull();
    }
  });

  it("a filing date Date.parse would roll over or guess at makes the copy stale", () => {
    const now = at("2026-11-13T10:00:00Z");
    expect(sharedReportFreshness(WRITTEN, { ...none, filingsAt: ["2026-02-30T10:00:00Z"] }, now).reason).toBe("unreadable");
    expect(sharedReportFreshness(WRITTEN, { ...none, filingsAt: ["Nov 5 2026"] }, now).reason).toBe("unreadable");
  });
});

describe("every filing is checked, not one latest", () => {
  it("a plain-date filing on the run's New York day counts, even beside a later-sorting UTC timestamp", () => {
    // The run started Thursday Nov 12 at 1:17 PM New York. An 8-K known only as "2026-11-12" may have come after it;
    // a 10-Q stamped 2026-11-12T17:00Z (noon New York, before the run) sorts later in UTC than midnight of that day.
    const signals = { ...none, filingsAt: ["2026-11-12T17:00:00Z", "2026-11-12"] };
    expect(sharedReportFreshness(WRITTEN, signals, at("2026-11-13T10:00:00Z")).reason).toBe("filing");
    expect(sharedReportFreshness(WRITTEN, { ...none, filingsAt: ["2026-11-12T17:00:00Z", "2026-11-11"] }, at("2026-11-13T10:00:00Z")).fresh).toBe(true);
  });
});

describe("strictTime New York day", () => {
  it("reads an instant as its New York day, not its literal UTC date", () => {
    expect(strictTime("2026-11-06T02:00:00Z")?.day).toBe("2026-11-05");
    expect(strictTime("2026-11-05T15:00:00-05:00")?.day).toBe("2026-11-05");
    expect(strictTime("2026-11-05")?.day).toBe("2026-11-05");
  });
});

describe("sharedReportFreshness start time", () => {
  it("treats an impossible or zoneless start time as a bad date", () => {
    const now = new Date("2026-11-12T18:00:00Z");
    const none: FreshnessSignals = { latestEarningsDay: null, filingsAt: [], latestCallChangeDay: null };
    expect(sharedReportFreshness("2026-11-31T12:00:00Z", none, now)).toEqual({ fresh: false, reason: "bad_date" });
    expect(sharedReportFreshness("2026-11-12 10:00", none, now)).toEqual({ fresh: false, reason: "bad_date" });
    expect(sharedReportFreshness("2026-11-12T15:00:00Z", none, now).fresh).toBe(true);
  });
});
