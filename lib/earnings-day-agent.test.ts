import { describe, expect, it } from "vitest";

import { EMPTY_FACTS, earningsDayEnabled, evaluateJob, hiddenTemplateIds, parseJobDraft, templateById, type AgentFacts } from "./agent-jobs";
import type { EarningsReportFact } from "./earnings-day-agent";

const report = (ticker: string, filed_day: string): EarningsReportFact => ({
  ticker,
  date: filed_day,
  filed_day,
  title: `${ticker} Q3 2026 Earnings: Beat on EPS`,
  headline: `${ticker} beat on EPS and raised its outlook.`,
  href: `/stock/${ticker}/earnings/${filed_day}`,
  url: "https://www.sec.gov/x.htm",
  tone: "up",
});

const facts = (reports: EarningsReportFact[], available = true): AgentFacts => ({
  ...EMPTY_FACTS,
  earnings_reports: reports,
  available: { ...EMPTY_FACTS.available, earnings_reports: available },
});

const job = { trigger: { type: "event" as const, event: "earnings_reported" as const }, scope: { kind: "watchlist" as const } };

describe("Earnings came out agent", () => {
  it("is a template that parses into its own event", () => {
    const template = templateById("earnings-out");
    expect(template?.needs).toBe("earnings_reports");
    const parsed = parseJobDraft({ template: "earnings-out", scope: { kind: "any" } }, { hidden: [] });
    expect(parsed.ok && parsed.draft.trigger).toEqual({ type: "event", event: "earnings_reported" });
    expect(parsed.ok && parsed.draft.scope).toEqual({ kind: "watchlist" });
  });

  it("is hidden and refused while the earnings day job is off", () => {
    const previous = process.env.EARNINGS_DAY_ENABLED;
    try {
      delete process.env.EARNINGS_DAY_ENABLED;
      expect(earningsDayEnabled()).toBe(false);
      expect(hiddenTemplateIds()).toEqual(["earnings-out"]);
      const refused = parseJobDraft({ template: "earnings-out" });
      expect(refused.ok).toBe(false);
      expect(parseJobDraft({ template: "big-move", trigger: { pct: 5 } }).ok).toBe(true);
      process.env.EARNINGS_DAY_ENABLED = "1";
      expect(hiddenTemplateIds()).toEqual([]);
      expect(parseJobDraft({ template: "earnings-out" }).ok).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.EARNINGS_DAY_ENABLED;
      else process.env.EARNINGS_DAY_ENABLED = previous;
    }
  });

  it("tells you about reports since the last check, for your names only", () => {
    const result = evaluateJob(job, facts([report("QLYS", "2026-11-09"), report("NVDA", "2026-11-09"), report("HIMS", "2026-11-05")]), {
      day: "2026-11-10",
      since: "2026-11-06",
      tickers: ["QLYS", "HIMS"],
    });
    expect(result?.decision).toBe("notify");
    expect(result?.findings.map((f) => f.ticker)).toEqual(["QLYS"]);
    expect(result?.summary).toBe("QLYS beat on EPS and raised its outlook.");
    expect(result?.findings[0].url).toBe("/stock/QLYS/earnings/2026-11-09");
  });

  it("does nothing when nothing new came out, and never reads the future", () => {
    const quiet = evaluateJob(job, facts([report("QLYS", "2026-11-11")]), { day: "2026-11-10", since: "2026-11-09", tickers: ["QLYS"] });
    expect(quiet?.decision).toBe("nothing");
  });

  it("says it could not check when the reports are missing", () => {
    const result = evaluateJob(job, facts([], false), { day: "2026-11-10", since: null, tickers: ["QLYS"] });
    expect(result?.decision).toBe("could_not_check");
  });
});
