import { buildDashboard, rangeDays } from "@/lib/analytics/dashboard";
import { emptyRollup, hoursUpTo, liveView, mergeRollups, rollupDay, type StoredEvent } from "@/lib/analytics/rollup";

const DAY = "2026-11-13";
const at = (hhmm: string, s = 0) => Date.parse(`${DAY}T${hhmm}:${String(s).padStart(2, "0")}Z`);

function pv(vid: string, sid: string, t: number, p: string, extra: Partial<StoredEvent> = {}): StoredEvent {
  return { t, n: "pageview", vid, sid, p, r: p.startsWith("/stock/") ? "/stock/[symbol]" : p, ...extra };
}

// Three visitors, four visits:
//  a: one visit from google, / then /stock/NVDA then /stock/AMD (2 minutes), signed in
//  b: one bounce on /pricing (direct), from India
//  c: two visits, 09:00 bounce on / (twitter) and 15:00 /stock/NVDA then a search (30 s)
const events: StoredEvent[] = [
  pv("a", "s1", at("08:00"), "/", { ref: "google.com", cc: "US", dev: "desktop", br: "Chrome", si: true }),
  pv("a", "s1", at("08:01"), "/stock/NVDA", { si: true }),
  pv("a", "s1", at("08:02"), "/stock/AMD", { si: true }),
  pv("b", "s2", at("08:30"), "/pricing", { cc: "IN", dev: "mobile", br: "Safari" }),
  pv("c", "s3", at("09:00"), "/", { ref: "x.com", us: "x", uc: "launch", cc: "US", dev: "mobile", br: "Safari" }),
  pv("c", "s4", at("15:00"), "/stock/NVDA", { cc: "US", dev: "mobile", br: "Safari" }),
  { t: at("15:00", 30), n: "search", vid: "c", sid: "s4", p: "/stock/NVDA", r: "/stock/[symbol]", q: "AAPL", found: true },
  // another day's event never leaks in
  pv("z", "s9", Date.parse("2026-11-12T23:59:00Z"), "/"),
];

describe("daily rollup", () => {
  const day = rollupDay(DAY, events, { complete: true, now: at("23:59") });

  it("counts visitors, pageviews, visits, bounces and visit length", () => {
    expect(day.v).toBe(3);
    expect(day.pv).toBe(6);
    expect(day.s).toBe(4);
    // b's single view and c's 09:00 single view; c's 15:00 visit had a search, so it is not a bounce
    expect(day.b).toBe(2);
    // a: 120 s, c's second visit: 30 s
    expect(day.d).toBe(150);
    expect(day.si_pv).toBe(3);
    expect(day.si_v).toBe(1);
    expect(day.complete).toBe(true);
  });

  it("puts each visitor in the hour they were first seen, and each visit in the hour it started", () => {
    expect(day.hours[8]).toEqual({ pv: 4, v: 2, s: 2, b: 1, d: 120 });
    expect(day.hours[9]).toEqual({ pv: 1, v: 1, s: 1, b: 1, d: 0 });
    expect(day.hours[15]).toEqual({ pv: 1, v: 0, s: 1, b: 0, d: 30 });
    expect(hoursUpTo(day, 9)).toEqual({ pv: 5, v: 3, s: 3, b: 2, d: 120 });
  });

  it("counts pages with visitors, entries and exits", () => {
    expect(day.pages["/"]).toEqual({ pv: 2, v: 2, x: 1, e: 2 });
    expect(day.pages["/stock/NVDA"]).toEqual({ pv: 2, v: 2, x: 1, e: 1 });
    expect(day.pages["/stock/AMD"]).toEqual({ pv: 1, v: 1, x: 1, e: 0 });
    expect(day.routes["/stock/[symbol]"]).toEqual({ pv: 3, v: 2, x: 2, e: 1 });
    expect(day.stocks).toEqual({ NVDA: { pv: 2, v: 2 }, AMD: { pv: 1, v: 1 } });
  });

  it("credits each visit's source by how it started", () => {
    expect(day.refs).toEqual({ "google.com": 1, "(direct)": 2, "x.com": 1 });
    expect(day.utm_source).toEqual({ x: 1 });
    expect(day.utm_campaign).toEqual({ launch: 1 });
    expect(day.countries).toEqual({ US: 2, IN: 1 });
    expect(day.devices).toEqual({ desktop: 1, mobile: 2 });
  });

  it("counts key events and searches", () => {
    expect(day.events.search).toEqual({ n: 1, v: 1 });
    expect(day.searches).toEqual({ AAPL: 1 });
  });

  it("is an empty, valid rollup for a day with nothing", () => {
    const none = rollupDay("2026-11-10", events);
    expect(none.v).toBe(0);
    expect(none.hours).toHaveLength(24);
  });
});

