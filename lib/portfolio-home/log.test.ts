import { describe, expect, it } from "vitest";

import { buildAgentLog, nextAgentCheck, nyDay, previousWeekday, type AgentsSource } from "@/lib/portfolio-home/log";
import type { HomeSources, Loaded } from "@/lib/portfolio-home/pick";

const TODAY = "2026-11-11"; // a Wednesday

const ok = <T,>(value: unknown): Loaded<T> => ({ state: "ready", value: value as T });

const memo = ok<never>({
  mode: "mine",
  memo: { weekKey: "2026-W46", monday: "2026-11-09", endDay: "2026-11-10", writtenAt: "2026-11-11T02:30:00.000Z", hurt: [{}], look: [{}, {}, {}] },
  history: [],
  missingWeek: false,
});

const reasons = ok<never>({
  checks: [
    { ticker: "JPM", verdict: "weaker", asOf: "2026-11-10", change: { from: "holds", day: "2026-11-05" } },
    { ticker: "AAPL", verdict: "holds", asOf: "2026-11-10", change: null },
  ],
  withReason: 2,
  holdings: 2,
  locked: 0,
});

const season = ok<never>({
  asOf: "2026-11-09T20:13:00.000Z",
  season: {
    reporting: [
      { ticker: "NVDA", name: "NVIDIA", kind: "holding", next: { date: "2026-11-19", session: "amc" } },
      { ticker: "COST", name: "Costco", kind: "holding", next: { date: "2026-12-10", session: null } },
      { ticker: "WMT", name: "Walmart", kind: "watching", next: { date: "2026-11-12", session: "bmo" } },
    ],
  },
});

const dividends = ok<never>({
  plan: { today: TODAY, total: 100, stocks: [{ ticker: "COST", name: "Costco", next: { payDate: "2026-11-13", payDateKnown: true, amount: 10, perShare: 1.3, status: "confirmed", paid: false } }] },
  read: null,
});

const goal = ok<never>({ pricesAsOf: "2026-11-10", portfolioValue: 128270, unvalued: [] });

const sources: Partial<HomeSources> = { memo, reasons, season, dividends, goal };

function agents(runs: Array<Partial<AgentsSource["runs"][number]>>, enabled = true, weekly = false): Loaded<AgentsSource> {
  return ok<AgentsSource>({
    jobs: [
      { id: "a1", name: "Big moves", enabled },
      { id: "a2", name: "Earnings coming up", enabled, weekly },
    ],
    runs: runs.map((run) => ({ job_id: "a1", job_name: "Big moves", day: "2026-11-10", ran_at: "2026-11-10T22:40:00.000Z", decision: "nothing", summary: "Nothing moved 5%.", ...run })),
  });
}

describe("buildAgentLog", () => {
  it("dates each check by its own data, newest first", () => {
    const log = buildAgentLog({ sources, agents: null, mode: "mine", today: TODAY });
    expect(log.checked.map((row) => [row.id, row.day])).toEqual([
      // Written at 02:30 UTC on Nov 11, which is still Nov 10 in New York.
      ["memo-2026-W46", "2026-11-10"],
      ["reasons", "2026-11-10"],
      ["prices", "2026-11-10"],
      ["calendar", "2026-11-09"],
    ]);
    expect(log.checked[0]!.text).toBe("Wrote your memo for the week of Nov 9, up to the Nov 10 close.");
    expect(log.checked[0]!.changed).toBe("Found one to watch and three worth a look.");
  });

  it("says what changed since an earlier check, and only when one was stored", () => {
    const mine = buildAgentLog({ sources, agents: null, mode: "mine", today: TODAY });
    expect(mine.checked.find((row) => row.id === "reasons")?.changed).toBe("JPM went from holds to weaker on Nov 5.");
    const plain = { ...sources, reasons: ok<never>({ checks: [{ ticker: "AAPL", verdict: "holds", asOf: "2026-11-10", change: null }], withReason: 1, holdings: 1, locked: 0 }) };
    expect(buildAgentLog({ sources: plain, agents: null, mode: "example", today: TODAY }).checked.find((row) => row.id === "reasons")?.changed).toBe("It still holds.");
  });

  it("lists the reports and payment still to come for holdings only, soonest first", () => {
    const log = buildAgentLog({ sources, agents: null, mode: "mine", today: TODAY });
    expect(log.next.map((row) => row.text)).toEqual(["Costco pays about $10 on Nov 13.", "NVIDIA reports on Nov 19 after the close.", "Costco reports on Dec 10."]);
  });

  it("names each standing agent's newest run, and leaves agents out of the example", () => {
    const loaded = agents([{ day: "2026-11-09", ran_at: "2026-11-09T22:40:00.000Z", summary: "Old." }, {}, { job_id: "a2", job_name: "Earnings coming up", decision: "notify", summary: "NVDA reports in 6 days." }, { job_id: "gone", job_name: "Archived" }]);
    const log = buildAgentLog({ sources: {}, agents: loaded, mode: "mine", today: TODAY });
    expect(log.checked.map((row) => row.text)).toEqual(["Big moves: Nothing moved 5%.", "Earnings coming up: NVDA reports in 6 days."]);
    expect(log.checked[1]!.tone).toBe("down");
    expect(log.checked[0]!.href).toBe("/agents?job=a1");
    expect(buildAgentLog({ sources: {}, agents: loaded, mode: "example", today: TODAY }).checked).toEqual([]);
  });

  it("shows nothing at all when no source answered", () => {
    expect(buildAgentLog({ sources: { memo: { state: "slow" } }, agents: { state: "failed" }, mode: "mine", today: TODAY })).toEqual({ checked: [], next: [], hasAgents: null });
  });

  it("knows the person has no agents only when the run log answered", () => {
    expect(buildAgentLog({ sources: {}, agents: ok<AgentsSource>({ jobs: [], runs: [] }), mode: "mine", today: TODAY }).hasAgents).toBe(false);
    expect(buildAgentLog({ sources: {}, agents: { state: "slow" }, mode: "mine", today: TODAY }).hasAgents).toBeNull();
  });

  it("says a single weakened reason no longer holds, in words", () => {
    const one = { ...sources, reasons: ok<never>({ checks: [{ ticker: "JPM", verdict: "weaker", asOf: "2026-11-10", change: null }], withReason: 1, holdings: 1, locked: 0 }) };
    expect(buildAgentLog({ sources: one, agents: null, mode: "example", today: TODAY }).checked.find((row) => row.id === "reasons")?.changed).toBe("It no longer holds.");
    const many = {
      ...sources,
      reasons: ok<never>({ checks: ["A", "B", "C"].map((ticker, i) => ({ ticker, verdict: i === 0 ? "broken" : "holds", asOf: "2026-11-10", change: null })), withReason: 3, holdings: 3, locked: 0 }),
    };
    expect(buildAgentLog({ sources: many, agents: null, mode: "example", today: TODAY }).checked.find((row) => row.id === "reasons")?.changed).toBe("Two of three still hold.");
  });
});

