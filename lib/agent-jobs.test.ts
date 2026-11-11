import { describe, expect, it } from "vitest";

import {
  AGENT_TEMPLATES,
  EMPTY_FACTS,
  cleanTickers,
  closesAsOf,
  describeJob,
  evaluateJob,
  parseJobDraft,
  replayJob,
  runDocId,
  scheduleDue,
  type AgentFacts,
  type AgentJobDraft,
} from "@/lib/agent-jobs";

/** Weekdays from 2026-10-05 (a Monday) for five weeks. */
function sessions(): string[] {
  const out: string[] = [];
  const start = Date.UTC(2026, 9, 5);
  for (let i = 0; i < 35; i += 1) {
    const date = new Date(start + i * 86_400_000);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) out.push(date.toISOString().slice(0, 10));
  }
  return out;
}

const DAYS = sessions();

function series(closes: Record<string, number>, base = 100) {
  return { dates: DAYS, closes: DAYS.map((day) => closes[day] ?? base) };
}

function facts(overrides: Partial<AgentFacts> = {}): AgentFacts {
  return {
    ...EMPTY_FACTS,
    available: { fund_filings: true, congress: true, insiders: true, earnings: true, movers: true },
    mover_days: DAYS,
    ...overrides,
  };
}

function job(template: string, patch: Partial<AgentJobDraft> = {}): AgentJobDraft {
  const found = AGENT_TEMPLATES.find((entry) => entry.id === template);
  if (!found) throw new Error(`no template ${template}`);
  return { ...found.defaults, ...patch };
}

describe("closesAsOf", () => {
  it("never reads a close dated after the day asked for", () => {
    const data = series({ "2026-10-08": 120, "2026-10-09": 500 });
    const quote = closesAsOf(data, "2026-10-08");
    expect(quote?.date).toBe("2026-10-08");
    expect(quote?.close).toBe(120);
    expect(quote?.prev).toBe(100);
  });

  it("falls back to the last session on a weekend and skips bad closes", () => {
    const data = { dates: ["2026-10-08", "2026-10-09"], closes: [101, Number.NaN] };
    expect(closesAsOf(data, "2026-10-11")?.date).toBe("2026-10-08");
    expect(closesAsOf(undefined, "2026-10-11")).toBeNull();
  });
});

