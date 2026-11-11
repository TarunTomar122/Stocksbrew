import { describe, expect, it } from "vitest";

import type { AskCard } from "@/lib/ask-cards";
import { contextHref, contextPin, parseAskContext, type AskContext } from "@/lib/ask-context";

const ctx = (raw: string) => parseAskContext(raw) as AskContext;

describe("the pinned card in Ask", () => {
  it("links each kind back to where it lives", () => {
    expect(contextHref(ctx("stock:NVDA"))).toEqual({ href: "/stock/NVDA", label: "Open NVDA" });
    expect(contextHref(ctx("research:NVDA:20261110T153012Z")).href).toBe("/stock/NVDA/research/20261110T153012Z");
    expect(contextHref(ctx("reason:KO")).href).toBe("/portfolio");
    expect(contextHref(ctx("ex.memo")).href).toBe("/portfolio/memo");
    expect(contextHref(ctx("brief:HIMS:2026-11-10:move-HIMS")).href).toBe("/briefing");
    expect(contextHref(ctx("agent:abc123def")).href).toBe("/agents?job=abc123def");
    expect(contextHref(ctx("portfolio")).href).toBe("/portfolio");
  });

  it("names the item before anything is opened, with no summary", () => {
    expect(contextPin(ctx("stock:NVDA"), null)).toEqual({ ticker: "NVDA", title: "NVDA", summary: null });
    expect(contextPin(ctx("memo"), null).title).toBe("This week's memo");
    expect(contextPin(ctx("ex.portfolio"), null).title).toBe("The example portfolio");
  });

  it("takes the summary from the card the server opened", () => {
    const quote = { card: "quote", ticker: "NVDA", name: "NVIDIA Corporation", headline: "  Data center demand still carries it. " } as unknown as AskCard;
    expect(contextPin(ctx("stock:NVDA"), quote)).toEqual({ ticker: "NVDA", title: "NVIDIA Corporation", summary: "Data center demand still carries it." });
    const memo = { card: "memo", focus: null, top_line: "A quiet week for your stocks." } as unknown as AskCard;
    expect(contextPin(ctx("memo"), memo).summary).toBe("A quiet week for your stocks.");
    const reasons = { card: "reasons", rows: [{ ticker: "KO", verdict_words: "Reason weaker", headline: "Volumes fell for a second quarter." }] } as unknown as AskCard;
    expect(contextPin(ctx("reason:KO"), reasons).summary).toBe("Reason weaker. Volumes fell for a second quarter.");
  });

  it("leaves the summary out when the card has none", () => {
    const quote = { card: "quote", ticker: "NVDA", name: null, headline: null } as unknown as AskCard;
    expect(contextPin(ctx("stock:NVDA"), quote)).toEqual({ ticker: "NVDA", title: "NVDA", summary: null });
  });
});
