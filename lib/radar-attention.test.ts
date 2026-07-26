import { describe, expect, it } from "vitest";

import type { RadarAttentionItem } from "@/lib/watchlist-view";
import { radarAttentionItems } from "@/lib/radar-attention";

function item(
  ticker: string,
  event_type: string,
  overrides: Partial<RadarAttentionItem> = {},
): RadarAttentionItem {
  return {
    item_id: `${ticker}-${event_type}`,
    instrument_id: `US_${ticker}`,
    ticker,
    position_type: "watchlist",
    event_type,
    direction: "neutral",
    headline: "Changed",
    what_changed: "A measured state changed.",
    why_it_matters: "Review the setup.",
    occurred_at: "2026-07-24T09:00:00Z",
    priority: 1,
    priority_score: 50,
    event_ids: ["event"],
    citations: [
      {
        title: "Source",
        url: "https://example.com",
        publisher: "Example",
        published_at: "2026-07-24T09:00:00Z",
      },
    ],
    ...overrides,
  };
}

describe("radarAttentionItems", () => {
  it("keeps only meaningful current state changes and caps the queue at three", () => {
    const rows = radarAttentionItems(
      [
        item("AAPL", "analyst_target_revision"),
        item("NVDA", "rsi_overbought_cross"),
        item("MSFT", "earnings_upcoming"),
        item("TSLA", "abnormal_price_move"),
        item("AMD", "rsi_oversold_cross"),
      ],
      Date.parse("2026-07-24T10:00:00Z"),
    );

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.ticker)).not.toContain("AAPL");
  });

  it("prioritizes held names over watched names", () => {
    const rows = radarAttentionItems(
      [
        item("NVDA", "rsi_overbought_cross", { priority_score: 99 }),
        item("MSFT", "earnings_upcoming", {
          position_type: "holding",
          priority_score: 10,
        }),
      ],
      Date.parse("2026-07-24T10:00:00Z"),
    );

    expect(rows[0].ticker).toBe("MSFT");
  });

  it("drops unexplained abnormal moves", () => {
    expect(
      radarAttentionItems(
        [item("TSLA", "abnormal_price_move", { citations: [] })],
        Date.parse("2026-07-24T10:00:00Z"),
      ),
    ).toEqual([]);
  });

  it("shows only the highest-priority item for a repeated technical state", () => {
    const rows = radarAttentionItems(
      [
        item("RKLB", "rsi_oversold_cross", { priority_score: 80 }),
        item("OKLO", "rsi_oversold_cross", { priority_score: 70 }),
        item("MSFT", "earnings_upcoming", { priority_score: 60 }),
      ],
      Date.parse("2026-07-24T10:00:00Z"),
    );

    expect(rows.map((row) => row.ticker)).toEqual(["RKLB", "MSFT"]);
  });
});