describe("price rules", () => {
  const below = job("price-level", {
    trigger: { type: "price", rule: "crosses_below", level: 95 },
    scope: { kind: "tickers", tickers: ["AAPL"] },
  });

  it("fires on the close that crosses the level, with the numbers", () => {
    const data = facts({ prices: { AAPL: series({ "2026-10-13": 94 }) } });
    const result = evaluateJob(below, data, { day: "2026-10-13", since: "2026-10-12", tickers: ["AAPL"] });
    expect(result?.decision).toBe("notify");
    expect(result?.summary).toBe("AAPL closed below $95.00.");
    expect(result?.findings[0].detail).toContain("$94.00");
    expect(result?.findings[0].at).toBe("2026-10-13");
  });

  it("does not fire again while the price stays below the level", () => {
    const data = facts({ prices: { AAPL: series({ "2026-10-13": 94, "2026-10-14": 93 }) } });
    const result = evaluateJob(below, data, { day: "2026-10-14", since: "2026-10-13", tickers: ["AAPL"] });
    expect(result?.decision).toBe("nothing");
    expect(result?.summary).toMatch(/^Checked, nothing to do/);
    expect(result?.checked[0]).toContain("Daily closes for 1 name");
  });

  it("does not fire twice on a close the last run already saw", () => {
    const data = facts({ prices: { AAPL: series({ "2026-10-16": 94 }) } });
    // Saturday run after a Friday run: no new close.
    const result = evaluateJob(below, data, { day: "2026-10-17", since: "2026-10-16", tickers: ["AAPL"] });
    expect(result?.decision).toBe("nothing");
    expect(result?.summary).toContain("no new close");
  });

  it("says it could not check when there is no price history, instead of saying nothing happened", () => {
    const result = evaluateJob(below, facts(), { day: "2026-10-13", since: "2026-10-12", tickers: ["AAPL"] });
    expect(result?.decision).toBe("could_not_check");
    expect(result?.summary).toContain("no price history for AAPL");
  });

  it("measures a daily move against the close before, both directions", () => {
    const move = job("big-move", { trigger: { type: "price", rule: "moves_pct", pct: 5 } });
    const data = facts({
      prices: { AAA: series({ "2026-10-13": 106 }), BBB: series({ "2026-10-13": 94 }), CCC: series({ "2026-10-13": 103 }) },
    });
    const result = evaluateJob(move, data, { day: "2026-10-13", since: "2026-10-12", tickers: ["AAA", "BBB", "CCC"] });
    expect(result?.decision).toBe("notify");
    expect(result?.findings.map((finding) => finding.ticker)).toEqual(["AAA", "BBB"]);
    expect(result?.findings[1].headline).toBe("BBB fell 6.00% in a day");
  });

  it("uses the add level from the research call, and admits when there is none", () => {
    const zone = job("buy-zone");
    const prices = { AAA: series({ "2026-10-13": 89 }), BBB: series({ "2026-10-13": 89 }) };
    const withLevel = evaluateJob(zone, facts({ prices, levels: { AAA: { add_below: 90 } } }), {
      day: "2026-10-13",
      since: "2026-10-12",
      tickers: ["AAA", "BBB"],
    });
    expect(withLevel?.decision).toBe("notify");
    expect(withLevel?.findings).toHaveLength(1);
    expect(withLevel?.checked.join(" ")).toContain("No add level in the research call: BBB");

    const without = evaluateJob(zone, facts({ prices }), { day: "2026-10-13", since: "2026-10-12", tickers: ["AAA", "BBB"] });
    expect(without?.decision).toBe("could_not_check");
  });

  it("never checks or names a level on a stock the plan does not cover, and says so", () => {
    const zone = job("buy-zone");
    const prices = { AAA: series({ "2026-10-13": 89 }), BBB: series({ "2026-10-13": 89 }) };
    const opts = { day: "2026-10-13", since: "2026-10-12", tickers: ["AAA", "BBB"] };
    const locked = { add_below: null, trim_above: null, locked: true as const };
    const mixed = evaluateJob(zone, facts({ prices, levels: { AAA: { add_below: 90 }, BBB: locked } }), opts);
    expect(mixed?.findings.map((finding) => finding.ticker)).toEqual(["AAA"]);
    expect(mixed?.checked.join(" ")).toContain("Not covered on your plan, so not checked: BBB");

    const none = evaluateJob(zone, facts({ prices, levels: { AAA: locked, BBB: locked } }), opts);
    expect(none?.decision).toBe("could_not_check");
    expect(none?.summary).toMatch(/covered on your plan/);
    expect(JSON.stringify(none)).not.toMatch(/\$\d/);
  });

  it("has nothing to look at when the watchlist is empty", () => {
    const result = evaluateJob(job("big-move"), facts(), { day: "2026-10-13", since: null, tickers: [] });
    expect(result?.decision).toBe("could_not_check");
  });
});

