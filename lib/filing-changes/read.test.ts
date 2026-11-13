import { describe, expect, it } from "vitest";

import type { Comparison } from "./diff";
import { comparisonSentence, readFilingChangesOf } from "./read";
import type { FilingChangesDoc } from "./store";

const TODAY = "2026-11-13";

function comparison(form: "10-K" | "10-Q", filed: string, patch: Partial<Comparison> = {}): Comparison {
  return {
    status: "changes",
    scope: "full",
    filing: { form, accession: `acc-${filed}`, filed, period: null, url: `https://www.sec.gov/${filed}.htm`, headings: 40 },
    base: { form: "10-K", accession: "acc-base", filed: "2026-02-04", period: null, url: "https://www.sec.gov/base.htm", headings: 40 },
    added: [],
    dropped: [],
    reworded: [],
    same: 38,
    reason: null,
    ...patch,
  };
}

const doc = (latest: Comparison, history: Comparison[] = []): FilingChangesDoc => ({ version: 1, ticker: "LLY", company: "Eli Lilly", cik: 1, latest, history, updated_at: "", source: "SEC EDGAR" });

describe("which comparison a reader gets", () => {
  it("is nothing when nothing is stored", () => {
    expect(readFilingChangesOf(null, TODAY)).toEqual({ kind: "none" });
  });

  it("falls back to the newest readable comparison when none changed anything", () => {
    const read = readFilingChangesOf(doc(comparison("10-Q", "2026-10-29", { status: "no_changes", scope: null })), TODAY);
    expect(read).toMatchObject({ kind: "ok", onPage: false, shown: { status: "no_changes" }, newer: null, unread: null });
  });

  it("is unreadable only when no comparison could be read", () => {
    const read = readFilingChangesOf(doc(comparison("10-K", "2026-02-04", { status: "unreadable" }), [comparison("10-Q", "2025-11-01", { status: "unreadable" })]), TODAY);
    expect(read).toMatchObject({ kind: "unreadable", filing: { filed: "2026-02-04" } });
  });
});

describe("the sentence", () => {
  it("says the counts, with the base filing", () => {
    expect(comparisonSentence("LLY", comparison("10-K", "2026-02-12", { added: ["a", "b"], dropped: ["c"] }), TODAY)).toBe("LLY's 10-K filed Feb 12 added 2 risks and dropped 1 against its 10-K from Feb 4.");
    expect(comparisonSentence("LLY", comparison("10-K", "2026-02-12", { dropped: ["c"] }), TODAY)).toBe("LLY's 10-K filed Feb 12 dropped 1 risk against its 10-K from Feb 4.");
  });

  it("holds a partial 10-Q against the 10-K and says what a quiet one said", () => {
    expect(comparisonSentence("LLY", comparison("10-Q", "2026-08-01", { scope: "partial", added: ["a"] }), TODAY)).toBe("LLY's 10-Q filed Aug 1 added 1 risk since its 10-K from Feb 4.");
    expect(comparisonSentence("LLY", comparison("10-Q", "2026-08-01", { status: "no_changes" }), TODAY)).toBe("LLY's 10-Q filed Aug 1 says its risks have not changed since the 10-K.");
    expect(comparisonSentence("LLY", comparison("10-Q", "2026-08-01", { reworded: [{ from: "a", to: "b", score: 0.9 }] }), TODAY)).toBe("LLY's 10-Q filed Aug 1 added and dropped no risks against its 10-K from Feb 4, and reworded 1.");
    expect(comparisonSentence("LLY", comparison("10-Q", "2026-08-01", { scope: "partial", repeated: ["a"] }), TODAY)).toBe("LLY's 10-Q filed Aug 1 repeats 1 risk first added after its 10-K.");
  });
});
