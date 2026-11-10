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
    expect(asSentence("Qualys falls despite earnings beat as growth concerns weigh")).toBe("Qualys falls despite earnings that beat expectations as growth concerns weigh.");
    expect(asSentence("Shares slide...")).toBe("Shares slide.");
    expect(asSentence("Is it time to buy?")).toBe("Is it time to buy?");
    // Someone's own words (a quoted post) keep their wording.
    expect(asSentence("Great earnings beat and guidance raise", { quote: true })).toBe("Great earnings beat and guidance raise.");
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

describe("plainCallReason", () => {
  it("rewrites every pipeline template with the same meaning", async () => {
    const { plainCallReason } = await import("./plain-copy");
    expect(plainCallReason("Risk/reward has weakened; avoid adding and use any bounce to reduce exposure.")).toBe(
      "The possible gain no longer looks worth the risk. We wouldn't buy more, and if the price bounces we'd sell some.",
    );
    expect(plainCallReason("Still constructive, but price is up 26% from its recent low, so the first pullback is the better entry.")).toBe(
      "We still like it, but the price is up 26% from its recent low, so we'd wait for the first dip to buy.",
    );
    expect(plainCallReason("Upside and downside look balanced; keep the position but do not force a new add.")).toMatch(/^The chances of a rise and a fall/);
    expect(plainCallReason("The setup is constructive, but the cleaner entry is a pullback into support.")).not.toMatch(/setup|constructive|support/);
  });

  it("rewrites the call engine scorecard sentence, with or without its level sentence", async () => {
    const { plainCallReason } = await import("./plain-copy");
    const lead = "Most of its measured families rank in the top third of similar companies and the price trend agrees.";
    expect(plainCallReason(`${lead} 5 of 7 families point up, 1 point down. The add level is $182.40 (50-day average).`)).toBe(
      "Most of what we measure ranks in the top third of similar companies, and the price trend agrees: 5 of 7 measures point up and 1 point down. We'd buy more below $182.40 (50-day average).",
    );
    expect(plainCallReason(`${lead} 5 of 7 families point up, 1 point down.`)).toMatch(/1 point down\.$/);
  });

  it("leaves anything else alone", async () => {
    const { plainCallReason } = await import("./plain-copy");
    expect(plainCallReason("Guidance beat and raised.")).toBe("Guidance beat and raised.");
    expect(plainCallReason(null)).toBe("");
  });
});

describe("plainFinance", () => {
  it("spells out beats, misses and guidance without changing what happened", async () => {
    const { plainFinance } = await import("./plain-copy");
    expect(plainFinance("Hims & Hers plunges after earnings miss and guidance cut")).toBe(
      "Hims & Hers plunges after earnings that missed expectations and a lower forecast",
    );
    expect(plainFinance("Zeta raises outlook after strong Q3 earnings beat")).toBe("Zeta raises its forecast after Q3 earnings that beat expectations");
    expect(plainFinance("Qualys falls despite earnings beat as growth concerns weigh")).toBe("Qualys falls despite earnings that beat expectations as growth concerns weigh");
    expect(plainFinance("On Holding drops as guidance disappoints despite earnings beat")).toBe("On Holding drops as its forecast disappoints despite earnings that beat expectations");
    expect(plainFinance("Revenue beat and patent defense support Acadia shares")).toBe("Revenue that beat expectations and patent defense support Acadia shares");
    expect(plainFinance("Apple unveils a new phone")).toBe("Apple unveils a new phone");
    // Already a sentence with its own object: left alone.
    expect(plainFinance("Nvidia earnings beat estimates")).toBe("Nvidia earnings beat estimates");
  });
});

describe("wholeSentences", () => {
  it("drops a sentence the feed cut off and keeps the complete ones", async () => {
    const { wholeSentences } = await import("./plain-copy");
    expect(wholeSentences("Nvidia hired a law firm. Its independent directors have retained prominent law firm...")).toBe("Nvidia hired a law firm.");
    expect(wholeSentences("W.H. Teh brings 20+ years of global leadership across AI…")).toBe("");
    expect(wholeSentences("One. Two. Three.")).toBe("One. Two.");
    expect(wholeSentences("A complete line.")).toBe("A complete line.");
  });
});