describe("merging days and building the dashboard", () => {
  const d13 = rollupDay(DAY, events, { complete: false });
  const d12 = rollupDay("2026-11-12", events, { complete: true });

  it("adds days up (visitors are per day, so a visitor on two days counts twice)", () => {
    const totals = mergeRollups([d12, d13]);
    expect(totals.v).toBe(4);
    expect(totals.pv).toBe(7);
    expect(totals.refs["(direct)"]).toBe(3);
    expect(totals.pages["/"]!.pv).toBe(3);
  });

  it("compares today with yesterday up to the same hour", () => {
    const now = at("09:30");
    const yesterday = emptyRollup("2026-11-12");
    yesterday.hours[8] = { pv: 10, v: 4, s: 5, b: 2, d: 300 };
    yesterday.hours[20] = { pv: 99, v: 50, s: 60, b: 10, d: 999 };
    const facts = { users: [], agents: [], lifecycle: [] };
    const board = buildDashboard({ range: "today", now, current: [rollupDay(DAY, events.filter((e) => e.t <= now))], previous: [yesterday], facts });
    expect(board.headline.visitors).toMatchObject({ value: 3, previous: 4 });
    expect(board.headline.pageviews).toMatchObject({ value: 5, previous: 10 });
    expect(board.headline.bounce.value).toBeCloseTo(2 / 3);
    expect(board.headline.bounce.previous).toBeCloseTo(2 / 5);
    expect(board.series).toHaveLength(10);
    expect(board.series[8]).toMatchObject({ label: "08:00", visitors: 2, pageviews: 4 });
  });

  it("compares a 7-day range so far with the 7 days before, cut at the same hour", () => {
    const now = at("09:30");
    const facts = { users: [], agents: [], lifecycle: [] };
    const full = (day: string, pv: number) => {
      const r = emptyRollup(day);
      r.pv = pv;
      r.hours[8] = { pv: pv / 2, v: 0, s: 0, b: 0, d: 0 };
      r.hours[20] = { pv: pv / 2, v: 0, s: 0, b: 0, d: 0 };
      return r;
    };
    const days = ["2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", DAY];
    const before = ["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
    const current = days.map((d) => (d === DAY ? rollupDay(DAY, events.filter((e) => e.t <= now)) : full(d, 10)));
    const previous = before.map((d) => full(d, 20));
    const board = buildDashboard({ range: "7d", now, current, previous, facts });
    // six full days of 10, plus today's 5 so far
    expect(board.headline.pageviews.value).toBe(65);
    // six full days of 20, plus Nov 6 up to 09:59 only (its 08:00 half), not its evening
    expect(board.headline.pageviews.previous).toBe(130);
  });

  it("covers the right days for each range", () => {
    const now = at("12:00");
    expect(rangeDays("today", now)).toEqual({ current: [DAY], previous: ["2026-11-12"] });
    const week = rangeDays("7d", now);
    expect(week.current).toHaveLength(7);
    expect(week.current[6]).toBe(DAY);
    expect(week.current[0]).toBe("2026-11-07");
    expect(week.previous[6]).toBe("2026-11-06");
    expect(rangeDays("90d", now).previous).toHaveLength(90);
  });
});

describe("live view", () => {
  it("counts the last five minutes, each visitor on the page they viewed last", () => {
    const now = at("15:03");
    const live = liveView(events, now);
    expect(live.visitors).toBe(1);
    expect(live.pageviews).toBe(1);
    expect(live.pages).toEqual([{ path: "/stock/NVDA", visitors: 1 }]);
    expect(liveView(events, at("16:00")).visitors).toBe(0);
  });
});

describe("odd keys", () => {
  it("counts a referrer or campaign called \"constructor\" as a number and never touches the prototype", () => {
    const e = pv("a", "s1", at("08:00"), "/", { ref: "constructor", us: "constructor", uc: "__proto__" });
    const range = mergeRollups([rollupDay(DAY, [e]), rollupDay(DAY, [e])]);
    expect(range.refs.constructor).toBe(2);
    expect(range.utm_source.constructor).toBe(2);
    expect(Object.keys(range.utm_campaign)).toEqual([]);
    expect(({} as Record<string, unknown>).pv).toBeUndefined();
  });
});
