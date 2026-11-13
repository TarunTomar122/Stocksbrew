import { describe, expect, it } from "vitest";

import {
  OUTCOME_SESSIONS,
  askOfJob,
  closeOnOrBefore,
  decisionCloseDay,
  loopCandidates,
  loopOf,
  outcomeOf,
  pickLoopCase,
  quietMoveOf,
  sessionsAfter,
  tellable,
  type LoopContext,
  type LoopJobInput,
  type LoopPoint,
  type LoopRunInput,
} from "./agent-loop";

/** Market days from `start` (weekends skipped), `count` of them, with the closes given (or a flat 100). */
function days(start: string, count: number): string[] {
  const out: string[] = [];
  const date = new Date(`${start}T12:00:00Z`);
  while (out.length < count) {
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) out.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return out;
}

function series(start: string, closes: number[]): LoopPoint[] {
  return days(start, closes.length).map((date, index) => ({ date, close: closes[index]! }));
}

const JOB: LoopJobInput = {
  id: "examplebigmove",
  name: "5% moves in a day",
  template: "big-move",
  trigger: { type: "price", rule: "moves_pct", pct: 5 },
  scope: { kind: "tickers", tickers: ["NVDA", "AAPL", "MSFT"] },
  created_at: "2026-11-02T11:00:00.000Z",
  enabled: true,
};

function moveRun(day: string, ticker: string, at: string, pct: number, close: number, extra: Partial<LoopRunInput> = {}): LoopRunInput {
  return {
    job_id: JOB.id,
    day,
    ran_at: `${day}T11:19:00.000Z`,
    decision: "notify",
    findings: [{ ticker, kind: "move", headline: `${ticker} moved`, at, change_pct: pct, close, source: "Daily closing prices" }],
    ...extra,
  };
}

const quiet = (day: string): LoopRunInput => ({ job_id: JOB.id, day, ran_at: `${day}T22:00:00.000Z`, decision: "nothing", latest_close: day, findings: [] });

describe("loopCandidates", () => {
  it("keeps notify runs of known jobs with a priced finding, newest first, one per run (the biggest move)", () => {
    const runs: LoopRunInput[] = [
      quiet("2026-11-05"),
      moveRun("2026-11-04", "AAPL", "2026-11-03", 5.2, 300),
      {
        ...moveRun("2026-11-11", "NVDA", "2026-11-10", -5.47, 168.89),
        findings: [
          { ticker: "MSFT", kind: "move", headline: "MSFT", at: "2026-11-10", change_pct: 5.1, close: 500 },
          { ticker: "NVDA", kind: "move", headline: "NVDA", at: "2026-11-10", change_pct: -5.47, close: 168.89 },
        ],
      },
      { ...moveRun("2026-11-12", "NVDA", "2026-11-11", 6, 170), job_id: "someone-elses" },
      { ...moveRun("2026-11-12", "NVDA", "2026-11-11", 6, 170), findings: [{ ticker: "NVDA", kind: "earnings", headline: "reports", at: "2026-11-14" }] },
    ];
    const out = loopCandidates([JOB], runs);
    expect(out.map((entry) => [entry.ticker, entry.day])).toEqual([
      ["NVDA", "2026-11-10"],
      ["AAPL", "2026-11-03"],
    ]);
    expect(out[0]).toMatchObject({ runDay: "2026-11-11", close: 168.89, changePct: -5.47 });
  });
});

