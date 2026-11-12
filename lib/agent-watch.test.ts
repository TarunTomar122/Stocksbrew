import { describe, expect, it } from "vitest";

import type { AgentTrigger } from "@/lib/agent-jobs";
import { activeWatches, firedFor, nextCheckFor, nextCheckWords, outcomeWords, runIdsToRead, runTickers, stampWords, watchRunFromDoc } from "@/lib/agent-watch";
import type { AgentsSource } from "@/lib/portfolio-home/log";
import { findingWatchLine, matchAgent, watchPlan } from "@/lib/portfolio-home/loop";
import type { Lead } from "@/lib/portfolio-home/focus";

const TODAY = "2026-11-11"; // a Wednesday
const UID = "test-user-0001";

type Run = AgentsSource["runs"][number];

/** A run the after-close runner made: 5:40 PM New York time on the day it read. */
function run(job: string, day: string, extra: Partial<Run> = {}): Run {
  return { job_id: job, job_name: job, day, ran_at: `${day}T22:40:00.000Z`, decision: "nothing", summary: "Nothing moved 5% or more.", ...extra };
}

const MOVE: AgentTrigger = { type: "price", rule: "moves_pct", pct: 5 };
const EARNINGS: AgentTrigger = { type: "event", event: "earnings_approaching", days_before: 3 };
const WEEKLY: AgentTrigger = { type: "schedule", cadence: "weekly", weekday: 1 };

function source(runs: Run[], jobs?: AgentsSource["jobs"]): AgentsSource {
  return {
    jobs: jobs ?? [
      { id: "moves", name: "Big daily moves", enabled: true, trigger: MOVE, scope: { kind: "tickers", tickers: ["NVDA"] } },
      { id: "earn", name: "Earnings coming up", enabled: true, trigger: EARNINGS, scope: { kind: "watchlist" } },
      { id: "off", name: "Price level", enabled: false, trigger: { type: "price", rule: "crosses_above", level: 200 }, scope: { kind: "tickers", tickers: ["AAPL"] } },
    ],
    runs,
  };
}

describe("activeWatches", () => {
  it("lists only switched-on agents, each with its plain rule, newest run, outcome and next check", () => {
    const summary = activeWatches(source([run("moves", "2026-11-10"), run("moves", "2026-11-09"), run("earn", "2026-11-10", { decision: "notify", summary: "NVDA reports in 3 days", tickers: ["nvda"] })]), TODAY);
    expect(summary.paused).toBe(1);
    expect(summary.rows.map((row) => row.id)).toEqual(["moves", "earn"]);
    const [moves, earn] = summary.rows;
    expect(moves!.what).toBe("Tell me when NVDA closes 5% or more away from the day before.");
    expect(moves!.href).toBe("/agents?job=moves");
    expect(moves!.last).toMatchObject({ day: "2026-11-10", decision: "nothing", outcome: "Nothing to report.", tickers: [] });
    expect(moves!.last!.when).toBe("yesterday at 5:40 PM ET");
    // The runner ran for yesterday's close, so the next check is after today's.
    expect(moves!.next).toBe(TODAY);
    expect(earn!.last).toMatchObject({ decision: "notify", outcome: "NVDA reports in 3 days.", tickers: ["NVDA"] });
  });

  it("promises no next check when the runner did not run for the last market day", () => {
    const summary = activeWatches(source([run("moves", "2026-11-06")]), TODAY);
    expect(summary.rows.every((row) => row.next === null)).toBe(true);
  });

  it("does not count a run made by hand during the day as proof the runner is running", () => {
    const summary = activeWatches(source([run("moves", "2026-11-10", { ran_at: "2026-11-10T15:00:00.000Z" })]), TODAY);
    expect(summary.rows[0]!.last).not.toBeNull();
    expect(summary.rows[0]!.next).toBeNull();
  });

  it("says an agent has not run yet rather than inventing a check", () => {
    const summary = activeWatches(source([run("moves", "2026-11-10")]), TODAY);
    expect(summary.rows.find((row) => row.id === "earn")!.last).toBeNull();
  });

  it("moves the next check to tomorrow once tonight's run is in", () => {
    const summary = activeWatches(source([run("moves", TODAY)]), TODAY);
    expect(summary.rows[0]!.next).toBe("2026-11-12");
  });
});

