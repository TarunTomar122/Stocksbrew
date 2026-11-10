import { describe, expect, it } from "vitest";

import type { BriefingItem } from "@/lib/briefing";

import { verdictFor } from "./item-metric";

function item(fields: Partial<BriefingItem>): BriefingItem {
  return { kind: "news", tone: "flat", metric: null, why: "", headline: "", ...fields } as BriefingItem;
}

describe("verdictFor", () => {
  it("reads beat or missed from the first sentence of an earnings report", () => {
    expect(verdictFor(item({ kind: "earnings_reported", why: "ROIV beat EPS estimates as shares rose 4.58%. Watch the launch." }))).toEqual({ tone: "up", word: "Beat" });
    expect(verdictFor(item({ kind: "earnings_reported", tone: "up", why: "IBRX missed revenue estimates of $0.49. Shares rose." }))).toEqual({ tone: "down", word: "Missed" });
    expect(verdictFor(item({ kind: "earnings_reported", why: "Apple Inc. beat U.S. estimates. Guidance was cut." }))).toEqual({ tone: "up", word: "Beat" });
  });

  it("says nothing for a mixed or wordless earnings report, or a miss only in a later sentence", () => {
    expect(verdictFor(item({ kind: "earnings_reported", why: "X beat on revenue but missed on EPS." }))).toBeNull();
    expect(verdictFor(item({ kind: "earnings_reported", why: "ZETA rose 4.46% after the report. Avoid if guidance is cut or it missed." }))).toBeNull();
  });

  it("judges filings, chart events and single congressional trades only when they lean one way", () => {
    expect(verdictFor(item({ kind: "filing", tone: "down" }))).toEqual({ tone: "down", word: "Negative" });
    expect(verdictFor(item({ kind: "technical", tone: "up" }))).toEqual({ tone: "up", word: "Bullish" });
    expect(verdictFor(item({ kind: "congress_trade", tone: "up", metric: "Bought" }))).toEqual({ tone: "up", word: "Bought" });
    expect(verdictFor(item({ kind: "congress_trade", tone: "up", metric: "3 trades" }))).toBeNull();
    expect(verdictFor(item({ kind: "filing", tone: "flat" }))).toBeNull();
    expect(verdictFor(item({ kind: "price_move", tone: "up", metric: "+3.00%" }))).toBeNull();
  });
});
