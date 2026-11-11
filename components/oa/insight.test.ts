import { describe, expect, it } from "vitest";

import { askFor, insightAskQuestion, quoted, stripLeadingTicker } from "./insight";

describe("stripLeadingTicker", () => {
  it("drops a labelled ticker and capitalises", () => {
    expect(stripLeadingTicker("SMR: our call moved to Hold", "SMR")).toBe("Our call moved to Hold");
    expect(stripLeadingTicker("VST — is in its add zone", "VST")).toBe("Is in its add zone");
  });
  it("drops a ticker used as the subject", () => {
    expect(stripLeadingTicker("SMR rose 7% today", "SMR")).toBe("rose 7% today");
  });
  it("leaves other sentences alone", () => {
    expect(stripLeadingTicker("SMRT rose", "SMR")).toBe("SMRT rose");
    expect(stripLeadingTicker("Chips led, with SMR up", "SMR")).toBe("Chips led, with SMR up");
    expect(stripLeadingTicker("SMR", "SMR")).toBe("SMR");
  });
});

describe("askFor", () => {
  const card = { id: "mover-NVDA", tone: "down" as const, text: "NVDA fell 5.5% after its report. Chips followed.", tickers: ["NVDA"] };
  const ctxOf = (href: string | null) => new URL(href!, "https://x.test").searchParams.get("ctx");
  const qOf = (href: string | null) => new URL(href!, "https://x.test").searchParams.get("q");

  it("asks about the card's one stock, quoting the card", () => {
    const href = askFor({ ...card, action: { label: "NVDA report", href: "/stock/NVDA" } }, undefined);
    expect(ctxOf(href)).toBe("stock:NVDA");
    expect(qOf(href)).toBe("NVDA fell 5.5% after its report. What's behind this, and what should I watch next on NVDA?");
  });

  it("offers none on a card with two steps, one that already asks, or when the page turns it off", () => {
    expect(askFor({ ...card, action: { label: "A", href: "/a" }, secondAction: { label: "B", href: "/b" } }, undefined)).toBeNull();
    expect(askFor({ ...card, action: { label: "Why?", href: "/ask?q=why" } }, undefined)).toBeNull();
    expect(askFor(card, false)).toBeNull();
  });

  it("keeps a portfolio card's words out of the link and lets Ask read the item", () => {
    const own = { id: "concentration", tone: "flat" as const, text: "Your $48,200 in NVDA is 31% of what you hold.", tickers: ["NVDA"] };
    const href = askFor(own, "portfolio");
    expect(ctxOf(href)).toBe("portfolio");
    expect(qOf(href)).toBe("What should I know about NVDA in my portfolio right now?");
    expect(qOf(href)).not.toMatch(/48,200/);
    expect(qOf(askFor({ ...own, tickers: ["NVDA", "AMD"] }, "ex.portfolio"))).toBe("What stands out in the example portfolio right now, and why?");
    expect(qOf(askFor({ ...own, id: "earnings-x" }, "portfolio"))).toBe("What should I watch for in NVDA's next report?");
  });

  it("takes the picker's context first, and leaves off one that is not ours", () => {
    const href = askFor(card, () => "brief:NVDA:2026-11-10:item_1");
    expect(ctxOf(href)).toBe("brief:NVDA:2026-11-10:item_1");
    expect(qOf(href)).toBe("Why does this matter for NVDA today?");
    expect(ctxOf(askFor({ ...card, tickers: ["NVDA", "AMD"] }, "nonsense"))).toBeNull();
  });
});

describe("quoted", () => {
  it("quotes the first sentence whole, past abbreviations", () => {
    expect(quoted("The S&P 500 is down 0.4%")).toBe("The S&P 500 is down 0.4%.");
    expect(quoted("Cash is $1.5M of the total. More here.")).toBe("Cash is $1.5M of the total.");
    expect(quoted("U.S. stocks fell. Chips led.")).toBe("U.S. stocks fell.");
    expect(quoted("Apple Inc. Said it would buy back stock. More.")).toBe("Apple Inc. Said it would buy back stock.");
    expect(quoted("NVDA reports Nov. 17 after the close. Then AMD.")).toBe("NVDA reports Nov. 17 after the close.");
  });
  it("is used in a question about nothing in particular", () => {
    expect(insightAskQuestion({ id: "index", text: "The S&P 500 is down 0.4%", tickers: [] }, null)).toBe("The S&P 500 is down 0.4%. What's behind this, and why does it matter?");
  });
});
