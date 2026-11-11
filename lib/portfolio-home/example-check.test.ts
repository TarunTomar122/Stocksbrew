import { describe, expect, it } from "vitest";

import type { AgentTrigger } from "@/lib/agent-jobs";

import { checkSteps, exampleAgentsSource, ownCheckView, ranWords, shapeExampleChecks, storedCheckFromDoc, type ExampleAgentDef, type StoredCheck } from "./example-check";
import { watchRunFromDoc } from "@/lib/agent-watch";

const AGENTS: ExampleAgentDef[] = [
  { id: "exampleearnings", ask: "Tell me 3 days before any of these report earnings.", trigger: { type: "event", event: "earnings_approaching", days_before: 3 } },
  { id: "examplebigmove", ask: "Tell me when any of these moves 5% or more in a day.", trigger: { type: "price", rule: "moves_pct", pct: 5 } },
  { id: "examplefilings", ask: "Tell me when any of these files something big with the SEC.", trigger: { type: "event", event: "sec_filing", filings: { major: true } } as AgentTrigger },
];
const TICKERS = ["MSFT", "AAPL", "NVDA", "JPM", "COST", "XOM", "UNH"];

function run(partial: Partial<StoredCheck> & Pick<StoredCheck, "job_id" | "day">): StoredCheck {
  return { ran_at: `${partial.day}T22:41:00.000Z`, decision: "nothing", summary: "", findings: [], checked: [], latest_close: null, counts: null, ...partial };
}

const NVDA_DROP = run({
  job_id: "examplebigmove",
  day: "2026-11-10",
  decision: "notify",
  summary: "NVDA fell 5.47% in a day.",
  findings: [{ ticker: "NVDA", headline: "NVDA fell 5.47% in a day", detail: "Closed at $168.89 on Nov 10, −5.47% on the day before ($178.67).", source: "Daily closing prices", url: "/stock/NVDA", at: "2026-11-10" }],
  checked: ["Daily closes for 7 names, latest Nov 10"],
  latest_close: "2026-11-10",
  counts: { names: 7, priced: 7, moves: 1 },
});

