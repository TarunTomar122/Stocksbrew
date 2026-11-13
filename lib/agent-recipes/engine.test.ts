import { describe, expect, it } from "vitest";

import { EMPTY_FACTS, describeJob, evaluateJob, parseJobDraft, replayJob, triggerLabel, usesProEvents, type AgentFacts, type AgentJobDraft } from "@/lib/agent-jobs";

/** Weekdays from 2026-10-05 (a Monday) for five weeks. */
const DAYS = (() => {
  const out: string[] = [];
  for (let i = 0; i < 35; i += 1) {
    const date = new Date(Date.UTC(2026, 9, 5) + i * 86_400_000);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) out.push(date.toISOString().slice(0, 10));
  }
  return out;
})();

function series(closes: Record<string, number>, base = 100) {
  return { dates: DAYS, closes: DAYS.map((day) => closes[day] ?? base) };
}

function facts(overrides: Partial<AgentFacts> = {}): AgentFacts {
  return { ...EMPTY_FACTS, available: { fund_filings: true, congress: true, insiders: true, earnings: true, movers: true, filing_risks: true }, mover_days: DAYS, ...overrides };
}

function draft(raw: Record<string, unknown>): AgentJobDraft {
  const parsed = parseJobDraft(raw, { hidden: [] });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.draft;
}

const JACKSON = { kind: "congress", id: "jonathan-jackson", name: "Jonathan Jackson" };

describe("parsing the recipe options", () => {
  it("keeps an investor, buys only and a dollar floor, and watches every stock for that investor", () => {
    const job = draft({ template: "congress-trade", scope: { kind: "watchlist" }, trigger: { who: JACKSON, side: "buy", min_value: 15000 } });
    expect(job.scope).toEqual({ kind: "any" });
    expect(job.trigger).toEqual({ type: "event", event: "congress_trade", who: JACKSON, side: "buy", min_value: 15000 });
    expect(job.name).toBe("Jonathan Jackson's trades");
  });

  it("drops a malformed investor and a silly floor", () => {
    const job = draft({ template: "congress-trade", trigger: { who: { kind: "fund", id: "x y", name: "" }, min_value: 5 } });
    expect(job.trigger).toEqual({ type: "event", event: "congress_trade" });
    expect(job.scope).toEqual({ kind: "watchlist" });
  });

  it("never gives a fund watch a side or a floor, and a 13F watch names its fund", () => {
    const job = draft({ template: "fund-filing", trigger: { who: { kind: "fund", id: "berkshire-hathaway", name: "Berkshire Hathaway" }, side: "buy", min_value: 1_000_000 } });
    expect(job.trigger).toEqual({ type: "event", event: "fund_13f", who: { kind: "fund", id: "berkshire-hathaway", name: "Berkshire Hathaway" } });
    expect(triggerLabel(job.trigger)).toBe("New 13F from Berkshire Hathaway");
    expect(describeJob(job)).toBe("Tell me when Berkshire Hathaway files a new 13F, with what it bought.");
  });

  it("keeps the night of on an earnings watch and the reason on a big move", () => {
    expect(draft({ template: "earnings-ahead", scope: { kind: "tickers", tickers: ["NVDA"] }, trigger: { days_before: 3, night_of: true } }).trigger).toEqual({
      type: "event",
      event: "earnings_approaching",
      days_before: 3,
      night_of: true,
    });
    expect(draft({ template: "big-move", trigger: { pct: 5, reason: true } }).trigger).toEqual({ type: "price", rule: "moves_pct", pct: 5, reason: true });
  });

  it("treats a filing-risk watch as a filing watch for the plan, and never over every stock", () => {
    const job = draft({ template: "filing-risks", scope: { kind: "any" } });
    expect(job.scope).toEqual({ kind: "watchlist" });
    expect(usesProEvents(job)).toBe(true);
  });
});

