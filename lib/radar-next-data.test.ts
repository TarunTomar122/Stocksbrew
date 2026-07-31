import { describe, expect, it } from "vitest";

import { buildBookRows, buildDecisionCards, buildIdeas } from "@/lib/radar-next-data";
import type { WatchlistRow } from "@/lib/watchlist-view";

function watchedRow(price: number): WatchlistRow {
  return {
    instrument_id: "US_AMD",
    ticker: "AMD",
    instrument_name: "Advanced Micro Devices, Inc.",
    position_type: "watchlist",
    market: "US",
    currency: "USD",
    price,
    day_change_pct: 2.4,
    scores: { overall: 76 },
    ai_directive: {
      stance: "accumulate",
      confidence: "high",
      action: {
        label: "Start a position on weakness",
        summary: "Let price come to the entry zone.",
      },
      zones: {
        accumulate_below: 160,
      },
    },
    ai_directive_rationale: "Revenue growth remains above sector peers.",
  } as WatchlistRow;
}

describe("buildBookRows", () => {
  it("keeps off-zone names unhighlighted", () => {
    const book = buildBookRows([watchedRow(166)]);

    expect(book.watching[0]).toMatchObject({
      stance: "accumulate",
      needsAttention: false,
    });
  });

  it("marks the row actionable when its price enters the directive zone", () => {
    const book = buildBookRows([watchedRow(159)]);

    expect(book.watching[0]).toMatchObject({
      needsAttention: true,
      attentionDirection: "bullish",
    });
  });
});

describe("buildDecisionCards", () => {
  it("keeps a watchlist accumulate call out until its live price reaches the zone", () => {
    expect(buildDecisionCards([watchedRow(166)], null)).toEqual([]);
  });

  it("surfaces an accumulate action only after the entry zone is reached", () => {
    expect(buildDecisionCards([watchedRow(159)], null)).toMatchObject([
      {
        ticker: "AMD",
        action: "Accumulate now",
        direction: "bullish",
        driver: "Revenue growth remains above sector peers.",
        nextTrigger: "Zone reached: Enter below $160",
      },
    ]);
  });

  it("does not surface a generic avoid directive without an exit level", () => {
    const avoid = watchedRow(166);
    avoid.ai_directive = {
      stance: "avoid",
      action: { label: "Do not add here", summary: "Wait." },
    };

    expect(buildDecisionCards([avoid], null)).toEqual([]);
  });

  it("does not convert an avoid directive's leftover add zone into an accumulate decision", () => {
    const avoid = watchedRow(159);
    avoid.ai_directive = {
      stance: "avoid",
      action: { label: "Avoid for now", summary: "The setup is not paying enough for the risk right now." },
      zones: { accumulate_below: 160 },
    };

    expect(buildDecisionCards([avoid], null)).toEqual([]);
  });
});

describe("buildIdeas", () => {
  it("keeps the daily discovery lens limited to source-backed live signals", () => {
    const ideas = buildIdeas([
      {
        instrument_id: "US_STATIC",
        ticker: "STATIC",
        sources: ["screen"],
        personalization_reasons: ["reduces technology concentration"],
        overall_score: 90,
      },
      {
        instrument_id: "US_FRESH",
        ticker: "FRESH",
        sources: ["anomaly"],
        anomaly_move_pct: 8.4,
        anomaly_headline: "Fresh earnings reaction",
        overall_score: 70,
      },
    ]);

    expect(ideas.unusual).toMatchObject([{ ticker: "FRESH", reason: "Fresh earnings reaction" }]);
    expect(ideas.unusual).not.toContainEqual(expect.objectContaining({ ticker: "STATIC" }));
    expect(ideas.fits[0]).toMatchObject({ ticker: "STATIC", reason: "Reduces technology concentration" });
  });
});
