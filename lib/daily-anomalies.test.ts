import { describe, expect, it } from "vitest";

import { anomalyHeadline } from "@/components/daily-anomalies-shared";
import {
  findAnomalyInFeed,
  mergeAnomalyWithLatestPrice,
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

  it("keeps a verified reason when only an intraday quote changes in the same session", () => {
    const anomaly = {
      ...row("CNXC"),
      price_as_of: "2026-07-29T13:50:05.000Z",
      narrative_status: "verified" as const,
      move_explanation: {
        headline: "Concentrix named AI leader",
        why_it_matters: "Current recognition supports the move.",
      },
    };
    const feed: DailyAnomaliesDoc = {
      market: "US",
      generated_at: "2026-07-29T13:50:05.000Z",
      date: "2026-07-29",
      anomaly_count: 1,
      threshold_pct: 1,
      up_count: 1,
      down_count: 0,
      anomalies: [anomaly],
    };
    const latest = new Map<string, Pick<LatestPrice, "quote"> & Partial<Pick<LatestPrice, "captured_at">>>([
      [
        "US_CNXC",
        {
          captured_at: "2026-07-29T14:00:00.000Z",
          quote: { current: 103.8, previous_close: 100, day_change_pct: 3.8, day_change_abs: 3.8 },
        },
      ],
    ]);

    const merged = mergeAnomaliesWithLatestPrices(feed, latest);

    expect(merged.anomalies[0]).toMatchObject({
      price: 103.8,
      day_change_pct: 3.8,
      narrative_status: "verified",
      move_explanation: { headline: "Concentrix named AI leader" },
    });
  });

  it("removes an anomaly when the latest quote belongs to another session", () => {
    const anomaly = {
      ...row("NVDA"),
      price_as_of: "2026-07-29T20:00:00.000Z",
      narrative_status: "verified" as const,
    };
    const feed: DailyAnomaliesDoc = {
      market: "US",
      generated_at: "2026-07-29T20:05:00.000Z",
      date: "2026-07-29",
      anomaly_count: 1,
      threshold_pct: 1,
      up_count: 1,
      down_count: 0,
      anomalies: [anomaly],
    };
    const latest = new Map([
      [
        "US_NVDA",
        {
          captured_at: "2026-07-30T20:00:00.000Z",
          quote: { current: 101, previous_close: 100, day_change_pct: 1, day_change_abs: 1 },
        },
      ],
    ]);

    const merged = mergeAnomaliesWithLatestPrices(feed, latest);

    expect(merged.anomalies).toEqual([]);
    expect(merged).toMatchObject({ anomaly_count: 0, up_count: 0, down_count: 0 });
  });
});

describe("mergeAnomalyWithLatestPrice", () => {
  it("reconciles the exact CBRS down-to-up reversal without split-brain copy", () => {
    const anomaly = {
      ...row("CBRS"),
      price: 148,
      previous_close: 168,
      day_change_abs: -20,
      day_change_pct: -12,
      direction: "down" as const,
      price_as_of: "2026-07-30T13:50:00.000Z",
      narrative_status: "unverified" as const,
    };

    const merged = mergeAnomalyWithLatestPrice(
      anomaly,
      {
        captured_at: "2026-07-30T20:00:00.000Z",
        quote: {
          current: 203.07,
          previous_close: 169.39,
          day_change_abs: 33.68,
          day_change_pct: 19.88,
        },
      },
      "US",
    );

    expect(merged).toMatchObject({
      day_change_pct: 19.88,
      direction: "up",
      narrative_status: "unverified",
    });
    expect(merged?.headline).toBeNull();
    expect(anomalyHeadline(merged!)).toBe("CBRS is up 19.9% today");
  });

  it("clears verified research when the live move reverses direction", () => {
    const anomaly = {
      ...row("CBRS"),
      price_as_of: "2026-07-30T13:50:00.000Z",
      narrative_status: "verified" as const,
      move_explanation: {
        headline: "Old downside explanation",
        why_it_matters: "Written for the selloff.",
      },
    };

    const merged = mergeAnomalyWithLatestPrice(
      anomaly,
      {
        captured_at: "2026-07-30T20:00:00.000Z",
        quote: {
          current: 90,
          previous_close: 100,
          day_change_abs: -10,
          day_change_pct: -10,
        },
      },
      "US",
    );

    expect(merged).toMatchObject({
      direction: "down",
      narrative_status: "unverified",
      move_explanation: null,
    });
  });

  it("treats Yahoo midnight daily bars as market-date labels", () => {
    const anomaly = {
      ...row("CBRS"),
      price_as_of: "2026-07-30T00:00:00.000Z",
      narrative_status: "verified" as const,
      move_explanation: {
        headline: "Current session catalyst",
        why_it_matters: "Still relevant during the same market session.",
      },
    };

    const merged = mergeAnomalyWithLatestPrice(
      anomaly,
      {
        captured_at: "2026-07-30T18:00:00.000Z",
        quote: {
          current: 106,
          previous_close: 100,
          day_change_abs: 6,
          day_change_pct: 6,
        },
      },
      "US",
    );

    expect(merged).toMatchObject({
      day_change_pct: 6,
      narrative_status: "verified",
      move_explanation: { headline: "Current session catalyst" },
    });
  });
});
