import { describe, expect, it } from "vitest";

import { rowPrices, showsMove } from "@/lib/inbox/prices";
import type { InboxItem } from "@/lib/inbox/types";
import type { LivePrice } from "@/lib/wire-prices";

const NOW = Date.parse("2026-11-12T21:00:00Z");

function item(ticker: string, extra: Partial<InboxItem> = {}): InboxItem {
  return {
    id: `move:${ticker}`,
    kind: "agent",
    at: "2026-11-12T21:00:00Z",
    day: "2026-11-12",
    exact: true,
    tickers: [ticker],
    text: `${ticker} fell 4.3% today.`,
    detail: null,
    href: `/stock/${ticker}`,
    external: false,
    source: "Your agent",
    tone: "down",
    quiet: false,
    locked: false,
    dedupeKey: "",
    weight: 0,
    thread: null,
    ...extra,
  };
}

describe("the inbox's stock prices", () => {
  const live = new Map<string, LivePrice>([
    ["NVDA", { price: 166.04, pct: -4.4, at: "2026-11-12T20:59:00Z" }],
    ["AMD", { price: 250.1, pct: 1.2, at: "2026-11-11T20:59:00Z" }],
    ["COHR", { price: 120, pct: 0.5, at: "2026-11-12T20:59:00Z" }],
  ]);

  it("prices each stock whose row reports a move, from the stock page's quote", () => {
    const prices = rowPrices(
      [
        item("NVDA", { move: { pct: -4.3, day: "2026-11-12", normalPct: 2 } }),
        item("COHR", { id: "filing:COHR", kind: "filing", text: "COHR's new 10-Q lists no new risks." }),
      ],
      live,
      NOW,
    );
    expect(prices).toEqual({ NVDA: { price: 166.04, day: null } });
  });

  it("says the day of an earlier session's quote, and leaves out a stock with no quote", () => {
    const prices = rowPrices(
      [
        item("AMD", { result: { headline: "", figures: "", movePct: 1, moveWords: null, call: null } }),
        item("SMCI", { move: { pct: -11.3, day: "2026-11-12", normalPct: 5 } }),
      ],
      live,
      NOW,
    );
    expect(prices).toEqual({ AMD: { price: 250.1, day: "yesterday" } });
  });

  it("counts a report's move as a move, and nothing else", () => {
    expect(showsMove({ move: null, result: { headline: "", figures: "", movePct: null, moveWords: null, call: null } })).toBe(false);
    expect(showsMove({ move: { pct: 1, day: "2026-11-12", normalPct: null } })).toBe(true);
  });
});