describe("shapeExampleChecks", () => {
  it("shows nothing when no example agent has run", () => {
    expect(shapeExampleChecks({ agents: AGENTS, runs: [], tickers: TICKERS }, "2026-11-11")).toBeNull();
  });

  it("leads with the newest check that found something, with its evidence and the decision", () => {
    const view = shapeExampleChecks(
      {
        agents: AGENTS,
        runs: [
          run({ job_id: "exampleearnings", day: "2026-11-10", summary: "Checked, nothing to do. None of your names reports within 3 days.", checked: ["Earnings dates within 3 days of Nov 10: 0", "Names in scope: 7"] }),
          NVDA_DROP,
          run({ job_id: "examplebigmove", day: "2026-11-09", summary: "Checked, nothing to do. None of the 7 names met the rule on Nov 9.", latest_close: "2026-11-09", counts: { names: 7, priced: 7 } }),
        ],
        tickers: TICKERS,
      },
      "2026-11-11",
    )!;
    expect(view.featured.id).toBe("examplebigmove");
    expect(view.featured.outcome).toBe("NVDA fell 5.47% in a day.");
    expect(view.featured.checked).toBe("Closing prices for the seven stocks, the latest from Nov 10.");
    expect(view.featured.findings[0]?.url).toBe("/stock/NVDA");
    expect(view.featured.findings[0]?.detail).toBe("Closed at $168.89 on Nov 10, down 5.47% from $178.67 the day before.");
    expect(view.featured.decided).toBe("It decided to tell you.");
    expect(view.featured.when).toMatch(/^Nov\s10\sat\s5:41/);
    expect(view.others.map((other) => other.id)).toEqual(["exampleearnings"]);
    expect(view.others[0]?.outcome).toBe("Nothing to report. None of these stocks reports within 3 days.");
    expect(view.others[0]?.checked).toBe("The earnings calendar for the seven stocks, 3 calendar days ahead.");
  });

  it("words a quiet price check plainly and names the next check only after a scheduled run", () => {
    const quiet = run({ job_id: "examplebigmove", day: "2026-11-10", latest_close: "2026-11-10", counts: { names: 7, priced: 7, moves: 0 }, summary: "Checked, nothing to do. None of the 7 names met the rule on Nov 10." });
    const view = shapeExampleChecks({ agents: AGENTS, runs: [quiet], tickers: TICKERS }, "2026-11-11")!;
    expect(view.featured.outcome).toBe("Nothing to report. None of the seven stocks moved 5% or more on Nov 10.");
    expect(view.featured.decided).toBe("It stayed quiet. Nothing needed you.");
    // 5:41 PM ET on Nov 10 is the after-close runner, so Nov 11's run is promised.
    expect(view.featured.next).toBe("2026-11-11");

    // A run made by hand in the morning proves nothing about the nightly runner: no promise.
    const byHand = { ...quiet, day: "2026-11-11", ran_at: "2026-11-11T11:20:00.000Z" };
    expect(shapeExampleChecks({ agents: AGENTS, runs: [byHand], tickers: TICKERS }, "2026-11-11")!.featured.next).toBeNull();
  });

  it("says what the filing agent read", () => {
    const filings = run({
      job_id: "examplefilings",
      day: "2026-11-11",
      summary: "Checked, nothing to do. None of your names filed something big on Nov 11.",
      checked: ["SEC filings from Nov 11: 12 filings across the companies we cover", "Names in scope: 7, 0 filings from them"],
    });
    const view = shapeExampleChecks({ agents: AGENTS, runs: [filings], tickers: TICKERS }, "2026-11-11")!;
    expect(view.featured.checked).toBe("Every SEC filing from Nov 11: 12 across the companies we cover, none from these seven stocks.");
    expect(view.featured.outcome).toBe("Nothing to report. None of these stocks filed something big on Nov 11.");
  });

  it("words a single fresh close and an already-told earnings date for a visitor", () => {
    const one = run({ job_id: "examplebigmove", day: "2026-11-10", latest_close: "2026-11-10", counts: { names: 7, priced: 1 } });
    const told = run({ job_id: "exampleearnings", day: "2026-11-10", summary: "Checked, nothing to do. NVDA reports soon, and you were already told." });
    const view = shapeExampleChecks({ agents: AGENTS, runs: [one, told], tickers: TICKERS }, "2026-11-11")!;
    const byId = Object.fromEntries([view.featured, ...view.others].map((check) => [check.id, check]));
    expect(byId.examplebigmove?.outcome).toBe("Nothing to report. The one stock with a new close did not move 5% or more on Nov 10.");
    expect(byId.examplebigmove?.checked).toBe("Closing prices for one of the seven stocks, the latest from Nov 10.");
    expect(byId.exampleearnings?.outcome).toBe("Nothing to report. NVDA reports soon, which it had already said.");
  });

  it("leads with a quiet check over one that could not run on the same day", () => {
    const failed = run({ job_id: "exampleearnings", day: "2026-11-10", decision: "could_not_check", summary: "Could not check: the earnings calendar was not available." });
    const quiet = run({ job_id: "examplebigmove", day: "2026-11-10", latest_close: "2026-11-10", counts: { names: 7, priced: 7 } });
    expect(shapeExampleChecks({ agents: AGENTS, runs: [failed, quiet], tickers: TICKERS }, "2026-11-11")!.featured.id).toBe("examplebigmove");
  });

  it("caps the evidence and counts the rest", () => {
    const many = run({
      ...NVDA_DROP,
      findings: ["NVDA", "AAPL", "MSFT", "JPM"].map((ticker) => ({ ticker, headline: `${ticker} fell 6% in a day`, detail: "", source: "Daily closing prices", url: `/stock/${ticker}`, at: "2026-11-10" })),
    });
    const view = shapeExampleChecks({ agents: AGENTS, runs: [many], tickers: TICKERS }, "2026-11-11")!;
    expect(view.featured.findings).toHaveLength(3);
    expect(view.featured.more).toBe(1);
    expect(view.featured.outcome).toBe("Four stocks moved 5% or more in a day: NVDA, AAPL, MSFT, JPM.");
  });

  it("ignores runs dated after today and runs of other jobs", () => {
    const future = { ...NVDA_DROP, day: "2026-11-12" };
    const stranger = { ...NVDA_DROP, job_id: "someoneelse" };
    expect(shapeExampleChecks({ agents: AGENTS, runs: [future, stranger], tickers: TICKERS }, "2026-11-11")).toBeNull();
  });
});