describe("loopCandidates: what the run had", () => {
  it("drops a finding dated after its run before choosing the biggest, and starts from the close the run stored", () => {
    const run: LoopRunInput = {
      ...moveRun("2026-11-11", "NVDA", "2026-11-10", -5.47, 168.89),
      latest_close: "2026-11-10",
      findings: [
        { ticker: "MSFT", kind: "move", headline: "MSFT", at: "2026-11-14", change_pct: 9, close: 500 },
        { ticker: "NVDA", kind: "move", headline: "NVDA", at: "2026-11-10", change_pct: -5.47, close: 168.89 },
      ],
    };
    expect(loopCandidates([JOB], [run])).toMatchObject([{ ticker: "NVDA", fromDay: "2026-11-10" }]);
    // A stored close date wins over the run's clock (a 6:30 PM run that had not read that day's close yet).
    const late = { ...run, ran_at: "2026-11-11T23:30:00.000Z", latest_close: "2026-11-10" };
    expect(loopCandidates([JOB], [late])[0]!.fromDay).toBe("2026-11-10");
    expect(loopCandidates([JOB], [{ ...late, latest_close: null }])[0]!.fromDay).toBe("2026-11-11");
  });

  it("explains a quiet day only with the close the check stored", () => {
    const job = { ...JOB, scope: { kind: "tickers" as const, tickers: ["X"] } };
    const points = series("2026-11-02", [100, 102, 97]);
    expect(quietMoveOf(job, [{ ...quiet("2026-11-04"), latest_close: null }], { X: points })).toBeNull();
  });
});

describe("pickLoopCase (the rule: newest with a full outcome, else newest with any, else newest)", () => {
  const nvda = series("2026-11-02", [180, 181, 182, 183, 184, 178.67, 168.89, 170, 171]); // ends Thu Nov 12
  const aapl = series("2026-10-20", Array.from({ length: 18 }, () => 300));
  const candidates = loopCandidates([JOB], [moveRun("2026-11-11", "NVDA", "2026-11-10", -5.47, 168.89), moveRun("2026-10-24", "AAPL", "2026-10-23", 5.2, 300)]);
  const seriesOf = (ticker: string) => ({ NVDA: nvda, AAPL: aapl })[ticker];

  it("prefers an older case with all its sessions in over a newer one still in progress", () => {
    const picked = pickLoopCase(candidates, seriesOf);
    expect(picked?.candidate.ticker).toBe("AAPL");
    expect(picked?.sessions).toBeGreaterThanOrEqual(OUTCOME_SESSIONS);
  });

  it("falls back to the newest case with any session in, then to the newest at all", () => {
    expect(pickLoopCase(candidates.filter((entry) => entry.ticker === "NVDA"), seriesOf)).toMatchObject({ candidate: { ticker: "NVDA" }, sessions: 2 });
    const fresh = loopCandidates([JOB], [moveRun("2026-11-13", "NVDA", "2026-11-12", 5.5, 171)]);
    expect(pickLoopCase(fresh, seriesOf)).toMatchObject({ candidate: { ticker: "NVDA", day: "2026-11-12" }, sessions: 0 });
    expect(pickLoopCase([], seriesOf)).toBeNull();
  });

  it("never looks at how a case turned out: flipping the later prices does not change the pick", () => {
    const up = series("2026-10-20", Array.from({ length: 18 }, (_, index) => 300 + index * 5));
    const down = series("2026-10-20", Array.from({ length: 18 }, (_, index) => 300 - index * 5));
    const a = pickLoopCase(candidates, (ticker) => (ticker === "AAPL" ? up : nvda));
    const b = pickLoopCase(candidates, (ticker) => (ticker === "AAPL" ? down : nvda));
    expect(a?.candidate).toEqual(b?.candidate);
  });
});