describe("nextCheckFor", () => {
  const job = { enabled: true, trigger: MOVE };
  const ran = (day: string, extra: Partial<Run> = {}) => run("j", day, extra);

  it("skips weekends and NYSE holidays", () => {
    // Friday's run is in, so Monday is next.
    expect(nextCheckFor(job, [ran("2026-11-13")], "2026-11-14")).toBe("2026-11-16");
    // Wednesday Nov 25 ran; Thanksgiving (Nov 26) has no close to read.
    expect(nextCheckFor(job, [ran("2026-11-25")], "2026-11-25")).toBe("2026-11-27");
  });

  it("accepts the Friday after Thanksgiving as proven when Wednesday ran", () => {
    expect(activeWatches(source([run("moves", "2026-11-25")]), "2026-11-27").rows[0]!.next).toBe("2026-11-27");
  });

  it("skips a day the agent was already run for by hand: the runner keeps one run per day", () => {
    expect(nextCheckFor(job, [ran("2026-11-10"), ran(TODAY, { ran_at: `${TODAY}T16:00:00.000Z` })], TODAY)).toBe("2026-11-12");
  });

  it("promises nothing for an agent the runner skipped, even when the person's other agents ran", () => {
    // A job past the plan's limit is left out by the runner: its own newest scheduled run is old.
    const summary = activeWatches(source([run("moves", "2026-11-10"), run("earn", "2026-11-04")]), TODAY);
    expect(summary.rows.find((row) => row.id === "moves")!.next).toBe(TODAY);
    expect(summary.rows.find((row) => row.id === "earn")!.next).toBeNull();
  });

  it("puts a weekly agent on its own day, once it ran on the last day it was due", () => {
    const weekly = { enabled: true, trigger: WEEKLY };
    expect(nextCheckFor(weekly, [ran("2026-11-09")], TODAY)).toBe("2026-11-16");
    // It missed Monday Nov 9: nothing proves the runner is checking it.
    expect(nextCheckFor(weekly, [ran("2026-11-02")], TODAY)).toBeNull();
  });

  it("is null for a paused agent or with no proof", () => {
    expect(nextCheckFor({ enabled: false, trigger: MOVE }, [ran("2026-11-10")], TODAY)).toBeNull();
    expect(nextCheckFor(job, [], TODAY)).toBeNull();
    expect(nextCheckFor(job, [ran("2026-11-10", { ran_at: "2026-11-10T15:00:00.000Z" })], TODAY)).toBeNull();
  });
});

describe("words", () => {
  it("says the outcome plainly", () => {
    expect(outcomeWords({ decision: "nothing", summary: "Nothing moved." })).toBe("Nothing to report.");
    expect(outcomeWords({ decision: "could_not_check", summary: "" })).toBe("It could not check this time.");
    expect(outcomeWords({ decision: "notify", summary: "" })).toBe("It found something to tell you.");
    expect(outcomeWords({ decision: "notify", summary: "AMD fell 6.2%." })).toBe("AMD fell 6.2%.");
  });

  it("names the next check from the real schedule", () => {
    expect(nextCheckWords(TODAY, TODAY)).toBe("after the close today, from 5:30 PM ET");
    expect(nextCheckWords("2026-11-12", TODAY)).toBe("after the close tomorrow");
    expect(nextCheckWords("2026-11-16", TODAY)).toBe("after the close on Monday");
    expect(nextCheckWords("2026-11-20", TODAY)).toBe("after the close on Nov 20");
  });

  it("falls back to the day when a run has no time", () => {
    expect(stampWords("", "2026-11-10", TODAY)).toBe("yesterday");
    expect(stampWords("", "2026-11-03", TODAY)).toBe("Nov 3");
  });

  it("says the run's day in words before its time", () => {
    expect(stampWords("2026-11-11T22:40:00Z", "2026-11-11", TODAY)).toBe("today at 5:40 PM ET");
    expect(stampWords("2026-11-09T22:40:00Z", "2026-11-09", TODAY)).toBe("Monday at 5:40 PM ET");
    expect(stampWords("2026-11-03T22:40:00Z", "2026-11-03", TODAY)).toBe("Nov 3 at 5:40 PM ET");
  });
});

describe("firedFor", () => {
  it("finds the newest active agent run that flagged the stock", () => {
    const agents = source([run("moves", "2026-11-10", { decision: "notify", tickers: ["NVDA"] }), run("earn", "2026-11-09", { decision: "notify", tickers: ["NVDA"] })]);
    expect(firedFor("nvda", agents, TODAY)?.job.id).toBe("moves");
    expect(firedFor("AAPL", agents, TODAY)).toBeNull();
    expect(firedFor(null, agents, TODAY)).toBeNull();
  });

  it("does not bring back an alert older than the last market day", () => {
    const agents = source([run("moves", "2026-11-06", { decision: "notify", tickers: ["NVDA"] })]);
    expect(firedFor("NVDA", agents, TODAY)).toBeNull();
  });

  it("ignores a stock flagged in an older run when the newest one found nothing", () => {
    const agents = source([run("moves", "2026-11-10"), run("moves", "2026-11-09", { decision: "notify", tickers: ["NVDA"] })]);
    expect(firedFor("NVDA", agents, TODAY)).toBeNull();
  });
});

