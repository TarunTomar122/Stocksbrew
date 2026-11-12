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

  it("puts a flagged move against the stock's normal day, and names a report coming up", () => {
    const move = job("big-move", { trigger: { type: "price", rule: "moves_pct", pct: 5 } });
    // 40 sessions swinging 1.5% a day, then a 6% fall.
    const dates: string[] = [];
    const closes: number[] = [];
    for (let i = 0; i < 41; i += 1) {
      dates.push(new Date(Date.UTC(2026, 8, 1) + i * 86_400_000).toISOString().slice(0, 10));
      closes.push(i % 2 === 0 ? 100 : 101.5);
    }
    closes[40] = closes[39]! * 0.94;
    const day = dates[40]!;
    const data = facts({ prices: { NVDA: { dates, closes } }, earnings: [{ ticker: "NVDA", date: "2026-10-20", time: "amc" }, { ticker: "AMD", date: "2026-10-15", time: null }] });
    const result = evaluateJob(move, data, { day, since: dates[39]!, tickers: ["NVDA"] });
    expect(result?.findings[0]!.headline).toBe("NVDA fell 6.00% in a day, about four times a normal day");
    expect(result?.summary).toBe("NVDA fell 6.00% in a day, about four times a normal day, and reports on Oct 20.");
    // A report more than three weeks out is not the thing to watch.
    const far = evaluateJob(move, facts({ prices: { NVDA: { dates, closes } }, earnings: [{ ticker: "NVDA", date: "2026-11-30" }] }), { day, since: dates[39]!, tickers: ["NVDA"] });
    expect(far?.summary).toBe("NVDA fell 6.00% in a day, about four times a normal day.");
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
    // The move that brought it there, its close and the level, in the call's own words.
    expect(withLevel?.findings[0]).toMatchObject({ kind: "level", zone: "add", level: 90, close: 89, change_pct: -11 });
    expect(withLevel?.findings[0].headline).toBe("AAA fell 11.0% to $89.00, below its $90.00 buy-more level");

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

  it("leaves out a stock whose price stopped updating, instead of calling its old move the last session", () => {
    const upTo = (end: string, closes: Record<string, number>) => {
      const dates = DAYS.filter((day) => day <= end);
      return { dates, closes: dates.map((day) => closes[day] ?? 100) };
    };
    // AAA has the Oct 13 close; BBB's last close is Oct 9, two sessions behind.
    const data = facts({ prices: { AAA: series({ "2026-10-13": 106 }), BBB: upTo("2026-10-09", { "2026-10-09": 110 }) } });
    const result = evaluateJob(job("morning-check"), data, { day: "2026-10-13", since: "2026-10-08", tickers: ["AAA", "BBB"] });
    expect(result?.findings.map((finding) => finding.ticker)).toEqual(["AAA"]);
    expect(result?.counts?.moves).toBe(1);
    expect(result?.checked.join(" ")).toContain("Price not updated for the latest session: BBB");
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
      // A level of our call ("its buy-more level") is a price to watch, not a trade.
      // So are our call's own words ("our call turns to Sell some").
      expect(text.replace(/\b(buy-more|sell-some) (level|price)\b/gi, "").replace(/\b(Buy more|Sell some)\b/g, "")).not.toMatch(/\b(buy|sell|order|execute)\b/i);
    }
  });

  it("keys a run by job and day so a second run the same day replaces nothing new", () => {
    expect(runDocId("u1", "abc123", "2026-10-13")).toBe("u1__abc123__2026-10-13");
  });
});

