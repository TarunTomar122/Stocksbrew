import { describe, expect, it } from "vitest";

import { firstSentences, isActionCard, saveOutcome, sourcesOf, splitAnswer, watchWhenWords } from "@/lib/ask-answer";
import type { AskCard } from "@/lib/ask-cards";

describe("the short answer and the evidence under it", () => {
  it("leads with the first paragraph and folds the rest", () => {
    const text = "NVIDIA closed at $186.20 on Nov 10, up 2.1%. The move came with its results date set.\n\n**Why it moved**\n- Chip export news\n- A broker upgrade";
    expect(splitAnswer(text)).toEqual({
      lead: "NVIDIA closed at $186.20 on Nov 10, up 2.1%. The move came with its results date set.",
      rest: "**Why it moved**\n- Chip export news\n- A broker upgrade",
    });
  });

  it("a one-paragraph answer has nothing to fold", () => {
    expect(splitAnswer("  Apple reports on Jan 29.  ")).toEqual({ lead: "Apple reports on Jan 29.", rest: "" });
    expect(splitAnswer("")).toEqual({ lead: "", rest: "" });
  });

  it("drops a label over the short answer", () => {
    expect(splitAnswer("**Short answer**\nIt is up 4% this week.\n\nMore here.")).toEqual({ lead: "It is up 4% this week.", rest: "More here." });
    expect(splitAnswer("## Answer\n\nIt is up 4% this week.\n\n- one")).toEqual({ lead: "It is up 4% this week.", rest: "- one" });
  });

  it("a heading that says something is part of the answer, so it is shown whole", () => {
    const text = "## NVIDIA beat estimates\nRevenue rose 20%.\n\nMore.";
    expect(splitAnswer(text)).toEqual({ lead: "", rest: text });
    expect(splitAnswer("**Bottom line: hold**\n\nIt is fine.")).toEqual({ lead: "", rest: "**Bottom line: hold**\n\nIt is fine." });
  });

  it("an answer that opens with a list or a table has no lead, so the page shows it whole", () => {
    const list = "- NVDA is up\n- AMD is down\n\nThat is all.";
    expect(splitAnswer(list)).toEqual({ lead: "", rest: list });
    const table = "| a | b |\n|---|---|\n| 1 | 2 |";
    expect(splitAnswer(table)).toEqual({ lead: "", rest: table });
  });

  it("a paragraph that runs straight into a list keeps only its prose as the lead", () => {
    expect(splitAnswer("It fell 3% on Nov 10.\n- export rules\n- an upgrade\n\nWatch the report.")).toEqual({
      lead: "It fell 3% on Nov 10.",
      rest: "- export rules\n- an upgrade\n\nWatch the report.",
    });
  });

  it("a lead that only introduces its list keeps the list", () => {
    expect(splitAnswer("It moved for two reasons:\n- export rules\n- an upgrade\n\nWatch the report.")).toEqual({
      lead: "It moved for two reasons:\n- export rules\n- an upgrade",
      rest: "Watch the report.",
    });
  });

  it("older stored answers split the same way, with Windows line ends", () => {
    expect(splitAnswer("First line one.\r\n\r\nSecond part.")).toEqual({ lead: "First line one.", rest: "Second part." });
  });
});

describe("the sources an answer was built from", () => {
  const quote = { card: "quote", ticker: "NVDA", source: "Prices from Yahoo Finance", as_of: "2026-11-10T21:00:00Z", source_url: "/stock/NVDA" } as unknown as AskCard;
  const news = { card: "news", source: "Headlines", as_of: "2026-11-11", source_url: null } as unknown as AskCard;
  const watch = { card: "watch", source: "Nothing is set up until you save it on the Agents page", as_of: null } as unknown as AskCard;

  it("lists each source and time once, in lookup order, without the action cards", () => {
    expect(sourcesOf([quote, news, quote, watch, { card: "error", message: "x" } as AskCard])).toEqual([
      { source: "Prices from Yahoo Finance", as_of: "2026-11-10T21:00:00Z", url: "/stock/NVDA" },
      { source: "Headlines", as_of: "2026-11-11", url: null },
    ]);
  });

  it("a watch, a proposed save, a basket and a sign-in ask for a tap; everything else is evidence", () => {
    expect([watch, quote, { card: "action" }, { card: "basket" }, { card: "sign_in", message: "" }].map((card) => isActionCard(card as AskCard))).toEqual([
      true,
      false,
      true,
      true,
      true,
    ]);
  });
});

