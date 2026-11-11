import { describe, expect, it } from "vitest";

import { buildAgentLog, dataChecks, type AgentsSource } from "@/lib/portfolio-home/log";
import { askFor, contextFor, checkIdOf, exampleWatchLine, findingLoop, foldedCheckIds, matchAgent, nextWords, stampWords, watchPlan, watchStatus } from "@/lib/portfolio-home/loop";
import { pickNoticed, type HomeSources, type Loaded, type Noticed } from "@/lib/portfolio-home/pick";
import { pickQuestions } from "@/lib/portfolio-home/questions";

const TODAY = "2026-11-11"; // a Wednesday
// Loaded<never> fits any source's slot, so fixtures can stay partial.
const ok = (value: unknown): Loaded<never> => ({ state: "ready", value: value as never });
const empty = { state: "empty" } as const;

function item(overrides: Partial<Noticed> & Pick<Noticed, "id" | "tool">): Noticed {
  return { caption: overrides.tool, tone: "flat", text: `${overrides.id} text.`, evidence: null, ticker: null, open: { label: "Open", href: "/x" }, watch: null, priority: 50, ...overrides };
}

const report = item({
  id: "earnings-NVDA",
  tool: "earnings",
  ticker: "NVDA",
  watch: { href: "/agents?q=Tell%20me%203%20days%20before%20NVDA%20reports%20earnings", request: "Tell me 3 days before NVDA reports earnings" },
});
const trim = item({ id: "ideas-trim-MSFT", tool: "ideas", ticker: "MSFT", watch: { href: "/agents?q=Tell%20me%20when%20MSFT%20moves%205%25%20in%20a%20day", request: "Tell me when MSFT moves 5% in a day" } });
const reason = item({ id: "reason-UNH-played_out", tool: "portfolio", ticker: "UNH" });
const loss = item({ id: "ideas-loss-UNH", tool: "ideas", ticker: "UNH", watch: { href: "/agents?q=x", request: "Tell me if UNH drops below $380" } });

const sources: Partial<HomeSources> = {
  memo: ok({ mode: "mine", memo: { weekKey: "2026-W46", monday: "2026-11-09", endDay: "2026-11-10", writtenAt: "2026-11-11T02:30:00.000Z", hurt: [], look: [] }, history: [], missingWeek: false }),
  reasons: ok({ checks: [{ ticker: "UNH", verdict: "played_out", asOf: "2026-11-11", change: null }], withReason: 1, holdings: 1, locked: 0 }),
  season: ok({ asOf: "2026-11-09T20:13:00.000Z", season: { reporting: [{ ticker: "NVDA", name: "NVIDIA", kind: "holding", next: { date: "2026-11-17", session: "amc" } }] } }),
  goal: ok({ pricesAsOf: "2026-11-10", portfolioValue: 128270, unvalued: [] }),
};

function agents(jobs: AgentsSource["jobs"], runs: Array<Partial<AgentsSource["runs"][number]>> = []): AgentsSource {
  return {
    jobs,
    runs: runs.map((run) => ({ job_id: "e1", job_name: "NVDA earnings", day: "2026-11-10", ran_at: "2026-11-10T22:40:00.000Z", decision: "nothing", summary: "Nothing yet.", ...run })),
  };
}

const earningsJob = { id: "e1", name: "NVDA earnings", enabled: true, trigger: { type: "event", event: "earnings_approaching", days_before: 3 }, scope: { kind: "tickers", tickers: ["NVDA"] } } as AgentsSource["jobs"][number];
const moveJob = { id: "m1", name: "Big moves", enabled: true, trigger: { type: "price", rule: "moves_pct", pct: 5 }, scope: { kind: "watchlist" } } as AgentsSource["jobs"][number];