describe("nextAgentCheck", () => {
  const value = (loaded: Loaded<AgentsSource>) => (loaded.state === "ready" ? loaded.value : null);

  it("promises a next check only when the runner ran for the last market day", () => {
    // Ran for Tuesday: due again after Wednesday's close.
    expect(nextAgentCheck(value(agents([{ day: "2026-11-10" }])), TODAY)).toMatchObject({ day: TODAY, text: "Your 2 agents check again after the close today, from 5:30 PM ET." });
    // Already ran after today's close: the next weekday.
    expect(nextAgentCheck(value(agents([{ day: TODAY, ran_at: "2026-11-11T22:40:00.000Z" }])), TODAY)?.day).toBe("2026-11-12");
    // A long after-close group that finished after midnight still counts for its day.
    expect(nextAgentCheck(value(agents([{ day: "2026-11-10", ran_at: "2026-11-11T06:30:00.000Z" }])), TODAY)?.day).toBe(TODAY);
    // Last ran Monday: Tuesday was missed, so no promise.
    expect(nextAgentCheck(value(agents([{ day: "2026-11-09" }])), TODAY)).toBeNull();
    // Nothing switched on, or never ran.
    expect(nextAgentCheck(value(agents([{ day: "2026-11-10" }], false)), TODAY)).toBeNull();
    expect(nextAgentCheck(value(agents([])), TODAY)).toBeNull();
  });

  it("does not count runs made by hand, which say nothing about the schedule", () => {
    // "Run now" at 10:30 AM ET on Tuesday, and on a Saturday.
    expect(nextAgentCheck(value(agents([{ day: "2026-11-10", ran_at: "2026-11-10T15:30:00.000Z" }])), TODAY)).toBeNull();
    expect(nextAgentCheck(value(agents([{ day: "2026-11-14", ran_at: "2026-11-14T22:40:00.000Z" }])), "2026-11-14")).toBeNull();
  });

  it("leaves weekly agents out of the count", () => {
    expect(nextAgentCheck(value(agents([{}], true, true)), TODAY)?.text).toBe("Your agent checks again after the close today, from 5:30 PM ET.");
  });

  it("skips the weekend", () => {
    const friday = { day: "2026-11-13", ran_at: "2026-11-13T22:40:00.000Z" };
    expect(nextAgentCheck(value(agents([friday])), "2026-11-14")?.day).toBe("2026-11-16");
    expect(nextAgentCheck(value(agents([friday])), "2026-11-13")?.day).toBe("2026-11-16");
  });
});

describe("dates", () => {
  it("reads instants in New York time and finds the weekday before", () => {
    expect(nyDay("2026-11-12T01:00:00.000Z")).toBe("2026-11-11");
    expect(nyDay("2026-11-12")).toBe("2026-11-12");
    expect(previousWeekday("2026-11-16")).toBe("2026-11-13");
    expect(previousWeekday(TODAY)).toBe("2026-11-10");
  });
});
