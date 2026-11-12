import { describe, expect, it } from "vitest";

import { anchorGroups, briefingAnchorTickers } from "@/lib/briefing-anchors";
import type { BriefingItem } from "@/lib/briefing";
import type { BriefingGroup } from "@/lib/briefing-groups";

const group = (ticker: string | null, key = ticker ?? "MARKET") => ({ key, ticker }) as unknown as BriefingGroup;

describe("anchorGroups", () => {
  it("gives each stock one anchor, on its first card in page order", () => {
    const first = group("NVDA");
    const again = group("NVDA");
    const amd = group("AMD");
    const market = group(null);
    const out = anchorGroups([first, market, amd, again]);
    expect(out.has(first)).toBe(true);
    expect(out.has(again)).toBe(false);
    expect(out.has(amd)).toBe(true);
    expect(out.has(market)).toBe(false);
  });
});

const base = {
  portfolio: null,
  market: { indices: [], gainers: [], losers: [], as_of: null },
  quiet: { text: "", names: [] },
  date: "2026-11-11",
};

const earnings = (ticker: string, relation: "holding" | "watching", days: number) =>
  ({
    id: `e-${ticker}`,
    kind: "earnings_upcoming",
    ticker,
    instrument_id: null,
    name: ticker,
    relation,
    severity: "low",
    needs_you: false,
    tone: "flat",
    headline: `${ticker} reports earnings in ${days} days`,
    metric: null,
    why: "",
    reason_status: "not_applicable",
    next_step: "",
    spoken: "",
    evidence: [],
    as_of: null,
    deadline_days: days,
    price: null,
    day_change_pct: 1,
    alert: null,
    href: `/stock/${ticker}`,
  }) as BriefingItem;

describe("briefingAnchorTickers", () => {
  it("is empty for the market view", () => {
    expect(briefingAnchorTickers({ ...base, mode: "market", needs_you: [], also_today: [] }, {})).toEqual([]);
  });

  it("leaves out a Coming up card the read replaced, as the page does (round 6)", () => {
    const tickers = briefingAnchorTickers({ ...base, mode: "personal", needs_you: [], also_today: [earnings("NVDA", "holding", 6), earnings("AAPL", "watching", 5)] }, {});
    expect(tickers).toEqual(["AAPL"]);
  });
});
