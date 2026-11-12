import { describe, expect, it } from "vitest";

import { agentChips, agentLines, chipDay, findingMove, shortAgentName } from "@/lib/portfolio-home/agent-lines";
import type { AgentsSource } from "@/lib/portfolio-home/log";

const finding = (ticker: string, headline: string, extra: { change_pct?: number; at?: string; kind?: "earnings" } = {}) => ({
  ticker,
  headline,
  detail: "",
  source: "Daily closing prices",
  url: null,
  at: extra.at ?? "2026-11-10",
  ...extra,
});

describe("shortAgentName", () => {
  it("names each kind of watch in a few words", () => {
    expect(shortAgentName({ name: "x", trigger: { type: "price", rule: "moves_pct", pct: 5 }, scope: { kind: "watchlist" } })).toBe("Big moves · 5%");
    expect(shortAgentName({ name: "x", trigger: { type: "event", event: "earnings_approaching", days_before: 3 }, scope: { kind: "watchlist" } })).toBe("Earnings · 3 days ahead");
    expect(shortAgentName({ name: "x", trigger: { type: "event", event: "congress_trade" }, scope: { kind: "watchlist" } })).toBe("Congress trades");
    expect(shortAgentName({ name: "x", trigger: { type: "price", rule: "crosses_below", level: 180 }, scope: { kind: "tickers", tickers: ["nvda"] } })).toBe("NVDA below $180");
    expect(shortAgentName({ name: "x", trigger: { type: "event", event: "insider_trade" }, scope: { kind: "tickers", tickers: ["AMD"] } })).toBe("Insider trades · AMD");
    expect(shortAgentName({ name: "x", trigger: { type: "schedule", cadence: "daily_open" }, scope: { kind: "watchlist" } })).toBe("Daily check · 3% moves");
    expect(shortAgentName({ name: "My watch" })).toBe("My watch");
  });
});

describe("chips", () => {
  it("reads the stored move, else the one in the headline", () => {
    expect(findingMove({ headline: "IREN rose 20.02% in the last session.", change_pct: 20.02 })).toBe(20.02);
    expect(findingMove({ headline: "NVDA fell 5.47% in a day." })).toBe(-5.47);
    expect(findingMove({ headline: "CBRS reports on Nov 12." })).toBeNull();
  });

  it("puts the biggest moves first, one chip per stock, and dates reports", () => {
    const chips = agentChips([finding("RKLB", "RKLB rose 15.39%"), finding("IREN", "IREN rose 20.02%"), finding("RKLB", "RKLB again rose 1%"), finding("COHR", "COHR fell 13.58%")], "digest");
    expect(chips.map((chip) => `${chip.ticker} ${chip.figure}`)).toEqual(["IREN +20.0%", "RKLB +15.4%", "COHR −13.6%"]);
    expect(chips[2]!.tone).toBe("down");
    expect(agentChips([finding("CBRS", "CBRS reports soon", { at: "2026-11-12", kind: "earnings" })], "earnings")[0]!.figure).toBe("Nov 12");
    // A percent in a news headline is not the stock's move.
    expect(agentChips([finding("AMD", "AMD says revenue up 12% on the year")], "news")[0]!.figure).toBeNull();
  });
});

