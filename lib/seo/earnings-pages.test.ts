import { describe, expect, it } from "vitest";

import { nextReport, normalizeEarnings, summarizeReports, withoutStaleEstimates, type EarningsItem } from "@/lib/calendar-shared";
import { LAST_QUARTER_MAX_AGE_DAYS, earningsPageFacts, earningsPageIsIndexable, lastQuarterHasData, lastQuarterOf } from "@/lib/seo/earnings-pages";

const TODAY = "2026-11-24";

function row(date: string, extra: Record<string, unknown> = {}): EarningsItem {
  return normalizeEarnings({ ticker: "NVDA", company: "NVIDIA", event_date: date, market: "US", time: "amc", ...extra }, { estimates: true })!;
}

const estimate = (date: string) => row(date, { market: "US_ESTIMATED", date_status: "estimated", source: "stocksbrew_estimate" });
const reported = (date: string) => ({ ...row(date, { reported_eps: 2.68, eps_estimate: 2.47 }) });

describe("estimated rows", () => {
  it("are read only by a reader that asks for them, and are marked", () => {
    const raw = { ticker: "NVDA", event_date: "2027-02-24", market: "US_ESTIMATED" };
    expect(normalizeEarnings(raw)).toBeNull();
    expect(normalizeEarnings(raw, { estimates: true })?.estimated).toBe(true);
    expect(normalizeEarnings({ ...raw, market: "US" })?.estimated).toBeUndefined();
    // A retired row stays out either way.
    expect(normalizeEarnings({ ...raw, market: "US_SUPERSEDED" }, { estimates: true })).toBeNull();
  });

  it("give way to an announced date and drop once their day has passed", () => {
    const kept = withoutStaleEstimates([estimate("2027-02-24"), estimate("2026-11-20"), reported("2026-11-17")], TODAY);
    expect(kept.map((item) => item.date)).toEqual(["2027-02-24", "2026-11-17"]);
    expect(withoutStaleEstimates([estimate("2027-02-24"), row("2027-02-25")], TODAY).map((item) => item.date)).toEqual(["2027-02-25"]);
  });

  it("are the next report only when nothing was announced", () => {
    expect(nextReport([estimate("2027-02-24"), reported("2026-11-17")], TODAY)?.estimated).toBe(true);
    // An announced date wins even when the estimate is earlier.
    expect(nextReport([estimate("2027-02-20"), row("2027-02-25")], TODAY)?.date).toBe("2027-02-25");
    expect(summarizeReports([estimate("2027-02-24")], TODAY).next?.date).toBe("2027-02-24");
    expect(nextReport([reported("2026-11-17")], TODAY)).toBeNull();
  });
});

describe("last quarter", () => {
  it("is the latest report that has happened, while it is recent", () => {
    const last = lastQuarterOf([reported("2026-08-26"), reported("2026-11-17"), row("2027-02-24")], TODAY);
    expect(last?.item.date).toBe("2026-11-17");
    expect(lastQuarterOf([reported("2026-05-20")], TODAY)).toBeNull(); // older than LAST_QUARTER_MAX_AGE_DAYS
    expect(LAST_QUARTER_MAX_AGE_DAYS).toBeGreaterThan(100);
    // A report today counts once its result is in.
    expect(lastQuarterOf([row(TODAY)], TODAY)).toBeNull();
    expect(lastQuarterOf([reported(TODAY)], TODAY)?.item.date).toBe(TODAY);
  });

  it("has data with an EPS result, a measured move or a revenue figure", () => {
    const bare = lastQuarterOf([row("2026-11-17")], TODAY);
    expect(bare).not.toBeNull();
    expect(lastQuarterHasData(bare)).toBe(false);
    expect(lastQuarterHasData(lastQuarterOf([reported("2026-11-17")], TODAY))).toBe(true);
    const moved = { ...row("2026-11-17"), reaction: { pct: -2.9, basis: "1d" as const, toDate: "2026-11-18" } };
    expect(lastQuarterHasData(lastQuarterOf([moved], TODAY))).toBe(true);
    expect(lastQuarterHasData(lastQuarterOf([row("2026-11-17")], TODAY, () => ({ value: 57e9, yoyPct: 62 })))).toBe(true);
  });
});

describe("earningsPageIsIndexable", () => {
  it("needs a next date (announced or estimated) and last-quarter figures", () => {
    expect(earningsPageIsIndexable(earningsPageFacts("NVDA", [reported("2026-11-17"), estimate("2027-02-24")], TODAY), TODAY)).toBe(true);
    expect(earningsPageIsIndexable(earningsPageFacts("NVDA", [reported("2026-11-17"), row("2027-02-25")], TODAY), TODAY)).toBe(true);
    // No next date: old numbers only.
    expect(earningsPageIsIndexable(earningsPageFacts("NVDA", [reported("2026-11-17")], TODAY), TODAY)).toBe(false);
    // A date and nothing else: a template page.
    expect(earningsPageIsIndexable(earningsPageFacts("NVDA", [row("2026-11-17"), estimate("2027-02-24")], TODAY), TODAY)).toBe(false);
    // A passed estimate is not a next date.
    expect(earningsPageIsIndexable(earningsPageFacts("NVDA", [reported("2026-11-17"), estimate("2026-11-20")], TODAY), TODAY)).toBe(false);
  });

  it("only lists covered stocks", () => {
    const facts = earningsPageFacts("ZZZZQ", [reported("2026-11-17"), estimate("2027-02-24")], TODAY);
    expect(facts.covered).toBe(false);
    expect(earningsPageIsIndexable(facts, TODAY)).toBe(false);
    expect(earningsPageIsIndexable(null, TODAY)).toBe(false);
  });
});