describe("outcomeOf", () => {
  const stock = series("2026-11-02", [100, 100, 100, 100, 100, 110, 99, 100, 101, 103, 104.5]);
  const bench = series("2026-11-02", [500, 500, 500, 500, 500, 500, 505, 506, 507, 508, 510]);

  it("measures the stock and the S&P 500 over the same closes, capped at the full window", () => {
    const outcome = outcomeOf(stock, bench, "2026-11-09")!; // close 110
    expect(outcome.sessions).toBe(OUTCOME_SESSIONS);
    expect(outcome.full).toBe(true);
    expect(outcome.fromClose).toBe(110);
    expect(outcome.toDay).toBe("2026-11-16");
    expect(outcome.toClose).toBe(104.5);
    expect(outcome.pct).toBeCloseTo(-5, 6);
    expect(outcome.benchPct).toBeCloseTo((510 / 500 - 1) * 100, 6);
  });

  it("says so far with fewer sessions, and nothing with none", () => {
    const outcome = outcomeOf(stock, bench, "2026-11-13")!;
    expect(outcome).toMatchObject({ sessions: 1, full: false, toDay: "2026-11-16" });
    expect(outcomeOf(stock, bench, "2026-11-16")).toBeNull();
  });

  it("starts from the last close on or before the day, and drops the S&P figure when its days do not match", () => {
    // A Sunday: Friday's close is the last one there was.
    expect(outcomeOf(stock, bench, "2026-11-08")).toMatchObject({ fromDay: "2026-11-06", fromClose: 100 });
    expect(outcomeOf(stock, bench, "2026-10-01")).toBeNull();
    const gappy = bench.filter((point) => point.date !== "2026-11-16");
    expect(outcomeOf(stock, gappy, "2026-11-09")!.benchPct).toBeNull();
    expect(outcomeOf(stock, undefined, "2026-11-09")!.benchPct).toBeNull();
  });

  it("finds the last close on or before a day", () => {
    expect(closeOnOrBefore(stock, "2026-11-08")?.date).toBe("2026-11-06");
    expect(closeOnOrBefore(stock, "2026-10-01")).toBeNull();
    expect(sessionsAfter(stock, "2026-11-12")).toBe(2);
  });
});

describe("tellable, quietMoveOf and decisionCloseDay", () => {
  const points = series("2026-11-02", [100, 102, 97]);
  it("needs the day's own close, to the cent, and one before it", () => {
    const base = { jobId: "j", runDay: "2026-11-05", ranAt: "", ticker: "X", day: "2026-11-04", fromDay: "2026-11-04", close: 97, changePct: -4.9, source: "" };
    expect(tellable(base, points)).toBe(true);
    expect(tellable({ ...base, close: 96.5 }, points)).toBe(false);
    expect(tellable({ ...base, day: "2026-11-02", close: 100 }, points)).toBe(false);
    expect(tellable(base, undefined)).toBe(false);
  });

  it("says nothing for other agents, or when a quiet day somehow crossed the line", () => {
    const job = { ...JOB, scope: { kind: "tickers" as const, tickers: ["X"] } };
    expect(quietMoveOf(job, [quiet("2026-11-04")], { X: points })).toMatchObject({ ticker: "X", day: "2026-11-04" });
    expect(quietMoveOf({ ...job, trigger: { type: "price", rule: "moves_pct", pct: 3 } }, [quiet("2026-11-04")], { X: points })).toBeNull();
    expect(quietMoveOf({ ...job, trigger: { type: "event", event: "earnings_approaching" } }, [quiet("2026-11-04")], { X: points })).toBeNull();
    // Every stock must have the close the check read: a gap could hide a move.
    const two = { ...JOB, scope: { kind: "tickers" as const, tickers: ["X", "Y"] } };
    expect(quietMoveOf(two, [quiet("2026-11-04")], { X: points })).toBeNull();
    expect(quietMoveOf(job, [{ ...quiet("2026-11-04"), latest_close: "2026-11-03" }], { X: points })).toMatchObject({ day: "2026-11-03" });
    expect(quietMoveOf(job, [{ ...quiet("2026-11-04"), latest_close: "2026-11-05" }], { X: points })).toBeNull();
  });


  it("starts the outcome at the last close the agent had when it ran", () => {
    // 6:19 AM ET on Wednesday: Tuesday's close; 5:50 PM ET on Thursday: Thursday's own.
    expect(decisionCloseDay("2026-11-11T11:19:00.000Z", "2026-11-10")).toBe("2026-11-10");
    expect(decisionCloseDay("2026-11-12T22:50:00.000Z", "2026-11-12")).toBe("2026-11-12");
    // A run days after the move starts from the close before it ran, not the move's.
    expect(decisionCloseDay("2026-11-16T11:00:00.000Z", "2026-11-10")).toBe("2026-11-15");
    expect(decisionCloseDay("not a time", "2026-11-10")).toBe("2026-11-10");
  });
});

