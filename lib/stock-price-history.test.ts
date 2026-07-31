import { describe, expect, it } from "vitest";

import { buildPriceHistorySeries } from "@/lib/price-history-series";

describe("stock price history freshness", () => {
  it("overlays the newest top-level quote onto an older same-day history point", () => {
    const series = buildPriceHistorySeries({
      captured_at: "2026-07-30T18:00:00+00:00",
      updated_at: "2026-07-30T18:00:05+00:00",
      quote: {
        current: 110,
        previous_close: 98,
        day_change_abs: 12,
        day_change_pct: 12.24,
      },
      history_window: [
        {
          captured_at: "2026-07-29T20:00:00+00:00",
          quote: { current: 98 },
        },
        {
          captured_at: "2026-07-30T13:30:00+00:00",
          quote: { current: 100 },
        },
      ],
    });

    expect(series).toEqual([
      { date: "2026-07-29", close: 98 },
      { date: "2026-07-30", close: 110 },
    ]);
  });

  it("does not relabel an old provider quote with the Firestore write date", () => {
    const series = buildPriceHistorySeries({
      captured_at: "2026-07-29T20:00:00+00:00",
      updated_at: "2026-07-30T13:00:00+00:00",
      quote: { current: 101 },
      history_window: [
        {
          captured_at: "2026-07-29T13:30:00+00:00",
          quote: { current: 100 },
        },
      ],
    });

    expect(series).toEqual([{ date: "2026-07-29", close: 101 }]);
  });

  it("does not let a stale top-level quote overwrite newer embedded history", () => {
    const series = buildPriceHistorySeries({
      captured_at: "2026-07-17T00:00:00+00:00",
      updated_at: "2026-07-30T20:10:00+00:00",
      quote: { current: 81.45 },
      history_window: [
        {
          captured_at: "2026-07-17T00:00:00+00:00",
          quote: { current: 80 },
        },
        {
          captured_at: "2026-07-30T00:00:00+00:00",
          quote: { current: 54.3 },
        },
      ],
    });

    expect(series).toEqual([
      { date: "2026-07-17", close: 80 },
      { date: "2026-07-30", close: 54.3 },
    ]);
  });
});
