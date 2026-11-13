import { describe, expect, it } from "vitest";

import type { Comparison } from "./diff";
import { FILING_CHANGES_VERSION, HISTORY_MAX, hasAnnualComparison, nextDoc, readComparison, readFilingChangesDoc, viewOf, type FilingChangesDoc } from "./store";
import { changesTitle, filedWhen, quietLine, quote, recordLine } from "./words";

function comparison(form: "10-K" | "10-Q", filed: string, patch: Partial<Comparison> = {}): Comparison {
  return {
    status: "changes",
    scope: "full",
    filing: { form, accession: `acc-${filed}`, filed, period: null, url: `https://www.sec.gov/Archives/edgar/data/2488/${filed}.htm`, headings: 40 },
    base: { form: "10-K", accession: "acc-base", filed: "2025-02-05", period: null, url: "https://www.sec.gov/Archives/edgar/data/2488/base.htm", headings: 42 },
    added: [],
    dropped: [],
    reworded: [],
    same: 38,
    reason: null,
    ...patch,
  };
}

const NOW = new Date("2026-11-13T22:00:00Z");

describe("the stored document", () => {
  it("puts the newest comparison first and keeps the rest as history, once per filing", () => {
    const annual = comparison("10-K", "2026-02-04", { added: ["We may be required to satisfy financial obligations under guarantees."] });
    const first = nextDoc(null, { ticker: "AMD", company: "ADVANCED MICRO DEVICES INC", cik: 2488, comparisons: [annual, comparison("10-Q", "2026-08-05")], now: NOW })!;
    expect(first.latest.filing.filed).toBe("2026-08-05");
    expect(first.history.map((entry) => entry.filing.filed)).toEqual(["2026-02-04"]);
    const second = nextDoc(first, { ticker: "AMD", company: "ADVANCED MICRO DEVICES INC", cik: 2488, comparisons: [comparison("10-Q", "2026-11-04")], now: NOW })!;
    expect([second.latest, ...second.history].map((entry) => entry.filing.filed)).toEqual(["2026-11-04", "2026-08-05", "2026-02-04"]);
    expect(hasAnnualComparison(second, "acc-2026-02-04")).toBe(true);
    expect(hasAnnualComparison(second, "acc-2026-08-05")).toBe(false);
  });

  it("keeps at most HISTORY_MAX earlier comparisons", () => {
    let doc: FilingChangesDoc | null = null;
    for (let month = 1; month <= 12; month += 1) {
      doc = nextDoc(doc, { ticker: "X", company: "X", cik: 1, comparisons: [comparison("10-Q", `2026-${String(month).padStart(2, "0")}-01`)], now: NOW });
    }
    expect(doc!.history).toHaveLength(HISTORY_MAX);
    expect(doc!.latest.filing.filed).toBe("2026-12-01");
  });

  it("reads back what it wrote and refuses anything else", () => {
    const doc = nextDoc(null, { ticker: "AMD", company: "AMD", cik: 2488, comparisons: [comparison("10-K", "2026-02-04", { added: ["A"] })], now: NOW });
    expect(readFilingChangesDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    expect(readFilingChangesDoc({ ...doc, version: FILING_CHANGES_VERSION + 1 })).toBeNull();
    expect(readFilingChangesDoc(null)).toBeNull();
    // Only SEC's own address is ever linked.
    expect(readComparison({ ...comparison("10-K", "2026-02-04"), filing: { ...comparison("10-K", "2026-02-04").filing, url: "https://evil.example/x" } })).toBeNull();
    expect(readComparison({ ...comparison("10-K", "2026-02-04"), status: "maybe" })).toBeNull();
  });
});

describe("what the stock page shows", () => {
  const doc = (latest: Comparison, history: Comparison[] = []): FilingChangesDoc => ({ version: 1, ticker: "LLY", company: "ELI LILLY", cik: 59478, latest, history, updated_at: NOW.toISOString(), source: "SEC EDGAR" });

  it("shows the 10-K's changes under a newer 10-Q that changed nothing", () => {
    const quiet = comparison("10-Q", "2026-10-29", { status: "no_changes", scope: null, same: 0 });
    const annual = comparison("10-K", "2026-02-12", { reworded: [{ from: "a", to: "b", score: 0.8 }] });
    expect(viewOf(doc(quiet, [annual]), "2026-11-13")).toMatchObject({ shown: { filing: { filed: "2026-02-12" } }, quiet: { filing: { filed: "2026-10-29" } } });
  });

  it("shows nothing without a readable change, or when the change is over 400 days old", () => {
    expect(viewOf(doc(comparison("10-K", "2026-02-12", { status: "unreadable", reason: "few_headings_new" })), "2026-11-13")).toBeNull();
    expect(viewOf(doc(comparison("10-K", "2026-02-12")), "2026-11-13")).toBeNull();
    expect(viewOf(doc(comparison("10-K", "2025-06-01", { added: ["Old news."] })), "2026-11-13")).toBeNull();
    expect(viewOf(null, "2026-11-13")).toBeNull();
  });

  it("leads with the newest filing that changed something", () => {
    const view = viewOf(doc(comparison("10-Q", "2026-11-04", { added: ["New."] }), [comparison("10-K", "2026-02-04", { added: ["Older."] })]), "2026-11-13");
    expect(view).toMatchObject({ shown: { filing: { filed: "2026-11-04" } }, quiet: null });
  });
});

describe("words", () => {
  it("quotes a short heading whole and cuts a long one at a word boundary, never on a joining word", () => {
    expect(quote("Climate change may have a long-term impact on our business.")).toEqual({ text: "Climate change may have a long-term impact on our business.", cut: false });
    const long = quote("We are subject to complex laws, rules, regulations, and political and other actions, including restrictions on the export of our products, which may adversely impact our business.");
    expect(long.cut).toBe(true);
    expect(long.text).toBe("We are subject to complex laws, rules, regulations, and political and other actions…");
    expect(quote("Our results may suffer because of the many different things that could go wrong with the supply of our products.").text).toBe("Our results may suffer because of the many different things that could go wrong…");
    expect(long.text.replace("…", "").split(" ").length).toBeLessThanOrEqual(15);
  });

  it("cuts a dropped risk at a clause where it can", () => {
    expect(quote("Our ability to complete the acquisition of ZT Systems is subject to closing conditions, including the receipt of consents and approvals.").text).toBe("Our ability to complete the acquisition of ZT Systems is subject to closing conditions…");
  });

  it("titles the section without promising only additions, within 10 words", () => {
    expect(changesTitle("AMD")).toBe("How AMD's risks changed");
  });

  it("says recent days in words and older ones as dates", () => {
    expect(filedWhen("2026-11-13", "2026-11-13")).toBe("today");
    expect(filedWhen("2026-11-12", "2026-11-13")).toBe("yesterday");
    expect(filedWhen("2026-11-09", "2026-11-13")).toBe("on Monday");
    expect(filedWhen("2026-02-04", "2026-11-13")).toBe("on Feb 4");
  });

  it("writes one record line of at most 15 words, from the comparison's figures", () => {
    expect(recordLine("AMD", comparison("10-Q", "2026-11-04", { added: ["a", "b"], dropped: ["c"] }))).toBe("AMD's new 10-Q adds 2 risks and drops 1.");
    expect(recordLine("SOFI", comparison("10-Q", "2026-11-05", { scope: "partial", added: ["a"] }))).toBe("SOFI's new 10-Q adds 1 risk since its 10-K.");
    expect(recordLine("APP", comparison("10-K", "2026-02-19", { dropped: ["a", "b"] }))).toBe("APP's new 10-K drops 2 risks.");
    expect(recordLine("LLY", comparison("10-Q", "2026-10-29", { status: "no_changes", scope: null }))).toBe("LLY's new 10-Q lists no changes to its risks.");
    expect(recordLine("X", comparison("10-K", "2026-02-19", { status: "unreadable" }))).toBeNull();
    expect(recordLine("X", comparison("10-K", "2026-02-19", { reworded: [{ from: "a", to: "b", score: 0.9 }] }))).toBeNull();
    for (const line of ["AMD's new 10-Q adds 2 risks and drops 1.", "SOFI's new 10-Q adds 1 risk since its 10-K."]) expect(line.split(" ").length).toBeLessThanOrEqual(15);
  });
});

describe("preferring added and dropped risks", () => {
  const doc = (latest: Comparison, history: Comparison[] = []): FilingChangesDoc => ({ version: 1, ticker: "AMD", company: "AMD", cik: 2488, latest, history, updated_at: NOW.toISOString(), source: "SEC EDGAR" });

  it("shows the 10-K that added a risk under a newer 10-Q that only reworded two", () => {
    const quarter = comparison("10-Q", "2026-11-04", { reworded: [{ from: "a", to: "b", score: 0.9 }, { from: "c", to: "d", score: 0.9 }] });
    const annual = comparison("10-K", "2026-02-04", { added: ["New."], dropped: ["Old."] });
    const view = viewOf(doc(quarter, [annual]), "2026-11-13")!;
    expect(view.shown.filing.form).toBe("10-K");
    expect(quietLine(view.quiet!, "2026-11-13")).toBe("Since then, its 10-Q filed Nov 4 adds no new risks.");
  });

  it("falls back to a reworded-only filing when nothing was added or dropped", () => {
    const annual = comparison("10-K", "2026-02-12", { reworded: [{ from: "a", to: "b", score: 0.9 }] });
    const quiet = comparison("10-Q", "2026-10-29", { status: "no_changes", scope: null });
    const view = viewOf(doc(quiet, [annual]), "2026-11-13")!;
    expect(view.shown.filing.form).toBe("10-K");
    expect(quietLine(view.quiet!, "2026-11-13")).toBe("Since then, its 10-Q filed Oct 29 lists no changes to its risks.");
  });
});

describe("QA round: stored time and repeated risks", () => {
  it("keeps when a comparison was first worked out when a forced run says the same", () => {
    const first = nextDoc(null, { ticker: "AMD", company: "AMD", cik: 2488, comparisons: [comparison("10-Q", "2026-11-04", { added: ["A."] })], now: new Date("2026-11-04T22:00:00Z") })!;
    const again = nextDoc(first, { ticker: "AMD", company: "AMD", cik: 2488, comparisons: [comparison("10-Q", "2026-11-04", { added: ["A."] })], now: NOW })!;
    expect(again.latest.compared_at).toBe("2026-11-04T22:00:00.000Z");
    const changed = nextDoc(first, { ticker: "AMD", company: "AMD", cik: 2488, comparisons: [comparison("10-Q", "2026-11-04", { added: ["A.", "B."] })], now: NOW })!;
    expect(changed.latest.compared_at).toBe(NOW.toISOString());
  });

  it("shows a 10-Q whose only risks are repeated ones, and reads them back", () => {
    const quarter = comparison("10-Q", "2026-11-05", { scope: "partial", repeated: ["Still new."] });
    const doc = nextDoc(null, { ticker: "SOFI", company: "SOFI", cik: 1, comparisons: [quarter], now: NOW })!;
    expect(readFilingChangesDoc(JSON.parse(JSON.stringify(doc)))!.latest.repeated).toEqual(["Still new."]);
    expect(viewOf(doc, "2026-11-13")?.shown.filing.filed).toBe("2026-11-05");
    expect(recordLine("SOFI", quarter)).toBe("SOFI's new 10-Q repeats 1 risk added after its 10-K.");
  });
});
