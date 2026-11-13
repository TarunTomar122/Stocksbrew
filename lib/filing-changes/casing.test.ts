import { describe, expect, it } from "vitest";

import { asSentence, docAsSentences, isTitleCase } from "./casing";
import type { FilingChangesDoc } from "./store";

describe("Title Case headings shown as sentences", () => {
  it("lowers common words and keeps names, acronyms and the company's own name", () => {
    expect(asSentence("We May Fail to Realize the Anticipated Benefits of the Merger, and Any Failure to Integrate Devon and Coterra May Hurt Us.", "DEVON ENERGY CORP")).toBe(
      "We may fail to realize the anticipated benefits of the merger, and any failure to integrate Devon and Coterra may hurt us.",
    );
    expect(asSentence("The Merger Agreement Could Be Terminated, Which Could Negatively Impact Us")).toBe("The merger agreement could be terminated, which could negatively impact us");
    expect(asSentence("Changes In U.S. Trade Policy And AI Rules Could Hurt SoFiUSD Demand")).toBe("Changes in U.S. trade policy and AI rules could hurt SoFiUSD demand");
  });

  it("leaves a heading in sentence case exactly as filed", () => {
    const heading = "The Company's operations depend on AI and the U.S. economy, and on Apple Pay.";
    expect(isTitleCase(heading)).toBe(false);
    expect(asSentence(heading)).toBe(heading);
  });

  it("turns a whole stored document into display text", () => {
    const comparison = {
      status: "changes" as const,
      scope: "full" as const,
      filing: { form: "10-K" as const, accession: "a", filed: "2026-02-18", period: null, url: "https://www.sec.gov/x", headings: 17 },
      base: null,
      added: ["The Merger Agreement Could Be Terminated, Which Could Negatively Impact Us"],
      dropped: ["Our Business Could Be Adversely Impacted by Shareholder Activism"],
      reworded: [{ from: "Activist Shareholders Could Cause Us Expense", to: "Activist Shareholders Could Cause Us Significant Expense", score: 0.9 }],
      same: 13,
      reason: null,
    };
    const doc: FilingChangesDoc = { version: 1, ticker: "DVN", company: "DEVON ENERGY CORP", cik: 1, latest: comparison, history: [comparison], updated_at: "", source: "SEC EDGAR" };
    const shown = docAsSentences(doc);
    expect(shown.latest.added[0]).toBe("The merger agreement could be terminated, which could negatively impact us");
    expect(shown.history[0]!.dropped[0]).toBe("Our business could be adversely impacted by shareholder activism");
    expect(shown.latest.reworded[0]!.to).toBe("Activist shareholders could cause us significant expense");
    // The stored copy is not changed.
    expect(doc.latest.added[0]).toMatch(/^The Merger Agreement/);
  });
});
