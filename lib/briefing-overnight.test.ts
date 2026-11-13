import { describe, expect, it } from "vitest";

import { overnightStrip } from "./briefing-overnight";
import { parseExtendedDoc, type ExtendedQuote } from "./extended-quotes";

const CLOSE = "2026-11-12T16:00:01-05:00";

function quote(ticker: string, pct: number, extra: Record<string, unknown> = {}): ExtendedQuote {
  return parseExtendedDoc({
    ticker,
    session: "post",
    price: 100 * (1 + pct / 100),
    change_pct: pct,
    regular_close: 100,
    regular_close_at: CLOSE,
    as_of: "2026-11-12T19:59:00-05:00",
    source: "Yahoo Finance",
    ...extra,
  })!;
}

const positions = [
  { ticker: "CBRS", name: "Cerebras Systems Inc.", relation: "holding" as const },
  { ticker: "MOD", name: "Modine Manufacturing Company", relation: "watching" as const },
  { ticker: "NVDA", name: "NVIDIA Corporation", relation: "holding" as const },
];

const quotes = new Map([
  ["CBRS", quote("CBRS", 18.34, { earnings: { date: "2026-11-12", session: "amc", confirmed: true, reason: "raised its outlook and revenue up 55% on a year ago" } })],
  ["MOD", quote("MOD", 27.43)],
  ["NVDA", quote("NVDA", 0.99)],
]);

describe("overnightStrip", () => {
  it("lists the big moves, biggest first, and says the session once", () => {
    const strip = overnightStrip(positions, quotes, Date.parse("2026-11-13T07:00:00-05:00"))!;
    expect(strip.title).toBe("Overnight");
    expect(strip.when).toBe("After hours, 7:59 PM ET yesterday");
    expect(strip.cards.map((card) => card.ticker)).toEqual(["MOD", "CBRS"]);
    expect(strip.cards[1]!.line).toBe("Reported after the close yesterday: raised its outlook");
    // A card without a report says nothing the heading does not already say.
    expect(strip.cards[0]!.line).toBeNull();
    expect(strip.dropAt).toBe(Date.parse("2026-11-13T09:30:00-05:00"));
  });

  it("is the evening's after hours before midnight", () => {
    const strip = overnightStrip(positions, quotes, Date.parse("2026-11-12T20:30:00-05:00"))!;
    expect(strip.title).toBe("After hours");
    expect(strip.when).toBe("7:59 PM ET");
  });

  it("is gone once the session opens, and leaves out stocks shown elsewhere", () => {
    expect(overnightStrip(positions, quotes, Date.parse("2026-11-13T09:31:00-05:00"))).toBeNull();
    const strip = overnightStrip(positions, quotes, Date.parse("2026-11-13T07:00:00-05:00"), new Set(["MOD"]))!;
    expect(strip.cards.map((card) => card.ticker)).toEqual(["CBRS"]);
  });

  it("names each card's session when the strip mixes them", () => {
    const pre = parseExtendedDoc({
      ticker: "NVDA",
      session: "pre",
      price: 106,
      change_pct: 6,
      regular_close: 100,
      regular_close_at: CLOSE,
      as_of: "2026-11-13T08:41:00-05:00",
    })!;
    const strip = overnightStrip(positions, new Map([...quotes, ["NVDA", pre]]), Date.parse("2026-11-13T08:50:00-05:00"))!;
    expect(strip.when).toBeNull();
    expect(strip.cards.find((card) => card.ticker === "NVDA")!.line).toBe("Pre-market, 8:41 AM ET");
  });

  it("returns null when nothing moved big", () => {
    expect(overnightStrip(positions, new Map([["NVDA", quote("NVDA", 2)]]), Date.parse("2026-11-13T07:00:00-05:00"))).toBeNull();
  });
});

describe("last evening's print", () => {
  it("does not borrow this morning's before-open report", () => {
    const now = Date.parse("2026-11-13T08:50:00-05:00");
    const quote = parseExtendedDoc({
      ticker: "CBRS",
      session: "pre",
      price: 101,
      change_pct: 1,
      regular_close: 100,
      regular_close_at: CLOSE,
      as_of: "2026-11-13T08:41:00-05:00",
      post: { session: "post", price: 106, change_pct: 6, regular_close: 100, regular_close_at: CLOSE, as_of: "2026-11-12T19:59:00-05:00" },
      earnings: { date: "2026-11-13", session: "bmo", confirmed: true, reason: "beat on earnings" },
    })!;
    const strip = overnightStrip(positions, new Map([["CBRS", quote]]), now)!;
    expect(strip.cards).toHaveLength(1);
    expect(strip.cards[0]).toMatchObject({ ticker: "CBRS", session: "post", pct: 6, line: null });
  });
});
