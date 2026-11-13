import { describe, expect, it } from "vitest";

import { cardHeadline, hasCardHeadline, headlineClause } from "@/lib/wire-read";

describe("cardHeadline", () => {
  it("takes the newest headline of at most 15 words", () => {
    const items = [
      { id: "a", title: "Stock market today, Nov. 11: Intel climbs on broader chip rally as AI infrastructure demand lifts semiconductor stocks" },
      { id: "b", title: "The chipmaker's CEO bought around $9.7 million of its stock in early November" },
    ];
    expect(cardHeadline(items)?.id).toBe("b");
  });

  it("cuts the shortest long headline at a clause boundary, never past 15 words and with no ellipsis", () => {
    const out = cardHeadline([
      { id: "a", title: "His California public pension once cost him up to $643 a month in Social Security. A federal law erased the cut. Now his fund gains" },
      { id: "b", title: "Stock market today, Nov. 11: Intel climbs on broader chip rally as AI infrastructure demand lifts semiconductor stocks and more" },
    ]);
    expect(out?.id).toBe("b");
    expect(out?.title).toBe("Stock market today, Nov. 11");
    expect(out!.title.split(" ").length).toBeLessThanOrEqual(15);
    expect(out!.title).not.toMatch(/…|\.\.\.$/);
  });

  it("skips the card when no headline fits and none has a clause to cut at", () => {
    const long = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen";
    expect(cardHeadline([{ id: "a", title: `${long} seventeen eighteen` }, { id: "b", title: long }])).toBeNull();
    expect(cardHeadline([])).toBeNull();
  });
});

describe("headlineClause", () => {
  it("keeps the longest whole clause under the cap, a question mark with it, and needs four words", () => {
    expect(headlineClause("Is Qualcomm stock worth buying now? Analysts weigh diversification against margin risk in a long note today")).toBe(
      "Is Qualcomm stock worth buying now?",
    );
    expect(headlineClause("Fed holds rates steady — markets shrug as traders look to December and the next jobs report for any clear signal")).toBe(
      "Fed holds rates steady",
    );
    expect(headlineClause("Short: then a very long tail of words that keeps going well past the fifteen word cap for sure")).toBeNull();
    // A decimal point the source spaced out is not a clause end: the AMAT earnings headline cut at its colon instead.
    expect(headlineClause("Applied Materials Inc (AMAT) (Q4 2026) Earnings Call Highlights: Record $10. 8 Billion Revenue and Strong AI Demand Lift the Outlook")).toBe(
      "Applied Materials Inc (AMAT) (Q4 2026) Earnings Call Highlights",
    );
    expect(headlineClause("Stock slips under $10. Investors weigh a long list of worries about the company and its plans for next year")).toBe("Stock slips under $10");
  });
});

describe("hasCardHeadline", () => {
  it("is false for a company whose stories give no headline the card can show", () => {
    expect(hasCardHeadline({ name: "Corning", items: [] })).toBe(false);
    expect(hasCardHeadline({ name: "Corning", items: [{ title: "Corning raises its outlook on fiber demand" }] })).toBe(true);
  });
});
