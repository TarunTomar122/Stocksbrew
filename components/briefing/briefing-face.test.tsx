import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DoCard, HeatCell, MovedCard, WeekDay } from "@/lib/briefing-face";

import { BriefingFace, type BriefingFaceProps } from "./briefing-face";

// Shared components written for Next's automatic JSX runtime (the stock logo) expect React in scope under vitest.
(globalThis as { React?: typeof React }).React = React;

const card = (ticker: string, line: string): DoCard => ({
  ticker,
  name: `${ticker} Inc.`,
  price: 100,
  pct: 2,
  call: "Keep",
  href: `/stock/${ticker}`,
  reason: "call",
  line,
});
const cell = (ticker: string, pct: number): HeatCell => ({ ticker, name: ticker, price: 100, pct, tone: pct > 0 ? "up" : "down", size: 1, href: `/stock/${ticker}` });

function face(cards: DoCard[]): string {
  const props: BriefingFaceProps = {
    mode: "personal",
    viewer: "member",
    date: "2026-11-11",
    clock: "Wed close",
    days: [{ day: "2026-11-12" }, { day: "2026-11-11" }],
    archived: true,
    degraded: false,
    example: false,
    strip: { you: null, sp500: null, gap: null, tiles: [], path: null },
    topNews: [],
    doToday: { kind: "cards", cards },
    heat: [cell("AAA", 4), cell("BBB", -3), cell("CCC", 2)],
    levels: [],
    moved: [],
    week: [],
    agentFindings: 0,
    sessionOpened: true,
  };
  return renderToStaticMarkup(<BriefingFace {...props} />);
}

/** How many Keep badges the Do today cards show. */
const keepBadges = (html: string) => (html.match(/>Keep<\/span>/g) ?? []).length;

describe("Do today's shared line and the call badges", () => {
  it("drops the badge when the shared line states the call", () => {
    const html = face([card("ASTS", "Our call moved to Keep"), card("NVDA", "Our call moved to Keep"), card("SMR", "Our call moved to Keep")]);
    expect(html).toContain("Our call moved to Keep on ASTS, NVDA and SMR.");
    expect(keepBadges(html)).toBe(0);
  });

  it("keeps the badge when the shared line names no call, even with the same call on every card", () => {
    const html = face([card("ASTS", "Reported results"), card("NVDA", "Reported results")]);
    expect(html).toContain("Reported results on ASTS and NVDA.");
    expect(keepBadges(html)).toBe(2);
  });
});

describe("the strip's day", () => {
  const render = (stripDay: string | null) =>
    renderToStaticMarkup(
      <BriefingFace
        {...{
          mode: "personal",
          viewer: "member",
          date: "2026-11-14",
          clock: "Fri close",
          days: [{ day: "2026-11-14" }],
          archived: false,
          degraded: false,
          example: false,
          strip: { you: { pct: 1, label: "You" }, sp500: { pct: -0.5, source: "index" }, gap: { word: "Ahead", pts: 1.5 }, tiles: [], path: null, day: stripDay },
          topNews: [],
          doToday: null,
          heat: [],
          levels: [],
          moved: [],
          week: [],
          since: null,
          agentFindings: 0,
          sessionOpened: true,
        }}
      />,
    );

  it("says a weekend's figures by their session's day, never as today", () => {
    expect(render("2026-11-13")).toContain("1.5 pts ahead yesterday");
    expect(render("2026-11-12")).toContain("1.5 pts ahead on Thursday");
  });

  it("says today when the figures are today's", () => {
    expect(render("2026-11-14")).toContain("1.5 pts ahead today");
    expect(render(null)).toContain("1.5 pts ahead today");
  });
});

describe("Why it moved beside the week", () => {
  const move = (ticker: string): MovedCard => ({ ticker, name: `${ticker} Inc.`, price: 100, pct: 3, call: "Keep", href: `/stock/${ticker}`, line: `${ticker} rose after results.`, source: null, kind: "news" });
  const week: WeekDay[] = [{ day: "2026-11-17", label: "Tuesday, next week", stocks: [{ ticker: "NVDA", name: "Nvidia", held: true, when: "after the close", price: 100, pct: 1, result: null, href: "/stock/NVDA" }] }];
  function render(moved: MovedCard[]): string {
    const props: BriefingFaceProps = {
      mode: "personal", viewer: "member", date: "2026-11-12", clock: "Thu close", days: [{ day: "2026-11-12" }], archived: true, degraded: false, example: false,
      strip: { you: null, sp500: null, gap: null, tiles: [], path: null }, topNews: [], doToday: null, heat: [], levels: [], moved, week, agentFindings: 0, sessionOpened: true,
    };
    return renderToStaticMarkup(<BriefingFace {...props} />);
  }

  it("lays a lone move across the row as one slim card, the reports under it", () => {
    const html = render([move("AMD")]);
    expect(html).toContain("AMD rose after results.");
    expect(html).not.toContain("lg:col-span-8");
  });

  it("puts two moves beside the week, in two thirds of the row", () => {
    const html = render([move("AMD"), move("AVGO")]);
    expect(html).toContain("lg:col-span-8");
    expect(html).toContain("lg:col-span-4");
  });
});
