import { describe, expect, it } from "vitest";

import { INVESTMENT_THEMES } from "@/lib/investment-themes";
import { BOOK_LINES, LINE_CHARS, LINE_WORDS, THESIS_HOLDS, bookLine, thesisHolds, wordsIn } from "@/lib/theme-book-lines";

// The verbs the book's lines lead with; a line whose first clause has none of them is a fragment.
const VERB =
  /\b(?:sells|makes|builds|earns|runs|rents|powers|cools|brings|link|can|gains|helps|swaps|checks|controls|keeps|stops|recovers|finds|automates|designs|mines|owns|produces|is|has|holds|invests|launches|delivers|supplies|combines|exports|drive|drives)\b/i;

describe("theme book lines", () => {
  it("gives every company in every book and watchlist one line of at most 15 words", () => {
    for (const theme of INVESTMENT_THEMES) {
      for (const candidate of [...theme.candidates, ...theme.watchlist]) {
        const line = BOOK_LINES[theme.slug]?.[candidate.ticker.toUpperCase()];
        expect(line, `${theme.slug} ${candidate.ticker}`).toBeTruthy();
        expect(wordsIn(line!), line).toBeLessThanOrEqual(LINE_WORDS);
        // One complete sentence: a full stop at the end, no ellipsis, no second sentence.
        expect(line).toMatch(/[^.…]\.$/);
        expect(line!.slice(0, -1)).not.toMatch(/[.!?]\s+[A-Z]/);
        expect(bookLine(theme.slug, candidate)).toBe(line);
      }
    }
  });

  it("keeps every line, the live themes' added companies too, to one line in the book at 1280", () => {
    for (const [slug, lines] of Object.entries(BOOK_LINES)) {
      for (const [ticker, line] of Object.entries(lines)) {
        expect(line.length, `${slug} ${ticker}: ${line}`).toBeLessThanOrEqual(LINE_CHARS);
        expect(wordsIn(line), `${slug} ${ticker}`).toBeLessThanOrEqual(LINE_WORDS);
        expect(line).toMatch(/[^.…]\.$/);
        // A sentence, not a list of things: its first clause has a verb ("Sells AI chips; …", not "AI chips; …").
        const first = line.split(/[;,]/)[0]!;
        expect(VERB.test(first), `${slug} ${ticker}: "${first}" has no verb`).toBe(true);
      }
    }
  });

  it("names no tickers in what has to hold, so a weekly change of members cannot make it stale", () => {
    for (const line of Object.values(THESIS_HOLDS)) expect(line).not.toMatch(/\b(?!AI\b)[A-Z]{2,5}\b(?!-)/);
  });

  it("says what has to hold in at most 15 words for every theme", () => {
    for (const theme of INVESTMENT_THEMES) {
      const line = thesisHolds(theme.slug, theme.resilienceNote);
      expect(line).toBe(THESIS_HOLDS[theme.slug]);
      expect(wordsIn(line)).toBeLessThanOrEqual(LINE_WORDS);
    }
  });

  it("shows a company we have no line for in the theme's own words, whole", () => {
    const added = { ticker: "AMD", benefitMechanism: "AMD sells AI accelerators and server chips to the same cloud companies." };
    expect(bookLine("ai-capex", added)).toBe(added.benefitMechanism);
    expect(bookLine("unknown-theme", { ...added, ticker: "NVDA" })).toBe(added.benefitMechanism);
    expect(thesisHolds("unknown-theme", "Something new. And a second sentence.")).toBe("Something new.");
  });
});
