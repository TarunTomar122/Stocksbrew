import { describe, expect, it } from "vitest";

import type { ConditionRecord } from "@/lib/thesis-watch/conditions";

import type { ThesisState } from "./model";
import { companiesView, historyStretches } from "./view";

const record = (key: string, status: ConditionRecord["status"], now: number | null): ConditionRecord => ({
  key,
  metric: key.split(":")[0] as ConditionRecord["metric"],
  status,
  now,
  as_of: "2026-11-08",
  line: status === "unknown" ? "Waiting for the figures from the Q3 report, Nov 19." : "",
  source: "Company results",
  href: null,
  report_date: null,
  report_quarter: null,
  checked_on: null,
  since: "2026-11-13",
  judged_now: now,
  judged_status: status === "unknown" ? null : status,
  judged_source: null,
  judged_stopped: null,
});

describe("companiesView", () => {
  it("puts broken lines first, then new risks, then companies with more lines, and marks lines not checked yet", () => {
    const spec = {
      lines: [
        { ticker: "NVDA", conditions: [{ metric: "revenue_growth" as const, op: "above" as const, value: 40 }] },
        { ticker: "MU", conditions: [{ metric: "gross_margin" as const, op: "above" as const, value: 30 }, { metric: "pe" as const, op: "below" as const, value: 30 }] },
        { ticker: "VRT", conditions: [{ metric: "gross_margin" as const, op: "above" as const, value: 35 }] },
        { ticker: "GONE", conditions: [{ metric: "gross_margin" as const, op: "above" as const, value: 35 }] },
      ],
    };
    const state = {
      lines: [
        { ticker: "NVDA", records: [record("revenue_growth:above:40", "holds", 83.4)] },
        { ticker: "VRT", records: [record("gross_margin:above:35", "broken", 31)] },
        { ticker: "MU", records: [record("gross_margin:above:30", "holds", 80.7)] },
      ],
      risks: [],
    } as unknown as ThesisState;
    const view = companiesView(spec, state, ["NVDA", "MU", "VRT"]);
    expect(view.map((company) => company.ticker)).toEqual(["VRT", "MU", "NVDA"]);
    expect(view[0]!.lines[0]).toMatchObject({ label: "Gross margin > 35%", status: "broken", nowText: "31%" });
    expect(view[1]!.lines[1]).toMatchObject({ label: "P/E < 30", status: "unknown", fresh: true });
  });
});

describe("historyStretches", () => {
  it("folds checks in a row that found the same into one dated stretch, newest first", () => {
    const row = (day: string, status: "holds" | "strain", broke: number) => ({ day, status, holds: 3 - broke, broke, waiting: 0, sources: [`s-${day}`] });
    const stretches = historyStretches([row("2026-11-13", "holds", 0), row("2026-11-14", "holds", 0), row("2026-11-17", "strain", 1), row("2026-11-18", "strain", 1)]);
    expect(stretches.map((stretch) => [stretch.from, stretch.to, stretch.status, stretch.checks])).toEqual([
      ["2026-11-17", "2026-11-18", "strain", 2],
      ["2026-11-13", "2026-11-14", "holds", 2],
    ]);
    expect(stretches[1]!.sources).toEqual(["s-2026-11-13", "s-2026-11-14"]);
  });
});

describe("one scale per figure", () => {
  const company = (ticker: string, metric: "revenue_growth" | "gross_margin" | "price", line: number, now: number | null) =>
    ({ ticker, risk: null, broken: 0, basis: null, lines: [{ key: `${metric}:above:${line}`, condition: { metric, op: "above", value: line }, label: "", status: now === null ? "unknown" : "holds", now, nowText: null, text: "", source: "", fresh: false }] }) as import("./view").CompanyView;

  it("shares one end per figure, margins run to 100%, an outlier is capped at three times the highest line, prices keep their own", async () => {
    const { sharedScales, scaleWords } = await import("./view");
    const scales = sharedScales([company("NVDA", "revenue_growth", 40, 83), company("MU", "revenue_growth", 30, 256), company("VRT", "gross_margin", 35, 38), company("X", "price", 100, 120)]);
    expect(scales.revenue_growth).toEqual({ from: 0, to: 200 });
    expect(scales.gross_margin).toEqual({ from: 0, to: 100 });
    expect(scales.price).toBeUndefined();
    expect(scaleWords("revenue_growth", scales.revenue_growth!)).toBe("Revenue growth 0%–200%");
    expect(sharedScales([company("A", "revenue_growth", 20, -12)]).revenue_growth).toEqual({ from: -20, to: 25 });
  });

  it("names what a line waits for, and the span of reports the verdicts stand on", async () => {
    const { waitingFor, basisSpan } = await import("./view");
    expect(waitingFor("Waiting for the figures from the Q3 report, Nov 3.")).toBe("Q3");
    expect(waitingFor("Waiting for the figures from the Nov 3 report.")).toBe("Nov 3");
    expect(waitingFor("Waiting for NVDA's EPS from the Q3 report, Nov 19.")).toBe("Q3");
    expect(waitingFor("No revenue growth figure for NVDA yet.")).toBeNull();
    const at = (day: string) => ({ ticker: day, lines: [], risk: null, broken: 0, basis: { quarter: null, day, report: true } });
    expect(basisSpan([at("2026-11-08"), at("2026-08-26"), { ...at("x"), basis: null }])).toEqual({ from: "2026-08-26", to: "2026-11-08" });
  });
});
