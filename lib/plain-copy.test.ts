import { describe, expect, it } from "vitest";

import { asSentence, companyFirstMove, countWord, firstFullSentence, hasTitleCaseLeftover, isTitleCase, sentenceCase, shortCompanyName, splitMoveReason, withoutSourceTag } from "./plain-copy";

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
  it("lowers the wire's common headline words but keeps names that use them", () => {
    expect(sentenceCase("Microsoft Stock Fell After Anthropic Launches Claude Sheets to Rival Excel")).toBe("Microsoft stock fell after Anthropic launches Claude Sheets to rival Excel");
    expect(sentenceCase("Arm Holdings Stock Jumps After Strong Quarter")).toBe("Arm Holdings stock jumps after strong quarter");
    expect(sentenceCase("Fitch Ratings Downgrades Bank After Weak Quarter")).toBe("Fitch Ratings downgrades Bank after weak quarter");
    expect(sentenceCase("Apple Wins Major League Baseball Streaming Deal")).toBe("Apple wins Major League Baseball Streaming deal");
  });
  it("lowers the stray capitals a half-done pass left (news page, Nov 11)", () => {
    expect(sentenceCase("Tesla Faces a Valuation Test Following its Cybertruck Wind Down and Robotaxi Pivot")).toBe(
      "Tesla faces a valuation test following its Cybertruck wind down and Robotaxi pivot",
    );
    expect(sentenceCase("IREN Stock Falls Even As JPMorgan Goes Bullish")).toBe("IREN stock falls even as JPMorgan goes bullish");
    expect(sentenceCase("Semiconductor Rally Drives SOXL Higher")).toBe("Semiconductor rally drives SOXL higher");
    expect(sentenceCase("Board Approves $450 Million Investment In New Plant")).toBe("Board approves $450 million investment in new plant");
  });
  it("keeps known names, the row's own company and words that may be part of a name", () => {
    expect(sentenceCase("Stocks Slip As Powell And Waller Signal Patience On Wall Street")).toBe("Stocks slip as Powell and Waller Signal Patience on Wall Street");
    expect(sentenceCase("Shares Of Boeing Climb After Trump Meeting With Jensen Huang")).toBe("Shares of Boeing climb after Trump meeting with Jensen Huang");
    // An unknown capitalised word beside a common ending may be a name ("Energy Following"), so both keep their capitals.
    expect(sentenceCase("Investors Pile Into Constellation Energy Following Nuclear Deal")).toBe("Investors pile into Constellation Energy Following Nuclear deal");
    expect(sentenceCase("Investors Pile Into Constellation Energy After Nuclear Deal", "Constellation Energy Corporation")).toBe(
      "Investors pile into Constellation Energy after Nuclear deal",
    );
    expect(sentenceCase("Why Acadia Healthcare Stock Fell Sharply Today", "Acadia Healthcare Company")).toBe("Why Acadia Healthcare stock fell sharply today");
    expect(sentenceCase("Fed Holds Rates: Markets Weigh Next Move")).toBe("Fed holds rates: Markets weigh next move");
    expect(sentenceCase("Intel Stocks Fall 1.82% As Chip Rally Fades And PC Slump Clouds Q4")).toBe("Intel stocks fall 1.82% as chip rally fades and PC slump clouds Q4");
    // Codes glued to digits, all-common hyphen compounds, names that use common words, a company's small words.
    expect(sentenceCase("How Much Tax Does A 61-Year-Old Owe On Inherited Apple Stock?")).toBe("How much tax does a 61-year-old owe on inherited Apple stock?");
    expect(sentenceCase("Shares Of Shift4 Jump After Strong Quarter")).toBe("Shares of Shift4 jump after strong quarter");
    expect(sentenceCase("Zeta Posts Better-Than-Expected Results And An All-Time High")).toBe("Zeta posts better-than-expected results and an all-time high");
    expect(sentenceCase("Microsoft Teams Hits Record Users As Tesla Model Y Sales Rise")).toBe("Microsoft Teams hits record users as Tesla Model Y sales rise");
    expect(sentenceCase("Why Bank Of America Stock Is Rising Today", "Bank of America Corporation")).toBe("Why Bank of America stock is rising today");
    expect(sentenceCase("Shares Of Take-Two Rise After GTA VI Preorders Beat")).toBe("Shares of Take-Two rise after GTA VI Preorders beat");
    expect(sentenceCase("SpaceX Supplier Is Doing Just Fine. The Stock Isn’t.")).toBe("SpaceX Supplier is doing just fine. The stock isn’t.");
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
    expect(plainAction("Hold", "Hold")).toBe("We'd keep it, not buy more");
    expect(plainAction(null, "Trim")).toBe("We'd sell some, not buy more");
    expect(plainAction("Wait for earnings", "Hold")).toBe("Wait for earnings");
    expect(callMetaLine("medium", "weeks")).toBe("We're fairly sure of this for the next few weeks.");
    expect(callMetaLine("low", null)).toBe("We're not very sure of this.");
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
    expect(plainCallReason("Upside and downside look balanced; keep the position but do not force a new add.")).toMatch(/^We see about as much reason for it to fall as to rise/);
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
  it("says headline shorthand in plain words", async () => {
    const { plainFinance } = await import("./plain-copy");
    expect(plainFinance("Qualys falls despite earnings beat on Tepid revenue outlook")).toBe("Qualys falls despite earnings that beat expectations on a weak forecast");
    expect(plainFinance("Earnings miss and weaker outlook trigger Hims & Hers selloff")).toBe("Earnings that missed expectations and a weaker forecast trigger Hims & Hers drop");
    expect(plainFinance("Relief rally lifts Acadia")).toBe("Rebound lifts Acadia");
  });

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
    expect(plainFinance("eBay raises guidance")).toBe("eBay raises its forecast");
    expect(plainFinance("Guidance cut sinks the stock")).toBe("A lower forecast sinks the stock");
    expect(plainFinance("\"Guidance cut\" sinks the stock")).toBe("\"A lower forecast\" sinks the stock");
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
    expect(wholeSentences("A headline with no full stop")).toBe("A headline with no full stop");
  });
});

