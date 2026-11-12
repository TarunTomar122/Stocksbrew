import { describe, expect, it, vi } from "vitest";

// The view imports fonts through the kit; they only resolve inside the Next compiler.
vi.mock("next/font/google", () => ({ Instrument_Sans: () => ({ variable: "", className: "" }), Inter_Tight: () => ({ variable: "", className: "" }) }));
vi.mock("next/font/local", () => ({ default: () => ({ variable: "", className: "" }) }));
vi.mock("@/components/oa/oa-site-header", () => ({ OaSiteHeader: () => null }));

import { redditRowLine, showsRedditRow } from "./signals-view";

describe("a Reddit row's line", () => {
  it("is a whole highlight of at most 12 words", () => {
    expect(redditRowLine({ catalysts: ["AMD is benefiting from Nvidia-specific weakness"], summary: null })).toBe("AMD is benefiting from Nvidia-specific weakness.");
  });

  it("takes the first highlight that fits when an earlier one runs long", () => {
    const line = redditRowLine({
      catalysts: [
        "Broadcom is framed as a preferred beneficiary of hyperscalers shifting toward custom silicon and away from merchant GPUs this year",
        "Broadcom gains as buyers favour custom chips",
      ],
      summary: null,
    });
    expect(line).toBe("Broadcom gains as buyers favour custom chips.");
  });

  it("is nothing, never a sentence cut with an ellipsis, when no highlight fits", () => {
    const line = redditRowLine({
      catalysts: ["Options activity shows investors actively hedging against a major market drawdown into the end of the year now"],
      summary: null,
    });
    expect(line).toBeNull();
  });
});

describe("which Reddit names get a row (owner rule 3: every row carries its mood)", () => {
  const row = (ticker: string, stance: "bullish" | "bearish" | "mixed" | "neutral", stanceRead = true) => ({ ticker, stance, stanceRead });

  it("shows a stock with a read mood that leans somewhere: Hopeful, Worried or Mixed", () => {
    expect(showsRedditRow(row("AMD", "bullish"))).toBe(true);
    expect(showsRedditRow(row("NVDA", "bearish"))).toBe(true);
    expect(showsRedditRow(row("SNDK", "mixed"))).toBe(true);
  });

  it("hides a stock that is neutral or not read yet", () => {
    expect(showsRedditRow(row("CVS", "neutral"))).toBe(false);
    expect(showsRedditRow(row("SMH", "bullish", false))).toBe(false);
  });

  it("keeps funds and indices to a clear lean, as before", () => {
    expect(showsRedditRow(row("SPY", "bearish"))).toBe(true);
    expect(showsRedditRow(row("SPY", "mixed"))).toBe(false);
    expect(showsRedditRow(row("SPX", "neutral"))).toBe(false);
  });
});
