import { describe, expect, it } from "vitest";

import type { StockCard } from "@/lib/portfolio-home/stocks";

import { cardLine, sayOnce, shortLine } from "./lines";

function card(ticker: string, fact: StockCard["fact"]): StockCard {
  return { ticker, name: ticker, href: `/stock/${ticker}`, price: 100, dayPct: 1, dayMove: null, gain: null, gainPct: null, weight: null, call: "Keep", level: null, fact, fund: false };
}

const words = (text: string) => text.split(/\s+/).length;

describe("shortLine", () => {
  it("keeps a short sentence whole", () => {
    expect(shortLine("Reports Tuesday, after the close.")).toBe("Reports Tuesday, after the close.");
  });

  it("cuts a long sentence to its first whole clause, one sentence of at most 15 words", () => {
    const line = shortLine("Alphabet fell 17% over the past month while other media and telecom stocks barely moved, but its P/E of 17 is below the usual 29.");
    expect(line).toBe("Alphabet fell 17% over the past month.");
    expect(words(line!)).toBeLessThanOrEqual(15);
  });

  it("keeps to one sentence and never stops on an abbreviation", () => {
    expect(shortLine("Revenue hit $1.5B last quarter. Guidance raised for Q4.")).toBe("Revenue hit $1.5B last quarter.");
    // "Inc." is not where the sentence ends.
    expect(shortLine("Shares of Apple Inc. Rose after the report.")).toBe("Shares of Apple Inc. Rose after the report.");
    expect(shortLine("Beat estimates vs. Wall Street by a wide margin, and raised the full-year outlook again.")).toBe("Beat estimates vs. Wall Street by a wide margin.");
  });

  it("says nothing rather than a cut-off sentence", () => {
    expect(shortLine("One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen.")).toBeNull();
  });
});

describe("cardLine", () => {
  const month = { MSFT: { pct: -1.6, marketPct: -1.7 } };

  it("moves the month into bars and keeps what comes before it", () => {
    const line = cardLine(card("MSFT", { kind: "month", text: "Your biggest holding, 17% of your money, down 1.6% over the past month, in line with the S&P 500.", priority: 8 }), month);
    expect(line).toEqual({ text: "Your biggest holding, 17% of your money.", month: month.MSFT });
  });

  it("draws a fund's month as bars with no sentence", () => {
    expect(cardLine(card("MSFT", { kind: "month", text: "Down 1.6% over the past month, in line with the S&P 500.", priority: 8 }), month)).toEqual({ text: null, month: month.MSFT });
  });

  it("keeps an attention card to its sentence", () => {
    expect(cardLine(card("MSFT", { kind: "report", text: "Reports Tuesday, after the close.", priority: 80 }), month)).toEqual({ text: "Reports Tuesday, after the close.", month: null });
  });
});

describe("sayOnce", () => {
  it("says a sentence shared by several cards once, with their tickers, and leaves the rest alone", () => {
    const cards = [card("NVDA", null), card("AAPL", null), card("MSFT", null)];
    const lines = [
      { text: "Reports Tuesday, after the close.", month: null },
      { text: "Reports Tuesday, after the close.", month: null },
      { text: "2 insiders bought.", month: null },
    ];
    const all = [true, true, true];
    const { lines: out, shared, saidAbove } = sayOnce(lines, cards, { NVDA: { pct: 2, marketPct: 1 } }, [all]);
    expect(shared).toEqual([{ text: "Reports Tuesday, after the close.", members: [0, 1], shown: [true] }]);
    // The sharing cards get their month bars, and their sentence is said above them.
    expect(out[0]).toEqual({ text: "Reports Tuesday, after the close.", month: { pct: 2, marketPct: 1 } });
    expect(saidAbove).toEqual([[true], [true], [false]]);
    expect(out[2]).toEqual(lines[2]);
  });

  it("never names a folded card: the line shows only where two of its cards are on screen", () => {
    // AVGO and ORCL share a line but are folded; opened, the line names both.
    const cards = [card("NVDA", null), card("AVGO", null), card("ORCL", null)];
    const lines = [
      { text: "Reports Tuesday, after the close.", month: null },
      { text: "Next report Dec 9.", month: null },
      { text: "Next report Dec 9.", month: null },
    ];
    const folded = [true, false, false];
    const open = [true, true, true];
    const { shared, saidAbove } = sayOnce(lines, cards, null, [folded, open]);
    expect(shared).toEqual([{ text: "Next report Dec 9.", members: [1, 2], shown: [false, true] }]);
    expect(saidAbove[1]).toEqual([false, true]);
  });

  it("says at most two shared sentences, the ones true for the most cards", () => {
    const texts = ["A one.", "A one.", "B two.", "B two.", "B two.", "C three.", "C three.", "C three.", "C three."];
    const cards = texts.map((_, index) => card(`T${index}`, null));
    const { saidAbove, shared } = sayOnce(
      texts.map((text) => ({ text, month: null })),
      cards,
      null,
      [texts.map(() => true)],
    );
    expect(shared.map((line) => line.text).sort()).toEqual(["B two.", "C three."]);
    expect(saidAbove[0]).toEqual([false]);
  });
});

describe("cardLine, worded another way", () => {
  it("drops the clause about the month when the bars show it", () => {
    const month = { NVDA: { pct: 1.0, marketPct: -1.6 } };
    expect(cardLine(card("NVDA", { kind: "month", text: "Your biggest holding, up 3.2% over the past month, ahead.", priority: 8 }), month).text).toBe("Your biggest holding.");
    expect(cardLine(card("NVDA", { kind: "month", text: "Up 3.2% this month, in line.", priority: 8 }), month).text).toBeNull();
  });

  it("drops a call's reason about the month, which can disagree with the bars", () => {
    const month = { GOOGL: { pct: -14.8, marketPct: -1.8 } };
    const line = cardLine(card("GOOGL", { kind: "call-reason", text: "Alphabet fell 17% over the past month while other media stocks barely moved.", priority: 10 }), month);
    expect(line).toEqual({ text: null, month: month.GOOGL });
  });
});
