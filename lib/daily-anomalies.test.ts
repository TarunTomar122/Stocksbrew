import { describe, expect, it } from "vitest";

import {
  findAnomalyInFeed,
  mergeAnomaliesWithLatestPrices,
  type AnomalyItem,
} from "@/lib/daily-anomalies";
import type { DailyAnomaliesDoc } from "@/lib/daily-anomalies";
import type { LatestPrice } from "@/lib/types";

function row(ticker: string): AnomalyItem {
  return {
    instrument_id: `US_${ticker}`,
    ticker,
    name: ticker,
    sector: null,
    industry: null,
    logo_url: null,
    price: 100,
    previous_close: 95,
    day_change_pct: 5,
    day_change_abs: 5,
    volume: null,
    direction: "up",
    headline: null,
    thesis: null,
    today_brief: null,
    news_count: 0,
    source_count: 0,
    overall_score: null,
    overall_label: null,
    catalyst: null,
    risk: null,
    key_points: [],
    visual_summary: null,
    overall_verdict: null,
    comparative_context: null,
  };
}

describe("findAnomalyInFeed", () => {
  it("matches tickers case-insensitively", () => {
    const anomalies = [row("NVDA"), row("AAPL")];
    expect(findAnomalyInFeed(anomalies, "nvda")?.ticker).toBe("NVDA");
    expect(findAnomalyInFeed(anomalies, " Aapl ")?.ticker).toBe("AAPL");
  });

  it("returns null when ticker is missing from feed", () => {
    expect(findAnomalyInFeed([row("NVDA")], "TSLA")).toBeNull();
    expect(findAnomalyInFeed(null, "NVDA")).toBeNull();
  });
});

describe("mergeAnomaliesWithLatestPrices", () => {
  it("uses canonical quote fields without carrying an explanation to a changed quote", () => {
    const anomaly = {
      ...row("NVDA"),
      headline: "Existing explanation",
      today_brief: "Research written for the earlier move.",
      comparative_context: { day_change_pct: 5, vs_market_day_change_pct: 3 },
    };
    const feed: DailyAnomaliesDoc = {
      market: "US",
      generated_at: "2026-07-22T20:00:00Z",
      date: "2026-07-22",
      anomaly_count: 1,
      threshold_pct: 1,
      up_count: 1,
      down_count: 0,
      anomalies: [anomaly],
    };
    const latest = new Map<string, Pick<LatestPrice, "quote">>([
      [
        "US_NVDA",
        {
          quote: {
            current: 112,
            previous_close: 100,
            day_change_abs: 12,
            day_change_pct: 12,
            volume: 42,
          },
        },
      ],
    ]);

    const merged = mergeAnomaliesWithLatestPrices(feed, latest);

    expect(merged.anomalies[0]).toMatchObject({
      price: 112,
      previous_close: 100,
      day_change_abs: 12,
      day_change_pct: 12,
      volume: 42,
      direction: "up",
      narrative_status: "unverified",
      headline: null,
      today_brief: null,
      comparative_context: null,
    });
    expect(feed.anomalies[0].price).toBe(100);
  });

  it("falls back to derived change fields and leaves missing quotes untouched", () => {
    const nvda = { ...row("NVDA"), direction: "up" as const };
    const aapl = row("AAPL");
    const feed: DailyAnomaliesDoc = {
      market: "US",
      generated_at: "2026-07-22T20:00:00Z",
      date: "2026-07-22",
      anomaly_count: 2,
      threshold_pct: 1,
      up_count: 2,
      down_count: 0,
      anomalies: [nvda, aapl],
    };
    const latest = new Map<string, Pick<LatestPrice, "quote">>([
      ["US_NVDA", { quote: { current: 90, previous_close: 100 } }],
    ]);

    const merged = mergeAnomaliesWithLatestPrices(feed, latest);

    expect(merged.anomalies[0]).toMatchObject({
      price: 90,
      day_change_abs: -10,
      day_change_pct: -10,
      direction: "down",
    });
    expect(merged.anomalies[1]).toBe(aapl);
  });
});
