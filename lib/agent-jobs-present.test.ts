import { describe, expect, it } from "vitest";

import { AGENT_TEMPLATES, EMPTY_FACTS, MAX_FINDINGS, evaluateJob, type AgentFacts, type AgentJob, type AgentRun } from "@/lib/agent-jobs";
import { aheadWhen, closeLabel, orderJobs, pastWhen, presentRun, ranLabel, structured } from "@/lib/agent-jobs-present";

function template(id: string) {
  const found = AGENT_TEMPLATES.find((entry) => entry.id === id);
  if (!found) throw new Error(id);
  return found.defaults;
}

function job(id: string, templateId: string, patch: Partial<AgentJob> = {}): AgentJob {
  return {
    ...template(templateId),
    id,
    uid: "u",
    mode: "tell_me",
    enabled: true,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...patch,
  };
}

/** A morning check recorded before findings carried numbers: text only. */
const OLD_MORNING: AgentRun = {
  id: "u__a__2026-11-09",
  job_id: "a",
  uid: "u",
  job_name: "Morning check on my names",
  day: "2026-11-09",
  ran_at: "2026-11-09T20:34:55.087Z",
  decision: "notify",
  summary: "22 names moved and 6 names report within a week.",
  latest_close: "2026-11-06",
  findings: [
    { ticker: "IREN", headline: "IREN rose 20.02% in the last session", detail: "Closed at $21.64 on Nov 6, from $18.03.", source: "Daily closing prices", url: "/stock/IREN", at: "2026-11-06" },
    { ticker: "COHR", headline: "COHR fell 3.58% in the last session", detail: "Closed at $192.81 on Nov 6, from $199.97.", source: "Daily closing prices", url: "/stock/COHR", at: "2026-11-06" },
  ],
  checked: ["Daily closes for 35 names of 41, latest Nov 6", "Earnings in the next 7 days: 6", "Congressional disclosures in your names: 0"],
};

/** The owner's Nov 11 runs: a buy-zone run and a morning check with a stale quote (NBIS, Nov 9) and two reports. */
const ZONE_RUN: AgentRun = {
  id: "u__z__2026-11-11",
  job_id: "z",
  uid: "u",
  job_name: "Names entering their add zone",
  day: "2026-11-11",
  ran_at: "2026-11-11T22:51:36.613Z",
  decision: "notify",
  summary: "2 names met the rule: SPCX and OUST.",
  latest_close: "2026-11-11",
  counts: { names: 30, priced: 30, moves: 2, up: 0, down: 2 },
  findings: [
    { ticker: "SPCX", headline: "SPCX closed in its add zone, at or below $142.07", detail: "", source: "Daily closing prices", url: "/stock/SPCX", at: "2026-11-11", kind: "level", change_pct: -2.33, close: 139.75, from_close: 143.09, zone: "add", level: 142.07 },
    { ticker: "OUST", headline: "OUST closed in its add zone, at or below $38.22", detail: "", source: "Daily closing prices", url: "/stock/OUST", at: "2026-11-10", kind: "level", change_pct: -0.91, close: 38.22, from_close: 38.57, zone: "add", level: 38.22 },
  ],
  checked: ["Daily closes for 30 names, latest Nov 11"],
};

const MORNING_RUN: AgentRun = {
  id: "u__m__2026-11-11",
  job_id: "m",
  uid: "u",
  job_name: "Morning check on my names",
  day: "2026-11-11",
  ran_at: "2026-11-11T22:51:36.613Z",
  decision: "notify",
  summary: "3 names moved and 2 names report within a week.",
  latest_close: "2026-11-11",
  counts: { names: 30, priced: 30, moves: 3, up: 2, down: 1, earnings: 2, threshold: 3 },
  findings: [
    { ticker: "MU", headline: "MU rose 11.89% in the last session", detail: "", source: "Daily closing prices", url: "/stock/MU", at: "2026-11-11", kind: "move", change_pct: 11.89, close: 811.3 },
    { ticker: "NBIS", headline: "NBIS rose 9.36% in the last session", detail: "", source: "Daily closing prices", url: "/stock/NBIS", at: "2026-11-09", kind: "move", change_pct: 9.36, close: 141.61 },
    { ticker: "ORCL", headline: "ORCL fell 8.82% in the last session", detail: "", source: "Daily closing prices", url: "/stock/ORCL", at: "2026-11-11", kind: "move", change_pct: -8.82, close: 128.38 },
    { ticker: "CBRS", headline: "CBRS reports earnings tomorrow", detail: "Scheduled for Nov 12 after the close.", source: "Earnings calendar", url: "/stock/CBRS", at: "2026-11-12", kind: "earnings", time: "amc" },
    { ticker: "MU", headline: "MU reports earnings in 6 days", detail: "Scheduled for Nov 17 before the open.", source: "Earnings calendar", url: "/stock/MU", at: "2026-11-17", kind: "earnings", time: "bmo" },
  ],
  checked: ["Daily closes for 30 names of 30, latest Nov 11"],
};