describe("event rules", () => {
  const trade = (id: string, ticker: string, disclosed: string) => ({
    id,
    person: "Jane Doe",
    ticker,
    tx_type: "buy",
    amount_low: 15001,
    amount_high: 50000,
    disclosed,
    url: "https://example.com/filing",
  });

  it("reports a congressional trade in a tracked name on the day it was disclosed", () => {
    const data = facts({ congress: [trade("a", "NVDA", "2026-10-13"), trade("b", "XOM", "2026-10-13")] });
    const result = evaluateJob(job("congress-trade"), data, { day: "2026-10-13", since: "2026-10-12", tickers: ["NVDA"] });
    expect(result?.decision).toBe("notify");
    expect(result?.findings).toHaveLength(1);
    expect(result?.findings[0].headline).toBe("Jane Doe bought NVDA");
    expect(result?.findings[0].detail).toContain("$15K to $50K");
    expect(result?.checked[0]).toBe("Congressional disclosures dated Oct 13: 2");
  });

  it("ends in a decision when trades were disclosed but none were in the person's names", () => {
    const data = facts({ congress: [trade("b", "XOM", "2026-10-13")] });
    const result = evaluateJob(job("congress-trade"), data, { day: "2026-10-13", since: "2026-10-12", tickers: ["NVDA"] });
    expect(result?.decision).toBe("nothing");
    expect(result?.summary).toBe("Checked, nothing to do. 1 trade disclosed on Oct 13, none in your names.");
  });

  it("does not see a disclosure dated after the day it is evaluating", () => {
    const data = facts({ congress: [trade("a", "NVDA", "2026-10-14")] });
    const result = evaluateJob(job("congress-trade"), data, { day: "2026-10-13", since: "2026-10-12", tickers: ["NVDA"] });
    expect(result?.decision).toBe("nothing");
  });

  it("picks up everything since the last check after a gap", () => {
    const data = facts({ congress: [trade("a", "NVDA", "2026-10-09")] });
    const result = evaluateJob(job("congress-trade"), data, { day: "2026-10-13", since: "2026-10-08", tickers: ["NVDA"] });
    expect(result?.decision).toBe("notify");
    expect(result?.checked[0]).toContain("Oct 9 to Oct 13");
  });

  it("says a source was never collected rather than reporting silence", () => {
    const data = facts({ available: { fund_filings: false, congress: true, insiders: false, earnings: true, movers: true } });
    const opts = { day: "2026-10-13", since: "2026-10-12", tickers: ["NVDA"] };
    expect(evaluateJob(job("insider-trade"), data, opts)?.decision).toBe("could_not_check");
    expect(evaluateJob(job("fund-filing"), data, opts)?.summary).toContain("have not been collected yet");
  });

  it("reports a 13F filing and points out the person's names in it", () => {
    const data = facts({
      fund_filings: [
        { id: "f1", fund: "Example Capital", date: "2026-10-13", headline: "Example Capital added 3 positions.", url: null, tickers: ["NVDA", "KO"] },
      ],
    });
    const result = evaluateJob(job("fund-filing"), data, { day: "2026-10-13", since: "2026-10-12", tickers: ["NVDA"] });
    expect(result?.decision).toBe("notify");
    expect(result?.findings[0].detail).toContain("It lists changes in NVDA.");
    expect(result?.findings[0].ticker).toBe("NVDA");
  });

  it("tells the person about earnings once, when the date enters the window", () => {
    const data = facts({ earnings: [{ ticker: "NVDA", date: "2026-10-16", time: "amc" }] });
    const early = evaluateJob(job("earnings-ahead"), data, { day: "2026-10-12", since: "2026-10-09", tickers: ["NVDA"] });
    expect(early?.decision).toBe("nothing");
    const first = evaluateJob(job("earnings-ahead"), data, { day: "2026-10-13", since: "2026-10-12", tickers: ["NVDA"] });
    expect(first?.decision).toBe("notify");
    expect(first?.findings[0].headline).toBe("NVDA reports earnings in 3 days");
    expect(first?.findings[0].detail).toBe("Scheduled for Oct 16 after the close.");
    const again = evaluateJob(job("earnings-ahead"), data, { day: "2026-10-14", since: "2026-10-13", tickers: ["NVDA"] });
    expect(again?.decision).toBe("nothing");
    expect(again?.summary).toContain("you were already told");
  });

  it("reports a tracked name on the movers list and never invents a reason", () => {
    const data = facts({
      movers: [
        { ticker: "NVDA", date: "2026-10-13", day_change_pct: -6.2, reason: null },
        { ticker: "XOM", date: "2026-10-13", day_change_pct: 9, reason: "Raised guidance." },
      ],
    });
    const result = evaluateJob(job("mover"), data, { day: "2026-10-13", since: "2026-10-12", tickers: ["NVDA"] });
    expect(result?.findings).toHaveLength(1);
    expect(result?.findings[0].detail).toBe("");
  });

  it("cannot check the movers list for a day it was not kept", () => {
    const data = facts({ mover_days: ["2026-10-20"] });
    const result = evaluateJob(job("mover"), data, { day: "2026-10-13", since: "2026-10-12", tickers: ["NVDA"] });
    expect(result?.decision).toBe("could_not_check");
    expect(result?.summary).toBe("Could not check: we did not keep a movers list for Oct 13.");
  });

  it("reads yesterday's close on a morning run without losing it to the last check", () => {
    const move = job("big-move", { trigger: { type: "price", rule: "moves_pct", pct: 5 } });
    const data = facts({ prices: { AAA: series({ "2026-10-12": 110 }) } });
    // Tuesday morning: Monday's close is the newest, the last run was Monday morning and read Friday's.
    const data13 = { ...data, prices: { AAA: { dates: DAYS.filter((d) => d <= "2026-10-12"), closes: data.prices.AAA.closes.slice(0, 6) } } };
    const result = evaluateJob(move, data13, { day: "2026-10-13", since: "2026-10-12", price_since: "2026-10-09", tickers: ["AAA"] });
    expect(result?.decision).toBe("notify");
    expect(result?.latest_close).toBe("2026-10-12");
    const again = evaluateJob(move, data13, { day: "2026-10-13", since: "2026-10-13", price_since: "2026-10-12", tickers: ["AAA"] });
    expect(again?.decision).toBe("nothing");
  });
});

