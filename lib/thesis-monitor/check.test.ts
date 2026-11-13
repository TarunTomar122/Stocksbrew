import { describe, expect, it } from "vitest";

import type { Comparison } from "@/lib/filing-changes/diff";
import type { FilingChangesDoc } from "@/lib/filing-changes/store";
import type { ConditionInputs } from "@/lib/thesis-watch/conditions";

import { checkThesis, reportSentence, risksOf, rollUp, type ThesisCheckInput } from "./check";
import type { ThesisLine, ThesisState } from "./model";

/* ── the rollup rules ───────────────────────────────────────────────────── */

const v = (ticker: string, status: "holds" | "broken" | "unknown") => ({ ticker, status });

describe("rollUp: the status rules", () => {
  it("holds when every judged line holds and no new risks came in", () => {
    expect(rollUp([v("NVDA", "holds"), v("VRT", "holds"), v("MU", "unknown")], [])).toEqual({
      status: "holds",
      counts: { lines: 3, holds: 2, broke: 0, waiting: 1 },
      affected: [],
    });
  });

  it("is under strain with one broken line, or with new risks alone", () => {
    expect(rollUp([v("NVDA", "holds"), v("VRT", "broken"), v("MU", "holds")], []).status).toBe("strain");
    // Half is not more than half: one of two broke is strain, not broken.
    expect(rollUp([v("NVDA", "holds"), v("VRT", "broken")], []).status).toBe("strain");
    expect(rollUp([v("NVDA", "holds"), v("VRT", "holds")], [{ ticker: "MU" }])).toMatchObject({ status: "strain", affected: ["MU"] });
  });

  it("is broken when more than half of all lines broke (a waiting line counts as not broken)", () => {
    expect(rollUp([v("NVDA", "broken"), v("VRT", "broken"), v("MU", "holds")], []).status).toBe("broken");
    expect(rollUp([v("NVDA", "broken")], []).status).toBe("broken");
    expect(rollUp([v("NVDA", "broken"), v("VRT", "unknown"), v("MU", "unknown")], []).status).toBe("strain");
  });

  it("waits when no line has a judged figure and nothing else strains it", () => {
    expect(rollUp([v("NVDA", "unknown"), v("VRT", "unknown")], []).status).toBe("waiting");
    expect(rollUp([v("NVDA", "unknown")], [{ ticker: "NVDA" }]).status).toBe("strain");
  });

  it("names each affected company once, broken lines first", () => {
    expect(rollUp([v("NVDA", "holds"), v("VRT", "broken"), v("VRT", "broken"), v("MU", "holds")], [{ ticker: "MU" }, { ticker: "VRT" }]).affected).toEqual(["VRT", "MU"]);
  });
});

/* ── the check ──────────────────────────────────────────────────────────── */

const UID = "u1";
const BASKET = "abc123def456";
const LINES: ThesisLine[] = [
  { ticker: "NVDA", conditions: [{ metric: "revenue_growth", op: "above", value: 40 }] },
  { ticker: "VRT", conditions: [{ metric: "gross_margin", op: "above", value: 35 }] },
];

function figures(ticker: string, metric: "revenue_growth" | "gross_margin", value: number, report: { date: string; quarter: string }, storedAt: string): ConditionInputs {
  return {
    ticker,
    report: { date: report.date, quarter: report.quarter, acceptedAt: `${report.date}T20:05:00Z`, url: null },
    values: { [metric]: { value, asOf: storedAt, source: "Company results, last 12 months", href: `/stock/${ticker}` } },
  };
}

function filing(form: "10-K" | "10-Q", accession: string, filed: string, added: string[], dropped: string[] = []): Comparison {
  return {
    status: "changes",
    scope: "full",
    filing: { form, accession, filed, period: null, url: `https://www.sec.gov/Archives/${accession}.htm`, headings: 30 },
    base: null,
    added,
    dropped,
    reworded: [],
    same: 20,
    reason: null,
  };
}

function doc(ticker: string, comparisons: Comparison[]): FilingChangesDoc {
  return { version: 1, ticker, company: ticker, cik: 1, latest: comparisons[0]!, history: comparisons.slice(1), updated_at: "", source: "SEC EDGAR" };
}

