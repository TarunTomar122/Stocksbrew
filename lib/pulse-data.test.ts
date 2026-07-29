import { describe, expect, it } from "vitest";

import type { AnomalyItem } from "@/lib/daily-anomalies";
import { buildPulsePageData } from "@/lib/pulse-data";

function anomaly(overrides: Partial<AnomalyItem> = {}): AnomalyItem {
  return {
    instrument_id: "US_SLB",
    ticker: "SLB",
    name: "SLB",
    sector: "Energy",
    industry: null,
    logo_url: null,
    price: 52.42,
    previous_close: 47.21,
    day_change_pct: 11.01,
    day_change_abs: 5.21,
    volume: null,
    direction: "up",
    headline: "Oilfield demand gives SLB fresh operating leverage",
    thesis: null,
    today_brief:
      "International drilling strength and firmer service pricing improve the earnings setup.",
    news_count: 0,
    source_count: 0,
    overall_score: null,
    overall_label: null,
    catalyst: null,
    risk: null,
    key_points: [],
    visual_summary: null,
    move_explanation: null,
    overall_verdict: null,
    comparative_context: null,
    ...overrides,
  };
}

function pulseItems(rows: AnomalyItem[]) {
  return buildPulsePageData({
    market: "US",
    anomalies: rows,
    redditTickers: [],
    snapshotRows: [],
    earningsEvents: [],
    predBy: new Map(),
    recentIntelDocs: [],
  }).items;
}

describe("Pulse mover narratives", () => {
  it("shows a mover only after a researched explanation was stored", () => {
    expect(pulseItems([anomaly({
      narrative_status: "verified",
      move_explanation: {
        headline: "Oilfield demand gives SLB fresh operating leverage",
        why_it_matters: "International drilling strength and firmer service pricing improve the earnings setup.",
      },
    })])[0]).toMatchObject({
      headline: "Oilfield demand gives SLB fresh operating leverage",
      whyItMatters:
        "International drilling strength and firmer service pricing improve the earnings setup.",
    });
  });

  it("uses the stored evidence-backed explanation instead of provider boilerplate", () => {
    const row = anomaly({
      ticker: "VZ",
      name: "Verizon",
      sector: "Communication Services",
      headline: "VZ is a top up mover in Communication Services.",
      today_brief: "Provides stock quote price and forecast.",
      catalyst: "In-line Q2 print",
      visual_summary: {
        what_changed: "Provides stock quote price and forecast",
        why_it_matters: "Provides stock quote price and forecast.",
        catalyst_cards: [
          {
            event: "In-line Q2 print",
            detail: "The muted positive reaction removed a near-term earnings risk.",
          },
        ],
      },
      narrative_status: "verified",
      move_explanation: {
        headline: "In-line Q2 print",
        why_it_matters: "The muted positive reaction removed a near-term earnings risk.",
      },
    });

    expect(pulseItems([row])[0]).toMatchObject({
      headline: "In-line Q2 print",
      whyItMatters: "The muted positive reaction removed a near-term earnings risk.",
    });
  });

  it("does not publish an unresearched mover as a fabricated explanation", () => {
    const row = anomaly({
      ticker: "EMPTY",
      headline: "EMPTY is a top up mover in Technology.",
      today_brief: "Provides stock quote price and forecast.",
      thesis: null,
    });

    expect(pulseItems([row])).toEqual([]);
  });

  it("does not display stale research as a reason for a current move", () => {
    const row = anomaly({
      ticker: "BKNG",
      day_change_pct: 6.7,
      narrative_status: "unverified",
      headline: "BKNG fell 4.13% today.",
      today_brief: "Stale price commentary.",
    });

    expect(pulseItems([row])).toEqual([]);
  });
});
