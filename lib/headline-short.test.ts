import { describe, expect, it } from "vitest";

import { cleanHeadline, cutHeadline, fitHeadline, headlineWordCount, HEADLINE_MAX_WORDS, newsHeadline } from "./headline-short";

describe("headlines within ten words", () => {
  // Judge 91's examples, as the live site showed them on Nov 13.
  it.each([
    ["Wall Street Steady pre-bell amid Nvidia CEO departure; Asia off, Europe up", "Wall Street steady pre-bell amid Nvidia CEO departure"],
    // Eleven words once "(AVGO)" goes: the reason after "after" is cut, the news stays.
    ["Broadcom (AVGO) stock gets a fresh AI opening after rival CEO exit", "Broadcom stock gets a fresh AI opening"],
    ["BioNTech may be the next Moderna. Even if it isn’t, the stock is a buy.", "BioNTech may be the next Moderna"],
    [
      "Wall Street Wrap: Nvidia faces downgrades as Jensen Huang’s exit rattles analysts — AMD, MP Materials, Riot Platforms Get bullish calls",
      "Nvidia faces downgrades as Jensen Huang’s exit rattles analysts",
    ],
    ["Is Freedom Capital markets wrong to give up on Qualcomm? Wall Street still sees $185", "Is Freedom Capital markets wrong to give up on Qualcomm?"],
    ["Musk: SpaceX makes compute “actually usable” in 2 months, 3x faster than rivals", "Musk: SpaceX makes compute “actually usable” in 2 months"],
    ["Why is Cisco stock falling today despite higher quarterly revenue and earnings?", "Why is Cisco stock falling today?"],
    ["Stock market today, Nov. 12: AMD jumps 5.9% on Bank of America price target hike to $700", "AMD jumps 5.9%"],
    ["Nvidia's rivals are cashing in on Jensen Huang's exit. AMD shares have jumped 30% this week", "Nvidia's rivals are cashing in on Jensen Huang's exit"],
    ["Oracle now gets “$16 billion a year” per gigawatt, up from $10 billion", "Oracle now gets “$16 billion a year” per gigawatt"],
    ["Super Micro (SMCI) takes another hit as fresh probe weighs on shares", "Super Micro takes another hit"],
    ["Widespread Microsoft outage continues, taking down Outlook and other 365 services", "Widespread Microsoft outage continues"],
    ["Arista Networks (ANET) guides higher, is the stock overvalued following earnings?", "Arista Networks guides higher, is the stock overvalued following earnings?"],
    ["Benchmark cuts E.W. Scripps stock price target on Q2 headwinds - Investing.com", "Benchmark cuts E.W. Scripps stock price target on Q2 headwinds"],
  ])("%s", (input, expected) => {
    const out = newsHeadline(input);
    expect(out).toBe(expected);
    expect(headlineWordCount(out)).toBeLessThanOrEqual(HEADLINE_MAX_WORDS);
  });

  it("takes off roundup prefixes, site names and tickers in brackets, and nothing else", () => {
    expect(cleanHeadline("Stock Market Today: Dow slips as yields climb")).toBe("Dow slips as yields climb");
    expect(cleanHeadline("Market Chatter: Berkshire Hathaway scales tighter credit markets")).toBe("Berkshire Hathaway scales tighter credit markets");
    expect(cleanHeadline("Nvidia (NASDAQ:NVDA) shares slide | Benzinga")).toBe("Nvidia shares slide");
    // A label needs its colon: these are headlines.
    expect(cleanHeadline("Wall Street steady ahead of jobs data")).toBe("Wall Street steady ahead of jobs data");
    expect(cleanHeadline("Stock market rallies on rate-cut hopes")).toBe("Stock market rallies on rate-cut hopes");
    // Not a ticker: a figure or a lowercase word in brackets stays.
    expect(cleanHeadline("Apple's M5 (2026) chip arrives")).toBe("Apple's M5 (2026) chip arrives");
  });

  it("never cuts a claim away from who made it, at an abbreviation, after a lead-in, or onto a small word", () => {
    expect(cutHeadline("Nvidia stock is far too expensive for most buyers right now, analyst says")).toBeNull();
    expect(cutHeadline("Advanced Micro Devices Inc. Shares jump after the company beats every estimate")).not.toBe("Advanced Micro Devices Inc");
    expect(cutHeadline("Despite strong iPhone sales in China and India, Apple shares fall again today")).not.toBe("Despite strong iPhone sales in China and India");
    expect(cutHeadline("Tesla shares and bonds rally with the dollar and, oddly, gold today, in a quiet session") ?? "").not.toMatch(/ and$/);
  });

  // QA, Nov 13: each of these once cut into something the source did not say.
  it("keeps the headline whole rather than cut it wrong", () => {
    // A kicker or a speaker before a colon is not the story.
    expect(cutHeadline("Nvidia earnings preview for the week: what Wall Street expects from the chipmaker")).toBeNull();
    expect(cutHeadline("Jensen Huang on China export rules: we will keep selling there anyway")).toBeNull();
    // A comma inside a list.
    expect(cutHeadline("Shares of Nvidia, AMD and Broadcom rise after a strong night for chip demand")).not.toBe("Shares of Nvidia");
    expect(cutHeadline("Nvidia sells more chips, memory and servers to every cloud company this year")).toBeNull();
    // Who said it stays with what was said, wherever it sits in the tail.
    expect(cutHeadline("The AI trade is far from over for chip stocks; strategists at Goldman say more is coming")).toBeNull();
    // A pair of dashes is an aside, not an ending.
    expect(cutHeadline("Nvidia — once the market's darling — slides for a fifth straight day on export worries")).toBeNull();
    // "a.m." is not a sentence end.
    expect(cutHeadline("Stocks open at 9:30 a.m. Nvidia and Apple lead the early gains on Wall Street today")).toBeNull();
    // No cut at a colon, and none before "or": a question kept whole beats one turned into an order.
    expect(newsHeadline("Broadcom just gained 25% in a week: Take profits, or buy more?")).toBe("Broadcom just gained 25% in a week: Take profits, or buy more?");
    // An aside left open by a pair of dashes, a role after "as", and "after hours".
    expect(cutHeadline("CoreWeave slides 8% — the AI cloud firm's lockup expiry looms — as insiders prepare to sell") ?? "").not.toMatch(/[—–-]$/);
    expect(cutHeadline("Starbucks names former Chipotle boss Brian Niccol as its new chief executive as turnaround push begins")).not.toBe("Starbucks names former Chipotle boss Brian Niccol");
    expect(cutHeadline("Tim Cook could step down as Apple CEO as soon as next year amid succession talks")).not.toBe("Tim Cook could step down");
    expect(cutHeadline("Oracle shares tumble 9% after hours as cloud capex balloons past every estimate")).toBe("Oracle shares tumble 9% after hours");
    // "As much as" is not a reason.
    expect(cutHeadline("Apple's iPhone sales in China rise as much as 10% in the third quarter")).toBeNull();
  });

  it("keeps a company's product names when the source wrote them as names", () => {
    expect(newsHeadline("Microsoft Stock Down; Cybersecurity Gains As Outage Disrupts Outlook, Teams")).toMatch(/Outlook, Teams$/);
    // One alone in a Title Case headline is just a word.
    expect(newsHeadline("Microsoft Raises Outlook For Cloud Growth")).toMatch(/^Microsoft raises outlook /);
    expect(newsHeadline("Microsoft Raises Outlook as Azure Growth Accelerates")).toMatch(/^Microsoft raises outlook /);
    expect(newsHeadline("Microsoft cuts its outlook; Outlook outage hits users")).toBe("Microsoft cuts its outlook; Outlook outage hits users");
  });

  it("never keeps only the tease before a colon", () => {
    expect(newsHeadline("What iShares PHLX SOX Semiconductor (SOXX) bought: AMD leads on Nov. 11")).toBe("What iShares PHLX SOX Semiconductor bought: AMD leads on Nov. 11");
  });

  it("keeps a headline whole when no clean cut exists, unless a stored short title fits", () => {
    const long = "SoundHound AI's latest results indicate that the company is getting its house in order.";
    expect(fitHeadline(long)).toBe(long);
    expect(fitHeadline(long, { shortTitle: "SoundHound is getting its house in order" })).toBe("SoundHound is getting its house in order");
    // A short title that is itself too long is not used.
    expect(fitHeadline(long, { shortTitle: long })).toBe(long);
  });

  it("lowers the stray capitals a market headline leaves", () => {
    expect(newsHeadline("Stocks tumble as rally Erases gains")).toBe("Stocks tumble as rally erases gains");
    // A hyphenated pair of ordinary words is no name; "Coca-Cola" is.
    expect(newsHeadline("CoreWeave stocks tumble 11.56% as NVIDIA Shake-Up Erases post-earnings rally")).toBe("CoreWeave stocks tumble 11.56% as NVIDIA shake-up erases post-earnings rally");
    expect(newsHeadline("Coca-Cola and Rolls-Royce Shares Rise")).toBe("Coca-Cola and Rolls-Royce shares rise");
    // Beside a possible name the pair keeps both capitals, never half of them.
    expect(newsHeadline("Starbucks Shake-Up Continues With Layoffs")).not.toMatch(/Shake-up/);
  });

  it("leaves a headline within the budget as it is", () => {
    expect(fitHeadline("Nvidia CEO Jensen Huang steps down")).toBe("Nvidia CEO Jensen Huang steps down");
  });
});