function input(over: Partial<ThesisCheckInput>): ThesisCheckInput {
  return {
    uid: UID,
    basketId: BASKET,
    day: "2026-11-13",
    now: new Date("2026-11-13T22:00:00Z"),
    lines: LINES,
    tickers: ["NVDA", "VRT", "MU"],
    inputs: new Map([
      ["NVDA", figures("NVDA", "revenue_growth", 83.4, { date: "2026-08-26", quarter: "Q2" }, "2026-11-08T12:00:00Z")],
      ["VRT", figures("VRT", "gross_margin", 38.1, { date: "2026-10-28", quarter: "Q3" }, "2026-11-08T12:00:00Z")],
    ]),
    filings: [],
    previous: null,
    spec: { created_at: "2026-11-13T21:00:00.000Z", version: 1 },
    ...over,
  };
}

describe("checkThesis: the first check", () => {
  it("judges every line, records what was on file as context only, and starts with the status it finds", () => {
    const state = checkThesis(input({ filings: [doc("VRT", [filing("10-K", "vrt-k", "2026-09-15", ["Tariffs on our cooling parts could raise costs."])])] }));
    expect(state.status).toBe("holds");
    expect(state.counts).toEqual({ lines: 2, holds: 2, broke: 0, waiting: 0 });
    expect(state.status_since).toBe("2026-11-13");
    expect(state.previous_status).toBeNull();
    expect(state.events.every((event) => event.baseline)).toBe(true);
    expect(state.events.map((event) => event.key).sort()).toEqual(["filing:VRT:vrt-k", "report:NVDA:revenue_growth:above:40:2026-08-26", "report:VRT:gross_margin:above:35:2026-10-28"]);
    expect(state.events.find((event) => event.ticker === "NVDA")!.text).toBe("NVDA's Q2: revenue growth 83%, above your 40%.");
    expect(state.seen_filings).toEqual(["vrt-k"]);
    expect(state.history).toEqual([expect.objectContaining({ day: "2026-11-13", status: "holds", holds: 2, broke: 0 })]);
  });

  it("only checks lines on companies still in the basket", () => {
    const state = checkThesis(input({ tickers: ["NVDA"] }));
    expect(state.lines.map((line) => line.ticker)).toEqual(["NVDA"]);
    expect(state.counts.lines).toBe(1);
  });
});

