import { describe, expect, it } from "vitest";

import { AGENT_TEMPLATES, EMPTY_FACTS, MAX_FINDINGS, evaluateJob, type AgentFacts, type AgentJob, type AgentRun } from "@/lib/agent-jobs";
import { agentsRead, aheadWhen, closeLabel, orderJobs, pastWhen, presentRun, ranLabel, structured } from "@/lib/agent-jobs-present";

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
    expect(view.todo).toBe("Nothing to act on. 6 of your names report this week.");
    expect(view.moves.map((row) => row.ticker)).toEqual(["IREN", "COHR"]);
    expect(view.movesTotal).toBe(22);
    expect(view.asOf).toBe("Friday's close (Nov 6) · checked Mon Nov 9, 3:34 PM ET");
  });

  it("says a name needs you when its close sits past a research level", () => {
    const view = presentRun(OLD_MORNING, job("a", "morning-check"), { levels: { IREN: { add_below: 12, trim_above: 21 } } });
    expect(view.verdict).toBe("act");
    expect(view.label).toBe("Needs you");
    expect(view.todo).toMatch(/^IREN went past its trim level \(\$21\.00\)\. Your call\./);
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
    expect(view.headline).toBe("None of your 35 names closed in their add zones on Friday.");
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
    expect(view.asOf).toBe("Close of Nov 6 · replayed, not sent at the time");
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

describe("the page read", () => {
  it("orders what needs you first and counts it in the headline", () => {
    const jobs = [job("q", "congress-trade"), job("a", "morning-check", { created_at: "2026-11-02T00:00:00Z" }), job("p", "big-move", { enabled: false })];
    const quiet: AgentRun = { ...OLD_MORNING, id: "q1", job_id: "q", decision: "nothing", summary: "Checked, nothing to do. No congressional trades were disclosed on Nov 9.", findings: [], checked: [] };
    const runs = new Map([
      ["a", [OLD_MORNING]],
      ["q", [quiet]],
    ]);
    const statuses = orderJobs(jobs, runs, { IREN: { add_below: null, trim_above: 20 } });
    expect(statuses.map((status) => status.job.id)).toEqual(["a", "q", "p"]);
    const read = agentsRead(statuses, "2026-11-10");
    expect(read?.headline).toBe("One agent needs you.");
    expect(read?.insights).toHaveLength(1);
    expect(read?.source).toBe("2 of 3 agents on · last checked yesterday");
  });

  it("has no read before anything has run", () => {
    expect(agentsRead(orderJobs([job("a", "morning-check")], new Map()), "2026-11-10")).toBeNull();
  });
});
