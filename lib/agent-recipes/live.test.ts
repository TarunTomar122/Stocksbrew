import { describe, expect, it } from "vitest";

import { EMPTY_FACTS, addDays, evaluateJob, keepsTold, mergeTold, parseJobDraft, type AgentFacts, type AgentJobDraft } from "@/lib/agent-jobs";

/**
 * Live runs on data shaped like the real collections, which arrive late: House and Senate disclosures and 13F filings
 * are collected once a week (rows dated days before the run that first sees them), Form 4s every hour (one filed after
 * the last collection before the evening run keeps that day's date), and filing comparisons after the agents ran (and
 * again when the reading improves). Each record must be told exactly once.
 */

const DAYS = (() => {
  const out: string[] = [];
  for (let i = 0; i < 35; i += 1) {
    const date = new Date(Date.UTC(2026, 9, 5) + i * 86_400_000);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) out.push(date.toISOString().slice(0, 10));
  }
  return out;
})();

function facts(overrides: Partial<AgentFacts> = {}): AgentFacts {
  return { ...EMPTY_FACTS, available: { fund_filings: true, congress: true, insiders: true, earnings: true, movers: true, filing_risks: true }, mover_days: DAYS, ...overrides };
}

function draft(raw: Record<string, unknown>): AgentJobDraft {
  const parsed = parseJobDraft(raw, { hidden: [] });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.draft;
}

/**
 * Runs the job the way runJob does, one evening after another: the facts as they stood that evening, the told ids and
 * the day it began keeping them carried from run to run. Returns, per run day, the tickers or headlines it told.
 */
function liveRuns(job: AgentJobDraft, startedOn: string, evenings: Array<{ day: string; facts: AgentFacts; tickers?: string[] }>) {
  let told: string[] = [];
  let since: string | null = null;
  const said: Record<string, string[]> = {};
  for (const evening of evenings) {
    const result = evaluateJob(job, evening.facts, {
      day: evening.day,
      since,
      tickers: evening.tickers ?? [],
      ...(keepsTold(job.trigger) ? { live: { told, since: startedOn } } : {}),
    })!;
    said[evening.day] = result.decision === "notify" ? result.findings.map((finding) => finding.headline) : [];
    told = mergeTold(told, result.told);
    since = evening.day;
  }
  return said;
}

