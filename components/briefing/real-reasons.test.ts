import { describe, expect, it } from "vitest";

import { NO_CONFIRMED_REASON, type Briefing, type BriefingItem } from "@/lib/briefing";

import { withoutCircularReasons } from "./real-reasons";

function move(ticker: string, name: string, why: string): BriefingItem {
  return {
    id: `2026-11-11:price_move:${ticker}`,
    kind: "price_move",
    ticker,
    instrument_id: `US_${ticker}`,
    name,
    relation: "market",
    severity: "high",
    needs_you: false,
    tone: "up",
    headline: `${ticker} is up 20% today`,
    metric: "+20%",
    why,
    reason_status: "confirmed",
    next_step: "",
    spoken: "",
    evidence: [
      { label: "Price $10", source: "Market quote", url: null, at: null },
      { label: "A story", source: "Reuters", url: "https://example.com", at: null },
    ],
    as_of: null,
    deadline_days: null,
    price: 10,
    day_change_pct: 20,
    alert: null,
    href: `/stock/${ticker}`,
  } as BriefingItem;
}

function briefing(items: BriefingItem[]): Briefing {
  return {
    date: "2026-11-11",
    built_at: "2026-11-11T15:00:00Z",
    mode: "market",
    summary: "",
    needs_you: [],
    also_today: items,
    nothing_needs_you: true,
    quiet: { text: "", names: [] },
    market: {
      indices: [],
      gainers: [{ ticker: "SOXL", name: "SOXL", price: 10, day_change_pct: 22, reason: "Semiconductor rally drives SOXL higher", reason_status: "confirmed", as_of: null }],
      losers: [],
      as_of: null,
    },
    counts: { holdings: 0, watching: 0 },
    stale_note: null,
  };
}

describe("withoutCircularReasons", () => {
  it("turns a reason that only says the move again into no reason", () => {
    const out = withoutCircularReasons(briefing([move("SOXL", "Direxion Daily Semiconductor Bull 3X", "Semiconductor rally drives SOXL higher. Chip stocks rose."), move("CRWV", "CoreWeave", "CoreWeave raises its forecast as demand strengthens.")]));
    const [soxl, crwv] = out.also_today;
    expect(soxl!.reason_status).toBe("unconfirmed");
    expect(soxl!.why).toBe(NO_CONFIRMED_REASON);
    expect(soxl!.evidence.map((entry) => entry.source)).toEqual(["Market quote"]);
    expect(crwv!.reason_status).toBe("confirmed");
    expect(out.market.gainers[0]!.reason_status).toBe("unconfirmed");
  });

  it("returns the same briefing when every reason is real", () => {
    const input = briefing([move("CRWV", "CoreWeave", "CoreWeave raises its forecast.")]);
    input.market.gainers = [];
    expect(withoutCircularReasons(input)).toBe(input);
  });
});
