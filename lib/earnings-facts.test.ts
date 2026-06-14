import { describe, expect, it } from "vitest";

import {
  firstSentence,
  isMissingActualEarningsCopy,
  pickEarningsHookLine,
} from "@/lib/earnings-facts";

describe("earnings-facts", () => {
  it("flags missing-EPS boilerplate", () => {
    expect(
      isMissingActualEarningsCopy(
        "Actual EPS for Q2 is not yet available; cannot confirm beat or miss.",
      ),
    ).toBe(true);
    expect(isMissingActualEarningsCopy("Reported $2.11 vs $1.96 estimate (+7.5%).")).toBe(false);
  });

  it("keeps only the first sentence for card previews", () => {
    expect(
      firstSentence(
        "Tuniu reported a 13% revenue increase but did not disclose EPS. The stock declined 5.7% on June 11.",
      ),
    ).toBe("Tuniu reported a 13% revenue increase but did not disclose EPS.");
    expect(firstSentence("Closed at $4.81 from $5.10 prior close.")).toBe(
      "Closed at $4.81 from $5.10 prior close.",
    );
    expect(
      firstSentence(
        "Gap Inc. reported Q1 results without disclosed EPS, with shares gaining 2.1% on June 4.",
      ),
    ).toBe(
      "Gap Inc. reported Q1 results without disclosed EPS, with shares gaining 2.1% on June 4.",
    );
    expect(
      firstSentence("Gap Inc. reported earnings. Shares rallied the next day."),
    ).toBe("Gap Inc. reported earnings.");
    expect(firstSentence("Dr. Smith guided revenue higher for FY26.")).toBe(
      "Dr. Smith guided revenue higher for FY26.",
    );
  });

  it("prefers useful evidence over disclaimers", () => {
    expect(
      pickEarningsHookLine(
        [
          "Actual EPS not reported; estimate was $1.58.",
          "Shares dropped 6% after hours on AI capex concerns.",
        ],
        "Oracle earnings update",
      ),
    ).toBe("Shares dropped 6% after hours on AI capex concerns.");
  });
});
