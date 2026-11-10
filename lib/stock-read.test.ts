import { describe, expect, it } from "vitest";

import { buildStockRead } from "@/lib/stock-read";
import type { StockIntelligenceDoc } from "@/lib/stock";

const base = {
  instrument_id: "US_NVDA",
  headline: "Leadership scrutiny competes with growth",
  body: "Nvidia fell as its board opened a review.",
  generated_at: "2026-11-09T15:15:10+00:00",
  key_points: ["Growth is still far ahead of peers.", "A fourth point."],
  evidence_history: { article_count: 19, source_count: 14 },
  directive_v2: {
    stance: "hold",
    confidence: "medium",
    horizon: "weeks",
    action: { label: "Hold here", summary: "Keep the position; do not add." },
    zones: { accumulate_below: 177.59, trim_above: 310.62 },
    invalidation: "Revisit if momentum breaks.",
    watch_out: "Revisit if momentum breaks.",
    evidence: [
      { type: "driver", text: "Revenue is growing faster than peers." },
      { type: "driver", text: "Rubin is rated above competing chips." },
      { type: "risk", text: "A damaging finding could weaken trust." },
    ],
  },
} as unknown as StockIntelligenceDoc;

describe("buildStockRead", () => {
  it("returns null when there is no brief", () => {
    expect(buildStockRead(null)).toBeNull();
    expect(buildStockRead({ instrument_id: "US_X" })).toBeNull();
  });

  it("prefers the stock-specific call reason and falls back to the old summary", () => {
    expect(buildStockRead(base)!.actionSummary).toBe("Keep the position; do not add.");
    const withReason = {
      ...base,
      directive_v2: { ...base.directive_v2, call_reason: "Nvidia is down 6% this week, so we'd hold rather than add." },
    } as unknown as StockIntelligenceDoc;
    expect(buildStockRead(withReason)!.actionSummary).toBe("Nvidia is down 6% this week, so we'd hold rather than add.");
  });

  it("splits evidence into reasons and what would change the call", () => {
    const read = buildStockRead(base)!;
    expect(read.call).toBe("Hold");
    expect(read.actionLabel).toBe("Hold here");
    expect(read.reasons).toEqual([
      "Revenue is growing faster than peers.",
      "Rubin is rated above competing chips.",
      "Growth is still far ahead of peers.",
    ]);
    expect(read.changers).toEqual(["A damaging finding could weaken trust.", "Revisit if momentum breaks."]);
    expect(read.confidence).toBe("medium");
    expect(read.zones).toEqual({ addBelow: 177.59, addAbove: null, trimAbove: 310.62 });
    expect(read.articleCount).toBe(19);
    expect(read.sourceCount).toBe(14);
    expect(read.writtenAt).toBe("2026-11-09T15:15:10+00:00");
    expect(read.changed).toBeNull();
  });

  it("never repeats a point and caps each list at three", () => {
    const read = buildStockRead({
      ...base,
      key_points: ["Revenue is growing faster than peers", "b", "c", "d"],
    } as StockIntelligenceDoc)!;
    expect(read.reasons).toHaveLength(3);
    expect(new Set(read.reasons).size).toBe(3);
    expect(read.reasons).not.toContain("Revenue is growing faster than peers");
  });

  it("drops a body that only repeats the headline and reports a changed call", () => {
    const read = buildStockRead({
      instrument_id: "US_X",
      headline: "Same line.",
      body: "Same line",
      directive_v2: { stance: "accumulate", changed_from_previous: true, change_reason: "Earnings beat.", zones: { accumulate_below: 0 } },
    })!;
    expect(read.body).toBeNull();
    expect(read.call).toBe("Add");
    expect(read.changed).toEqual({ reason: "Earnings beat." });
    expect(read.zones.addBelow).toBeNull();
    expect(read.confidence).toBeNull();
  });
});
