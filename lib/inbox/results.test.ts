import { describe, expect, it } from "vitest";

import type { ResultRead } from "@/lib/results/types";

import { mergeInbox } from "./merge";
import { resultsItem } from "./words";

const TODAY = "2026-11-11";

const read = (patch: Partial<ResultRead> = {}): ResultRead => ({
  ticker: "CRWV",
  company: "CoreWeave, Inc.",
  reportDate: "2026-11-10",
  session: "amc",
  period: null,
  eps: { actual: -1.27, expected: -1.55, verdict: "beat", surprisePct: 18.1, source: "Yahoo Finance", asOf: "2026-11-10T23:00:28.738345+00:00" },
  revenue: null,
  guidance: null,
  move: { pct: 25.45, kind: "today", day: TODAY, nextDay: true, usualPct: 17.41, usualCount: 6, source: "Live price", asOf: "2026-11-11T19:03:00+00:00" },
  call: { status: "held", call: "Buy more", asOf: "2026-11-11T15:08:52Z" },
  reportHref: null,
  sources: [],
  ...patch,
});

describe("results items", () => {
  it("says what the person's stock reported, how it moved and where the call stands", () => {
    const item = resultsItem(read(), "holding", "mine", TODAY)!;
    expect(item.kind).toBe("results");
    expect(item.text).toBe(
      "CRWV, which you own, lost $1.27 a share, less than the $1.55 expected, and the stock is up 25% today, bigger than its usual 17% move after a report.",
    );
    expect(item.detail).toBe("Our call is still Buy more after the results.");
    expect(item.tone).toBe("up");
    expect(item.at).toBe("2026-11-10T23:00:28.738Z");
    expect(item.id).toBe("results:CRWV:2026-11-10");
    expect(item.href).toBe("/stock/CRWV");
  });

  it("names the example's stocks as the example's", () => {
    expect(resultsItem(read(), "holding", "example", TODAY)!.text.startsWith("CRWV, which the example portfolio holds, lost")).toBe(true);
    expect(resultsItem(read(), "watchlist", "mine", TODAY)!.text.startsWith("CRWV, which you watch, lost")).toBe(true);
  });

  it("makes no item without figures or a time", () => {
    expect(resultsItem(read({ eps: null }), "holding", "mine", TODAY)).toBeNull();
    expect(resultsItem(read({ eps: { ...read().eps!, asOf: null } }), "holding", "mine", TODAY)).toBeNull();
  });

  it("keeps one item per report through the merge, the same id on every read", () => {
    const first = resultsItem(read(), "holding", "mine", TODAY)!;
    const later = resultsItem(read({ move: { ...read().move!, pct: 22 } }), "holding", "mine", TODAY)!;
    const merged = mergeInbox([[first], [later]], "2026-10-28T00:00:00Z", new Date("2026-11-11T20:00:00Z"));
    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe(first.id);
  });
});