describe("storedCheckFromDoc", () => {
  it("keeps only this account's well-formed runs", () => {
    const doc = { uid: "example-portfolio", job_id: "examplebigmove", day: "2026-11-10", decision: "notify", summary: "x", findings: [{ ticker: "nvda", headline: "NVDA fell", url: "/stock/NVDA", at: "2026-11-10T00:00:00Z" }, { headline: "" }] };
    const stored = storedCheckFromDoc(doc, "example-portfolio")!;
    expect(stored.findings).toEqual([{ ticker: "NVDA", headline: "NVDA fell", detail: "", source: "", url: "/stock/NVDA", at: "2026-11-10" }]);
    expect(storedCheckFromDoc(doc, "someone")).toBeNull();
    expect(storedCheckFromDoc({ ...doc, decision: "maybe" }, "example-portfolio")).toBeNull();
    expect(storedCheckFromDoc({ ...doc, day: "Nov 10" }, "example-portfolio")).toBeNull();
  });
});

describe("ranWords", () => {
  const now = new Date("2026-11-11T15:00:00Z"); // 10 AM ET
  it("says when, the way a person would", () => {
    expect(ranWords("2026-11-10T22:41:00Z", "2026-11-10", now)).toBe("last night");
    expect(ranWords("2026-11-11T04:10:00Z", "2026-11-10", now)).toBe("last night");
    expect(ranWords("2026-11-11T11:20:00Z", "2026-11-11", now)).toBe("this morning");
    expect(ranWords("2026-11-11T22:41:00Z", "2026-11-11", new Date("2026-11-11T23:30:00Z"))).toBe("this evening");
    expect(ranWords("2026-11-06T22:41:00Z", "2026-11-06", now)).toBe("on Nov 6");
    expect(ranWords("", "2026-11-06", now)).toBe("on Nov 6");
  });
});

describe("exampleAgentsSource", () => {
  const defs = AGENTS.map((agent) => ({ id: agent.id, draft: { name: agent.id, trigger: agent.trigger, scope: { kind: "tickers" as const, tickers: TICKERS } } }));
  it("is null until an example agent has run, and carries the flagged stocks of a run that found something", () => {
    expect(exampleAgentsSource(defs, [])).toBeNull();
    expect(exampleAgentsSource(defs, [{ ...NVDA_DROP, job_id: "someoneelse" }])).toBeNull();
    const source = exampleAgentsSource(defs, [NVDA_DROP, run({ job_id: "exampleearnings", day: "2026-11-10" })])!;
    expect(source.jobs.map((job) => job.id)).toEqual(["exampleearnings", "examplebigmove", "examplefilings"]);
    expect(source.runs.find((one) => one.job_id === "examplebigmove")?.tickers).toEqual(["NVDA"]);
    expect(source.runs.find((one) => one.job_id === "exampleearnings")?.tickers).toEqual([]);
  });
});