describe("agentLines", () => {
  const source: AgentsSource = {
    jobs: [
      { id: "bigmoves1", name: "Big moves", enabled: true, trigger: { type: "price", rule: "moves_pct", pct: 3 }, scope: { kind: "watchlist" } },
      { id: "earnings1", name: "Earnings", enabled: true, trigger: { type: "event", event: "earnings_approaching", days_before: 3 }, scope: { kind: "watchlist" } },
      { id: "paused111", name: "Old", enabled: false, trigger: { type: "event", event: "congress_trade" }, scope: { kind: "watchlist" } },
    ],
    runs: [
      {
        job_id: "bigmoves1",
        job_name: "Big moves",
        day: "2026-11-10",
        ran_at: "2026-11-10T22:30:00Z",
        decision: "notify",
        summary: "",
        tickers: ["IREN", "RKLB", "COHR", "AMD", "TSLA"],
        detail: { findings: ["IREN", "RKLB", "COHR", "AMD", "TSLA"].map((ticker, i) => finding(ticker, `${ticker} rose ${20 - i}%`)), findingCount: 5, checked: [], latest_close: null, counts: null },
      },
      { job_id: "earnings1", job_name: "Earnings", day: "2026-11-10", ran_at: "2026-11-10T22:30:00Z", decision: "nothing", summary: "" },
    ],
  };

  it("gives each active agent a figure, its chips and the rest as a count", () => {
    const { lines, paused, sharedDay } = agentLines(source, "2026-11-11");
    expect(paused).toBe(1);
    expect(sharedDay).toBe("2026-11-10");
    expect(lines.map((line) => [line.name, line.figure])).toEqual([
      ["Big moves · 3%", "5 flagged"],
      ["Earnings · 3 days ahead", "quiet"],
    ]);
    expect(lines[0]!.chips.map((chip) => chip.ticker)).toEqual(["IREN", "RKLB", "COHR"]);
    expect(lines[0]!.more).toBe(2);
    expect(lines[0]!.href).toBe("/agents?job=bigmoves1");
    // Yesterday's moves say their day, so "IREN +20.0%" is not read as today's move.
    expect(lines[0]!.chips.map((chip) => chip.when)).toEqual(["Tue", "Tue", "Tue"]);
    // Moves from today: no day on the chips.
    expect(agentLines(source, "2026-11-10").lines[0]!.chips.every((chip) => !chip.when)).toBe(true);
    // A run today about yesterday's close: the move's own date decides, not the run's.
    const ranToday: AgentsSource = { ...source, runs: source.runs.map((run) => ({ ...run, day: "2026-11-11" })) };
    expect(agentLines(ranToday, "2026-11-11").lines[0]!.chips[0]!.when).toBe("Tue");
  });

  it("says a chip's day as a weekday within the week and a date before it", () => {
    expect(chipDay("2026-11-10", "2026-11-11")).toBe("Tue");
    expect(chipDay("2026-11-05", "2026-11-11")).toBe("Thu");
    expect(chipDay("2026-11-03", "2026-11-11")).toBe("Nov 3");
    expect(chipDay("2026-11-11", "2026-11-11")).toBeNull();
    expect(chipDay(null, "2026-11-11")).toBeNull();
  });

  it("counts a daily check's moves, reports and trades, and says when an agent has not run", () => {
    const daily: AgentsSource = {
      jobs: [
        { id: "daily1111", name: "Daily", enabled: true, trigger: { type: "schedule", cadence: "daily_open" }, scope: { kind: "watchlist" } },
        { id: "fresh1111", name: "Fresh", enabled: true, trigger: { type: "event", event: "news" }, scope: { kind: "watchlist" } },
      ],
      runs: [
        {
          job_id: "daily1111",
          job_name: "Daily",
          day: "2026-11-09",
          ran_at: "",
          decision: "notify",
          summary: "",
          tickers: ["IREN"],
          detail: { findings: [finding("IREN", "IREN rose 20.02%")], findingCount: 1, checked: [], latest_close: null, counts: { moves: 22, earnings: 6, trades: 0 } },
        },
      ],
    };
    const { lines, sharedDay } = agentLines(daily, "2026-11-11", { hrefFor: () => "/agents" });
    expect(lines[0]!.figure).toBe("28 flagged");
    expect(lines[0]!.more).toBe(27);
    expect(lines[1]!.figure).toBe("not run yet");
    expect(lines[1]!.href).toBe("/agents");
    expect(sharedDay).toBeNull();
  });

  it("says one shared run time once, and each row's own time when they differ", () => {
    const shared = agentLines(source, "2026-11-11");
    expect(shared.ownTimes).toBe(false);
    expect(shared.sharedTime).toBe("5:30 PM");
    expect(shared.lines.every((line) => line.time === "5:30 PM")).toBe(true);
    const apart = agentLines({ ...source, runs: source.runs.map((run, i) => ({ ...run, ran_at: i === 0 ? "2026-11-10T22:30:00Z" : "2026-11-10T23:05:00Z" })) }, "2026-11-11");
    expect(apart.ownTimes).toBe(true);
    expect(apart.sharedTime).toBeNull();
    expect(apart.lines.map((line) => line.time)).toEqual(["5:30 PM", "6:05 PM"]);
  });
});
