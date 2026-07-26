import { describe, expect, it } from "vitest";

import {
  ANOMALY_NO_NEWS_COPY,
  anomalyDetail,
  anomalyHeadline,
  isWeakMoveExplanation,
  splitDisplayableMoves,
  topMoverHeadline,
} from "@/components/daily-anomalies-shared";
import type { AnomalyItem } from "@/lib/daily-anomalies";

function item(overrides: Partial<AnomalyItem> = {}): AnomalyItem {
  return {
    instrument_id: "US_AMD",
    ticker: "AMD",
    name: "AMD",
    sector: null,
    industry: null,
    logo_url: null,
    price: 100,
    previous_close: 95,
    day_change_pct: 5,
    day_change_abs: 5,
    volume: null,
    direction: "up",
    headline: "Short headline",
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
    ...overrides,
  };
}

describe("anomalyDetail", () => {
  it("prefers the hard-move explanation over generic anomaly brief text", () => {
    const moveExplanation = "Search found a specific catalyst explaining today's move.";
    const genericBrief = "A".repeat(260);

    const detail = anomalyDetail(
      item({
        move_explanation: { why_it_matters: moveExplanation },
        today_brief: genericBrief,
      }),
    );

    expect(detail).toBe(moveExplanation);
  });

  it("uses plain no-news copy for weak move explainers", () => {
    const row = item({
      ticker: "SMR",
      sector: "Utilities",
      direction: "up",
      move_explanation: {
        cause_type: "unclear",
        headline: "No clear company-specific driver surfaced yet.",
        why_it_matters:
          "The move is large, but current internal news and intelligence do not explain it cleanly.",
      },
    });

    expect(isWeakMoveExplanation(row)).toBe(true);
    expect(topMoverHeadline(row)).toBe("SMR is a top up mover in Utilities.");
    expect(anomalyHeadline(row)).toBe("SMR is a top up mover in Utilities.");
    expect(anomalyDetail(row)).toBe(ANOMALY_NO_NEWS_COPY);
  });

  it("keeps materialized post-close research when the expensive move explainer was skipped", () => {
    const row = item({
      headline: "Oilfield demand gives SLB fresh operating leverage",
      today_brief:
        "International drilling strength and firmer service pricing improve the earnings setup.",
      move_explanation: null,
    });

    expect(anomalyHeadline(row)).toBe("Oilfield demand gives SLB fresh operating leverage");
    expect(anomalyDetail(row)).toBe(
      "International drilling strength and firmer service pricing improve the earnings setup.",
    );
  });

  it("does not present provider boilerplate as the reason for a move", () => {
    const row = item({
      ticker: "VZ",
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
      move_explanation: null,
    });

    expect(anomalyHeadline(row)).toBe("In-line Q2 print");
    expect(anomalyDetail(row)).toBe(
      "The muted positive reaction removed a near-term earnings risk.",
    );
  });

  it("does not leak unrelated analysis from an explicitly unclear move explainer", () => {
    const row = item({
      ticker: "NOW",
      sector: "Technology",
      move_explanation: {
        cause_type: "unclear",
        headline: "No clear company-specific driver surfaced yet.",
        why_it_matters: "NOW has +30.4% analyst target runway.",
      },
    });

    expect(anomalyHeadline(row)).toBe("NOW is a top up mover in Technology.");
    expect(anomalyDetail(row)).toBe(ANOMALY_NO_NEWS_COPY);
  });
});

describe("splitDisplayableMoves", () => {
  it("drops weak explainers when explainedOnly is set", () => {
    const anomalies = [
      item({ ticker: "ARM", day_change_pct: 9, move_explanation: { cause_type: "unclear" } }),
      item({
        ticker: "NVDA",
        day_change_pct: 8,
        move_explanation: { why_it_matters: "AI demand drove the move." },
      }),
    ];

    const { ups } = splitDisplayableMoves(anomalies, { explainedOnly: true });
    expect(ups.map((row) => row.ticker)).toEqual(["NVDA"]);
  });
});