describe("checkThesis: event detection without double counting", () => {
  const first = checkThesis(input({ filings: [doc("VRT", [filing("10-K", "vrt-k", "2026-09-15", ["Tariffs could raise costs."])])] }));
  const nextDay = "2026-11-20";
  const later = (over: Partial<ThesisCheckInput>) =>
    checkThesis(input({ day: nextDay, now: new Date(`${nextDay}T22:00:00Z`), previous: first, filings: [doc("VRT", [filing("10-K", "vrt-k", "2026-09-15", ["Tariffs could raise costs."])])], ...over }));

  it("records a new report's figures once, on the night they are judged, with the verdict", () => {
    const inputs = new Map([
      ["NVDA", figures("NVDA", "revenue_growth", 62, { date: "2026-11-19", quarter: "Q3" }, "2026-11-20T00:30:00Z")],
      ["VRT", figures("VRT", "gross_margin", 38.1, { date: "2026-10-28", quarter: "Q3" }, "2026-11-08T12:00:00Z")],
    ]);
    const state = later({ inputs });
    const news = state.events.filter((event) => !event.baseline);
    expect(news).toEqual([
      expect.objectContaining({ key: "report:NVDA:revenue_growth:above:40:2026-11-19", day: nextDay, at: "2026-11-19", verdict: "holds", text: "NVDA's Q3: revenue growth 62%, above your 40%." }),
    ]);
    // The same night checked again: nothing new.
    const again = checkThesis(input({ day: nextDay, now: new Date(`${nextDay}T23:00:00Z`), previous: state, inputs, filings: [] }));
    expect(again.events.filter((event) => !event.baseline)).toHaveLength(1);
    // And the next night, the same report is not news again.
    const after = checkThesis(input({ day: "2026-11-23", now: new Date("2026-11-23T22:00:00Z"), previous: again, inputs, filings: [] }));
    expect(after.events.filter((event) => !event.baseline && event.kind === "report")).toHaveLength(1);
  });

  it("records a broken line from a new report, and the thesis turning, once", () => {
    const inputs = new Map([
      ["NVDA", figures("NVDA", "revenue_growth", 83.4, { date: "2026-08-26", quarter: "Q2" }, "2026-11-08T12:00:00Z")],
      ["VRT", figures("VRT", "gross_margin", 31.2, { date: "2026-11-19", quarter: "Q4" }, "2026-11-20T00:30:00Z")],
    ]);
    const state = later({ inputs });
    expect(state.status).toBe("strain");
    expect(state.previous_status).toBe("holds");
    expect(state.status_since).toBe(nextDay);
    expect(state.affected).toEqual(["VRT"]);
    const news = state.events.filter((event) => !event.baseline);
    // The turn leads its day, the evidence under it.
    expect(news.map((event) => [event.kind, event.verdict, event.text])).toEqual([
      ["status", null, "Now under strain: 1 of 2 lines broke."],
      ["report", "broken", "VRT's Q4: gross margin 31%, under your 35%."],
    ]);
    // Checked again the same night: still judged against the day before, so the change and its day stand.
    const again = checkThesis(input({ day: nextDay, now: new Date(`${nextDay}T23:30:00Z`), previous: state, inputs, filings: [] }));
    expect(again).toMatchObject({ status: "strain", previous_status: "holds", status_since: nextDay });
    expect(again.events.filter((event) => event.kind === "status")).toHaveLength(1);
  });

  it("records a filing that changed risks once, by its accession, and quotes the company's heading", () => {
    const newQ = filing("10-Q", "vrt-q", "2026-11-18", ["Memory pricing could squeeze our margins."]);
    const filings = [doc("VRT", [newQ, filing("10-K", "vrt-k", "2026-09-15", ["Tariffs could raise costs."])])];
    const state = later({ filings });
    const news = state.events.filter((event) => !event.baseline);
    expect(news.map((event) => [event.key, event.text, event.detail])).toEqual([
      ["status:2026-11-20", "Now under strain: VRT filed new risks.", null],
      ["filing:VRT:vrt-q", "VRT's new 10-Q adds 1 risk.", "New: “Memory pricing could squeeze our margins.”"],
    ]);
    expect(state.risks).toEqual([expect.objectContaining({ ticker: "VRT", accession: "vrt-q", added: 1 })]);
    expect(state.status).toBe("strain");
    const again = checkThesis(input({ day: "2026-11-21", now: new Date("2026-11-21T22:00:00Z"), previous: state, filings }));
    expect(again.events.filter((event) => event.key === "filing:VRT:vrt-q")).toHaveLength(1);
    expect(again.seen_filings.filter((accession) => accession === "vrt-q")).toHaveLength(1);
  });

  it("does not count a partial 10-Q's repeated risks or a filing with no changes as news", () => {
    const quiet: Comparison = { ...filing("10-Q", "vrt-q2", "2026-11-18", []), repeated: ["Tariffs could raise costs."] };
    const state = later({ filings: [doc("VRT", [quiet])] });
    expect(state.events.filter((event) => !event.baseline)).toEqual([]);
    expect(state.seen_filings).toContain("vrt-q2");
    expect(state.status).toBe("holds");
  });

  it("treats what was on file for a company added later as context, not news", () => {
    const lines: ThesisLine[] = [...LINES, { ticker: "MU", conditions: [{ metric: "gross_margin", op: "above", value: 30 }] }];
    const inputs = new Map([
      ...input({}).inputs,
      ["MU", figures("MU", "gross_margin", 80.7, { date: "2026-09-30", quarter: "Q4" }, "2026-11-08T12:00:00Z")],
    ]);
    const state = later({ lines, inputs, filings: [doc("MU", [filing("10-K", "mu-k", "2026-10-09", ["Labor disputes could disrupt our fabs."])])] });
    expect(state.events.filter((event) => event.ticker === "MU").every((event) => event.baseline)).toBe(true);
    expect(state.events.filter((event) => !event.baseline)).toEqual([]);
  });

  it("keeps a company's last records when its figures could not be read, so an outage never moves the status", () => {
    const broken = later({
      inputs: new Map([
        ["NVDA", figures("NVDA", "revenue_growth", 83.4, { date: "2026-08-26", quarter: "Q2" }, "2026-11-08T12:00:00Z")],
        ["VRT", figures("VRT", "gross_margin", 31.2, { date: "2026-11-19", quarter: "Q4" }, "2026-11-20T00:30:00Z")],
      ]),
    });
    const outage = checkThesis(input({ day: "2026-11-21", now: new Date("2026-11-21T22:00:00Z"), previous: broken, inputs: new Map(), filings: [] }));
    expect(outage.status).toBe("strain");
    expect(outage.status_since).toBe(nextDay);
    expect(outage.events.filter((event) => event.kind === "status")).toHaveLength(1);
  });

  it("records a daily line that turns, once", () => {
    const lines: ThesisLine[] = [{ ticker: "NVDA", conditions: [{ metric: "price", op: "above", value: 150 }] }];
    const price = (value: number, day: string): Map<string, ConditionInputs> =>
      new Map([["NVDA", { ticker: "NVDA", report: null, values: { price: { value, asOf: day, source: "Daily closes", href: "/stock/NVDA" } } }]]);
    const start = checkThesis(input({ lines, tickers: ["NVDA"], inputs: price(166, "2026-11-13") }));
    expect(start.events).toEqual([]);
    const fell = checkThesis(input({ lines, tickers: ["NVDA"], day: "2026-11-16", now: new Date("2026-11-16T22:00:00Z"), previous: start, inputs: price(144, "2026-11-16") }));
    expect(fell.status).toBe("broken");
    expect(fell.events.map((event) => [event.kind, event.text])).toEqual([
      ["status", "Now broken: 1 of 1 lines broke."],
      ["line", "NVDA closed at $144, under your $150."],
    ]);
    const still = checkThesis(input({ lines, tickers: ["NVDA"], day: "2026-11-17", now: new Date("2026-11-17T22:00:00Z"), previous: fell, inputs: price(143, "2026-11-17") }));
    expect(still.events.filter((event) => event.kind === "line")).toHaveLength(1);
  });
});

