import { describe, expect, it } from "vitest";

import { parseByRules } from "@/lib/agents-plain/parse";
import { buildCatalog } from "@/lib/agents-plain/stocks";

import { askHref, earningsReminder, stockCallSteps, whyMovedQuestion } from "./next-steps";

const catalog = buildCatalog([
  { ticker: "NVDA", name: "NVIDIA Corporation", aliases: ["NVDA", "NVIDIA"], price: 168.79 },
  { ticker: "HIMS", name: "Hims & Hers Health", aliases: ["HIMS"], price: 40 },
]);

/** Every agent link must land on an agent, never on "I can't watch that yet". */
function readsAsOneAgent(href: string) {
  expect(href.startsWith("/agents?q=")).toBe(true);
  const request = decodeURIComponent(href.slice("/agents?q=".length));
  const result = parseByRules(request, catalog, { hidden: [] });
  expect(result.spec.cannot).toEqual([]);
  expect(result.spec.watches).toHaveLength(1);
}

function question(href: string): string {
  expect(href.startsWith("/ask?q=")).toBe(true);
  return new URL(href, "https://example.test").searchParams.get("q") ?? "";
}

describe("ask links", () => {
  it("prefills Ask and names the move without a day", () => {
    expect(question(askHref("  What would change your mind on NVDA? "))).toBe("What would change your mind on NVDA?");
    expect(whyMovedQuestion("HIMS", -16.52)).toBe("Why did HIMS fall 16.5%?");
    expect(whyMovedQuestion("NVDA", 3.24)).toBe("Why did NVDA rise 3.2%?");
    expect(whyMovedQuestion("NVDA", null)).toBe("What's behind NVDA's latest move?");
  });
});

describe("earnings reminders", () => {
  it("only offers a reminder that can still fire", () => {
    expect(earningsReminder("NVDA", 10)?.days).toBe(3);
    expect(earningsReminder("NVDA", 4)?.days).toBe(3);
    expect(earningsReminder("NVDA", 3)?.days).toBe(1);
    expect(earningsReminder("NVDA", 2)?.days).toBe(1);
    expect(earningsReminder("NVDA", 1)).toBeNull();
    expect(earningsReminder("NVDA", null)).toBeNull();
    readsAsOneAgent(earningsReminder("NVDA", 10)!.href);
    readsAsOneAgent(earningsReminder("NVDA", 2)!.href);
  });
});

describe("the stock call", () => {
  it("asks what would change our mind when the reader sees the full read", () => {
    const steps = stockCallSteps({ ticker: "nvda", fullRead: true, dayPct: 0.4, earningsInDays: 12 })!;
    expect(steps.ask.map((step) => question(step.href))).toEqual(["What would change your mind on NVDA?", "What are the biggest risks for NVDA right now?"]);
    expect(steps.watch?.label).toBe("Remind me 3 days before earnings");
    readsAsOneAgent(steps.watch!.href);
  });

  it("asks about the move on a big day and watches for big moves without a report ahead", () => {
    const steps = stockCallSteps({ ticker: "NVDA", fullRead: false, dayPct: -4.1, earningsInDays: null })!;
    expect(steps.ask.map((step) => step.label)).toEqual(["How has NVDA done against the S&P 500 this year?", "Why did NVDA fall 4.1%?"]);
    expect(steps.watch?.label).toBe("Tell me when NVDA moves 5% in a day");
    readsAsOneAgent(steps.watch!.href);
  });

  it("offers nothing for a symbol that is not a ticker", () => {
    expect(stockCallSteps({ ticker: "not one", fullRead: true, dayPct: 0, earningsInDays: 5 })).toBeNull();
  });
});
