import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The calendar the strip falls back to, per ticker (lib/earnings getNextEarningsCalendarEventCached).
const calendar = new Map<string, string>();
const asked: string[] = [];
vi.mock("@/lib/earnings", () => ({
  getNextEarningsCalendarEventCached: async (_market: string, ticker: string) => {
    asked.push(ticker);
    const day = calendar.get(ticker);
    return day ? { event_date: day } : null;
  },
}));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("@/lib/watchlist", () => ({ getUserDoc: async () => null }));
vi.mock("./data", () => ({ listTheses: async () => [] }));

const { reportsFor, startStripCalendar } = await import("./strip-server");

const TODAY = "2026-11-13";
const source = { kind: "thesis" as const, list: [{ id: "t", name: "T", enabled: true, tickers: ["NVDA", "AMD", "MRVL"], state: null }] };

describe("the strip's report days", () => {
  beforeEach(() => {
    calendar.clear();
    asked.length = 0;
    calendar.set("NVDA", "2026-11-18");
    calendar.set("AMD", "2027-02-03");
    calendar.set("MRVL", "2026-12-02");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives the same days whether the calendar is read at the end or started early", async () => {
    // The page knows AMD's report (today or later) and an old NVDA one; MRVL it does not know.
    const reports = { AMD: "2026-11-20", NVDA: "2026-08-27" };
    const late = await reportsFor(["NVDA", "AMD", "MRVL"], { today: TODAY, reports });
    const early = await reportsFor(["NVDA", "AMD", "MRVL"], { today: TODAY, reports, calendar: startStripCalendar(source) });
    expect(early).toEqual(late);
    expect(Object.keys(early)).toEqual(Object.keys(late));
    // The page's own day wins; the calendar fills only the companies it has no current day for.
    expect(early).toEqual({ NVDA: "2026-11-18", MRVL: "2026-12-02", AMD: "2026-11-20" });
  });

  it("reads nothing more once every company has a day of the page's own", async () => {
    const days = await reportsFor(["NVDA"], { today: TODAY, reports: { NVDA: "2026-11-18" }, calendar: new Promise(() => {}) });
    expect(days).toEqual({ NVDA: "2026-11-18" });
  });

  it("goes on without the calendar when it is slow, keeping the page's own days", async () => {
    vi.useFakeTimers();
    const read = reportsFor(["NVDA", "AMD"], { today: TODAY, reports: { AMD: "2026-11-20" }, calendar: new Promise(() => {}) });
    await vi.advanceTimersByTimeAsync(801);
    expect(await read).toEqual({ AMD: "2026-11-20" });
  });

  it("starts the calendar for every company the source names, and never rejects", async () => {
    expect(await startStripCalendar(source)).toEqual({ NVDA: "2026-11-18", AMD: "2027-02-03", MRVL: "2026-12-02" });
    expect(asked.sort()).toEqual(["AMD", "MRVL", "NVDA"]);
    expect(await startStripCalendar(null)).toEqual({});
    expect(await startStripCalendar({ kind: "reasons", records: [{ ticker: "KO", records: [] }] })).toEqual({});
  });
});