describe("findingWatchLine", () => {
  const lead = (extra: Partial<Lead>): Lead =>
    ({
      id: "move-NVDA",
      tool: "xray",
      ticker: "NVDA",
      tone: "down",
      text: "NVDA fell.",
      watch: { request: "Tell me when NVDA moves 5% in a day", href: "/agents?watch=NVDA" },
      action: { kind: "watch", label: "Watch this", href: "/agents?watch=NVDA" },
      ...extra,
    }) as unknown as Lead;

  it("links to the run when the agent that has the rule flagged it", () => {
    const item = lead({});
    const agents = source([run("moves", "2026-11-10", { decision: "notify", tickers: ["NVDA"] })]);
    const plan = watchPlan(item, "mine");
    const match = matchAgent(plan, "NVDA", agents, new Set(), TODAY);
    const line = findingWatchLine({ plan, match, ticker: "NVDA", agents: { state: "ready", value: agents }, mine: true, reasonDay: null, today: TODAY });
    expect(line).toMatchObject({ fired: true, link: { href: "/agents?job=moves" } });
    expect(line!.text).toContain("“Big daily moves” flagged this yesterday at 5:40");
  });

  it("does not say it flagged this stock when the agent's run flagged another one", () => {
    const item = lead({});
    const agents = source([run("moves", "2026-11-10", { decision: "notify", summary: "AMD fell 6%.", tickers: ["AMD"] })]);
    const plan = watchPlan(item, "mine");
    const match = matchAgent(plan, "NVDA", agents, new Set(), TODAY);
    const line = findingWatchLine({ plan, match, ticker: "NVDA", agents: { state: "ready", value: agents }, mine: true, reasonDay: null, today: TODAY });
    expect(line?.fired).toBe(false);
    expect(line?.text).not.toContain("flagged");
  });

  it("gives the agent's quiet outcome when it found nothing", () => {
    const item = lead({});
    const agents = source([run("moves", "2026-11-10")]);
    const plan = watchPlan(item, "mine");
    const match = matchAgent(plan, "NVDA", agents, new Set(), TODAY);
    const line = findingWatchLine({ plan, match, ticker: "NVDA", agents: { state: "ready", value: agents }, mine: true, reasonDay: null, today: TODAY });
    expect(line).toMatchObject({ fired: false, link: null });
    expect(line!.text).toContain("found nothing to tell you");
  });

  it("points at another agent's run that flagged the stock", () => {
    const item = lead({ watch: null } as Partial<Lead>);
    const agents = source([run("earn", "2026-11-10", { decision: "notify", tickers: ["NVDA"] })]);
    const line = findingWatchLine({ plan: watchPlan(item, "mine"), match: null, ticker: "NVDA", agents: { state: "ready", value: agents }, mine: true, reasonDay: null, today: TODAY });
    expect(line).toMatchObject({ fired: true, text: "Your agent “Earnings coming up” flagged NVDA yesterday.", link: { href: "/agents?job=earn" } });
  });

  it("never reads the person's agents onto the example", () => {
    const item = lead({});
    const agents = source([run("earn", "2026-11-10", { decision: "notify", tickers: ["NVDA"] })]);
    const line = findingWatchLine({ plan: watchPlan(item, "example"), match: null, ticker: "NVDA", agents: { state: "ready", value: agents }, mine: false, reasonDay: null, today: TODAY });
    expect(line).toEqual({ text: "No agent watches this yet.", link: null, fired: false });
  });

  it("dates the reason watcher's last check on a reason finding", () => {
    const item = lead({ id: "reason-NVDA", watch: null } as Partial<Lead>);
    const line = findingWatchLine({ plan: watchPlan(item, "mine"), match: null, ticker: "NVDA", agents: { state: "empty" }, mine: true, reasonDay: "2026-11-10", today: TODAY });
    expect(line).toEqual({ text: "The reason watcher last checked this yesterday.", link: null, fired: false });
  });

  it("says so when the agents could not be read", () => {
    const item = lead({});
    const line = findingWatchLine({ plan: watchPlan(item, "mine"), match: null, ticker: "NVDA", agents: { state: "slow" }, mine: true, reasonDay: null, today: TODAY });
    expect(line?.text).toBe("We could not read your agents just now.");
  });
});

describe("reading runs", () => {
  it("reads each job's last checked day and the runner's proof days by id", () => {
    const ids = runIdsToRead(UID, [{ id: "moves1", last_checked_day: "2026-11-06" }, { id: "BAD ID", last_checked_day: TODAY }], TODAY);
    expect(ids).toEqual([`${UID}__moves1__2026-11-06`, `${UID}__moves1__${TODAY}`, `${UID}__moves1__2026-11-10`]);
  });

  it("keeps only this person's well-formed runs, with the flagged tickers", () => {
    const doc = { uid: UID, job_id: "moves1", job_name: "Big daily moves", day: "2026-11-10", ran_at: "2026-11-10T22:40:00.000Z", decision: "notify", summary: "NVDA fell 6%.", findings: [{ ticker: "nvda" }, { ticker: null }, { ticker: "NVDA" }, { ticker: "AMD" }] };
    expect(watchRunFromDoc(doc, UID)).toMatchObject({ job_id: "moves1", decision: "notify", tickers: ["NVDA", "AMD"] });
    expect(watchRunFromDoc(doc, "someone-else")).toBeNull();
    expect(watchRunFromDoc({ ...doc, decision: "maybe" }, UID)).toBeNull();
    expect(watchRunFromDoc({ ...doc, day: "Nov 10" }, UID)).toBeNull();
  });

  it("drops junk tickers from findings", () => {
    expect(runTickers([{ ticker: "brk.b" }, { ticker: "<script>" }, { ticker: "" }])).toEqual(["BRK.B"]);
  });
});