describe("the check that explains a finding", () => {
  it("maps each finding to the data check behind it", () => {
    expect(checkIdOf(report)).toBe("calendar");
    expect(checkIdOf(reason)).toBe("reasons");
    expect(checkIdOf(trim)).toBe("prices");
    expect(checkIdOf(item({ id: "memo-2026-W46", tool: "memo" }))).toBe("memo-2026-W46");
    expect(checkIdOf(item({ id: "dividend-COST", tool: "dividends" }))).toBeNull();
  });

  it("puts the real check, with its own time, on the finding and leaves it out of the log", () => {
    const checks = dataChecks(sources, "mine", TODAY);
    const loop = findingLoop(report, checks, "example");
    expect(loop.check).toMatchObject({ id: "calendar", day: "2026-11-09", at: "2026-11-09T20:13:00.000Z" });
    const omit = foldedCheckIds([report, reason], checks);
    expect([...omit].sort()).toEqual(["calendar", "reasons"]);
    const log = buildAgentLog({ sources, agents: null, mode: "mine", today: TODAY, omit });
    expect(log.checked.map((row) => row.id).sort()).toEqual(["memo-2026-W46", "prices"]);
  });

  it("never folds a check that does not exist", () => {
    expect([...foldedCheckIds([trim], dataChecks({}, "mine", TODAY))]).toEqual([]);
    expect(findingLoop(trim, dataChecks({}, "mine", TODAY), "mine").check).toBeNull();
  });
});

describe("ask and watch", () => {
  it("asks the finding's own question, and the memo's only about your own week", () => {
    expect(askFor(report, "example")).toEqual({ question: "What should I know before NVDA reports earnings?", href: "/ask?q=What%20should%20I%20know%20before%20NVDA%20reports%20earnings%3F&ctx=stock%3ANVDA" });
    expect(askFor(item({ id: "memo-1", tool: "memo" }), "example")).toBeNull();
    expect(askFor(item({ id: "memo-1", tool: "memo" }), "mine")?.question).toBe("What changed in my portfolio since yesterday?");
  });

  it("sends the finding's item to Ask, marking the example's", () => {
    expect(contextFor(reason, "mine")).toBe("reason:UNH");
    expect(contextFor(reason, "example")).toBe("ex.reason:UNH");
    expect(contextFor(item({ id: "memo-1", tool: "memo" }), "mine")).toBe("memo");
    expect(contextFor(report, "example")).toBe("stock:NVDA");
    expect(contextFor(item({ id: "ideas-quiet", tool: "ideas" }), "example")).toBe("ex.portfolio");
  });

  it("watches a reason with the reason watcher and anything else with the agent request it carries", () => {
    expect(watchPlan(reason, "mine")).toMatchObject({ kind: "reasons" });
    expect(watchPlan(reason, "example")).toEqual({ kind: "reasons", text: "The reason watcher keeps checking the example's reason for owning UNH." });
    expect(watchPlan(report, "mine")).toEqual({ kind: "agent", request: report.watch!.request, href: report.watch!.href, shape: "earnings", amount: 3 });
    expect(watchPlan(trim, "mine")).toMatchObject({ shape: "move", amount: 5 });
    expect(watchPlan(loss, "mine")).toMatchObject({ shape: "other" });
    expect(watchPlan(item({ id: "ideas-quiet", tool: "ideas" }), "mine")).toBeNull();
  });
});

