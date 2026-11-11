import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AFTER_CLOSE_RUN_ET,
  AFTER_CLOSE_WEEKDAYS,
  afterCloseDayWords,
  afterCloseRunOn,
  afterCloseTimeEt,
  lastAfterCloseRun,
  nextAfterCloseRun,
} from "./agent-schedule";

describe("agent schedule", () => {
  it("matches the after-close timer the VPS installs", () => {
    const timer = readFileSync(join(__dirname, "..", "backend", "vps", "units", "tikrr-agentdata-after-close.timer"), "utf-8");
    const line = timer.split("\n").find((row) => row.startsWith("OnCalendar="));
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(line).toBe(`OnCalendar=Mon..Fri *-*-* ${pad(AFTER_CLOSE_RUN_ET.hour)}:${pad(AFTER_CLOSE_RUN_ET.minute)}:00 America/New_York`);
    expect(AFTER_CLOSE_WEEKDAYS).toEqual([1, 2, 3, 4, 5]);
  });

  it("starts at 5:30 PM New York time in winter and in summer", () => {
    expect(afterCloseRunOn("2026-11-11")!.startsAt.toISOString()).toBe("2026-11-11T22:30:00.000Z");
    expect(afterCloseRunOn("2026-07-15")!.startsAt.toISOString()).toBe("2026-07-15T21:30:00.000Z");
    expect(afterCloseTimeEt(afterCloseRunOn("2026-07-15")!)).toBe("5:30 PM ET");
    expect(afterCloseRunOn("2026-11-11")!.usuallyDoneBy.toISOString()).toBe("2026-11-12T00:30:00.000Z");
  });

  it("does not run on weekends and marks holidays", () => {
    expect(afterCloseRunOn("2026-11-14")).toBeNull();
    expect(afterCloseRunOn("2026-11-15")).toBeNull();
    expect(afterCloseRunOn("2026-11-26")!.marketDay).toBe(false); // Thanksgiving
    expect(afterCloseRunOn("not a day")).toBeNull();
  });

  it("finds the next run", () => {
    // Wednesday 3 AM ET: tonight.
    expect(nextAfterCloseRun(new Date("2026-11-11T08:00:00Z")).day).toBe("2026-11-11");
    // Wednesday 6 PM ET, the run has started: tomorrow, unless a running one counts.
    expect(nextAfterCloseRun(new Date("2026-11-11T23:00:00Z")).day).toBe("2026-11-12");
    expect(nextAfterCloseRun(new Date("2026-11-11T23:00:00Z"), { includeRunning: true }).day).toBe("2026-11-11");
    // Friday night: Monday.
    expect(nextAfterCloseRun(new Date("2026-11-13T23:00:00Z")).day).toBe("2026-11-16");
    // The night before Thanksgiving: Friday, or Thursday when holidays count.
    expect(nextAfterCloseRun(new Date("2026-11-25T23:00:00Z")).day).toBe("2026-11-27");
    expect(nextAfterCloseRun(new Date("2026-11-25T23:00:00Z"), { marketDaysOnly: false }).day).toBe("2026-11-26");
    // Just past midnight UTC is still the evening before in New York.
    expect(nextAfterCloseRun(new Date("2026-11-12T01:00:00Z")).day).toBe("2026-11-12");
  });

  it("finds the last run", () => {
    expect(lastAfterCloseRun(new Date("2026-11-11T22:29:00Z")).day).toBe("2026-11-10");
    expect(lastAfterCloseRun(new Date("2026-11-11T22:30:00Z")).day).toBe("2026-11-11");
    expect(lastAfterCloseRun(new Date("2026-11-16T12:00:00Z")).day).toBe("2026-11-13");
    expect(lastAfterCloseRun(new Date("2026-11-27T12:00:00Z")).day).toBe("2026-11-25");
  });

  it("says the day in words", () => {
    const now = new Date("2026-11-11T15:00:00Z");
    expect(afterCloseDayWords({ day: "2026-11-11" }, now)).toBe("today");
    expect(afterCloseDayWords({ day: "2026-11-12" }, now)).toBe("tomorrow");
    expect(afterCloseDayWords({ day: "2026-11-16" }, now)).toBe("on Monday");
    expect(afterCloseDayWords({ day: "2026-11-30" }, now)).toBe("on Nov 30");
  });
});
