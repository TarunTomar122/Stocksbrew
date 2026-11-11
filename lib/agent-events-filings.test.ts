import { describe, expect, it } from "vitest";

import {
  cleanFilingFilter,
  evaluateFilingEvent,
  filingKnownDay,
  isMajorFiling,
  matchesFilingFilter,
  type FilingFact,
} from "@/lib/agent-events-filings";
import { EMPTY_FACTS, describeJob, parseJobDraft, replayJob, triggerLabel, type AgentFacts } from "@/lib/agent-jobs";

function filing(patch: Partial<FilingFact> = {}): FilingFact {
  return {
    id: "NVDA_1",
    ticker: "NVDA",
    company: "NVIDIA",
    form: "8-K",
    group: "8-K",
    amendment: false,
    items: ["1.01", "9.01"],
    filed_at: "2026-11-09T14:05:00+00:00",
    day: "2026-11-09",
    url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000001/nvda-8k.htm",
    ...patch,
  };
}

function facts(filings: FilingFact[]): AgentFacts {
  return { ...EMPTY_FACTS, filings, available: { ...EMPTY_FACTS.available, filings: true } };
}

describe("filingKnownDay", () => {
  it("puts a filing accepted after 5 PM New York on the next day's check", () => {
    expect(filingKnownDay("2026-11-09T21:30:40+00:00")).toBe("2026-11-09"); // 4:30 PM EST
    expect(filingKnownDay("2026-11-09T22:05:00+00:00")).toBe("2026-11-10"); // 5:05 PM EST
    expect(filingKnownDay("2026-07-09T20:30:00+00:00")).toBe("2026-07-09"); // 4:30 PM EDT
    expect(filingKnownDay("not a date")).toBeNull();
  });
});

describe("filters", () => {
  it("cleans what a person sends", () => {
    expect(cleanFilingFilter(undefined)).toBeUndefined();
    expect(cleanFilingFilter({ forms: ["8-k", "bogus"] })).toEqual({ forms: ["8-K"] });
    // Items imply an 8-K, unknown items are dropped.
    expect(cleanFilingFilter({ items: ["5.02", "9.99", "1.01"] })).toEqual({ forms: ["8-K"], items: ["1.01", "5.02"] });
    expect(cleanFilingFilter({ major: true, forms: ["10-Q"] })).toEqual({ major: true });
    expect(cleanFilingFilter({ forms: [] })).toBeUndefined();
  });

  it("leaves funds' passive 13G updates out unless asked for", () => {
    const passive = filing({ form: "SCHEDULE 13G/A", group: "13D/G", amendment: true, items: [] });
    expect(matchesFilingFilter(passive, undefined)).toBe(false);
    expect(matchesFilingFilter(passive, { forms: ["13D/G"] })).toBe(true);
  });

  it("counts deals, annual reports and activist stakes as big, not results or officer changes", () => {
    expect(isMajorFiling(filing())).toBe(true);
    expect(isMajorFiling(filing({ items: ["2.02", "9.01"] }))).toBe(false);
    expect(isMajorFiling(filing({ items: ["5.02"] }))).toBe(false);
    expect(isMajorFiling(filing({ form: "10-K", group: "10-K", items: [] }))).toBe(true);
    expect(isMajorFiling(filing({ form: "10-K/A", group: "10-K", amendment: true, items: [] }))).toBe(false);
    expect(isMajorFiling(filing({ form: "SCHEDULE 13D", group: "13D/G", items: [] }))).toBe(true);
    expect(isMajorFiling(filing({ form: "SCHEDULE 13G", group: "13D/G", items: [] }))).toBe(false);
  });

  it("matches 8-K items only on 8-Ks", () => {
    const filter = { forms: ["8-K" as const, "10-K" as const], items: ["5.02"] };
    expect(matchesFilingFilter(filing(), filter)).toBe(false);
    expect(matchesFilingFilter(filing({ items: ["5.02"] }), filter)).toBe(true);
    expect(matchesFilingFilter(filing({ form: "10-K", group: "10-K", items: [] }), filter)).toBe(true);
    expect(matchesFilingFilter(filing({ form: "10-Q", group: "10-Q", items: [] }), filter)).toBe(false);
  });
});

