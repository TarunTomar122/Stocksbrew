import { describe, expect, it } from "vitest";

import { asSentence, firstFullSentence, isTitleCase, sentenceCase } from "./plain-copy";

describe("sentenceCase", () => {
  it("undoes Title Case but keeps names and acronyms", () => {
    expect(sentenceCase("Revenue Beat and Patent Defense Support Acadia Shares")).toBe("Revenue beat and patent defense support Acadia shares");
    expect(sentenceCase("Zeta Raises Outlook After Strong Q3 Earnings Beat")).toBe("Zeta raises outlook after strong Q3 earnings beat");
    expect(sentenceCase("NVIDIA Stock Falls As AI Chip Demand Fears Grow")).toBe("NVIDIA stock falls as AI chip demand fears grow");
    expect(sentenceCase("S&P 500 Hits Record High As Fed Cuts Rates")).toBe("S&P 500 hits record high as Fed cuts rates");
  });
  it("leaves sentences alone", () => {
    const text = "Hims & Hers plunges after earnings miss and guidance cut";
    expect(isTitleCase(text)).toBe(false);
    expect(sentenceCase(text)).toBe(text);
  });
  it("starts a new clause after a colon", () => {
    expect(sentenceCase("Earnings Preview: What To Expect From Micron Report")).toBe("Earnings preview: What to expect from Micron report");
  });
});

describe("firstFullSentence", () => {
  it("returns the whole first sentence", () => {
    expect(firstFullSentence("GTA VI momentum lifts Take-Two shares after earnings. Take-Two reaffirmed its $8.0 billion outlook.")).toBe(
      "GTA VI momentum lifts Take-Two shares after earnings.",
    );
  });
  it("steps over abbreviations and decimals", () => {
    expect(firstFullSentence("Hecla Mining Co. said it will redeem $1.5 billion of shares. More later.")).toBe(
      "Hecla Mining Co. said it will redeem $1.5 billion of shares.",
    );
  });
  it("keeps a text with no sentence end whole", () => {
    expect(firstFullSentence("No end here")).toBe("No end here");
  });
});

describe("asSentence", () => {
  it("adds one full stop and drops an ellipsis", () => {
    expect(asSentence("Qualys falls despite earnings beat as growth concerns weigh")).toBe("Qualys falls despite earnings beat as growth concerns weigh.");
    expect(asSentence("Shares slide...")).toBe("Shares slide.");
    expect(asSentence("Is it time to buy?")).toBe("Is it time to buy?");
  });
});

describe("shortCompanyName", () => {
  it("drops legal suffixes", async () => {
    const { shortCompanyName } = await import("./plain-copy");
    expect(shortCompanyName("Hims & Hers Health, Inc.")).toBe("Hims & Hers Health");
    expect(shortCompanyName("NVIDIA Corporation")).toBe("NVIDIA");
    expect(shortCompanyName("Take-Two Interactive Software, Inc.")).toBe("Take-Two Interactive Software");
    expect(shortCompanyName("Apple")).toBe("Apple");
    expect(shortCompanyName("Berkshire Hathaway Inc. Class B")).toBe("Berkshire Hathaway");
    expect(shortCompanyName("Cerebras Systems Inc - a")).toBe("Cerebras Systems");
    expect(shortCompanyName("Taiwan Semiconductor-Sp ADR")).toBe("Taiwan Semiconductor");
    expect(shortCompanyName("")).toBe("");
  });
});

describe("plainAction and callMetaLine", () => {
  it("translates trader shorthand and falls back to the call's meaning", async () => {
    const { plainAction, callMetaLine } = await import("./plain-copy");
    expect(plainAction("Accumulate on pullbacks", "Add")).toBe("Buy more on a dip, not here");
    expect(plainAction("Do not add here", "Trim")).toBe("Don't buy more at this price");
    expect(plainAction("Hold", "Hold")).toBe("We'd keep it, not add");
    expect(plainAction(null, "Trim")).toBe("We'd sell some, not buy more");
    expect(plainAction("Wait for earnings", "Hold")).toBe("Wait for earnings");
    expect(callMetaLine("medium", "weeks")).toBe("Medium confidence, for the next few weeks.");
    expect(callMetaLine(null, null)).toBe("");
  });
});
