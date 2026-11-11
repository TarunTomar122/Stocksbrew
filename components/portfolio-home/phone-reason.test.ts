import { describe, expect, it } from "vitest";

import { leadSentence, phoneReason, sentenceParts } from "./phone-reason";

describe("leadSentence", () => {
  it("keeps numbers and abbreviations inside the sentence", () => {
    expect(leadSentence("It sits $1,110 below what was paid. More text.")).toBe("It sits $1,110 below what was paid.");
    expect(leadSentence("Apple: 15% bought directly and 2.5% through VOO and QQQ. Fund holdings from SEC filings.")).toBe(
      "Apple: 15% bought directly and 2.5% through VOO and QQQ.",
    );
    expect(leadSentence("It reports after the U.S. close on Nov. 17 with Apple Inc. ahead. Then more.")).toBe(
      "It reports after the U.S. close on Nov. 17 with Apple Inc. ahead.",
    );
    expect(leadSentence("Revenue grew vs. last year. Margins fell.")).toBe("Revenue grew vs. last year.");
  });

  it("returns the whole line when it has one sentence, and null for nothing", () => {
    expect(leadSentence("  One sentence without a full stop ")).toBe("One sentence without a full stop");
    expect(leadSentence("")).toBeNull();
    expect(leadSentence(null)).toBeNull();
  });
});

describe("sentenceParts", () => {
  it("adds the clause after a colon only when it reads as a sentence", () => {
    expect(sentenceParts("Of the holdings reporting soon, its report matters most: it is 11% of the example portfolio.")).toEqual([
      "Of the holdings reporting soon, its report matters most: it is 11% of the example portfolio.",
      "It is 11% of the example portfolio.",
    ]);
    // A list of tickers or a bare label is not a sentence.
    expect(sentenceParts("Three report this week: NVDA, AMD, AVGO, TSM.")).toHaveLength(1);
    expect(sentenceParts("Context: the fund.")).toHaveLength(1);
  });

  it("adds the clause before ', so' when it is a sentence of its own", () => {
    expect(sentenceParts("Vanguard Growth Index Fund is a similar fund to hold meanwhile, so selling for the tax would not leave the money idle.")).toContain(
      "Vanguard Growth Index Fund is a similar fund to hold meanwhile.",
    );
  });
});

describe("phoneReason", () => {
  it("prefers a short part of the why", () => {
    expect(
      phoneReason(
        {
          headline: "NVIDIA reports on Nov 17 after the close.",
          why: "Of the holdings reporting soon, its report matters most: it is 11% of the example portfolio.",
          evidence: "It has moved 3.2% on a typical report, about one and a half times a normal day.",
        },
        "NVIDIA reports on Nov 17 after the close.",
      ),
    ).toBe("It is 11% of the example portfolio.");
  });

  it("falls back to the evidence, and ignores a why on a card without its own headline", () => {
    expect(phoneReason({ headline: null, why: "Ignored here.", evidence: "Apple: 15% bought directly and 2.5% through VOO and QQQ. More." }, "Apple is 17%.")).toBe(
      "Apple: 15% bought directly and 2.5% through VOO and QQQ.",
    );
  });

  it("returns the shortest whole sentence when none is short, never a cut one", () => {
    const long = "This is a deliberately long sentence that goes on and on about many things without any colon at all in it.";
    expect(phoneReason({ headline: "H.", why: long, evidence: null }, "H.")).toBe(long);
  });

  it("is null when nothing goes beyond the headline", () => {
    expect(phoneReason({ headline: "Same.", why: "Same.", evidence: null }, "Same.")).toBeNull();
    expect(phoneReason({ headline: "H.", why: null, evidence: null }, "H.")).toBeNull();
  });
});