describe("sell zone and call changes", () => {
  const day = "2026-10-13";
  const prices = { AAA: series({ "2026-10-13": 111 }), BBB: series({ "2026-10-13": 111 }) };
  const turned = (date: string, from: "Add" | "Hold" | "Trim" | null, to: "Add" | "Hold" | "Trim", reason: string | null = null) => ({ date, from, to, reason });
  const withCalls = (calls: AgentFacts["calls"], levels: AgentFacts["levels"] = {}) =>
    facts({ prices, levels, calls, available: { ...facts().available, calls: true } });

  it("fires on a close at or above the sell-some price of a Sell some call, never under Keep or Buy more", () => {
    const sell = job("sell-zone");
    const levels = { AAA: { add_below: 80, trim_above: 110 }, BBB: { add_below: 80, trim_above: 110 } };
    const calls = { AAA: { call: "Trim" as const, changes: [] }, BBB: { call: "Hold" as const, changes: [] } };
    const result = evaluateJob(sell, withCalls(calls, levels), { day, since: "2026-10-12", tickers: ["AAA", "BBB"], calls_seen: { AAA: "Trim", BBB: "Hold" } });
    expect(result?.decision).toBe("notify");
    expect(result?.findings).toHaveLength(1);
    expect(result?.findings[0]).toMatchObject({ ticker: "AAA", kind: "level", zone: "trim", level: 110, close: 111 });
    expect(result?.findings[0].headline).toBe("AAA rose 11.0% to $111, above its $110 sell-some level");
    expect(result?.checked.join(" ")).toContain("No sell-some price in our call: BBB");
    expect(result?.calls_seen).toEqual({ AAA: "Trim", BBB: "Hold" });
  });

  it("fires when our call turns to Sell some, even without a new close, and only once", () => {
    const sell = job("sell-zone");
    const calls = { AAA: { call: "Trim" as const, changes: [turned("2026-10-12", "Hold", "Trim", "Results missed and guidance was cut.")] } };
    // Yesterday's run saw Keep; the change was written after it ran.
    const first = evaluateJob(sell, withCalls(calls), { day, since: "2026-10-12", price_since: day, tickers: ["AAA"], calls_seen: { AAA: "Hold" } });
    expect(first?.decision).toBe("notify");
    expect(first?.summary).toMatch(/^Our call on AAA moved from Keep to Sell some/);
    expect(first?.findings[0]).toMatchObject({ kind: "call", call_from: "Keep", call_to: "Sell some", at: "2026-10-12", detail: "Results missed and guidance was cut." });
    expect(first?.calls_seen).toEqual({ AAA: "Trim" });
    const again = evaluateJob(sell, withCalls(calls), { day, since: day, price_since: day, tickers: ["AAA"], calls_seen: first!.calls_seen });
    expect(again?.decision).toBe("nothing");
    expect(again?.summary).toBe("Checked, nothing to do. Our call did not say to sell it.");
  });

  it("a turn to Keep or Buy more is not a sell signal; a stock the plan does not cover never says its earlier call or the reason", () => {
    const sell = job("sell-zone");
    const toKeep = { AAA: { call: "Hold" as const, changes: [turned(day, "Trim", "Hold")] } };
    expect(evaluateJob(sell, withCalls(toKeep), { day, since: "2026-10-12", tickers: ["AAA"], calls_seen: { AAA: "Trim" } })?.decision).toBe("nothing");
    const locked = { AAA: { call: "Trim" as const, changes: [turned(day, "Hold", "Trim", null)], locked: true as const } };
    const result = evaluateJob(sell, withCalls(locked, { AAA: { add_below: null, trim_above: null, locked: true } }), { day, since: "2026-10-12", tickers: ["AAA"], calls_seen: { AAA: "Hold" } });
    expect(result?.findings[0]).toMatchObject({ headline: "Our call on AAA turned to Sell some", call_from: null, detail: "" });
    expect(JSON.stringify(result)).not.toMatch(/Keep/);
  });

  it("a first run reads only today's dated change; a replay places each change on its day", () => {
    const sell = job("sell-zone");
    const calls = { AAA: { call: "Trim" as const, changes: [turned("2026-10-07", "Hold", "Trim")] } };
    expect(evaluateJob(sell, withCalls(calls), { day, since: null, tickers: ["AAA"], calls_seen: {} })?.decision).toBe("nothing");
    const replay = replayJob(sell, withCalls(calls), { end: "2026-10-16", tickers: ["AAA"], weeks: 2 });
    expect(replay.runs.filter((run) => run.decision === "notify").map((run) => run.day)).toEqual(["2026-10-07"]);
    expect(replay.notes.join(" ")).toMatch(/sell-some price is the one in today's call/);
  });

  it("says it could not check when neither our calls nor a price could be read", () => {
    const sell = job("sell-zone");
    const blind = facts({ prices: {}, available: { ...facts().available, calls: false } });
    expect(evaluateJob(sell, blind, { day, since: "2026-10-12", tickers: ["AAA"], calls_seen: {} })?.decision).toBe("could_not_check");
  });

  it("the call-change agent: any change, or only a change to one call", () => {
    const calls = {
      AAA: { call: "Add" as const, changes: [turned(day, "Hold", "Add")] },
      BBB: { call: "Trim" as const, changes: [turned(day, "Hold", "Trim")] },
    };
    const any = evaluateJob(job("call-change"), withCalls(calls), { day, since: "2026-10-12", tickers: ["AAA", "BBB"], calls_seen: { AAA: "Hold", BBB: "Hold" } });
    expect(any?.decision).toBe("notify");
    expect(any?.findings.map((finding) => finding.call_to)).toEqual(["Buy more", "Sell some"]);
    expect(any?.summary).toBe("Our call changed on 2 names: AAA and BBB.");
    const onlyTrim = evaluateJob(job("call-change", { trigger: { type: "event", event: "call_change", to: "Trim" } }), withCalls(calls), {
      day,
      since: "2026-10-12",
      tickers: ["AAA", "BBB"],
      calls_seen: { AAA: "Hold", BBB: "Hold" },
    });
    expect(onlyTrim?.findings.map((finding) => finding.ticker)).toEqual(["BBB"]);
    const quiet = evaluateJob(job("call-change"), withCalls(calls), { day, since: "2026-10-12", tickers: ["AAA"], calls_seen: { AAA: "Add" } });
    expect(quiet?.summary).toBe(`Checked, nothing to do. Our call on AAA did not change on Oct 13.`);
    const blind = evaluateJob(job("call-change"), facts(), { day, since: "2026-10-12", tickers: ["AAA"], calls_seen: {} });
    expect(blind?.decision).toBe("could_not_check");
  });

  it("validates both new templates and keeps them on the person's names", () => {
    expect(parseJobDraft({ template: "sell-zone", scope: { kind: "tickers", tickers: ["orcl"] } })).toEqual({
      ok: true,
      draft: { template: "sell-zone", name: "When to sell some", trigger: { type: "price", rule: "enters_sell_zone" }, scope: { kind: "tickers", tickers: ["ORCL"] } },
    });
    expect(parseJobDraft({ template: "call-change", scope: { kind: "any" }, trigger: { to: "Trim" } })).toMatchObject({
      ok: true,
      draft: { trigger: { type: "event", event: "call_change", to: "Trim" }, scope: { kind: "watchlist" } },
    });
    expect(parseJobDraft({ template: "call-change", trigger: { to: "Sell" } })).toMatchObject({ ok: true, draft: { trigger: { type: "event", event: "call_change" } } });
  });
});

describe("sell zone: found in review", () => {
  const day = "2026-10-13";
  const prices = { AAA: series({ "2026-10-13": 111 }) };
  const turned = (date: string, from: "Add" | "Hold" | "Trim" | null, to: "Add" | "Hold" | "Trim", reason: string | null = null) => ({ date, from, to, reason });

  it("says it could not check, not that the call held, when our calls were unavailable", () => {
    const result = evaluateJob(job("sell-zone"), facts({ prices, levels: { AAA: { add_below: 80, trim_above: 200 } } }), { day, since: "2026-10-12", tickers: ["AAA"], calls_seen: {} });
    expect(result?.decision).toBe("could_not_check");
    expect(result?.summary).toBe("Could not check: our calls were not available.");
  });

  it("never dates a live change by an old one to the same call", () => {
    const calls = { AAA: { call: "Trim" as const, changes: [turned("2026-08-01", "Hold", "Trim", "old reason"), turned("2026-09-01", "Trim", "Hold")] } };
    const result = evaluateJob(job("sell-zone"), facts({ prices, calls, available: { ...facts().available, calls: true } }), { day, since: "2026-10-12", tickers: ["AAA"], calls_seen: { AAA: "Hold" } });
    expect(result?.findings[0]).toMatchObject({ kind: "call", at: day, detail: "" });
  });

  it("a replayed day before the call turned to Sell some is checked under the call it had then", () => {
    const calls = { AAA: { call: "Trim" as const, changes: [turned("2026-10-14", "Hold", "Trim")] } };
    const levels = { AAA: { add_below: 80, trim_above: 110 } };
    const before = evaluateJob(job("sell-zone"), facts({ prices, levels, calls, available: { ...facts().available, calls: true } }), { day, since: "2026-10-12", tickers: ["AAA"] });
    expect(before?.findings).toEqual([]);
  });
});
