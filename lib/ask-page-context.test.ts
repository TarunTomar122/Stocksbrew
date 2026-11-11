import { describe, expect, it } from "vitest";

import { contextSuggestions, parseAskContext } from "@/lib/ask-context";
import { askLinkTarget } from "@/lib/ask-link";
import { pageAskContext } from "@/lib/ask-page-context";

const signedIn = { signedIn: true, example: false };
const signedOut = { signedIn: false, example: false };

describe("pageAskContext", () => {
  it("reads the stock from a stock page and its tabs", () => {
    expect(pageAskContext({ pathname: "/stock/NVDA", ...signedOut })).toBe("stock:NVDA");
    expect(pageAskContext({ pathname: "/stock/brk.b/earnings", ...signedIn })).toBe("stock:BRK.B");
    expect(pageAskContext({ pathname: "/calendar/earnings/AAPL", ...signedIn })).toBe("stock:AAPL");
  });

  it("reads a research report, and falls back to the stock for a bad key", () => {
    expect(pageAskContext({ pathname: "/stock/NVDA/research/20261110T153012Z", ...signedIn })).toBe("research:NVDA:20261110T153012Z");
    expect(pageAskContext({ pathname: "/stock/NVDA/research/nope", ...signedIn })).toBe("stock:NVDA");
    expect(pageAskContext({ pathname: "/stock/NVDA/research", ...signedIn })).toBe("stock:NVDA");
  });

  it("uses the example on My stocks when signed out or when the page shows it", () => {
    expect(pageAskContext({ pathname: "/portfolio", ...signedOut })).toBe("ex.portfolio");
    expect(pageAskContext({ pathname: "/portfolio", signedIn: true, example: true })).toBe("ex.portfolio");
    expect(pageAskContext({ pathname: "/portfolio/dividends", ...signedIn })).toBe("portfolio");
    expect(pageAskContext({ pathname: "/portfolio/memo", ...signedIn })).toBe("memo");
    expect(pageAskContext({ pathname: "/portfolio/memo", ...signedOut })).toBe("ex.memo");
  });

  it("puts the briefing on your stocks only when signed in", () => {
    expect(pageAskContext({ pathname: "/briefing", ...signedIn })).toBe("portfolio");
    expect(pageAskContext({ pathname: "/briefing", ...signedOut })).toBeNull();
  });

  it("reads an agent from /agents?job=", () => {
    expect(pageAskContext({ pathname: "/agents", search: "?job=abc123def", ...signedIn })).toBe("agent:abc123def");
    expect(pageAskContext({ pathname: "/agents", search: "?job=../x", ...signedIn })).toBeNull();
    expect(pageAskContext({ pathname: "/agents", search: "?job=abc123def", ...signedOut })).toBeNull();
  });

  it("has nothing for pages that are not about one item", () => {
    for (const pathname of ["/", "/screener", "/stock", "/ask", "/compare/amd-vs-nvda"]) {
      expect(pageAskContext({ pathname, ...signedIn })).toBeNull();
    }
  });

  it("only returns values the route accepts", () => {
    for (const pathname of ["/stock/NVDA", "/portfolio", "/portfolio/memo", "/briefing"]) {
      const value = pageAskContext({ pathname, ...signedIn });
      expect(parseAskContext(value)).not.toBeNull();
    }
  });
});

describe("askLinkTarget", () => {
  const origin = "https://www.stocksbrew.online";
  const at = (href: string) => askLinkTarget(new URL(href, origin), origin);

  it("takes a question, an item, or both", () => {
    expect(at("/ask?q=Why%20did%20NVDA%20fall%3F&ctx=stock%3ANVDA")).toEqual({ question: "Why did NVDA fall?", context: "stock:NVDA" });
    expect(at("/ask?ctx=portfolio")).toEqual({ question: null, context: "portfolio" });
    expect(at("/ask?q=hello")).toEqual({ question: "hello", context: null });
  });

  it("leaves plain /ask, saved conversations, other paths and other sites to the browser", () => {
    expect(at("/ask")).toBeNull();
    expect(at("/ask?q=%20")).toBeNull();
    expect(at("/ask?c=abc&q=hi")).toBeNull();
    expect(at("/asking?q=hi")).toBeNull();
    expect(askLinkTarget(new URL("https://example.com/ask?q=hi"), origin)).toBeNull();
  });
});

describe("contextSuggestions", () => {
  it("starts with the item's own question and keeps example ones to that", () => {
    const stock = parseAskContext("stock:NVDA")!;
    expect(contextSuggestions(stock)[0]).toBe("What matters most for NVDA right now?");
    expect(contextSuggestions(stock).every((question) => question.includes("NVDA"))).toBe(true);
    expect(contextSuggestions(parseAskContext("ex.portfolio")!)).toEqual(["How is the example portfolio doing this week?"]);
  });
});
