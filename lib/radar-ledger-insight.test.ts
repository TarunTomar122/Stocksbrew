import { describe, expect, it } from "vitest";

import { resolveRadarLedgerCell } from "@/lib/radar-ledger-insight";
import type { BookCallHint } from "@/lib/radar-hub-data";
import type { WatchlistRow } from "@/lib/watchlist-view";

function baseRow(overrides: Partial<WatchlistRow> = {}): WatchlistRow {
  return {
    instrument_id: "US_AAPL",
    ticker: "AAPL",
    position_type: "holding",
    market: "US",
    sector_label: "",
    industry_label: "",
    currency: "USD",
    price: 200,
    day_change_pct: 0.5,
    day_change_abs: 1,
    scores: {
      overall: null,
      verdict: null,
      valuation: null,
      growth: null,
      quality: null,
      momentum: null,
    },
    alerts: [],
    catalysts: [],
    brief_tile: { micro: "Price and analysis are syncing.", vibe: "wild", source: "rules" },
    coverage_status: "ready",
    has_intel_pro: true,
    ...overrides,
  };
}

describe("resolveRadarLedgerCell", () => {
  it("shows urgent buy/trim call when price is in zone", () => {
    const call: BookCallHint = {
      hint: "Buy more below $246",
      urgent: true,
      callKind: "buy_dip",
    };
    const cell = resolveRadarLedgerCell(baseRow(), call);
    expect(cell?.mode).toBe("action");
  });

  it("skips move alerts and prefers substantive brief copy", () => {
    const cell = resolveRadarLedgerCell(
      baseRow({
        alerts: [{ message: "AAPL moved +7.5% today", type: "alert" }],
        brief_tile: {
          micro: "AAPL: Services attach rate hit a new high in the latest quarter.",
          vibe: "up",
          source: "rules",
        },
      }),
    );
    expect(cell?.mode).toBe("insight");
    if (cell?.mode === "insight") {
      expect(cell.headline).toContain("Services attach");
    }
  });

  it("skips rsi alerts when ticker column already shows rsi", () => {
    const cell = resolveRadarLedgerCell(
      baseRow({
        alerts: [{ message: "RSI indicates overbought", type: "alert" }],
        technicals: { rsi_14: { value: 74.2, state: "overbought" } },
        brief_tile: {
          micro: "AAPL: Margin guidance came in softer than the street expected.",
          vibe: "down",
          source: "rules",
        },
      }),
    );
    expect(cell?.mode).toBe("insight");
    if (cell?.mode === "insight") {
      expect(cell.headline).toContain("Margin guidance");
    }
  });

  it("falls back to scorecard summary when nothing else is interesting", () => {
    const cell = resolveRadarLedgerCell(
      baseRow({
        attention_kind: "calm",
        attention_reason: "AAPL is calm. No major price, technical, alert, or news anomaly stood out.",
        top_metric_summaries: ["Growth leads the scorecard: revenue growth (TTM) 18%"],
      }),
    );
    expect(cell?.mode).toBe("insight");
    if (cell?.mode === "insight") {
      expect(cell.headline).toContain("Growth leads");
    }
  });
});