describe("scheduled jobs", () => {
  it("runs a daily job once per day", () => {
    const trigger = { type: "schedule", cadence: "daily_open" } as const;
    expect(scheduleDue(trigger, "2026-10-13", "2026-10-12")).toBe(true);
    expect(scheduleDue(trigger, "2026-10-13", "2026-10-13")).toBe(false);
    expect(scheduleDue(trigger, "2026-10-13", null)).toBe(true);
  });

  it("runs a weekly job on its weekday, and catches up after a missed one", () => {
    const trigger = { type: "schedule", cadence: "weekly", weekday: 1 } as const;
    expect(scheduleDue(trigger, "2026-10-12", "2026-10-09")).toBe(true); // Monday
    expect(scheduleDue(trigger, "2026-10-13", "2026-10-12")).toBe(false); // ran Monday
    expect(scheduleDue(trigger, "2026-10-13", "2026-10-09")).toBe(true); // Monday was missed
    expect(scheduleDue(trigger, "2026-10-13", null)).toBe(false); // first run waits for a Monday
    expect(evaluateJob(job("weekly-review"), facts(), { day: "2026-10-13", since: "2026-10-12", tickers: ["A"] })).toBeNull();
  });

  it("records 'checked, nothing to do' with what it looked at on a quiet day", () => {
    const data = facts({ prices: { AAA: series({}), BBB: series({}) } });
    const result = evaluateJob(job("morning-check"), data, { day: "2026-10-13", since: "2026-10-12", tickers: ["AAA", "BBB"] });
    expect(result?.decision).toBe("nothing");
    expect(result?.summary).toMatch(/^Checked, nothing to do\. None of your 2 names moved 3% or more/);
    expect(result?.checked).toEqual([
      "Daily closes for 2 names of 2, latest Oct 13",
      "Earnings in the next 7 days: 0",
      "Congressional disclosures in your names: 0",
    ]);
  });

  it("gathers moves, earnings and disclosures into one morning note", () => {
    const data = facts({
      prices: { AAA: series({ "2026-10-13": 104 }), BBB: series({}) },
      earnings: [{ ticker: "BBB", date: "2026-10-15", time: "bmo" }],
    });
    const result = evaluateJob(job("morning-check"), data, { day: "2026-10-13", since: "2026-10-12", tickers: ["AAA", "BBB"] });
    expect(result?.decision).toBe("notify");
    expect(result?.summary).toBe("1 name moved and 1 name reports within a week.");
    expect(result?.findings.map((finding) => finding.ticker)).toEqual(["AAA", "BBB"]);
  });
});