describe("plainFinance says the researcher's no-reason lines plainly", () => {
  it("rewrites range breaks and missing catalysts", async () => {
    const { plainFinance } = await import("./plain-copy");
    expect(plainFinance("CHTR breaks above recent closing range without verified catalyst")).toBe(
      "CHTR rises above its recent price range",
    );
    expect(plainFinance("VCX rebounds sharply despite quiet coverage.")).toBe("VCX rebounds sharply with little news.");
  });
});

describe("companyFirstMove", () => {
  it("puts the company first and the cause after", () => {
    expect(companyFirstMove("Earnings that missed expectations and a weaker forecast trigger Hims & Hers drop.", -16.5, { withPct: true })).toBe(
      "Hims & Hers fell 16.5% after earnings that missed expectations and a weaker forecast",
    );
    expect(companyFirstMove("Revenue that beat expectations and forecast lift Acadia shares", 10.73)).toBe(
      "Acadia rose after revenue that beat expectations and forecast",
    );
    expect(companyFirstMove("GTA VI preorders spark Take-Two’s rebound", 8.3)).toBe("Take-Two rose after GTA VI preorders");
  });

  it("keeps a company-first reason's words and puts the size after its verb", () => {
    expect(companyFirstMove("LifeVantage stock falls after revenue drops 22%", -13.6, { withPct: true })).toBe("LifeVantage falls 13.6% after revenue drops 22%");
    expect(companyFirstMove("Qualys falls despite earnings that beat expectations on a weak forecast", -13.3)).toBe(
      "Qualys falls despite earnings that beat expectations on a weak forecast",
    );
    expect(companyFirstMove("GTA VI Preorders Spark Take-Two's rebound", 8.3)).toBe("Take-Two rose after GTA VI Preorders");
    expect(companyFirstMove("LifeVantage stock falls after revenue drops 22%", 4)).toBeNull();
  });

  it("leaves other shapes alone", () => {
    expect(companyFirstMove("Analyst lowers Serve Robotics price target, pressuring shares", -8.4)).toBeNull();
    expect(companyFirstMove("", 3)).toBeNull();
    expect(companyFirstMove("Earnings trigger Acme rally", null)).toBeNull();
  });

  it("splits the company from what happened to it", () => {
    expect(splitMoveReason("AST SpaceMobile slides after earnings that missed expectations", -8.7, { withPct: true })).toEqual({
      subject: "AST SpaceMobile",
      predicate: "slides 8.7% after earnings that missed expectations",
    });
  });

  it("only turns a reason around when its subject is the company on the row", () => {
    expect(companyFirstMove("Oil prices jumps after an OPEC cut", 3, { company: { name: "Exxon Mobil Corporation", ticker: "XOM" } })).toBeNull();
    expect(companyFirstMove("Earnings miss triggers Hims & Hers drop", -16.5, { company: { name: "Hims & Hers Health, Inc.", ticker: "HIMS" } })).toBe(
      "Hims & Hers fell after earnings miss",
    );
    expect(companyFirstMove("GTA VI preorders spark Take-Two's rebound", 8.3, { company: { name: "Take-Two Interactive Software", ticker: "TTWO" } })).toBe(
      "Take-Two rose after GTA VI preorders",
    );
  });

  it("refuses a reason whose words point the other way from the move", () => {
    expect(companyFirstMove("Strong demand sparks Acme rally", -4)).toBeNull();
    expect(companyFirstMove("Weak demand triggers Acme selloff", 4)).toBeNull();
  });
});

