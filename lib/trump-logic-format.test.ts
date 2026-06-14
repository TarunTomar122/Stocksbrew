import { describe, expect, it } from "vitest";

import {
  flattenTrumpLogicMentions,
  formatTrumpLogicDate,
  mergeTrumpLogicTableRows,
  splitTrumpLogicTableRows,
} from "@/lib/trump-logic-format";
import type { TrumpLogicMention } from "@/lib/trump-logic-types";

const mentions: TrumpLogicMention[] = [
  {
    post_id: "p1",
    published_at: "2026-06-10T12:00:00.000Z",
    truth_url: "https://truthsocial.com/post/1",
    source: "truth_social",
    said: "Great energy stocks.",
    sentiment: "bullish",
    tickers: ["XOM", "CVX"],
    company_names: [],
    ticker_moves: [
      { ticker: "XOM", change_since_pct: 2.5, mention_price_date: null, current_price: null },
      { ticker: "CVX", change_since_pct: -1.2, mention_price_date: null, current_price: null },
    ],
  },
  {
    post_id: "p2",
    published_at: "2026-06-08T12:00:00.000Z",
    truth_url: "https://truthsocial.com/post/2",
    source: "truth_social",
    said: "Bad quarter.",
    sentiment: "bearish",
    tickers: ["BA"],
    company_names: [],
    ticker_moves: [{ ticker: "BA", change_since_pct: -3.1, mention_price_date: null, current_price: null }],
  },
  {
    post_id: "p3",
    published_at: "2026-06-09T12:00:00.000Z",
    truth_url: "https://truthsocial.com/post/3",
    source: "truth_social",
    said: "Neutral note.",
    sentiment: "neutral",
    tickers: ["AAPL"],
    company_names: [],
  },
];

describe("trump-logic-format", () => {
  it("flattens mentions by ticker and sorts newest first", () => {
    const rows = flattenTrumpLogicMentions(mentions);
    expect(rows.map((row) => row.ticker)).toEqual(["CVX", "XOM", "BA"]);
    expect(rows[0]?.published_at).toBe("2026-06-10T12:00:00.000Z");
  });

  it("splits bullish and bearish rows", () => {
    const split = splitTrumpLogicTableRows(flattenTrumpLogicMentions(mentions));
    expect(split.bullish).toHaveLength(2);
    expect(split.bearish).toHaveLength(1);
  });

  it("formats recent dates", () => {
    const ref = new Date("2026-06-10T18:00:00.000Z");
    expect(formatTrumpLogicDate("2026-06-10T12:00:00.000Z", ref)).toBe("Today");
    expect(formatTrumpLogicDate("2026-06-09T12:00:00.000Z", ref)).toBe("Yesterday");
  });

  it("drops mentions without a since-move value", () => {
    const rows = flattenTrumpLogicMentions([
      {
        post_id: "p4",
        published_at: "2026-06-10T12:00:00.000Z",
        truth_url: "https://truthsocial.com/post/4",
        source: "truth_social",
        said: "CITI ranked number 1 in M&A.",
        sentiment: "bullish",
        tickers: ["CTRN"],
        company_names: [],
        ticker_moves: [{ ticker: "CTRN", change_since_pct: null, mention_price_date: null, current_price: null }],
      },
      ...mentions,
    ]);
    expect(rows.some((row) => row.ticker === "CTRN")).toBe(false);
    expect(rows.every((row) => row.change_since_pct != null)).toBe(true);
  });

  it("merges same ticker on the same day with the same move", () => {
    const merged = mergeTrumpLogicTableRows([
      {
        id: "p1-AEO",
        published_at: "2026-06-02T08:00:00.000Z",
        ticker: "AEO",
        said: "Supports American Energy dominance.",
        sentiment: "bullish",
        change_since_pct: 14,
        truth_url: "https://truthsocial.com/post/1",
        mention_count: 1,
      },
      {
        id: "p2-AEO",
        published_at: "2026-06-02T18:00:00.000Z",
        ticker: "AEO",
        said: "Champions American Energy to grow the economy.",
        sentiment: "bullish",
        change_since_pct: 14,
        truth_url: "https://truthsocial.com/post/2",
        mention_count: 1,
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.mention_count).toBe(2);
    expect(merged[0]?.said).toContain("Champions American Energy");
  });
});