describe("investor watches", () => {
  const trades: AgentFacts["congress"] = [
    { id: "a", person_id: "jonathan-jackson", person: "Jonathan L. Jackson", ticker: "DDOG", tx_type: "buy", amount_low: 50001, amount_high: 100000, disclosed: "2026-10-19", url: null },
    { id: "b", person_id: "jonathan-jackson", person: "Jonathan L. Jackson", ticker: "TYG", tx_type: "sell", amount_low: 1001, amount_high: 15000, disclosed: "2026-10-19", url: null },
    { id: "c", person_id: "jonathan-jackson", person: "Jonathan L. Jackson", ticker: "GH", tx_type: "buy", amount_low: 1001, amount_high: 15000, disclosed: "2026-10-19", url: null },
    { id: "d", person_id: "someone-else", person: "Someone Else", ticker: "NVDA", tx_type: "buy", amount_low: 250001, amount_high: 500000, disclosed: "2026-10-19", url: null },
  ];
  const buys = draft({ template: "congress-trade", trigger: { who: JACKSON, side: "buy", min_value: 15000 } });

  it("tells only that member's buys from the floor up, on the day they were disclosed", () => {
    const result = evaluateJob(buys, facts({ congress: trades }), { day: "2026-10-19", since: "2026-10-16", tickers: [] })!;
    expect(result.decision).toBe("notify");
    expect(result.findings.map((finding) => finding.ticker)).toEqual(["DDOG"]);
    expect(result.checked[0]).toBe("Jonathan Jackson's disclosures dated Oct 17 to Oct 19: 3");
  });

  it("is quiet, and says why, when the member traded but nothing passed the filter", () => {
    const result = evaluateJob(buys, facts({ congress: trades.filter((trade) => trade.id !== "a") }), { day: "2026-10-19", since: "2026-10-16", tickers: [] })!;
    expect(result.decision).toBe("nothing");
    expect(result.summary).toBe("Checked, nothing to do. Jonathan Jackson disclosed 2 trades on Oct 17 to Oct 19, none of them a buy of $15K or more.");
  });

  it("never reads a disclosure dated after the day it checks (replay)", () => {
    const replay = replayJob(buys, facts({ congress: trades, prices: { SPY: series({}) } }), { end: "2026-10-23", tickers: [] });
    const told = replay.runs.filter((run) => run.decision === "notify").map((run) => run.day);
    expect(told).toEqual(["2026-10-19"]);
  });

  it("says a fund's own 13F with what it bought, and nothing for other funds", () => {
    const fund = draft({ template: "fund-filing", trigger: { who: { kind: "fund", id: "berkshire-hathaway", name: "Berkshire Hathaway" } } });
    const filings: AgentFacts["fund_filings"] = [
      { id: "x", source_id: "akre-capital", fund: "Akre Capital", date: "2026-10-20", headline: "Akre filed.", url: null, tickers: ["MA"], buys: ["MA"] },
    ];
    expect(evaluateJob(fund, facts({ fund_filings: filings }), { day: "2026-10-20", since: "2026-10-19", tickers: [] })!.summary).toBe(
      "Checked, nothing to do. Berkshire Hathaway filed no new 13F on Oct 20.",
    );
    const own = [...filings, { id: "y", source_id: "berkshire-hathaway", fund: "Berkshire Hathaway", date: "2026-10-20", headline: "Berkshire bought DHI.", url: null, tickers: ["DHI", "BAC"], buys: ["DHI"] }];
    const result = evaluateJob(fund, facts({ fund_filings: own }), { day: "2026-10-20", since: "2026-10-19", tickers: [] })!;
    expect(result.decision).toBe("notify");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ticker).toBe("DHI");
  });
});

describe("insider buys over a floor", () => {
  const insiders: AgentFacts["insiders"] = [
    { id: "1", ticker: "NVDA", person: "A", role: "Director", tx_type: "sell", value: 5_000_000, filed: "2026-10-20", url: null },
    { id: "2", ticker: "NVDA", person: "B", role: "CEO", tx_type: "buy", value: 50_000, filed: "2026-10-20", url: null },
    { id: "3", ticker: "AMD", person: "C", role: "CFO", tx_type: "buy", value: 900_000, filed: "2026-10-20", url: null },
  ];
  const watch = draft({ template: "insider-trade", scope: { kind: "tickers", tickers: ["NVDA"] }, trigger: { side: "buy", min_value: 100000 } });

  it("leaves out sales, small buys and other stocks, and says what it read", () => {
    const result = evaluateJob(watch, facts({ insiders }), { day: "2026-10-20", since: "2026-10-19", tickers: ["NVDA"] })!;
    expect(result.decision).toBe("nothing");
    expect(result.summary).toBe("Checked, nothing to do. No insider buys of $100K or more in NVDA were filed on Oct 20.");
    expect(result.checked).toContain("Insider filings in NVDA dated Oct 20: 2");
    expect(result.checked).toContain("Buys of $100K or more in NVDA dated Oct 20: 0");
  });

  it("tells a buy at or over the floor", () => {
    const big = [...insiders, { id: "4", ticker: "NVDA", person: "D", role: "Director", tx_type: "buy", value: 100_000, filed: "2026-10-20", url: null }];
    const result = evaluateJob(watch, facts({ insiders: big }), { day: "2026-10-20", since: "2026-10-19", tickers: ["NVDA"] })!;
    expect(result.decision).toBe("notify");
    expect(result.findings.map((finding) => finding.headline)).toEqual(["D, Director, bought NVDA"]);
  });
});

