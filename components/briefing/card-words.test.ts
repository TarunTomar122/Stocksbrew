import { describe, expect, it } from "vitest";

import { NO_CONFIRMED_REASON, type BriefingItem } from "@/lib/briefing";
import { groupBriefingItems } from "@/lib/briefing-groups";

import { plainCardText, sectionWords, unTitle } from "./card-words";

function item(overrides: Partial<BriefingItem> & Pick<BriefingItem, "id" | "kind">): BriefingItem {
  const ticker = overrides.ticker ?? "CBRS";
  return {
    ticker,
    instrument_id: `US_${ticker}`,
    name: `${ticker} Corp`,
    relation: "holding",
    severity: "medium",
    needs_you: false,
    tone: "flat",
    headline: `${ticker} did something`,
    metric: null,
    why: "Because.",
    reason_status: "not_applicable",
    next_step: "Read it.",
    spoken: "",
    evidence: [],
    as_of: "2026-11-10T18:00:00.000Z",
    deadline_days: null,
    price: 10,
    day_change_pct: -3.1,
    alert: null,
    href: `/stock/${ticker}`,
    call: "Keep",
    ...overrides,
  };
}

const call = (ticker: string, from: string, to: string, why = "The new call: steady demand.") =>
  item({ id: `call-${ticker}`, kind: "call_changed", ticker, needs_you: true, headline: `The call on ${ticker} changed from ${from} to ${to}`, metric: to, why });
const earnings = (ticker: string, when: string, days: number) =>
  item({ id: `earn-${ticker}`, kind: "earnings_upcoming", ticker, headline: `${ticker} reports earnings ${when}`, deadline_days: days });
const move = (ticker: string, pct: number, next_step = "Read it.") =>
  item({ id: `move-${ticker}`, kind: "price_move", ticker, why: NO_CONFIRMED_REASON, reason_status: "unconfirmed", day_change_pct: pct, next_step });

describe("unTitle", () => {
  it("puts a Title Case headline in sentence case and keeps names", () => {
    const text = unTitle("TSM Stock Jumps After Board Approves $1B Investment In Anthropic And OpenAI");
    expect(text).toMatch(/^TSM stock jumps after /);
    expect(text).toContain("in Anthropic and OpenAI");
  });
  it("lowers only the last word of a leftover run", () => {
    expect(unTitle("Take-Two rose after GTA VI Preorders.", "Take-Two Interactive")).toBe("Take-Two rose after GTA VI preorders.");
    expect(unTitle("Acadia rose after revenue that beat expectations.")).toBe("Acadia rose after revenue that beat expectations.");
  });
});

describe("unTitle on half-Title-Case headlines (round 6)", () => {
  it("lowers stray capitals but keeps names, tickers and the company's own name", () => {
    expect(unTitle("Nvidia's Board is reportedly planning to Oust Jensen Huang over Chinese spy, Employee Misconduct investigation", "NVIDIA")).toBe(
      "Nvidia's board is reportedly planning to oust Jensen Huang over Chinese spy, employee misconduct investigation",
    );
    expect(unTitle("QQQ Holders Feel it even If they Never trade", "Invesco QQQ Trust")).toBe("QQQ holders feel it even if they never trade");
    expect(unTitle("Caterpillar (CAT) stock looks Like a Bargain on its 222% run", "Caterpillar")).toBe("Caterpillar (CAT) stock looks like a bargain on its 222% run");
  });
  it("reads the same headlines from their scraped Title Case", () => {
    expect(unTitle("Nvidia’s Board Is Reportedly Planning To Oust Jensen Huang Over Chinese Spy, Employee Misconduct Investigation", "NVIDIA")).toBe(
      "Nvidia’s board is reportedly planning to oust Jensen Huang over Chinese spy, employee misconduct investigation",
    );
    expect(unTitle("Every December the Nasdaq-100 Reshuffles. QQQ Holders Feel It Even If They Never Trade", "Invesco QQQ Trust")).toBe(
      "Every December the Nasdaq-100 reshuffles. QQQ holders feel it even if they never trade",
    );
    expect(unTitle("Caterpillar (CAT) Stock Looks Like A Bargain On Its 222% Run", "Caterpillar")).toBe("Caterpillar (CAT) stock looks like a bargain on its 222% run");
  });
  it("leaves brands and the other companies on the page alone", () => {
    expect(unTitle("Sales at Target rose while Best Buy fell", "Costco")).toBe("Sales at Target rose while Best Buy fell");
    // Ship 39's Worth knowing card on AMD, and NVDA's.
    expect(unTitle("Nvidia Stock Sinks As Jensen Huang Ouster Report Sends Investors Toward AMD, Broadcom", "Advanced Micro Devices", ["NVIDIA"])).toBe(
      "Nvidia stock sinks as Jensen Huang ouster report sends investors toward AMD, Broadcom",
    );
    expect(unTitle("Cramer's Stance On Nvidia's Stock Amid Reports That CEO Jensen Huang May Be Ousted", "NVIDIA")).toBe(
      "Cramer's stance on Nvidia's stock amid reports that CEO Jensen Huang may be ousted",
    );
    expect(unTitle("Shares of The Trade Desk fell after Five Below beat", "Costco")).toBe("Shares of The Trade Desk fell after Five Below beat");
    expect(unTitle("AMD gains as Advanced Micro Devices wins Board approval", "Nvidia", ["Advanced Micro Devices"])).toBe("AMD gains as Advanced Micro Devices wins board approval");
  });
});

