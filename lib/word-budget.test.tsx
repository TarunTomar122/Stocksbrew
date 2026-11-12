import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { HERO_SUBHEAD } from "@/lib/brand-copy";
import { fitLine } from "@/lib/fit-line";
import { budgetBreaks, countSentences, countWords, headCopy, LINE_WORDS, TITLE_WORDS } from "@/lib/word-budget";
import { shortFact } from "@/components/stock-report/format";

// The page head reads the address for its icon and trail; a test has none.
vi.mock("next/navigation", () => ({ usePathname: () => "/themes", useRouter: () => ({ push() {}, replace() {}, prefetch() {} }), useSearchParams: () => new URLSearchParams() }));

// Fonts only resolve inside the Next compiler.
vi.mock("next/font/google", () => ({ Instrument_Sans: () => ({ variable: "", className: "" }), Inter_Tight: () => ({ variable: "", className: "" }) }));
vi.mock("next/font/local", () => ({ default: () => ({ variable: "", className: "" }) }));
// The site header reads the session; the page head under test does not need it.
vi.mock("@/components/oa/oa-site-header", () => ({ OaSiteHeader: () => null }));

(globalThis as { React?: typeof React }).React = React;

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/**
 * Each `<PageHead … />` in a file, as its source text: from the tag to the `/>` that closes it at the same depth,
 * skipping braces and quotes inside props.
 */
