import { describe, expect, it } from "vitest";

import { buildMoveRead, buildMoversDayRead, closeOn, sinceClose } from "@/lib/move-page";
import type { ExplainedMove } from "@/lib/seo/family-data";

const series = [
  { date: "2026-11-06", close: 100 },
  { date: "2026-11-09", close: 105 },
  { date: "2026-11-10", close: 110 },
];

const move = (over: Partial<ExplainedMove> = {}): ExplainedMove => ({
  ticker: "LCID",
  name: "Lucid Group",
  sector: null,
  industry: null,
  day: "2026-11-09",
  pct: 4.8,
  price: 105,
  previousClose: 100,
  volume: null,
  priceAsOf: "2026-11-09T14:54:00+00:00",
  researchedAt: "2026-11-09T14:57:00+00:00",
  headline: "Lucid rises on lower cash burn",
  why: null,
  cause: "earnings",
  confidence: "high",
  sources: [{ title: "a", url: "https://a.example" }],
  ...over,
});

describe("move page numbers", () => {
  it("reads the close on a day and what came after", () => {
    expect(closeOn(series, "2026-11-09")).toEqual({ close: 105, pct: 5.000000000000004 });
    expect(closeOn(series, "2026-11-06")).toBeNull();
    expect(closeOn(series, "2026-11-11")).toBeNull();
    expect(sinceClose(series, "2026-11-09")?.date).toBe("2026-11-10");
    expect(sinceClose(series, "2026-11-10")).toBeNull();
  });

  it("leads with the close when it is in, the intraday move with its time when not", () => {
    const closed = buildMoveRead({ move: move(), close: { close: 105, pct: 5 }, spyClose: { close: 1, pct: 0.4 }, since: { pct: 4.76, date: "2026-11-10", close: 110 }, call: { word: "Add", at: "2026-11-09T21:00:00Z" } });
    expect(closed.headline).toBe("LCID closed up 5.0% on Nov 9, 2026, against +0.4% for the S&P 500.");
    expect(closed.insights.map((insight) => insight.id)).toEqual(["since", "call", "sources"]);
    expect(closed.insights[1]!.text).toContain("written after this move");
    const live = buildMoveRead({ move: move(), close: null, spyClose: null, since: null, call: null });
    expect(live.headline).toBe("LCID was up 4.8% at 9:54 AM ET on Nov 9, 2026.");
  });

  it("sums a day of moves by direction and cause", () => {
    const read = buildMoversDayRead({ day: "2026-11-09", moves: [move(), move({ ticker: "HIMS", pct: -11, cause: "earnings guidance cut" }), move({ ticker: "OUST", pct: 2, cause: "business_contract" })], spyClose: null })!;
    expect(read.headline).toBe("3 stocks made a big move with a confirmed reason on Nov 9, 2026: 2 up, 1 down.");
    expect(read.insights.find((insight) => insight.id === "causes")?.text).toBe("Earnings explained 2 of the 3 moves.");
    expect(buildMoversDayRead({ day: "2026-11-09", moves: [], spyClose: null })).toBeNull();
  });
});