describe("plainCardText", () => {
  it("drops question endings and what-would-change notes", () => {
    expect(plainCardText("Our call moved to Trim, and you hold it. Review?")).toBe("Our call moved to Sell some, and you hold it.");
    expect(plainCardText("The call is Accumulate. What would change it: Revisit if momentum breaks.")).toBe("The call is Buy more.");
    expect(plainCardText("Is Nvidia A Buy?")).toBe("");
    // Someone else's rating is not our call word.
    expect(plainCardText("Morgan Stanley cut Tesla to Hold.")).toBe("Morgan Stanley cut Tesla to Hold.");
    expect(plainCardText("Read it. Open NVDA to see what would change it.")).toBe("Read it.");
  });
  it("ends with a full stop", () => {
    expect(plainCardText("Reports earnings tomorrow after the close")).toBe("Reports earnings tomorrow after the close.");
  });
});

describe("sectionWords", () => {
  it("says a shared call change once and keeps each card to its own words", () => {
    const groups = groupBriefingItems([
      call("ASTS", "Buy more", "Keep", "The new call: the launch slipped."),
      call("NVDA", "Sell some", "Keep", "The new call: chip demand held up."),
      call("SMR", "Sell some", "Keep"),
      item({ id: "smr-analyst", kind: "technical", ticker: "SMR", headline: "Analyst consensus lowered its price target on SMR from $10.08 to $7.41" }),
    ]);
    const words = sectionWords(groups, { personal: true });
    expect(words.shared).toEqual(["Our call moved to Keep on ASTS, NVDA and SMR, and you hold all of them."]);
    const sentences = groups.map((group) => words.cards.get(group.key)!.sentence);
    expect(sentences).toContain("The launch slipped.");
    expect(sentences).toContain("Analyst consensus lowered its price target on SMR from $10.08 to $7.41.");
    // No sentence on two cards.
    expect(new Set(sentences.filter(Boolean)).size).toBe(sentences.filter(Boolean).length);
    // The call chip names what is different: where each call came from.
    expect(words.cards.get("ASTS")!.fact).toBe("Call: Keep (was Buy more)");
  });

  it("leaves a fact off when three or more cards would show it", () => {
    const groups = groupBriefingItems([
      item({ id: "a", kind: "news", ticker: "AAA", headline: "News on AAA: Aaa signs a deal" }),
      item({ id: "b", kind: "news", ticker: "BBB", headline: "News on BBB: Bbb opens a plant" }),
      item({ id: "c", kind: "news", ticker: "CCC", headline: "News on CCC: Ccc hires a chief" }),
    ]);
    const words = sectionWords(groups, { personal: true });
    for (const group of groups) expect(words.cards.get(group.key)!.fact).toBeNull();
  });

  it("highlights earnings and the distance to the buy-more price", () => {
    const groups = groupBriefingItems([
      move("CBRS", -3.1, "The buy-more price is $20. The price is 2.0% above it."),
      earnings("CBRS", "tomorrow after the close", 1),
      move("COHR", -4.6, "Check the add zone at $207.49. The price is 3.4% above it."),
    ]);
    const words = sectionWords(groups, { personal: true });
    expect(words.cards.get("CBRS")!.sentence).toBe("Reports earnings tomorrow after the close, and you hold it.");
    expect(words.cards.get("CBRS")!.fact).toBe("2.0% above the buy-more price");
    // A move with no reason says its level as the sentence, so the chip does not repeat it.
    expect(words.cards.get("COHR")!.sentence).toBe("The price is 3.4% above the buy-more price of $207.49.");
    expect(words.cards.get("COHR")!.fact).toBe("You hold it");
  });

  it("says nothing for a Sell some to Sell some change", () => {
    const groups = groupBriefingItems([call("IREN", "Trim", "Avoid"), move("IREN", -7.9)]);
    const words = sectionWords(groups, { personal: true });
    expect(words.cards.get("IREN")!.sentence).not.toMatch(/Sell some to Sell some/);
  });

  it("joins shared earnings dates into one sentence", () => {
    const groups = groupBriefingItems([
      item({ id: "d", kind: "earnings_upcoming", ticker: "DIS", relation: "market", headline: "DIS reports earnings on Tuesday before the open", deadline_days: 5 }),
      item({ id: "h", kind: "earnings_upcoming", ticker: "HD", relation: "market", headline: "HD reports earnings on Tuesday before the open", deadline_days: 5 }),
    ]);
    const words = sectionWords(groups, { personal: false });
    expect(words.shared).toEqual(["DIS and HD report earnings on Tuesday before the open."]);
    expect(words.cards.get("DIS")!.sentence).toBe("");
    // The chip does not repeat what the section already said.
    expect(words.cards.get("DIS")!.fact).toBeNull();
  });
});