describe("shortCompanyName keeps very short names readable", () => {
  it("does not cut a name down to one tiny word", () => {
    expect(shortCompanyName("On Holding AG")).toBe("On Holding");
    expect(shortCompanyName("Lennar Corp - B Shs")).toBe("Lennar");
    expect(shortCompanyName("Elmet Group Co. (The)")).toBe("Elmet Group");
  });

  it("never leaves a dangling 'and' or a filing-style 'The'", () => {
    expect(shortCompanyName("Eli Lilly and Company")).toBe("Eli Lilly");
    expect(shortCompanyName("Procter & Gamble Company")).toBe("Procter & Gamble");
    expect(shortCompanyName("Johnson & Johnson")).toBe("Johnson & Johnson");
    expect(shortCompanyName("AT&T Inc.")).toBe("AT&T");
    expect(shortCompanyName("The Coca-Cola Company")).toBe("Coca-Cola");
    expect(shortCompanyName("The Home Depot, Inc.")).toBe("Home Depot");
    expect(shortCompanyName("The Trade Desk, Inc.")).toBe("The Trade Desk");
    expect(shortCompanyName("3M Company")).toBe("3M");
    expect(shortCompanyName("Marsh & McLennan Companies, Inc.")).toBe("Marsh & McLennan Companies");
    expect(shortCompanyName("NVIDIA Corporation")).toBe("NVIDIA");
  });
});