describe("when a watch checks", () => {
  it("names the after-close run and the next one", () => {
    // Wednesday Nov 11 2026, 10:00 AM in New York.
    expect(watchWhenWords(new Date("2026-11-11T15:00:00Z"))).toBe("Every weekday after the close, from 5:30 PM ET. The next check is after today's close.");
    // Friday evening, after the run has finished: Monday.
    expect(watchWhenWords(new Date("2026-11-14T03:00:00Z"))).toBe("Every weekday after the close, from 5:30 PM ET. The next check is after Monday's close.");
    // While tonight's run is going.
    expect(watchWhenWords(new Date("2026-11-11T22:45:00Z"))).toBe("Every weekday after the close, from 5:30 PM ET. Tonight's check is running now.");
  });
});

describe("after the tap", () => {
  it("on, paused, already, or not saved", () => {
    expect(saveOutcome(true, { ok: true, jobs: [{ name: "NVDA moves 5%", enabled: true }], already: [], failed: [], paused: null })).toEqual({ phase: "on", names: ["NVDA moves 5%"], missed: null });
    expect(saveOutcome(true, { ok: true, jobs: [{ name: "NVDA moves 5%", enabled: false }], paused: { count: 1, limit: 1 } })).toEqual({ phase: "paused", on: 0, paused: 1, message: null, missed: null });
    expect(saveOutcome(true, { ok: true, jobs: [{ name: "NVDA filings", enabled: false }], paused: { count: 1, limit: 1, pro_only: 1, message: "Watching filings and news is part of Pro." } })).toEqual({
      phase: "paused",
      on: 0,
      paused: 1,
      message: "Watching filings and news is part of Pro.",
      missed: null,
    });
    expect(saveOutcome(true, { ok: true, jobs: [], already: ["NVDA moves 5%"] })).toEqual({ phase: "already" });
    expect(saveOutcome(false, { error: "You have 20 agents, the most one account can keep. Remove one to add another." })).toEqual({
      phase: "failed",
      message: "You have 20 agents, the most one account can keep. Remove one to add another.",
    });
    expect(saveOutcome(false, null).phase).toBe("failed");
    // Part saved: the card says what did not.
    expect(saveOutcome(true, { ok: true, jobs: [{ name: "A", enabled: true }], failed: ["B"] })).toEqual({ phase: "on", names: ["A"], missed: "“B” didn't save. Add it from the Agents page." });
    expect(saveOutcome(true, { ok: true, jobs: [{ name: "A", enabled: true }, { name: "B", enabled: false }], paused: { count: 1, limit: 1 } })).toMatchObject({ phase: "paused", on: 1, paused: 1 });
  });
});

describe("a long first paragraph", () => {
  it("leads with three sentences and moves the others into the fold, word for word", () => {
    const text =
      "NVDA closed at 168.79, down 5.53% on the day. The stock is about 29% below its 52-week high of 236.54. Our score is 87. The average target is 322.5. AI growth remains strong.\n\n- one";
    expect(splitAnswer(text)).toEqual({
      lead: "NVDA closed at 168.79, down 5.53% on the day. The stock is about 29% below its 52-week high of 236.54. Our score is 87.",
      rest: "The average target is 322.5. AI growth remains strong.\n\n- one",
    });
  });

  it("does not end a sentence at a decimal, an abbreviation or initials", () => {
    expect(firstSentences("Apple Inc. rose 2.5% vs. the S&P 500 on Nov. 10. U.S. Steel fell. Then it rose. More.", 3)).toEqual([
      "Apple Inc. rose 2.5% vs. the S&P 500 on Nov. 10. U.S. Steel fell. Then it rose.",
      "More.",
    ]);
    expect(firstSentences("One. Two.", 3)).toEqual(["One. Two.", ""]);
    // Never cut inside bold.
    expect(firstSentences("**A one. B two. C three. D four.** E.", 3)).toEqual(["**A one. B two. C three. D four.** E.", ""]);
    // Sentences may open with italics or a link.
    expect(firstSentences("One. _Two_ is here. [Three](/x) too. Four.", 3)).toEqual(["One. _Two_ is here. [Three](/x) too.", "Four."]);
  });
});