describe("two lines on one report", () => {
  it("are said in one sentence when both hold, and a baseline filing is not called new", () => {
    const lines: ThesisLine[] = [{ ticker: "NVDA", conditions: [{ metric: "revenue_growth", op: "above", value: 40 }, { metric: "gross_margin", op: "above", value: 70 }] }];
    const both: ConditionInputs = {
      ticker: "NVDA",
      report: { date: "2026-08-26", quarter: "Q2", acceptedAt: "2026-08-26T20:05:00Z", url: null },
      values: {
        revenue_growth: { value: 83.4, asOf: "2026-11-08T12:00:00Z", source: "r", href: "/stock/NVDA" },
        gross_margin: { value: 74.7, asOf: "2026-11-08T12:00:00Z", source: "g", href: "/stock/NVDA" },
      },
    };
    const state = checkThesis(input({ lines, tickers: ["NVDA"], inputs: new Map([["NVDA", both]]), filings: [doc("NVDA", [{ ...filing("10-Q", "nv-q", "2026-08-26", ["Our debt may weigh on cash flow."]), scope: "partial" }])] }));
    expect(state.events.map((event) => event.text).sort()).toEqual(["NVDA's 10-Q adds 1 risk since its 10-K.", "NVDA's Q2: both lines hold, revenue growth 83% and gross margin 75%."]);
    expect(state.events.find((event) => event.kind === "report")!.source).toBe("Revenue growth 83% after the Q2 report, Aug 26 (SEC 8-K); Gross margin 75% after the Q2 report, Aug 26 (SEC 8-K)");
  });
});

