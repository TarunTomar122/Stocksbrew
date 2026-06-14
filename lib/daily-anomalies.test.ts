import { describe, expect, it } from "vitest";

import { findAnomalyInFeed, type AnomalyItem } from "@/lib/daily-anomalies";

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