function pageHeads(text: string): string[] {
  const out: string[] = [];
  let from = text.indexOf("<PageHead");
  while (from >= 0) {
    let depth = 0;
    let quote: string | null = null;
    let end = -1;
    for (let i = from + 9; i < text.length; i++) {
      const ch = text[i]!;
      if (quote) {
        if (ch === quote && text[i - 1] !== "\\") quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (depth === 0 && ch === "/" && text[i + 1] === ">") {
        end = i + 2;
        break;
      }
    }
    if (end < 0) break;
    out.push(text.slice(from, end));
    from = text.indexOf("<PageHead", end);
  }
  return out;
}

/** The literal words of a head's title: a string, or a template with each `${…}` counted as one word. */
function titleWords(head: string): string | null {
  const plain = /\btitle="([^"]*)"/.exec(head)?.[1];
  if (plain !== undefined) return plain;
  const template = /\btitle=\{`([^`]*)`\}/.exec(head)?.[1];
  return template === undefined ? null : template.replace(/\$\{[^}]*\}/g, "X");
}

/** The pages the owner's word budget was enforced on (judges, ship 81). */
const KEY_PAGES = [
  "app/(app)/screener/page.tsx",
  "app/(app)/sectors/page.tsx",
  "app/(app)/themes/page.tsx",
  "app/(app)/portfolio/xray/page.tsx",
  "app/(app)/portfolio/page.tsx",
  "app/(app)/compare/[pair]/page.tsx",
  "app/(app)/compare/(desk)/page.tsx",
  "app/(app)/insiders/(hub)/page.tsx",
  "app/(app)/inbox/page.tsx",
  "app/(app)/backtest/page.tsx",
  "app/(app)/explore/page.tsx",
  "app/(app)/signals/page.tsx",
  "app/(app)/calendar/page.tsx",
  "app/(app)/news/page.tsx",
];

describe("word budget helpers", () => {
  it("counts words the way a reader does", () => {
    expect(countWords("NVDA fell 5.5% on Tuesday, about three times a normal day.")).toBe(11);
    expect(countWords("S&P 500 +12.3% — vs $1.2M")).toBe(5);
    expect(countWords("")).toBe(0);
  });

  it("counts sentences without splitting on prices or abbreviations", () => {
    expect(countSentences("Six beat profit forecasts; JPM missed.")).toBe(1);
    expect(countSentences("It fell to $1.50 today.")).toBe(1);
    expect(countSentences("702 older posts. Pro keeps them all.")).toBe(2);
  });

  it("flags a long title, anything under a title, and a long or two-sentence card line", () => {
    const breaks = budgetBreaks("test", {
      title: "One two three four five six seven eight nine ten eleven",
      underTitle: "Advanced Micro Devices and Broadcom, side by side.",
      lines: ["Short and fine.", "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen.", "Two sentences. Here."],
    });
    expect(breaks.map((item) => item.rule)).toEqual(["title", "under-title", "line", "sentences"]);
    expect(budgetBreaks("ok", { title: "Idea baskets", underTitle: null, lines: ["Our call on more than 700 US stocks, with why"] })).toEqual([]);
  });
});

describe("page heads keep the budget", () => {
  it("renders a page head with no paragraph under its title, and the guard sees one when it is there", async () => {
    const { PageHead } = await import("@/components/oa/kit");
    const clean = headCopy(renderToStaticMarkup(<PageHead title="Idea baskets" note={false} />));
    expect(clean).toEqual({ title: "Idea baskets", underTitle: null });
    expect(budgetBreaks("themes", clean)).toEqual([]);
    const withLede = headCopy(renderToStaticMarkup(<PageHead title="Backtest a mix" lede="Test a mix of stocks and funds against the S&P 500 over any years." full />));
    expect(budgetBreaks("backtest", withLede).map((item) => item.rule)).toEqual(["under-title"]);
  });

  it.each(KEY_PAGES)("%s: titles of at most 10 words, and no line under the title", (file) => {
    const heads = pageHeads(source(file));
    expect(heads.length).toBeGreaterThan(0);
    for (const head of heads) {
      // A lede prints as a paragraph under the title (or as "About this page" at the foot): neither is allowed here.
      expect(head, `${file}: a lede under the page title`).not.toMatch(/\blede=/);
      const title = titleWords(head);
      if (title !== null) expect(countWords(title), `${file}: "${title}"`).toBeLessThanOrEqual(TITLE_WORDS);
    }
  });
});

describe("card copy keeps the budget", () => {
  it("keeps the landing's plan lines to 12 words and its hero to one line", () => {
    const plans = source("components/oa/landing/plans-section.tsx");
    const lines = [...plans.matchAll(/<Line>([\s\S]*?)<\/Line>/g)].map((match) =>
      match[1]!
        .replace(/\{[^}]*\}/g, "X")
        .replace(/&apos;/g, "'")
        .trim(),
    );
    expect(lines.length).toBeGreaterThanOrEqual(5);
    for (const line of lines) expect(countWords(line), line).toBeLessThanOrEqual(12);
    // The agent line is chosen in code; both forms stay in budget.
    for (const line of plans.match(/"[^"]*agents? that email[^"]*"|`[^`]*agents that email[^`]*`/g) ?? []) expect(countWords(line)).toBeLessThanOrEqual(12);
    // The trial's terms stay beside its button: a required disclosure, not copy under the budget.
    expect(plans).toMatch(/unless you cancel; card required/);
    expect(countWords(HERO_SUBHEAD)).toBeLessThanOrEqual(LINE_WORDS);
    expect(source("components/oa/landing/taste.tsx")).not.toMatch(/\bproof\b/);
  });

  it("keeps the signals lock to one short line", () => {
    const view = source("components/signals/signals-view.tsx");
    expect(view).toContain('"Pro keeps them all."');
    expect(view).not.toContain("past the last ${archive.days} days");
  });

  it("cuts a card or row line to its clause, never past the budget or mid-word", () => {
    const long =
      "Jensen Huang's shock resignation at Nvidia is prompting investors to look for alternative beneficiaries in AI chips, directly lifting AMD and Broadcom.";
    const fact = shortFact(long);
    expect(countWords(fact)).toBeLessThanOrEqual(LINE_WORDS);
    const cut = fitLine(long, 52);
    expect(cut.length).toBeLessThanOrEqual(53);
    for (const word of cut.replace(/…$/, "").split(" ")) expect(long.split(" ")).toContain(word);
  });
});