describe("replay", () => {
  const below = job("price-level", {
    trigger: { type: "price", rule: "crosses_below", level: 95 },
    scope: { kind: "tickers", tickers: ["AAPL"] },
  });
  const end = DAYS[DAYS.length - 1];

  it("checks every session in the last four weeks and ends each one in a decision", () => {
    const data = facts({ prices: { AAPL: series({ "2026-10-20": 94, "2026-10-21": 96, "2026-10-22": 93 }) } });
    const replay = replayJob(below, data, { end, tickers: ["AAPL"] });
    expect(replay.sessions).toBe(20);
    expect(replay.runs).toHaveLength(20);
    expect(replay.counts).toEqual({ notify: 2, nothing: 18, could_not_check: 0 });
    expect(replay.runs.filter((run) => run.decision === "notify").map((run) => run.day)).toEqual(["2026-10-22", "2026-10-20"]);
    expect(replay.notes[0]).toContain("This is a replay");
  });

  it("has no hindsight: what happens later never changes an earlier day", () => {
    const calm = facts({ prices: { AAPL: series({ "2026-10-20": 94 }) } });
    const stormy = facts({ prices: { AAPL: series({ "2026-10-20": 94, "2026-10-27": 40, "2026-10-28": 300 }) } });
    const pick = (data: AgentFacts) =>
      replayJob(below, data, { end, tickers: ["AAPL"] }).runs.filter((run) => run.day <= "2026-10-26");
    expect(pick(stormy)).toEqual(pick(calm));
  });

  it("only runs a weekly job on its day", () => {
    const data = facts({ prices: { AAA: series({}) } });
    const replay = replayJob(job("weekly-review"), data, { end, tickers: ["AAA"] });
    expect(replay.runs).toHaveLength(4);
    expect(replay.runs.every((run) => new Date(`${run.day}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
  });

  it("says what it cannot know", () => {
    const replay = replayJob(job("buy-zone"), facts({ prices: { AAA: series({}) } }), { end, tickers: ["AAA"] });
    expect(replay.notes.join(" ")).toContain("We do not keep past levels");
    expect(replay.notes.join(" ")).toContain("the names you track today");
  });
});

describe("drafts", () => {
  it("cleans tickers a person types", () => {
    expect(cleanTickers("aapl, $nvda  brk.b; aapl <script>")).toEqual(["AAPL", "NVDA", "BRK.B"]);
  });

  it("rejects a price level without a price or a ticker, in plain words", () => {
    expect(parseJobDraft({ template: "price-level", scope: { kind: "tickers", tickers: "AAPL" }, trigger: {} })).toEqual({
      ok: false,
      error: "Enter the price to watch, like 180.",
    });
    expect(parseJobDraft({ template: "price-level", trigger: { level: 10 } })).toMatchObject({ ok: false });
    expect(parseJobDraft({ template: "nope" })).toMatchObject({ ok: false });
  });

  it("builds a named job from a template and ignores fields it does not know", () => {
    const result = parseJobDraft({
      template: "price-level",
      scope: { kind: "tickers", tickers: ["aapl"] },
      trigger: { rule: "crosses_above", level: 250.129, mode: "trade" },
      mode: "trade_within_limits",
    });
    expect(result).toEqual({
      ok: true,
      draft: {
        template: "price-level",
        name: "AAPL above $250.13",
        trigger: { type: "price", rule: "crosses_above", level: 250.13 },
        scope: { kind: "tickers", tickers: ["AAPL"] },
      },
    });
  });

  it("describes every template as a sentence and never as a trade", () => {
    for (const template of AGENT_TEMPLATES) {
      const text = describeJob(template.defaults);
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/\b(buy|sell|order|execute)\b/i);
    }
  });

  it("keys a run by job and day so a second run the same day replaces nothing new", () => {
    expect(runDocId("u1", "abc123", "2026-10-13")).toBe("u1__abc123__2026-10-13");
  });
});