describe("matchAgent", () => {
  it("finds the agent that already has the rule, by name or through the watchlist", () => {
    const list = agents([earningsJob, moveJob], [{}]);
    expect(matchAgent(watchPlan(report, "mine"), "NVDA", list, new Set(), TODAY)).toMatchObject({ id: "e1", name: "NVDA earnings", lastRun: { day: "2026-11-10" } });
    expect(matchAgent(watchPlan(trim, "mine"), "MSFT", list, new Set(["MSFT"]), TODAY)).toMatchObject({ id: "m1" });
    // Not tracked, so the watchlist agent does not cover it.
    expect(matchAgent(watchPlan(trim, "mine"), "MSFT", list, new Set(), TODAY)).toBeNull();
    // A different threshold is a different rule.
    const tenPct = agents([{ ...moveJob, trigger: { type: "price", rule: "moves_pct", pct: 10 } }]);
    expect(matchAgent(watchPlan(trim, "mine"), "MSFT", tenPct, new Set(["MSFT"]), TODAY)).toBeNull();
    const oneDay = agents([{ ...earningsJob, trigger: { type: "event", event: "earnings_approaching", days_before: 1 } }]);
    expect(matchAgent(watchPlan(report, "mine"), "NVDA", oneDay, new Set(), TODAY)).toBeNull();
    // An unset threshold is the runner's default (3 days, 5%).
    const defaults = agents([{ ...earningsJob, trigger: { type: "event", event: "earnings_approaching" } }]);
    expect(matchAgent(watchPlan(report, "mine"), "NVDA", defaults, new Set(), TODAY)).toMatchObject({ id: "e1" });
    // A request we do not match is never claimed.
    expect(matchAgent(watchPlan(loss, "mine"), "UNH", list, new Set(["UNH"]), TODAY)).toBeNull();
  });

  it("names the next check only when the after-close runner ran for the last market day", () => {
    const ran = agents([earningsJob], [{ day: "2026-11-10", ran_at: "2026-11-10T22:40:00.000Z" }]);
    expect(matchAgent(watchPlan(report, "mine"), "NVDA", ran, new Set(), TODAY)!.next).toBe(TODAY);
    const stale = agents([earningsJob], [{ day: "2026-11-02", ran_at: "2026-11-02T22:40:00.000Z" }]);
    expect(matchAgent(watchPlan(report, "mine"), "NVDA", stale, new Set(), TODAY)!.next).toBeNull();
    const paused = agents([{ ...earningsJob, enabled: false }], [{}]);
    expect(matchAgent(watchPlan(report, "mine"), "NVDA", paused, new Set(), TODAY)).toMatchObject({ enabled: false, next: null });
  });

  it("prefers an agent that is on over a paused one", () => {
    const both = agents([{ ...earningsJob, id: "p", name: "Old", enabled: false }, earningsJob]);
    expect(matchAgent(watchPlan(report, "mine"), "NVDA", both, new Set(), TODAY)!.id).toBe("e1");
  });
});

describe("watchStatus", () => {
  const plan = watchPlan(report, "mine");
  it("says whether an agent already does it, and never guesses", () => {
    expect(watchStatus({ plan, match: null, agents: "none" })).toBe("No agent watches this yet.");
    expect(watchStatus({ plan, match: null, agents: "ready" })).toBe("None of your agents does this yet.");
    expect(watchStatus({ plan, match: null, agents: "slow" })).toBe("We could not read your agents just now.");
    expect(watchStatus({ plan: watchPlan(loss, "mine"), match: null, agents: "ready" })).toBeNull();
    expect(watchStatus({ plan: watchPlan(reason, "mine"), match: null, agents: "ready" })).toBeNull();
  });

  it("reads the agent's last run back with its real time", () => {
    const match = matchAgent(plan, "NVDA", agents([earningsJob], [{}]), new Set(), TODAY);
    expect(watchStatus({ plan, match, agents: "ready" })).toBe("Your agent “NVDA earnings” does this. It last ran Nov 10 at 5:40 PM ET and found nothing to tell you.");
    expect(watchStatus({ plan, match: { ...match!, lastRun: null }, agents: "ready" })).toBe("Your agent “NVDA earnings” does this. It has not run yet.");
    expect(watchStatus({ plan, match: { ...match!, enabled: false }, agents: "ready" })).toBe("Your agent “NVDA earnings” does this, but it is paused.");
  });

  it("formats times in New York and days without one", () => {
    expect(stampWords("2026-11-09T20:13:00.000Z", "2026-11-09")).toBe("Nov 9 at 3:13 PM ET");
    expect(stampWords(null, "2026-11-10")).toBe("Nov 10");
    expect(stampWords(null, null)).toBe("");
    expect(nextWords(TODAY, TODAY)).toBe("After the close today.");
    expect(nextWords("2026-11-12", TODAY)).toBe("After the close on Nov 12.");
  });
});