describe("askOfJob", () => {
  it("says the saved trigger the way a person would type it", () => {
    expect(askOfJob(JOB)).toBe("Tell me when one of my stocks moves 5% in a day.");
    expect(askOfJob({ ...JOB, scope: { kind: "tickers", tickers: ["AMD"] }, trigger: { type: "price", rule: "crosses_below", level: 140 } })).toBe("Tell me if AMD closes below $140.");
    expect(askOfJob({ ...JOB, trigger: { type: "event", event: "earnings_approaching", days_before: 3 }, name: "Earnings in the next 3 days" })).toBe("Earnings in the next 3 days.");
  });
});

describe("loopOf", () => {
  const nvda = series("2026-10-13", [...Array.from({ length: 19 }, () => 180), 178.67, 168.89, 170, 171]); // Nov 10 = 168.89, last close Nov 12
  const spy = series("2026-10-13", [...Array.from({ length: 21 }, () => 600), 603, 606]);
  const context: LoopContext = {
    today: "2026-11-13",
    jobs: [JOB],
    runs: [quiet("2026-11-12"), moveRun("2026-11-11", "NVDA", "2026-11-10", -5.47, 168.89)],
    // Every watched stock has its closes, so the quiet check can be explained.
    series: { NVDA: nvda, AAPL: series("2026-10-13", Array.from({ length: 23 }, () => 300)), MSFT: series("2026-10-13", Array.from({ length: 23 }, () => 500)) },
    bench: spy,
    now: () => ({ price: 172.4, dayPct: 0.8, at: "2026-11-13T15:00:00Z" }),
    nextCheck: () => "2026-11-13",
  };

  it("tells the case from the request to the outcome, every figure as stored when the agent acted", () => {
    const loop = loopOf(context)!;
    expect(loop.ticker).toBe("NVDA");
    expect(loop.asked).toMatchObject({ text: "Tell me when one of my stocks moves 5% in a day.", name: "5% moves in a day", tickers: ["NVDA", "AAPL", "MSFT"] });
    expect(loop.watched.days).toEqual([
      { day: "2026-11-11", found: true },
      { day: "2026-11-12", found: false },
    ]);
    expect(loop.found).toMatchObject({ day: "2026-11-10", close: 168.89, changePct: -5.47 });
    expect(loop.found.chart.at(-1)).toEqual({ date: "2026-11-10", close: 168.89 });
    expect(loop.found.chart).toHaveLength(20);
    expect(loop.decided).toEqual({ line: 5, toldDay: "2026-11-11", toldAt: "2026-11-11T11:19:00.000Z" });
    expect(loop.outcome).toMatchObject({ sessions: 2, full: false, fromDay: "2026-11-10", fromClose: 168.89, toClose: 171 });
    expect(loop.outcome!.benchPct).toBeCloseTo(1, 6);
    // Thursday's quiet check: NVDA's +0.59% was its biggest move, under the 5% line.
    expect(loop.watched.quiet).toMatchObject({ day: "2026-11-12", ticker: "NVDA", threshold: 5 });
    expect(loop.watched.quiet!.pct).toBeCloseTo((171 / 170 - 1) * 100, 6);
    expect(loop.watched.nextDay).toBe("2026-11-13");
  });

  it("skips a finding whose close is not the day's close (an after-hours quote), and marks the days from the one it told you", () => {
    const afterHours = moveRun("2026-11-11", "NVDA", "2026-11-10", -7, 160.5);
    expect(loopOf({ ...context, runs: [afterHours] })).toBeNull();
    // An older case, followed by more checks than the marks hold: the marks start on the day it told you.
    const runs = [moveRun("2026-11-04", "NVDA", "2026-11-03", -5.5, 180), ...["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"].map(quiet)];
    const loop = loopOf({ ...context, runs, nextCheck: () => "2026-11-13" })!;
    expect(loop.watched.days.map((entry) => entry.day)).toEqual(["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09"]);
    expect(loop.watched.nextDay).toBeNull();
    expect(loop.outcome).toMatchObject({ full: true, fromDay: "2026-11-03", toDay: "2026-11-10" });
  });

  it("is null with no case", () => {
    expect(loopOf({ ...context, runs: [quiet("2026-11-12")] })).toBeNull();
  });
});
