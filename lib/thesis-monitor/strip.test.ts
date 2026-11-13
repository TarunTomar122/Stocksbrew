import { describe, expect, it } from "vitest";

import type { ConditionRecord } from "@/lib/thesis-watch/conditions";

import type { ThesisState } from "./model";
import { changedLine, nextReport, reasonsStrip, thesisStrip, type StripThesis } from "./strip";

const TODAY = "2026-11-13";

function record(overrides: Partial<ConditionRecord> & { key: string }): ConditionRecord {
  return {
    metric: null,
    status: "holds",
    now: 40,
    as_of: "2026-10-30",
    line: "",
    source: "10-Q, Q3 (SEC)",
    href: null,
    report_date: "2026-10-29",
    report_quarter: "Q3",
    checked_on: null,
    since: "2026-10-30",
    judged_now: null,
    judged_status: null,
    judged_source: null,
    judged_stopped: null,
    ...overrides,
  };
}

function state(overrides: Partial<ThesisState>): ThesisState {
  return {
    version: 1,
    uid: "u",
    basket_id: "b1",
    day: "2026-11-12",
    checked_at: "2026-11-12T22:00:00Z",
    spec_created_at: "2026-10-01T00:00:00Z",
    spec_version: 1,
    base: null,
    status: "holds",
    status_since: "2026-11-01",
    previous_status: null,
    counts: { lines: 2, holds: 2, broke: 0, waiting: 0 },
    affected: [],
    lines: [],
    risks: [],
    seen_filings: [],
    events: [],
    history: [],
    ...overrides,
  };
}

describe("changedLine", () => {
  it("picks the line that changed most recently, a broken one first on the same day, never a waiting one", () => {
    const line = changedLine([
      { ticker: "NVDA", records: [record({ key: "revenue_growth:above:40", now: 62, since: "2026-11-05" })] },
      { ticker: "MRVL", records: [record({ key: "revenue_growth:above:35", status: "broken", now: 31, since: "2026-11-05", report_date: "2026-08-27", report_quarter: "Q2" })] },
      { ticker: "TSM", records: [record({ key: "gross_margin:above:55", status: "unknown", now: null, since: "2026-11-12" })] },
    ]);
    expect(line).toMatchObject({ ticker: "MRVL", label: "Revenue growth > 35%", nowText: "31%", status: "broken", quarter: "Q2", report: true, day: "2026-08-27" });
  });

  it("counts a line waiting tonight on its last judged figure, and never one that was never judged", () => {
    const line = changedLine([
      { ticker: "TSM", records: [record({ key: "gross_margin:above:55", status: "unknown", now: null, judged_status: "broken", judged_now: 53, judged_source: "10-Q, Q3", since: "2026-11-12" })] },
      { ticker: "AVGO", records: [record({ key: "gross_margin:above:55", status: "unknown", now: null, since: "2026-11-13" })] },
    ]);
    expect(line).toMatchObject({ ticker: "TSM", status: "broken", nowText: "53%", source: "10-Q, Q3" });
  });

  it("skips a record whose key is not a condition", () => {
    expect(changedLine([{ ticker: "X", records: [record({ key: "nonsense" })] }])).toBeNull();
  });
});

describe("nextReport", () => {
  it("is the earliest report on or after today", () => {
    expect(nextReport(["A", "B", "C"], { A: "2026-11-20", B: "2026-11-18", C: "2026-11-10" }, TODAY)).toEqual({ ticker: "B", day: "2026-11-18" });
    expect(nextReport(["A"], {}, TODAY)).toBeNull();
  });
});

describe("thesisStrip", () => {
  const lines = [{ ticker: "NVDA", records: [record({ key: "revenue_growth:above:40", now: 62 })] }];
  const thesis = (overrides: Partial<StripThesis>): StripThesis => ({ id: "b1", name: "AI infrastructure", enabled: true, tickers: ["NVDA"], state: state({ lines }), ...overrides });

  it("shows nothing without a judged check", () => {
    expect(thesisStrip([thesis({ state: null })], {}, TODAY)).toBeNull();
    expect(thesisStrip([thesis({ state: state({ status: "waiting" }) })], {}, TODAY)).toBeNull();
  });

  it("picks a switched-on thesis, then the worst status", () => {
    const strip = thesisStrip(
      [
        thesis({ id: "b1", name: "Holds", state: state({ lines }) }),
        thesis({ id: "b2", name: "Strained", state: state({ status: "strain", lines }) }),
        thesis({ id: "b3", name: "Paused and broken", enabled: false, state: state({ status: "broken", lines }) }),
      ],
      { NVDA: "2026-11-19" },
      TODAY,
    );
    expect(strip).toMatchObject({ name: "Strained", status: "strain", href: "/agents/theses/b2", next: { ticker: "NVDA", day: "2026-11-19" } });
    expect(strip?.line?.ticker).toBe("NVDA");
  });

  it("leaves out the lines of a company no longer in the thesis", () => {
    const strip = thesisStrip([thesis({ tickers: ["AVGO"] })], {}, TODAY);
    expect(strip?.line).toBeNull();
  });
});

describe("reasonsStrip", () => {
  it("rolls the reasons' lines up by the thesis rules", () => {
    const strip = reasonsStrip(
      [
        { ticker: "A", records: [record({ key: "gross_margin:above:50", status: "broken", now: 45 })] },
        { ticker: "B", records: [record({ key: "gross_margin:above:50", now: 60 })] },
      ],
      {},
      TODAY,
    );
    expect(strip).toMatchObject({ name: "Your reasons", status: "strain", counts: { lines: 2, holds: 1, broke: 1, waiting: 0 } });
  });

  it("shows nothing while every line waits", () => {
    expect(reasonsStrip([{ ticker: "A", records: [record({ key: "gross_margin:above:50", status: "unknown", now: null })] }], {}, TODAY)).toBeNull();
  });
});