describe("stock rows", () => {
  it("says the move into a buy-more level with the close and the level, and dates only an earlier session", () => {
    const view = presentRun(ZONE_RUN, job("z", "buy-zone"));
    expect(view.rows).toEqual([
      { ticker: "SPCX", close: 139.75, change_pct: -2.33, zone: "add", line: "Below its $142.07 buy-more level" },
      { ticker: "OUST", close: 38.22, change_pct: -0.91, zone: "add", line: "Closed Nov 10, at its $38.22 buy-more level" },
    ]);
    expect(view.headline).toBe("SPCX and OUST closed at their buy-more levels today.");
    expect(view.todo).toBe("Our call says this is where to buy more. Your call.");
  });

  it("drops a stale quote, keeps one row per stock, and says reports without a date", () => {
    const view = presentRun(MORNING_RUN, job("m", "morning-check"));
    expect(view.rows.map((row) => [row.ticker, row.line])).toEqual([
      ["MU", "Reports Tuesday before the open"],
      ["ORCL", ""],
      ["CBRS", "Reports tomorrow after the close"],
    ]);
    expect(view.moves.map((row) => row.ticker)).not.toContain("NBIS");
    expect(view.movesTotal).toBe(2);
    expect(view.headline).toMatch(/^2 of your 30 names moved 3% or more today \(1 up, 1 down\), led by MU/);
  });

  it("reads a run whose only finding was a stale quote as a quiet run", () => {
    const stale = { ...MORNING_RUN, findings: MORNING_RUN.findings.filter((finding) => finding.ticker === "NBIS" && finding.kind === "move") };
    const view = presentRun(stale, job("m", "morning-check"));
    expect(view.verdict).toBe("quiet");
    expect(view.rows).toEqual([]);
    expect(view.headline).not.toContain("NBIS");
  });

  it("says one stock's move into its level as a sentence", () => {
    const view = presentRun({ ...ZONE_RUN, findings: ZONE_RUN.findings.slice(0, 1) }, job("z", "buy-zone"));
    expect(view.headline).toBe("SPCX fell 2.3% to $139.75 today, below its $142.07 buy-more level.");
  });
});

describe("dates in plain words", () => {
  it("says Friday's close for a Monday run, and flags a close that is behind", () => {
    expect(pastWhen("2026-11-06", "2026-11-09")).toBe("on Friday");
    expect(pastWhen("2026-11-08", "2026-11-09")).toBe("yesterday");
    expect(closeLabel("2026-11-06", "2026-11-09")).toBe("Friday's close (Nov 6)");
    expect(closeLabel("2026-10-30", "2026-11-09")).toBe("Latest close we have: Oct 30");
    expect(aheadWhen("2026-11-12", "2026-11-09")).toBe("Thursday");
    expect(aheadWhen("2026-11-10", "2026-11-09")).toBe("tomorrow");
  });

  it("formats when a run happened in Eastern time", () => {
    expect(ranLabel("2026-11-09T20:34:55.087Z")).toBe("Mon Nov 9, 3:34 PM ET");
    expect(ranLabel(undefined)).toBe("");
  });
});

