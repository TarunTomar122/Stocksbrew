import { describe, expect, it } from "vitest";

import { compareBars, holdingsTotal, sessionPrices, TILE_HEADLINE, tileHeadline, tileMove, tileStories, topCovered } from "@/lib/og/rules";
import type { WireItem } from "@/lib/wire-shared";
import { fitsLines, textWidth } from "@/lib/og/text-width";
import { caseWireHeadlines } from "@/lib/wire-casing";

const NOW = new Date("2026-11-12T19:00:00Z");

describe("compare prices (sessionPrices)", () => {
  it("dates the card once when every price is from the same session", () => {
    const out = sessionPrices(
      [
        { price: 581.59, dayPct: 5.2, at: "2026-11-12T18:00:00Z" },
        { price: 363.83, dayPct: 5.4, at: "2026-11-12T18:05:00+00:00" },
      ],
      NOW,
    );
    expect(out.oneSession).toBe(true);
    expect(out.newestAt).toBe("2026-11-12T18:05:00+00:00");
    expect(out.columns.map((column) => column.dayLabel)).toEqual([null, null]);
  });

  it("gives every price its own day when the sessions differ", () => {
    const out = sessionPrices(
      [
        { price: 581.59, dayPct: 5.2, at: "2026-11-12T18:00:00Z" },
        { price: 345.45, dayPct: 4.1, at: "2026-11-11T20:59:00Z" },
      ],
      NOW,
    );
    expect(out.oneSession).toBe(false);
    expect(out.columns.map((column) => column.dayLabel)).toEqual(["Nov 12", "Nov 11"]);
  });

  it("leaves off an undated price instead of putting it under another price's time", () => {
    const out = sessionPrices(
      [
        { price: 581.59, dayPct: 5.2, at: "2026-11-12T18:00:00Z" },
        { price: 345.45, dayPct: 4.1, at: null },
      ],
      NOW,
    );
    expect(out.columns[1]).toEqual({ price: null, dayPct: null, dayLabel: null });
    expect(out.columns[0]!.price).toBe(581.59);
    expect(out.oneSession).toBe(true);
    expect(out.newestAt).toBe("2026-11-12T18:00:00Z");
  });
});

describe("news tiles", () => {
  it("shows the wire's own top three, in its order, with no threshold of its own", () => {
    const buzz = [
      { ticker: "SPCX", count: 120 },
      { ticker: "NVDA", count: 90 },
      { ticker: "AMD", count: 40 },
      { ticker: "MSFT", count: 30 },
    ];
    expect(topCovered(buzz).map((row) => row.ticker)).toEqual(["SPCX", "NVDA", "AMD"]);
    // A quiet day: the leaders have only a few stories each, and they are still the top three.
    const quiet = [
      { ticker: "A", count: 4 },
      { ticker: "B", count: 2 },
      { ticker: "C", count: 1 },
      { ticker: "D", count: 1 },
    ];
    expect(topCovered(quiet).map((row) => row.ticker)).toEqual(["A", "B", "C"]);
    expect(topCovered([{ ticker: "A", count: 1 }])).toHaveLength(1);
  });

  it("puts a headline on a tile only when it fits whole in one line, trying the next stories in order", () => {
    const long = "AI industry reassesses future without Jensen Huang at Nvidia";
    expect(tileHeadline([long, "Nvidia slides as CEO quits", "Another one"])).toBe("Nvidia slides as CEO quits");
    // An overlong headline never shows a part of itself, not even a full first sentence: the next story gets its turn.
    expect(tileHeadline(["AMD wins a huge order. Here is what it means for the chip race"])).toBeNull();
    expect(tileHeadline(["AMD wins a huge order. Here is what it means for the chip race", "AMD rallies on AI demand"])).toBe(
      "AMD rallies on AI demand",
    );
    expect(tileHeadline([long, "Nebius doesn’t have a demand problem"])).toBeNull();
    expect(tileHeadline([])).toBeNull();
    expect(tileHeadline(["Midday, Nov. 12: chip stocks rally as the Nasdaq climbs", "AMD rallies on AI demand"])).toBe("AMD rallies on AI demand");
  });

  it("never uses a headline the publisher already cut with an ellipsis", () => {
    expect(tileHeadline(["Why the chip rally…", "Is Nvidia a buy now..."])).toBeNull();
    expect(tileHeadline(["Why the chip rally …", "AMD rallies on AI demand"])).toBe("AMD rallies on AI demand");
    for (const title of ["Short one.", "Nvidia slides as CEO quits"]) expect(tileHeadline([title]) ?? "").not.toMatch(/(…|\.\.\.)$/);
  });

  it("measures the headline with the card's font, so wide letters cannot spill past one line", () => {
    expect(TILE_HEADLINE.lines).toBe(1);
    // Twenty characters of W and M are far wider than twenty ordinary ones: a character count would let them through.
    const wide = "WWWW MMMM WWWW MMMMM";
    expect(fitsLines(wide, TILE_HEADLINE)).toBe(false);
    expect(tileHeadline([wide])).toBeNull();
    expect(fitsLines("Nvidia slides as CEO quits", TILE_HEADLINE)).toBe(true);
    // What it accepts is no wider than the tile.
    const ok = tileHeadline(["Nvidia slides as CEO quits"])!;
    expect(textWidth(ok, TILE_HEADLINE.fontSize)).toBeLessThanOrEqual(TILE_HEADLINE.width);
    // A single word wider than the tile would be cut mid-word, so it never fits.
    expect(fitsLines("W".repeat(20), { ...TILE_HEADLINE, lines: 3 })).toBe(false);
    // Narrow letters fit more: the same count of i and l is well inside the line.
    expect(fitsLines("ill ill ill ill ill", TILE_HEADLINE)).toBe(true);
  });

  it("sentence-cases scraped title case before fitting, as the News page does", () => {
    const items = [
      { title: "Nvidia stock hammered as CEO Resigns in Disgrace", tickers: ["NVDA"] },
      { title: "Analysts say the chief resigns amid a disgrace that rattles the market", tickers: ["NVDA"] },
      { title: "Chip stocks slide as one boss resigns in disgrace", tickers: ["AMD"] },
    ];
    const cased = caseWireHeadlines(items, { NVDA: "NVIDIA Corporation", AMD: "Advanced Micro Devices" });
    // Measured on a two-line room here, so the casing is what is tested.
    expect(tileHeadline([cased[0]!.title], { ...TILE_HEADLINE, lines: 2 })).toBe("Nvidia stock hammered as CEO resigns in disgrace");
  });

  it("draws tile headlines only from the feed's own headlines, never a bait headline's excerpt", () => {
    const story = (id: string, title: string, excerpt = "", tickers = ["NVDA"]): WireItem =>
      ({ id, title, url: "", source: "Wire", sourceKind: "publisher", publishedAt: "2026-11-12T15:00:00Z", excerpt, excerptOrigin: "publisher", tickers }) as WireItem;
    const bait = story("b", "Dear Nvidia stock fans, mark your calendars", "Nvidia reports its third-quarter results on November 17 after the market closes.");
    const plain = story("p", "Nvidia slides as CEO quits");
    const other = story("o", "Apple ships a new phone", "", ["AAPL"]);
    const picked = tileStories("NVDA", bait, [bait, plain, other]);
    expect(picked.map((item) => item.id)).toEqual(["p"]);
    // The titles passed on are the feed's own, never the excerpt sentence.
    expect(picked.every((item) => item.title !== bait.excerpt)).toBe(true);
    expect(tileHeadline(picked.map((item) => item.title))).toBe("Nvidia slides as CEO quits");
    expect(tileStories("NVDA", bait, [bait])).toEqual([]);
  });

  it("shows a dash for a stock without a quote, never a made-up move", () => {
    expect(tileMove(null)).toEqual({ price: null, value: "—", tone: "flat" });
    expect(tileMove({ price: 165.07, dayPct: -4.99 })).toEqual({ price: "$165.07", value: "−5.0%", tone: "down" });
    expect(tileMove({ price: 165.07, dayPct: null }).value).toBe("—");
  });
});