describe("a live run tells late-arriving records exactly once", () => {
  it("Congress: a disclosure collected a week after it was filed", () => {
    const job = draft({ template: "congress-trade", trigger: { who: { kind: "congress", id: "jonathan-jackson", name: "Jonathan Jackson" } } });
    const trade = { id: "t1", person_id: "jonathan-jackson", person: "Jonathan L. Jackson", ticker: "DDOG", tx_type: "buy", amount_low: 50001, amount_high: 100000, disclosed: "2026-10-19", url: null };
    const said = liveRuns(job, "2026-10-16", [
      { day: "2026-10-19", facts: facts({ congress: [] }) },
      { day: "2026-10-23", facts: facts({ congress: [] }) },
      // The weekly collection lands on Sunday; Monday's run is the first to see the Oct 19 row.
      { day: "2026-10-26", facts: facts({ congress: [trade] }) },
      { day: "2026-10-27", facts: facts({ congress: [trade] }) },
      { day: "2026-11-02", facts: facts({ congress: [{ ...trade }] }) },
    ]);
    expect(said).toEqual({ "2026-10-19": [], "2026-10-23": [], "2026-10-26": ["Jonathan L. Jackson bought DDOG"], "2026-10-27": [], "2026-11-02": [] });
  });

  it("Congress: nothing disclosed before the watch began, and nothing past the look-back", () => {
    const job = draft({ template: "congress-trade", trigger: { who: { kind: "congress", id: "jonathan-jackson", name: "Jonathan Jackson" } } });
    const before = { id: "old", person_id: "jonathan-jackson", person: "J", ticker: "EL", tx_type: "buy", amount_low: 1001, amount_high: 15000, disclosed: "2026-10-14", url: null };
    const said = liveRuns(job, "2026-10-16", [{ day: "2026-10-19", facts: facts({ congress: [before] }) }]);
    expect(said["2026-10-19"]).toEqual([]);
  });

  it("13F: a fund's filing collected days later", () => {
    const job = draft({ template: "fund-filing", trigger: { who: { kind: "fund", id: "berkshire-hathaway", name: "Berkshire Hathaway" } } });
    const filing = { id: "berkshire-hathaway__2026-11-14", source_id: "berkshire-hathaway", fund: "Berkshire Hathaway", date: "2026-10-30", headline: "Berkshire bought DHI.", url: null, tickers: ["DHI"], buys: ["DHI"] };
    const said = liveRuns(job, "2026-10-28", [
      { day: "2026-10-30", facts: facts() },
      { day: "2026-11-02", facts: facts({ fund_filings: [filing] }) },
      { day: "2026-11-03", facts: facts({ fund_filings: [filing] }) },
    ]);
    expect(said).toEqual({ "2026-10-30": [], "2026-11-02": ["Berkshire Hathaway filed a 13F"], "2026-11-03": [] });
  });

  it("Form 4: a buy filed at 6:10 PM, after the last collection before the evening run", () => {
    const job = draft({ template: "insider-trade", scope: { kind: "tickers", tickers: ["NVDA"] }, trigger: { side: "buy", min_value: 100000 } });
    const late = { id: "f4", ticker: "NVDA", person: "A Director", role: "Director", tx_type: "buy", value: 250_000, filed: "2026-10-20", url: null };
    const said = liveRuns(job, "2026-10-19", [
      { day: "2026-10-20", facts: facts({ insiders: [] }), tickers: ["NVDA"] },
      // Collected at 6:20 PM on Oct 20, still dated Oct 20: the Oct 21 run must not skip it.
      { day: "2026-10-21", facts: facts({ insiders: [late] }), tickers: ["NVDA"] },
      { day: "2026-10-22", facts: facts({ insiders: [late] }), tickers: ["NVDA"] },
    ]);
    expect(said).toEqual({ "2026-10-20": [], "2026-10-21": ["A Director, Director, bought NVDA"], "2026-10-22": [] });
  });

  it("Filing risks: compared after the agents ran, then compared again with a better reading", () => {
    const job = draft({ template: "filing-risks", scope: { kind: "tickers", tickers: ["AMD"] } });
    const risk = { ticker: "AMD", form: "10-Q", filed: "2026-11-04", day: "2026-11-04", accession: "q3", added: 1, first: "We may be required to satisfy guarantees.", url: null };
    const said = liveRuns(job, "2026-11-02", [
      { day: "2026-11-04", facts: facts({ filing_risks: [] }), tickers: ["AMD"] },
      { day: "2026-11-05", facts: facts({ filing_risks: [risk] }), tickers: ["AMD"] },
      // `--force` re-compared it: same filing, new compare date, two risks now.
      { day: "2026-11-09", facts: facts({ filing_risks: [{ ...risk, added: 2 }] }), tickers: ["AMD"] },
    ]);
    expect(said).toEqual({ "2026-11-04": [], "2026-11-05": ["AMD's 10-Q adds 1 risk"], "2026-11-09": [] });
  });

  it("Filing risks: a backfilled old filing outside the look-back is not news", () => {
    const job = draft({ template: "filing-risks", scope: { kind: "tickers", tickers: ["AMD"] } });
    const old = { ticker: "AMD", form: "10-K", filed: "2026-02-04", day: "2026-02-04", accession: "k", added: 3, first: null, url: null };
    const said = liveRuns(job, "2026-01-01", [{ day: "2026-11-05", facts: facts({ filing_risks: [old] }), tickers: ["AMD"] }]);
    expect(said["2026-11-05"]).toEqual([]);
  });

  it("Report night: a midday check waits for the close, the evening run tells the after-hours move once", () => {
    const job = draft({ template: "earnings-ahead", scope: { kind: "tickers", tickers: ["NVDA"] }, trigger: { days_before: 3, night_of: true } });
    const earnings = [{ ticker: "NVDA", date: "2026-10-22", time: "amc" }];
    const through = (last: string) => ({ NVDA: { dates: DAYS.filter((day) => day <= last), closes: DAYS.filter((day) => day <= last).map(() => 100) } });
    const extended = { NVDA: { day: "2026-10-22", change_pct: 4.24, price: 201.3, as_of: "5:15 PM ET" } };
    const said = liveRuns(job, "2026-10-16", [
      { day: "2026-10-19", facts: facts({ earnings, prices: through("2026-10-16") }), tickers: ["NVDA"] },
      // Midday on the report day: the session's close is not in yet.
      { day: "2026-10-22", facts: facts({ earnings, prices: through("2026-10-21") }), tickers: ["NVDA"] },
      { day: "2026-10-22", facts: facts({ earnings, extended, prices: through("2026-10-22") }), tickers: ["NVDA"] },
      { day: "2026-10-22", facts: facts({ earnings, extended, prices: through("2026-10-22") }), tickers: ["NVDA"] },
    ]);
    expect(said["2026-10-19"]).toEqual(["NVDA reports earnings in 3 days"]);
    // The last run of the 22nd is the second evening check: it tells nothing new, and the night was told once.
    expect(said["2026-10-22"]).toEqual([]);
  });

  it("Report night: the evening check after a midday one tells the move", () => {
    const job = draft({ template: "earnings-ahead", scope: { kind: "tickers", tickers: ["NVDA"] }, trigger: { days_before: 3, night_of: true } });
    const earnings = [{ ticker: "NVDA", date: "2026-10-22", time: "amc" }];
    const prices = { NVDA: { dates: DAYS.filter((day) => day <= "2026-10-22"), closes: DAYS.filter((day) => day <= "2026-10-22").map(() => 100) } };
    const extended = { NVDA: { day: "2026-10-22", change_pct: 4.24, price: 201.3, as_of: "5:15 PM ET" } };
    const evening = evaluateJob(job, facts({ earnings, extended, prices }), { day: "2026-10-22", since: "2026-10-22", tickers: ["NVDA"], live: { told: [], since: "2026-10-16" } })!;
    expect(evening.findings.map((finding) => finding.headline)).toEqual(["NVDA reports after today's close; up 4.2% after hours at $201.30"]);
    expect(evening.told).toEqual(["night:NVDA:2026-10-22"]);
  });

  it("keeps at most the newest told ids", () => {
    const many = Array.from({ length: 500 }, (_, index) => `x${index}`);
    const merged = mergeTold(many.slice(0, 450), ["x0", "new"]);
    expect(merged.length).toBe(400);
    expect(merged[merged.length - 1]).toBe("new");
    expect(merged[merged.length - 2]).toBe("x0");
    expect(addDays("2026-11-13", -45)).toBe("2026-09-29");
  });
});