describe("presentRun", () => {
  it("reads an old text-only run back into numbers", () => {
    const finding = structured(OLD_MORNING.findings[0]);
    expect(finding.kind).toBe("move");
    expect(finding.change_pct).toBeCloseTo(20.02);
    expect(finding.close).toBe(21.64);
  });

  it("opens a morning check with what happened, then what to do, with no debug lines", () => {
    const view = presentRun(OLD_MORNING, job("a", "morning-check"));
    expect(view.verdict).toBe("look");
    expect(view.label).toBe("Heads-up");
    expect(view.headline).toBe("22 of your 35 names moved 3% or more on Friday, led by IREN at +20.0%.");
    expect(view.todo).toBe("No action needed. 6 of your names report this week.");
    expect(view.moves.map((row) => row.ticker)).toEqual(["IREN", "COHR"]);
    expect(view.movesTotal).toBe(22);
    expect(view.asOf).toBe("Friday's close (Nov 6) · checked Mon Nov 9, 3:34 PM ET");
  });

  it("says a name needs you when its close sits past a research level", () => {
    const view = presentRun(OLD_MORNING, job("a", "morning-check"), { levels: { IREN: { add_below: 12, trim_above: 21 } } });
    expect(view.verdict).toBe("act");
    expect(view.label).toBe("Needs you");
    expect(view.todo).toMatch(/^IREN went past its sell-some level \(\$21\.00\)\. Your call\./);
    // Already past it before the move: not news.
    expect(presentRun(OLD_MORNING, job("a", "morning-check"), { levels: { IREN: { add_below: null, trim_above: 17 } } }).verdict).toBe("look");
  });

  it("keeps earnings in a busy morning note and records how many moved", () => {
    const days = ["2026-11-05", "2026-11-06"];
    const prices: AgentFacts["prices"] = {};
    const tickers: string[] = [];
    for (let i = 0; i < MAX_FINDINGS + 4; i += 1) {
      const ticker = `T${String.fromCharCode(65 + i)}`;
      tickers.push(ticker);
      prices[ticker] = { dates: days, closes: [100, 110 + i] };
    }
    const facts: AgentFacts = {
      ...EMPTY_FACTS,
      prices,
      levels: { TA: { add_below: null, trim_above: 105 } },
      earnings: [{ ticker: "TB", date: "2026-11-12", time: "amc" }],
      available: { ...EMPTY_FACTS.available, earnings: true, congress: true },
    };
    const result = evaluateJob(template("morning-check"), facts, { day: "2026-11-09", since: "2026-11-06", price_since: "2026-11-05", tickers });
    expect(result?.counts?.moves).toBe(MAX_FINDINGS + 4);
    expect(result?.findings.filter((f) => f.kind === "move")).toHaveLength(MAX_FINDINGS);
    expect(result?.findings.some((f) => f.kind === "earnings")).toBe(true);
    // The name past its trim level leads.
    expect(result?.findings[0]).toMatchObject({ ticker: "TA", zone: "trim", level: 105 });

    const view = presentRun({ ...result!, day: "2026-11-09", ran_at: "2026-11-09T21:00:00Z" }, job("a", "morning-check"));
    expect(view.verdict).toBe("act");
    expect(view.headline).toMatch(/^12 of your 12 names moved 3% or more on Friday, all up, led by TL at \+21\.0%\.$/);
    expect(view.todo).toContain("TB reports Thursday.");
    expect(view.dates).toEqual([{ ticker: "TB", date: "2026-11-12", when: "Thursday", time: "after the close" }]);
  });

  it("puts a quiet run in one plain sentence", () => {
    const quiet: AgentRun = {
      ...OLD_MORNING,
      decision: "nothing",
      summary: "Checked, nothing to do. None of the 35 names met the rule on Nov 6.",
      findings: [],
      checked: ["Daily closes for 35 names, latest Nov 6"],
    };
    const view = presentRun(quiet, job("b", "buy-zone"));
    expect(view.label).toBe("All quiet");
    expect(view.headline).toBe("None of your 35 names closed at their buy-more levels on Friday.");
    expect(view.todo).toBe("Nothing to do.");
  });

  it("drops the 'could not check' prefix and says what to do", () => {
    const view = presentRun(
      { ...OLD_MORNING, decision: "could_not_check", summary: "Could not check: there are no names to look at yet. Add a stock to your watchlist.", findings: [], checked: [] },
      job("a", "morning-check"),
    );
    expect(view.label).toBe("Couldn't check");
    expect(view.headline).toBe("There are no stocks for it to check yet.");
  });

  it("dates a replayed day absolutely and says it was not sent", () => {
    const view = presentRun({ ...OLD_MORNING, ran_at: undefined }, job("a", "morning-check"), { replay: true });
    expect(view.headline).toContain("on Nov 6");
    expect(view.asOf).toBe("Official close of Nov 6 · replayed, not sent at the time");
  });

  it("names earnings by weekday", () => {
    const run: AgentRun = {
      ...OLD_MORNING,
      summary: "CBRS and NBIS report earnings within 3 days.",
      latest_close: null,
      findings: [
        { ticker: "NBIS", headline: "NBIS reports earnings in 3 days", detail: "Scheduled for Nov 12 before the open.", source: "Earnings calendar", url: "/stock/NBIS", at: "2026-11-12" },
        { ticker: "CBRS", headline: "CBRS reports earnings in 3 days", detail: "Scheduled for Nov 12 after the close.", source: "Earnings calendar", url: "/stock/CBRS", at: "2026-11-12" },
      ],
      checked: [],
    };
    const view = presentRun(run, job("c", "earnings-ahead"));
    expect(view.headline).toBe("CBRS and NBIS report earnings on Thursday.");
    expect(view.asOf).toBe("Earnings calendar · checked Mon Nov 9, 3:34 PM ET");
  });
});