describe("the Ask box beside the findings", () => {
  it("does not repeat a question a lead finding already offers", () => {
    const xray = ok({ xray: { companies: [{ ticker: "AAPL" }, { ticker: "MSFT" }, { ticker: "NVDA" }] } });
    const season = ok({ season: { reporting: [{ ticker: "NVDA", kind: "holding", next: { date: "2026-11-17" } }] } });
    const questions = pickQuestions({ lead: [], rest: [], sources: { xray, season } as Partial<HomeSources>, mode: "example", skip: ["What should I know before NVDA reports earnings?"] });
    expect(questions.map((row) => row.question)).not.toContain("What should I know before NVDA reports earnings?");
    expect(questions.length).toBeGreaterThan(0);
  });
});

describe("lead findings speak about the stock they are labelled with", () => {
  it("keeps a trim idea's lines on the company to sell, with the portfolio-wide read as context", () => {
    const ideas = ok({
      subject: "example",
      pricesAsOf: "2026-11-10",
      snapshotDay: "2026-11-11",
      plan: {
        total: 1000,
        trims: [{ kind: "company", ticker: "MSFT", name: "Microsoft", subject: "Microsoft", before: 14, after: 9.9, shares: 10, call: "Hold", sentence: "Selling about 10 Microsoft shares would bring it from 14% to 9.9% of this portfolio." }],
        adds: [],
      },
      losses: [],
      read: { headline: "3 companies are each above 10% of this portfolio once funds are counted, led by Apple at 17%.", insights: [] },
    });
    const [found] = pickNoticed({ memo: empty, xray: empty, season: empty, dividends: empty, stress: empty, ideas }, "example");
    expect(found).toMatchObject({ ticker: "MSFT", headline: "Microsoft is 14% of the example once funds are counted." });
    expect(found!.text).toBe("Selling about 10 Microsoft shares would bring it from 14% to 9.9% of this portfolio.");
    expect(found!.text).not.toContain("Apple");
    expect(found!.why).toBe("Selling about 10 shares would bring it to 9.9%.");
    expect(found!.evidence).toBe("3 companies are each above 10% of this portfolio once funds are counted, led by Apple at 17%. Our call on Microsoft is to keep it.");
    expect(found!.source).toEqual({ label: "Closing prices and our daily screen", day: "2026-11-10", at: null });
  });

  it("gives the earnings finding a short headline and the calendar's capture time as its source", () => {
    const season = ok({
      mode: "example",
      asOf: "2026-11-09T20:13:00.000Z",
      season: {
        today: TODAY,
        reporting: [
          { ticker: "NVDA", name: "NVIDIA", kind: "holding", weight: 11, next: { date: "2026-11-17", session: "amc" }, past: [], stats: { count: 0, usual: 3, usualKind: "median", vsNormalDay: null } },
          { ticker: "COST", name: "Costco", kind: "holding", weight: 4, next: { date: "2026-12-10", session: null }, past: [], stats: { count: 0, usual: 1, usualKind: "median", vsNormalDay: null } },
        ],
      },
    });
    const [found] = pickNoticed({ memo: empty, xray: empty, season, dividends: empty, stress: empty, ideas: empty }, "example");
    expect(found!.headline).toBe("NVIDIA reports on Nov 17 after the close.");
    expect(found!.why).toBe("Of the holdings reporting soon, its report matters most: it is 11% of the example portfolio.");
    expect(found!.source).toEqual({ label: "Earnings calendar", day: "2026-11-09", at: "2026-11-09T20:13:00.000Z" });
  });

  it("heads a weakened reason with the stock and its signal's own source", () => {
    const reasons = ok({
      checks: [
        { ticker: "UNH", verdict: "played_out", asOf: "2026-11-11", signals: [{ text: "It is no longer cheap.", source: "Company results in our daily screen", asOf: "2026-11-10" }], checked: [] },
        { ticker: "KO", verdict: "holds", asOf: "2026-11-11", signals: [], checked: [] },
      ],
      withReason: 2,
      holdings: 2,
      locked: 0,
    });
    const [found] = pickNoticed({ memo: empty, xray: empty, season: empty, dividends: empty, stress: empty, ideas: empty, reasons }, "example");
    expect(found).toMatchObject({ headline: "The reason for owning UNH has played out.", why: null, evidence: "It is no longer cheap." });
    expect(found!.source).toEqual({ label: "Company results in our daily screen", day: "2026-11-10", at: null });
  });
});