describe("feed names in the company's own casing", () => {
  it("fixes 13F title-casing, capitals, clipped fields and listing tails", () => {
    expect(shortCompanyName("Dr Horton")).toBe("D.R. Horton");
    expect(shortCompanyName("D R HORTON INC")).toBe("D.R. Horton");
    expect(shortCompanyName("Nvidia")).toBe("NVIDIA");
    expect(shortCompanyName("Mckesson")).toBe("McKesson");
    expect(shortCompanyName("Nxp Semiconductors NV")).toBe("NXP Semiconductors");
    expect(shortCompanyName("Te Connectivity")).toBe("TE Connectivity");
    expect(shortCompanyName("Ishares Core S&P 500 ETF")).toBe("iShares Core S&P 500 ETF");
    expect(shortCompanyName("Credo Technology Group Holdi")).toBe("Credo Technology Group");
    expect(shortCompanyName("Jefferies Financial Group in")).toBe("Jefferies Financial Group");
    expect(shortCompanyName("Vanguard Ftse Emerging Marke")).toBe("Vanguard FTSE Emerging Markets");
    expect(shortCompanyName("Bloom Energy Corp- a")).toBe("Bloom Energy");
    expect(shortCompanyName("Dell Technologies -C")).toBe("Dell Technologies");
    expect(shortCompanyName("ASML Holding Nv-Ny Reg Shs")).toBe("ASML");
    expect(shortCompanyName("WINDWARD BIO GROUP AG")).toBe("Windward Bio Group");
    expect(shortCompanyName("CSX CORP")).toBe("CSX");
    expect(shortCompanyName("AMC")).toBe("AMC");
    expect(shortCompanyName("MACY'S INC")).toBe("Macy's");
    expect(shortCompanyName("JOYY Inc. American Deposit")).toBe("JOYY");
    expect(shortCompanyName("Hello Group Inc. Sponsored")).toBe("Hello Group");
    // Names already in mixed case keep their own casing.
    expect(shortCompanyName("Hims & Hers Health, Inc.")).toBe("Hims & Hers Health");
    expect(shortCompanyName("Applied Optoelectronics Tech")).toBe("Applied Optoelectronics Tech");
  });
});

describe("plainFinance says a beat and a raised forecast as both facts", () => {
  it("rewrites the headline pair", async () => {
    const { plainFinance } = await import("./plain-copy");
    expect(plainFinance("Revenue Beat and Guidance Lift")).toBe("Revenue that beat expectations and a raised forecast");
    expect(plainFinance("Acadia rose after revenue beat and forecast")).toBe("Acadia rose after revenue and a forecast that beat expectations");
    expect(plainFinance("Revenue Beat and Guidance Lift Acadia Shares")).toBe("Acadia rose after revenue that beat expectations and a raised forecast");
    expect(plainFinance("GTA VI Preorders Spark Take-Two's rebound")).toBe("Take-Two rose after GTA VI Preorders");
    expect(plainFinance("GTA VI Preorders Spark Take-Two\u2019s Relief Rally")).toBe("Take-Two rose after GTA VI Preorders");
  });
});

describe("plainFinance says analyst target headlines as sentences", () => {
  it("names who did what", async () => {
    const { plainFinance } = await import("./plain-copy");
    expect(plainFinance("Analyst trims Biodesix target despite maintaining Buy rating.")).toBe("An analyst lowered the price they expect for Biodesix but still says buy.");
    expect(plainFinance("Analyst lowers Serve Robotics price target, pressuring shares.")).toBe("Serve Robotics fell after an analyst lowered the price they expect.");
    expect(plainFinance("AST SpaceMobile slides after earnings that missed expectations and price-target cut")).toBe("AST SpaceMobile slides after earnings that missed expectations and a lower analyst price target");
  });
});

describe("feed names from the quality pass", () => {
  it("fixes shouting names, acronyms and abbreviations", async () => {
    const { readableCompanyName, shortCompanyName } = await import("./plain-copy");
    expect(readableCompanyName("BANK OF NEW YORK MELLON CORP")).toBe("Bank of New York Mellon Corp");
    expect(shortCompanyName("PROCTER AND GAMBLE CO")).toBe("Procter and Gamble");
    expect(readableCompanyName("BNY MELLON")).toBe("BNY Mellon");
    expect(readableCompanyName("EBAY INC")).toBe("eBay Inc");
    expect(readableCompanyName("MCDONALDS CORP")).toBe("McDonald's Corp");
    expect(readableCompanyName("PAYPAL HLDGS INC")).toBe("PayPal Holdings Inc");
    expect(shortCompanyName("AI HOLDINGS")).toBe("AI Holdings");
    expect(shortCompanyName("HP INC")).toBe("HP");
    expect(shortCompanyName("3M CO")).toBe("3M");
  });
});