describe("evaluateFilingEvent", () => {
  const scope = { kind: "tickers" as const, tickers: ["NVDA"] };

  it("says what was filed in plain words, with the date and the SEC link", () => {
    const result = evaluateFilingEvent(undefined, scope, facts([filing()]), { day: "2026-11-09", since: "2026-11-06", tickers: ["NVDA"] }, 8);
    expect(result.decision).toBe("notify");
    expect(result.findings[0]).toMatchObject({
      ticker: "NVDA",
      headline: "NVDA filed an 8-K on a new material agreement",
      kind: "filing",
      form: "8-K",
      source: "SEC EDGAR",
      at: "2026-11-09",
    });
    expect(result.findings[0].url).toMatch(/^https:\/\/www\.sec\.gov\//);
    expect(result.findings[0].detail).toBe("Filed with the SEC on Nov 9 at 9:05 AM ET. The link opens the original filing.");
    expect(result.summary).toBe("NVDA filed an 8-K on a new material agreement, on Nov 9.");
  });

  it("only reads filings after the last check and up to the day", () => {
    const older = filing({ id: "a", day: "2026-11-06" });
    const later = filing({ id: "b", day: "2026-11-10" });
    const result = evaluateFilingEvent(undefined, scope, facts([older, later]), { day: "2026-11-09", since: "2026-11-06", tickers: ["NVDA"] }, 8);
    expect(result.decision).toBe("nothing");
    expect(result.summary).toBe("Checked, nothing to do. None of your names filed anything with the SEC on Nov 7 to Nov 9.");
  });

  it("says when filings were not available rather than calling it quiet", () => {
    const result = evaluateFilingEvent(undefined, scope, { available: { filings: false } }, { day: "2026-11-09", since: null, tickers: ["NVDA"] }, 8);
    expect(result.decision).toBe("could_not_check");
  });
});

describe("in the jobs", () => {
  it("validates, describes and labels a filing job", () => {
    const parsed = parseJobDraft({ template: "sec-filing", scope: { kind: "tickers", tickers: ["NVDA"] }, trigger: { filings: { forms: ["8-K"], items: ["5.02"] } } });
    expect(parsed.ok && parsed.draft.trigger).toEqual({ type: "event", event: "sec_filing", filings: { forms: ["8-K"], items: ["5.02"] } });
    if (!parsed.ok) return;
    expect(describeJob(parsed.draft)).toBe("Tell me when NVDA files an 8-K about a director or executive change.");
    expect(triggerLabel(parsed.draft.trigger)).toBe("8-K: director or executive change");
    // Every company's 8-Ks would be a flood: "any" becomes your names.
    const any = parseJobDraft({ template: "sec-filing", scope: { kind: "any" }, trigger: {} });
    expect(any.ok && any.draft.scope).toEqual({ kind: "watchlist" });
    const offerings = parseJobDraft({ template: "sec-filing", scope: { kind: "any" }, trigger: { filings: { forms: ["S-1"] } } });
    expect(offerings.ok && offerings.draft.scope).toEqual({ kind: "any" });
    expect(offerings.ok && describeJob(offerings.draft)).toBe("Tell me when any company files a share offering (S-1).");
  });

  it("replays without hindsight: a filing shows up on the day it could be read, never before", () => {
    const calendar = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"];
    const late = filing({ id: "late", filed_at: "2026-11-05T22:30:00+00:00", day: filingKnownDay("2026-11-05T22:30:00+00:00")! });
    const replay = replayJob(
      { trigger: { type: "event", event: "sec_filing" }, scope: { kind: "tickers", tickers: ["NVDA"] } },
      facts([late]),
      { end: "2026-11-10", tickers: ["NVDA"], calendar, weeks: 1 },
    );
    const fired = replay.runs.filter((run) => run.decision === "notify").map((run) => run.day);
    expect(fired).toEqual(["2026-11-06"]);
    expect(replay.notes.join(" ")).toMatch(/after 5 PM New York time counts for the next day/);
  });
});
