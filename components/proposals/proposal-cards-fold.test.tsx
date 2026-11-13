import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { newProposal, toCard, type ProposalAction } from "@/lib/proposals";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
// Some shared parts (the level bar, the logo) are written for the app's automatic JSX runtime.
vi.stubGlobal("React", React);

const { ProposalCards } = await import("./proposal-cards");

const NOW = new Date("2026-11-13T15:00:00Z");

function card(ticker: string, index: number) {
  const action: ProposalAction = { type: "alert_price", ticker, instrument_id: `US_${ticker}`, condition: "below", price: 100, replaces: null };
  return toCard(
    newProposal(
      "u1",
      {
        kind: "level_reached",
        ticker,
        instrument_id: `US_${ticker}`,
        event: { key: `level:${ticker}`, kind: "level_reached", at: "2026-11-12", refs: [] },
        idea: `i${index}`,
        title: `Set an alert on ${ticker} at $100`,
        why: [`${ticker} closed under its buy-more level yesterday.`],
        does: "",
        read: [],
        figures: [],
        action,
        priority: 50 - index,
        level: { price: 100, label: "Buy-more level" },
        quote: { price: 99, dayPct: -1, at: null },
      },
      NOW,
    ),
    null,
  );
}

const html = (count: number, fold?: number) =>
  renderToStaticMarkup(<ProposalCards initial={["ASTS", "LLY", "DELL", "OUST", "META"].slice(0, count).map(card)} today="2026-11-13" compact fold={fold} />);

describe("ProposalCards folded (the briefing)", () => {
  it("draws the first row, counts the whole queue, and keeps the rest one tap away", () => {
    const out = html(5, 2);
    expect(out).toMatch(/Needs you<span[^>]*>5<\/span>/);
    expect((out.match(/aria-label="Accept: /g) ?? []).length).toBe(2);
    expect(out).toContain(">Show 3 more<");
    expect(out).toContain(">Show 4 more<");
  });

  it("does not fold a queue that fits in the first row", () => {
    const out = html(2, 2);
    expect(out).not.toContain("more</span>");
    expect((out.match(/aria-label="Accept: /g) ?? []).length).toBe(2);
  });

  it("says nothing at all with nothing waiting", () => {
    expect(html(0, 2)).toBe("");
  });

  it("compact cards carry one line: the trigger is the hover, not a second line", () => {
    const out = html(1);
    expect(out).toContain('title="ASTS closed under its buy-more level yesterday."');
    expect(out.split("ASTS closed under its buy-more level yesterday.").length - 1).toBe(1);
  });
});