describe("what is not news", () => {
  const first = checkThesis(input({}));
  const nextDay = "2026-11-20";
  const brokenVrt = new Map([
    ["NVDA", figures("NVDA", "revenue_growth", 83.4, { date: "2026-08-26", quarter: "Q2" }, "2026-11-08T12:00:00Z")],
    ["VRT", figures("VRT", "gross_margin", 31.2, { date: "2026-10-28", quarter: "Q3" }, "2026-11-08T12:00:00Z")],
  ]);

  it("a line the person tightens until it breaks changes the status without a status event or a previous status", () => {
    const lines: ThesisLine[] = [LINES[0]!, { ticker: "VRT", conditions: [{ metric: "gross_margin", op: "above", value: 40 }] }];
    const state = checkThesis(input({ day: nextDay, now: new Date(`${nextDay}T15:00:00Z`), previous: first, lines, spec: { created_at: "2026-11-13T21:00:00.000Z", version: 2 } }));
    expect(state).toMatchObject({ status: "strain", previous_status: null, status_since: nextDay, base: null, spec_version: 2 });
    expect(state.events.filter((event) => event.kind === "status")).toEqual([]);
    // The night after, judged against itself: no change, nothing to say.
    const night = checkThesis(input({ day: nextDay, now: new Date(`${nextDay}T22:00:00Z`), previous: state, lines, spec: { created_at: "2026-11-13T21:00:00.000Z", version: 2 } }));
    expect(night.events.filter((event) => event.kind === "status")).toEqual([]);
  });

  it("an edit that leaves the status where it was keeps its day", () => {
    const state = checkThesis(input({ day: nextDay, now: new Date(`${nextDay}T15:00:00Z`), previous: first, spec: { created_at: "2026-11-13T21:00:00.000Z", version: 2 } }));
    expect(state).toMatchObject({ status: "holds", status_since: "2026-11-13" });
  });

  it("lines taken off and added back start over: the old thesis's events, history and filings are not carried", () => {
    const old = checkThesis(input({ filings: [doc("VRT", [filing("10-K", "vrt-k", "2026-09-15", ["Tariffs could raise costs."])])] }));
    const again = checkThesis(input({ day: nextDay, now: new Date(`${nextDay}T15:00:00Z`), previous: old, inputs: brokenVrt, spec: { created_at: "2026-11-20T15:00:00.000Z", version: 1 }, filings: [doc("VRT", [filing("10-K", "vrt-k", "2026-09-15", ["Tariffs could raise costs."])])] }));
    expect(again.history).toHaveLength(1);
    expect(again.previous_status).toBeNull();
    expect(again.events.every((event) => event.baseline)).toBe(true);
    expect(again.events.some((event) => event.key === "filing:VRT:vrt-k")).toBe(true);
  });

  it("a failed filings read keeps the risks in the window and records nothing", () => {
    const withRisk = checkThesis(input({ day: nextDay, now: new Date(`${nextDay}T22:00:00Z`), previous: first, filings: [doc("VRT", [filing("10-Q", "vrt-q", "2026-11-18", ["Memory pricing could squeeze margins."])])] }));
    expect(withRisk.status).toBe("strain");
    const outage = checkThesis(input({ day: "2026-11-21", now: new Date("2026-11-21T22:00:00Z"), previous: withRisk, filings: null }));
    expect(outage).toMatchObject({ status: "strain", status_since: nextDay });
    expect(outage.risks.map((risk) => risk.accession)).toEqual(["vrt-q"]);
    expect(outage.seen_filings).toEqual(withRisk.seen_filings);
  });

  it("a company's filing record that appears after it joined, or an old filing filled in later, is context", () => {
    const late = checkThesis(input({ day: nextDay, now: new Date(`${nextDay}T22:00:00Z`), previous: first, filings: [doc("NVDA", [filing("10-Q", "nv-q", "2026-11-18", ["New debt risk."]), filing("10-K", "nv-k", "2026-02-25", ["Old risk."])])] }));
    expect(late.events.filter((event) => event.ticker === "NVDA" && event.kind === "filing").map((event) => [event.key, event.baseline])).toEqual([["filing:NVDA:nv-q", true]]);
    const backfill = checkThesis(input({ day: "2026-11-21", now: new Date("2026-11-21T22:00:00Z"), previous: late, filings: [doc("NVDA", [filing("10-Q", "nv-q", "2026-11-18", ["New debt risk."]), filing("10-K", "nv-k", "2026-02-25", ["Old risk."]), filing("10-Q", "nv-q0", "2026-08-26", ["Older."])])] }));
    expect(backfill.events.filter((event) => !event.baseline && event.kind === "filing")).toEqual([]);
  });
});

describe("risksOf", () => {
  it("takes each company's newest filing in the window that added risks", () => {
    const docs = [doc("MU", [filing("10-Q", "mu-q", "2026-11-05", ["New risk"]), filing("10-K", "mu-k", "2026-10-01", ["Old risk"])]), doc("VRT", [filing("10-K", "vrt-k", "2026-09-15", ["x"])])];
    expect(risksOf(docs, new Set(["MU", "VRT"]), "2026-11-13").map((risk) => risk.accession)).toEqual(["mu-q"]);
    expect(risksOf(docs, new Set(["VRT"]), "2026-11-13")).toEqual([]);
  });
});

describe("reportSentence", () => {
  it("says the figure against the line, on the right side, never reading the same as the line", () => {
    const record = { key: "gross_margin:above:35", metric: "gross_margin", status: "broken", now: 34.96, as_of: null, line: "", source: "", href: null, report_date: "2026-11-19", report_quarter: null, checked_on: null, since: "", judged_now: null, judged_status: null, judged_source: null, judged_stopped: null } as const;
    expect(reportSentence("VRT", { ...record })).toBe("VRT's Nov 19: gross margin 34.96%, under your 35%.");
    expect(reportSentence("VRT", { ...record, key: "pe:below:30", metric: "pe", status: "holds", now: 21.3, report_quarter: "Q3" })).toBe("VRT's Q3: the P/E 21, under your 30.");
  });
});

// Keeps the state type exercised: a later field added to ThesisState must be set by checkThesis.
const _shape: (keyof ThesisState)[] = ["base", "status", "status_since", "previous_status", "counts", "affected", "lines", "risks", "seen_filings", "events", "history"];
void _shape;
