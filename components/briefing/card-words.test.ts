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