describe("example portfolio total (holdingsTotal)", () => {
  const DAY = "2026-11-12";
  const holding = (value: number | null, dayMove: number | null = 10, day: string | null = DAY) => ({ value, dayMove, day });

  it("adds up the total and the day's change when every holding is priced in the session", () => {
    const out = holdingsTotal([holding(1000, 10), holding(2000, -40), holding(500, 5)], 3, DAY);
    expect(out).toMatchObject({ kind: "total", value: 3500, dayMove: -25 });
    if (out.kind === "total") expect(out.dayPct).toBeCloseTo((-25 / 3525) * 100, 6);
  });

  it("does not present a subtotal as the total when a holding failed to price", () => {
    expect(holdingsTotal([holding(1000), holding(2000)], 3, DAY)).toEqual({ kind: "partial", priced: 2, expected: 3 });
    expect(holdingsTotal([holding(1000), holding(null), holding(500)], 3, DAY)).toEqual({ kind: "partial", priced: 2, expected: 3 });
  });

  it("does not total prices from different days under one session", () => {
    expect(holdingsTotal([holding(1000), holding(2000, null, "2026-11-11"), holding(500)], 3, DAY)).toEqual({ kind: "partial", priced: 2, expected: 3 });
    expect(holdingsTotal([holding(1000), holding(2000, 10, null), holding(500)], 3, DAY)).toEqual({ kind: "partial", priced: 2, expected: 3 });
    expect(holdingsTotal([holding(1000), holding(500)], 2, null)).toEqual({ kind: "partial", priced: 0, expected: 2 });
  });

  it("drops the day's change when any holding's move is missing", () => {
    expect(holdingsTotal([holding(1000, 10), holding(2000, null)], 2, DAY)).toEqual({ kind: "total", value: 3000, dayMove: null, dayPct: null });
  });
});

describe("compare bars (compareBars)", () => {
  it("grows returns from a shared zero line and marks the highest", () => {
    const [up, down] = compareBars([132.8, -1.1], "signed");
    expect(up!.zero).toBeCloseTo(1.1 / 133.9, 6);
    expect(up).toMatchObject({ start: up!.zero, best: true });
    expect(up!.end).toBeCloseTo(1, 6);
    expect(down!.start).toBeCloseTo(0, 6);
    expect(down!.end).toBe(down!.zero);
    expect(down!.best).toBe(false);
  });

  it("draws P/E from the left edge with the lowest best, and skips what cannot compare", () => {
    expect(compareBars([29.9, 16.9], "lower")).toEqual([
      { start: 0, end: 1, zero: 0, best: false },
      { start: 0, end: 16.9 / 29.9, zero: 0, best: true },
    ]);
    expect(compareBars([29.9, null], "lower")).toEqual([null, null]);
    expect(compareBars([-5, 12], "lower")).toEqual([null, null]);
    expect(compareBars([10, 10], "signed").every((bar) => bar && !bar.best)).toBe(true);
  });
});