describe("unTitle names", () => {
  it("keeps a person's surname capitalised", async () => {
    const { unTitle } = await import("./card-words");
    expect(unTitle("Nvidia Sells Off After Jensen Huang Affair")).not.toMatch(/Jensen huang/);
  });
  it("makes an overnight result the held stock's fact, ahead of everything else", () => {
    const groups = groupBriefingItems([
      move("CBRS", -3.1, "The buy-more price is $20. The price is 2.0% above it."),
      earnings("CBRS", "tomorrow after the close", 1),
      move("COHR", 4.6),
      item({ id: "w", kind: "price_move", ticker: "WAT", relation: "watching", why: NO_CONFIRMED_REASON, reason_status: "unconfirmed", day_change_pct: 2 }),
    ]);
    const results = { CBRS: "Beat by 8%, up 6% today", WAT: "Missed by 4%, down 2% today" };
    const words = sectionWords(groups, { personal: true, results });
    expect(words.cards.get("CBRS")!.fact).toBe("Beat by 8%, up 6% today");
    // Only held stocks: a watched one keeps its own fact.
    expect(words.cards.get("WAT")!.fact).not.toBe("Missed by 4%, down 2% today");
    expect(words.cards.get("COHR")!.fact).toBe("You hold it");
    // The market view never uses it.
    expect(sectionWords(groups, { personal: false, results }).cards.get("CBRS")!.fact).not.toBe("Beat by 8%, up 6% today");
  });
});