describe("exampleWatchLine", () => {
  const example: AgentsSource = {
    jobs: [
      { id: "exampleearnings", name: "Earnings in the next 3 days", enabled: true, trigger: { type: "event", event: "earnings_approaching", days_before: 3 }, scope: { kind: "tickers", tickers: ["NVDA", "MSFT"] } },
      { id: "examplebigmove", name: "5% moves in a day", enabled: true, trigger: { type: "price", rule: "moves_pct", pct: 5 }, scope: { kind: "tickers", tickers: ["NVDA", "MSFT"] } },
    ],
    runs: [
      { job_id: "exampleearnings", job_name: "", day: "2026-11-10", ran_at: "2026-11-10T22:41:00.000Z", decision: "nothing", summary: "" },
      { job_id: "examplebigmove", job_name: "", day: "2026-11-10", ran_at: "2026-11-10T22:41:00.000Z", decision: "notify", summary: "MSFT fell 6%.", tickers: ["MSFT"] },
    ],
  };

  it("names the example's agent that watches the finding, with its real last check", () => {
    const line = exampleWatchLine({ plan: watchPlan(report, "example"), ticker: "NVDA", agents: example, today: TODAY });
    expect(line?.fired).toBe(false);
    expect(line?.text).toBe("An agent watches this for the example. Its Nov 10 check found nothing.");
  });

  it("says when that agent flagged the finding's stock, and links to its check on the page", () => {
    const line = exampleWatchLine({ plan: watchPlan(trim, "example"), ticker: "MSFT", agents: example, today: TODAY });
    expect(line).toMatchObject({ fired: true, link: { href: "#agents-head" } });
    expect(line?.text).toBe("An agent flagged this for the example on Nov 10.");
  });

  it("says an older alert was an alert, not news and not 'found nothing'", () => {
    const line = exampleWatchLine({ plan: watchPlan(trim, "example"), ticker: "MSFT", agents: example, today: "2026-11-16" });
    expect(line).toMatchObject({ fired: false, link: null, text: "An agent watches this for the example. It flagged it on Nov 10." });
  });

  it("claims nothing for a stock or a rule none of them covers", () => {
    expect(exampleWatchLine({ plan: watchPlan(loss, "example"), ticker: "UNH", agents: example, today: TODAY })).toBeNull();
    expect(exampleWatchLine({ plan: watchPlan(report, "example"), ticker: "AAPL", agents: example, today: TODAY })).toBeNull();
  });

  it("does not pass another stock's alert off as this one's", () => {
    const nvdaMove = { ...trim, id: "x-NVDA", ticker: "NVDA", watch: { href: "/agents?q=x", request: "Tell me when NVDA moves 5% in a day" } };
    const line = exampleWatchLine({ plan: watchPlan(nvdaMove, "example"), ticker: "NVDA", agents: example, today: TODAY });
    expect(line?.fired).toBe(false);
    expect(line?.text).toBe("An agent watches this for the example. Its Nov 10 check found nothing on NVDA.");
  });
});