describe("new risks in filings", () => {
  const watch = draft({ template: "filing-risks", scope: { kind: "tickers", tickers: ["AMD"] } });
  const risks: AgentFacts["filing_risks"] = [
    { ticker: "AMD", form: "10-Q", filed: "2026-11-04", day: "2026-11-04", accession: "q3", added: 0, first: null, url: null },
    { ticker: "AMD", form: "10-K", filed: "2026-10-14", day: "2026-10-14", accession: "k", added: 2, first: "We may be required to satisfy guarantees.", url: "https://sec.gov/x" },
  ];

  it("tells a filing that adds risks once, on its day, quoting the first one", () => {
    const result = evaluateJob(watch, facts({ filing_risks: risks }), { day: "2026-10-14", since: "2026-10-13", tickers: ["AMD"] })!;
    expect(result.decision).toBe("notify");
    expect(result.findings[0]).toMatchObject({ headline: "AMD's 10-K adds 2 risks", detail: "New: “We may be required to satisfy guarantees.”" });
    expect(evaluateJob(watch, facts({ filing_risks: risks }), { day: "2026-10-15", since: "2026-10-14", tickers: ["AMD"] })!.decision).toBe("nothing");
  });

  it("counts a filing with no new risks as checked and quiet", () => {
    const result = evaluateJob(watch, facts({ filing_risks: risks }), { day: "2026-11-04", since: "2026-11-03", tickers: ["AMD"] })!;
    expect(result.summary).toBe("Checked, nothing to do. 1 filing from AMD on Nov 4, no new risks.");
  });

  it("could not check without the comparisons", () => {
    const result = evaluateJob(watch, facts({ available: { ...facts().available, filing_risks: false } }), { day: "2026-11-04", since: "2026-11-03", tickers: ["AMD"] })!;
    expect(result.decision).toBe("could_not_check");
  });
});

describe("the night of a report", () => {
  const watch = draft({ template: "earnings-ahead", scope: { kind: "tickers", tickers: ["NVDA"] }, trigger: { days_before: 3, night_of: true } });
  const earnings = [{ ticker: "NVDA", date: "2026-10-22", time: "amc" }];

  it("tells three days before, then again on the night with the after-hours move", () => {
    const before = evaluateJob(watch, facts({ earnings }), { day: "2026-10-19", since: "2026-10-16", tickers: ["NVDA"] })!;
    expect(before.findings[0]!.headline).toBe("NVDA reports earnings in 3 days");
    const quietDay = evaluateJob(watch, facts({ earnings }), { day: "2026-10-20", since: "2026-10-19", tickers: ["NVDA"] })!;
    expect(quietDay.decision).toBe("nothing");
    const extended = { NVDA: { day: "2026-10-22", change_pct: 4.24, price: 201.3, as_of: "5:15 PM ET" } };
    const night = evaluateJob(watch, facts({ earnings, extended, prices: { NVDA: series({}) } }), { day: "2026-10-22", since: "2026-10-21", tickers: ["NVDA"] })!;
    expect(night.decision).toBe("notify");
    expect(night.findings[0]).toMatchObject({ headline: "NVDA reports after today's close; up 4.2% after hours at $201.30", change_pct: 4.24, close: 201.3 });
  });

  it("never takes an after-hours quote from another session", () => {
    const extended = { NVDA: { day: "2026-10-21", change_pct: -9, price: 150, as_of: "5:15 PM ET" } };
    const night = evaluateJob(watch, facts({ earnings, extended, prices: { NVDA: series({}) } }), { day: "2026-10-22", since: "2026-10-21", tickers: ["NVDA"] })!;
    expect(night.findings[0]!.headline).toBe("NVDA reports after today's close");
  });

  it("does not say the night twice when it already checked that day", () => {
    const again = evaluateJob(watch, facts({ earnings }), { day: "2026-10-22", since: "2026-10-22", tickers: ["NVDA"] })!;
    expect(again.decision).toBe("nothing");
  });
});

describe("big moves with their reason", () => {
  const watch = draft({ template: "big-move", scope: { kind: "tickers", tickers: ["NVDA"] }, trigger: { pct: 5, reason: true } });
  const prices = { NVDA: series({ "2026-10-20": 90 }) };

  it("adds the confirmed reason of that session only", () => {
    const reasons = [
      { ticker: "NVDA", day: "2026-10-20", headline: "Nvidia fell after a report on export limits." },
      { ticker: "NVDA", day: "2026-10-21", headline: "A later reason." },
    ];
    const result = evaluateJob(watch, facts({ prices, move_reasons: reasons }), { day: "2026-10-20", since: "2026-10-19", tickers: ["NVDA"] })!;
    expect(result.findings[0]!.reason).toBe("Nvidia fell after a report on export limits.");
  });

  it("says the move without a reason when none was found", () => {
    const result = evaluateJob(watch, facts({ prices, move_reasons: [] }), { day: "2026-10-20", since: "2026-10-19", tickers: ["NVDA"] })!;
    expect(result.findings[0]!.reason).toBeUndefined();
  });
});