describe("splitMoveReason reads our own past-tense rewrites", () => {
  it("splits 'X rose after ...' and keeps a size it already has", async () => {
    const { splitMoveReason } = await import("./plain-copy");
    expect(splitMoveReason("Acadia rose after revenue that beat expectations", 10.7, { withPct: true, company: { name: "Acadia Pharmaceuticals", ticker: "ACAD" } })).toEqual({
      subject: "Acadia",
      predicate: "rose 10.7% after revenue that beat expectations",
    });
    expect(splitMoveReason("Zeta rose 8% after strong earnings", 8.2, { withPct: true })?.predicate).toBe("rose 8% after strong earnings");
    expect(splitMoveReason("Zeta fell after strong earnings", 8.2, { withPct: true })).toBeNull();
  });
});

describe("hasTitleCaseLeftover", () => {
  it("spots headline capitals left in a sentence, not acronyms, the company's name or a new sentence", () => {
    expect(hasTitleCaseLeftover("Take-Two rose after GTA VI Preorders.", "Take-Two Interactive")).toBe(true);
    expect(hasTitleCaseLeftover("Take-Two rose after GTA VI preorders.", "Take-Two Interactive")).toBe(false);
    expect(hasTitleCaseLeftover("Hims & Hers fell after earnings missed. Shares hit a low.", "Hims & Hers Health")).toBe(false);
    expect(hasTitleCaseLeftover("Apple rose after iPhone sales beat.", "Apple Inc.")).toBe(false);
    expect(hasTitleCaseLeftover("", "")).toBe(false);
  });

  it("lets a single proper noun, a day or a month through", () => {
    expect(hasTitleCaseLeftover("Zeta rose as Microsoft spending grew.", "Zeta Global")).toBe(false);
    expect(hasTitleCaseLeftover("Zeta rose after the Fed cut rates on Monday.", "Zeta Global")).toBe(false);
    expect(hasTitleCaseLeftover("Zeta rose after its report on November 4.", "Zeta Global")).toBe(false);
  });
});

describe("countWord", () => {
  it("says small counts in words and larger ones as digits", () => {
    expect(countWord(5)).toBe("five");
    expect(countWord(20)).toBe("20");
  });
});

describe("withoutSourceTag", () => {
  it("drops a wire desk's tag in front of a headline", () => {
    expect(withoutSourceTag("Analysis-Nvidia's clubby board faces a sticky 'honey pot' test")).toBe("Nvidia's clubby board faces a sticky 'honey pot' test");
    expect(withoutSourceTag("UPDATE 2-EXCLUSIVE-Apple weighs a bigger buyback")).toBe("Apple weighs a bigger buyback");
    expect(withoutSourceTag("Exclusive: Tesla cuts prices")).toBe("Tesla cuts prices");
    expect(withoutSourceTag("BREAKINGVIEWS-Oil's rally has legs")).toBe("Oil's rally has legs");
  });

  it("leaves a headline that only starts with the word alone", () => {
    expect(withoutSourceTag("Analysis shows chip stocks are stretched")).toBe("Analysis shows chip stocks are stretched");
    expect(withoutSourceTag("Insight-driven funds lag")).toBe("Insight-driven funds lag");
    expect(withoutSourceTag("Live Nation beats estimates")).toBe("Live Nation beats estimates");
  });

  it("never capitalises a brand that starts lowercase", () => {
    expect(withoutSourceTag("eBay raises its outlook")).toBe("eBay raises its outlook");
    expect(withoutSourceTag("UPDATE 1-eBay beats estimates")).toBe("eBay beats estimates");
    expect(withoutSourceTag("iPhone sales slow")).toBe("iPhone sales slow");
  });

  it("sentence case drops the tag too", () => {
    expect(sentenceCase("Analysis-Nvidia's clubby board faces a sticky 'honey pot' test")).toBe("Nvidia's clubby board faces a sticky 'honey pot' test");
  });
});