describe("job order", () => {
  it("puts what needs you first and paused jobs last", () => {
    const jobs = [job("q", "congress-trade"), job("a", "morning-check", { created_at: "2026-11-02T00:00:00Z" }), job("p", "big-move", { enabled: false })];
    const quiet: AgentRun = { ...OLD_MORNING, id: "q1", job_id: "q", decision: "nothing", summary: "Checked, nothing to do. No congressional trades were disclosed on Nov 9.", findings: [], checked: [] };
    const runs = new Map([
      ["a", [OLD_MORNING]],
      ["q", [quiet]],
    ]);
    const statuses = orderJobs(jobs, runs, { IREN: { add_below: null, trim_above: 20 } });
    expect(statuses.map((status) => status.job.id)).toEqual(["a", "q", "p"]);
  });
});

describe("sell zone and call changes read back", () => {
  const base = { id: "u__s__2026-11-12", job_id: "s", uid: "u", job_name: "ORCL: time to sell some", day: "2026-11-12", ran_at: "2026-11-12T21:30:00Z", checked: [] };

  it("our call turning to Sell some leads, with what to do", () => {
    const run: AgentRun = {
      ...base,
      decision: "notify",
      summary: "Our call on ORCL moved from Keep to Sell some.",
      findings: [{ ticker: "ORCL", headline: "Our call on ORCL moved from Keep to Sell some", detail: "Ran past fair value.", source: "Our research call", url: "/stock/ORCL", at: "2026-11-12", kind: "call", call_from: "Keep", call_to: "Sell some" }],
    };
    const view = presentRun(run, job("s", "sell-zone"));
    expect(view.verdict).toBe("act");
    expect(view.headline).toBe("Our call on ORCL moved from Keep to Sell some.");
    expect(view.todo).toBe("Our call says this is where to sell some. Your call.");
    expect(view.notes).toEqual([{ title: "Our call on ORCL moved from Keep to Sell some", detail: "Ran past fair value.", source: "Our research call", url: "/stock/ORCL", at: "2026-11-12" }]);
  });

  it("a close at the sell-some price reads like the buy zone's, and a quiet day says both checks", () => {
    const run: AgentRun = {
      ...base,
      decision: "notify",
      summary: "ORCL rose 3.0% to $251, above its $250 sell-some level.",
      latest_close: "2026-11-12",
      counts: { names: 1, priced: 1, moves: 1, up: 1, down: 0 },
      findings: [{ ticker: "ORCL", headline: "ORCL rose 3.0% to $251, above its $250 sell-some level", detail: "", source: "Daily closing prices", url: "/stock/ORCL", at: "2026-11-12", kind: "level", zone: "trim", level: 250, close: 251, change_pct: 3 }],
    };
    expect(presentRun(run, job("s", "sell-zone")).headline).toBe("ORCL rose 3.0% to $251 today, above its $250 sell-some level.");
    const quiet: AgentRun = { ...base, decision: "nothing", summary: "Checked, nothing to do.", latest_close: "2026-11-12", counts: { names: 1, priced: 1, moves: 0 }, findings: [] };
    expect(presentRun(quiet, job("s", "sell-zone")).headline).toBe("Our call did not say to sell it today.");
  });
});