describe("Reddit talk and the next update on the card face (round 8)", () => {
  const talk = (ticker: string, posts: number, mood: string, why: string) =>
    item({
      id: `talk-${ticker}`,
      kind: "discussion_spike",
      ticker,
      severity: "low",
      headline: `${ticker} is one of the most discussed stocks on Reddit: ${posts} posts in 5 days, mostly ${mood}`,
      metric: `${posts} posts`,
      why,
    });
  const news = (ticker: string, headline: string) => item({ id: `news-${ticker}`, kind: "news", ticker, severity: "low", headline: `News on ${ticker}: ${headline}` });

  it("never puts a summary of Reddit posts on a card face: talk is not a confirmed story (owner rule 7)", () => {
    const groups = groupBriefingItems([
      talk("QQQ", 4, "bearish", "QQQ is described as having bounced after a severe decline. Bears remain in control."),
      talk("AMD", 6, "bullish", "AMD is being positioned as a beneficiary of Nvidia's weakness. Some call it a long-term pick."),
    ]);
    const words = sectionWords(groups, { personal: true });
    const by = (ticker: string) => words.cards.get(groups.find((group) => group.ticker === ticker)!.key)!;
    expect(by("QQQ").sentence).toBe("");
    expect(by("AMD").sentence).toBe("");
    // No Reddit chip on each card (owner rule 1), and no unmeasured mood anywhere (judges, ship 44).
    expect(by("QQQ").fact ?? "").not.toMatch(/Reddit/);
    expect(by("AMD").fact ?? "").not.toMatch(/Reddit/);
    // Nothing left to say: each is a chip with its move rather than an empty card.
    expect(by("QQQ").bare).toBe(true);
    expect(by("AMD").bare).toBe(true);
    expect(words).not.toHaveProperty("talk");
    expect(words.shared).toEqual([]);
  });

  it("leads with the news, and never says Reddit's unmeasured mood", () => {
    const groups = groupBriefingItems([talk("NVDA", 11, "bearish", "Nvidia is under pressure from board scrutiny."), news("NVDA", "Nvidia and Alphabet agreed to buy Anthropic stock")]);
    const words = sectionWords(groups, { personal: true });
    const card = words.cards.get(groups[0]!.key)!;
    expect(card.sentence).toBe("Nvidia and Alphabet agreed to buy Anthropic stock.");
    expect(card.more).toBeNull();
    expect(card.fact ?? "").not.toMatch(/Reddit/);
    expect(card.bare).toBe(false);
    expect(JSON.stringify([...words.cards.values(), words.shared])).not.toMatch(/bearish|bullish/);
  });

  it("does not say a report the read already names", () => {
    const groups = groupBriefingItems([news("NVDA", "Nvidia and Alphabet agreed to buy Anthropic stock"), earnings("NVDA", "on Tuesday after the close", 6)]);
    const plain = sectionWords(groups, { personal: true }).cards.get(groups[0]!.key)!;
    expect(`${plain.sentence} ${plain.more ?? ""} ${plain.fact ?? ""}`).toMatch(/[Rr]eports/);
    const card = sectionWords(groups, { personal: true, readEarnings: new Set(["NVDA"]) }).cards.get(groups[0]!.key)!;
    expect(card.sentence).toBe("Nvidia and Alphabet agreed to buy Anthropic stock.");
    expect(`${card.more ?? ""} ${card.fact ?? ""}`).not.toMatch(/[Rr]eports/);
  });

  it("puts the stock's next update on the face instead of an 'N more' fold", () => {
    const groups = groupBriefingItems([news("CBRS", "Cerebras files for its listing"), earnings("CBRS", "tomorrow after the close", 1)]);
    const card = sectionWords(groups, { personal: true }).cards.get(groups[0]!.key)!;
    expect(card.sentence).toBeTruthy();
    expect(card.more).toBeTruthy();
    expect(card.more).not.toBe(card.sentence);
  });

  it("says nothing from Reddit when the posts have no summary", () => {
    const groups = groupBriefingItems([talk("SMCI", 5, "bullish", "People are posting about it, but we do not have a summary of what they are saying yet.")]);
    const card = sectionWords(groups, { personal: true }).cards.get(groups[0]!.key)!;
    expect(card.sentence).not.toMatch(/People are posting/);
  });
});

describe("price facts for a move with no confirmed reason (round 13)", () => {
  const discussion = (ticker: string) =>
    item({ id: `talk-${ticker}`, kind: "discussion_spike", ticker, relation: "watching", headline: `${ticker} is one of the most discussed stocks on Reddit: 4 posts in 5 days, mostly bearish`, next_step: "Treat it as what people are saying." });

  it("gives a stock with only Reddit talk a card: its price fact as the sentence, the next one as its fact", () => {
    const groups = groupBriefingItems([discussion("QQQ")]);
    const words = sectionWords(groups, { personal: true, moveFacts: { QQQ: ["About twice a normal 1.1% day", "Still down 7.2% over the past month"] } });
    const card = words.cards.get(groups[0]!.key)!;
    expect(card).toMatchObject({ sentence: "That is about twice a normal 1.1% day for it.", fact: "Still down 7.2% over the past month", bare: false });
    // Without the facts it stays a chip.
    expect(sectionWords(groups, { personal: true }).cards.get(groups[0]!.key)!.bare).toBe(true);
  });

  it("never puts the same price fact on two cards, and never writes a reason", () => {
    const groups = groupBriefingItems([move("QQQ", 2.3), move("AMD", 7.3)]);
    const words = sectionWords(groups, {
      personal: true,
      moveFacts: { QQQ: ["Its biggest gain since Sep 2", "About twice a normal 1.1% day"], AMD: ["Its biggest gain since Sep 2", "About twice a normal 3.8% day"] },
    });
    const said = groups.map((group) => [words.cards.get(group.key)!.sentence, words.cards.get(group.key)!.fact]);
    for (const [sentence] of said) expect(sentence ?? "").not.toMatch(/because|after|on news/i);
    const facts = said.flat().filter(Boolean);
    expect(new Set(facts).size).toBe(facts.length);
    expect(facts).not.toContain("Its biggest gain since Sep 2");
  });
});

describe("scraped headline casing on a Worth knowing card", () => {
  it("reads the AMD story as a plain sentence (judges, ship 47)", () => {
    expect(unTitle("Nvidia Turmoil lifts AMD, Broadcom on bets for business gains", "Advanced Micro Devices, Inc.", ["NVIDIA Corporation"])).toBe(
      "Nvidia turmoil lifts AMD, Broadcom on bets for business gains",
    );
  });
});