describe("ownCheckView", () => {
  const job = {
    id: "abc123def",
    name: "Big moves",
    enabled: true,
    weekly: false,
    trigger: { type: "price", rule: "moves_pct", pct: 5 } as AgentTrigger,
    scope: { kind: "tickers" as const, tickers: ["NVDA", "AAPL"] },
  };
  const doc = {
    uid: "u1",
    job_id: "abc123def",
    job_name: "Big moves",
    day: "2026-11-10",
    ran_at: "2026-11-10T22:41:00.000Z",
    decision: "notify",
    summary: "NVDA fell 5.47% in a day.",
    findings: [{ ticker: "NVDA", headline: "NVDA fell 5.47% in a day", detail: "Closed at $168.89 on Nov 10, −5.47% on the day before ($178.67).", source: "Daily closing prices", url: "/stock/NVDA", at: "2026-11-10" }],
    checked: ["Daily closes for 2 names, latest Nov 10"],
    latest_close: "2026-11-10",
    counts: { names: 2, priced: 2, moves: 1 },
  };

  it("opens a person's own run with what it examined, in their words, and the stocks it looked at", () => {
    const stored = watchRunFromDoc(doc, "u1")!;
    expect(stored.detail?.findings).toHaveLength(1);
    const view = ownCheckView(job, [stored], "2026-11-11")!;
    expect(view.ask).toMatch(/NVDA/);
    expect(view.checked).toBe("Closing prices for the two stocks, the latest from Nov 10.");
    expect(view.stocks).toEqual(["NVDA", "AAPL"]);
    expect(view.flagged).toEqual(["NVDA"]);
    expect(view.findings[0]?.detail).toBe("Closed at $168.89 on Nov 10, down 5.47% from $178.67 the day before.");
  });

  it("is null for an agent that has not run, or a run read without its detail", () => {
    expect(ownCheckView(job, [], "2026-11-11")).toBeNull();
    const { detail: _drop, ...bare } = watchRunFromDoc(doc, "u1")!;
    expect(ownCheckView(job, [bare], "2026-11-11")).toBeNull();
  });

  it("words the evaluator's counting phrases as plain sentences about your stocks", () => {
    const daily = { ...job, trigger: { type: "schedule", cadence: "daily_open" } as AgentTrigger };
    const stored = watchRunFromDoc({ ...doc, decision: "nothing", findings: [], summary: "Checked, nothing to do. None of your names met the rule, across the 2 names." }, "u1")!;
    expect(ownCheckView(daily, [stored], "2026-11-11")!.outcome).toBe("Nothing to report. None of your stocks met the rule, across the 2 stocks.");
  });

  it("says 'your stocks' when a watchlist rule stored no count", () => {
    const watchlist = { ...job, scope: { kind: "watchlist" as const } };
    const stored = watchRunFromDoc({ ...doc, counts: null, decision: "nothing", findings: [], summary: "Checked, nothing to do." }, "u1")!;
    expect(ownCheckView(watchlist, [stored], "2026-11-11")!.checked).toBe("Closing prices for your stocks, the latest from Nov 10.");
  });
});

describe("checkSteps", () => {
  it("asks about a person's own agent by its id and opens it to change", () => {
    const steps = checkSteps({ id: "abc123def", day: "2026-11-10", decision: "notify", flagged: ["NVDA"] }, "mine");
    expect(steps.ask).toEqual({ question: "Why did my agent flag NVDA on Nov 10, and does it need me?", context: "agent:abc123def" });
    expect(steps.change).toEqual({ label: "Change this watch", href: "/agents?job=abc123def" });
  });

  it("asks about the example's check through the stock it flagged or the example portfolio", () => {
    expect(checkSteps({ id: "examplebigmove", day: "2026-11-10", decision: "notify", flagged: ["NVDA"] }, "example").ask.context).toBe("stock:NVDA");
    const quiet = checkSteps({ id: "examplebigmove", day: "2026-11-10", decision: "nothing", flagged: [] }, "example");
    expect(quiet.ask).toEqual({ question: "What did the example's agent check on Nov 10, and what would make it speak up?", context: "ex.portfolio" });
    expect(quiet.change).toBeNull();
  });
});
