import { describe, expect, it } from "vitest";

import { CLOSE_MARGIN, buildComparePick, wordCount, type ComparePick } from "@/lib/compare-pick";
import type { ScreenerRow } from "@/lib/screener-shared";

function row(symbol: string, fields: Partial<ScreenerRow> = {}): ScreenerRow {
  return {
    symbol,
    name: `${symbol} Inc.`,
    call: "Hold",
    rev_growth: 10,
    fwd_pe: 20,
    upside: 10,
    op_margin: 20,
    buy_pct: 70,
    s_momentum: 50,
    ret_1y: 10,
    vol_90d: 30,
    ...fields,
  } as ScreenerRow;
}

const SPY = { symbol: "SPY", ret_1y: 12.4 } as ScreenerRow;

/** Every line the card prints, with its word budget. */
function checkBudgets(pick: ComparePick) {
  expect(wordCount(pick.title)).toBeLessThanOrEqual(10);
  for (const reason of [...pick.reasons, ...pick.close.flatMap((item) => item.reasons)]) {
    expect(wordCount(reason.text)).toBeLessThanOrEqual(12);
    expect(reason.text).not.toMatch(/\bwill\b/i);
  }
  for (const place of pick.ranking) if (place.need) expect(wordCount(place.need)).toBeLessThanOrEqual(12);
  if (pick.loses) expect(wordCount(pick.loses)).toBeLessThanOrEqual(14);
  // Every need and loss prints both figures (a call need says the call instead).
  for (const line of [...pick.ranking.map((place) => place.need), pick.loses]) {
    if (line && !line.startsWith("Would need our call")) expect(line).toMatch(/ vs /);
  }
  // Green is the best of ALL the stocks: on a pick's reason that is the pick alone; on a close side, that side.
  for (const reason of pick.reasons) expect(reason.bars.filter((bar) => bar.lead).map((bar) => bar.symbol)).toEqual([pick.leader]);
  // A close side's line is a lead it holds alone: its bar is the only green one.
  for (const side of pick.close) for (const reason of side.reasons) expect(reason.bars.filter((bar) => bar.lead).map((bar) => bar.symbol)).toEqual([side.symbol]);
  // Only stocks outside the close group are told what they would need.
  for (const place of pick.ranking) if (pick.close.some((side) => side.symbol === place.symbol)) expect(place.need).toBeNull();
}

describe("buildComparePick", () => {
  it("is deterministic and does not depend on the order the stocks come in", () => {
    const a = row("AAA", { call: "Add", rev_growth: 40, fwd_pe: 18, upside: 30, op_margin: 35 });
    const b = row("BBB", { call: "Add", rev_growth: 20, fwd_pe: 25, upside: 12, op_margin: 15, ret_1y: 60 });
    const first = buildComparePick([a, b], SPY);
    expect(first).toEqual(buildComparePick([a, b], SPY));
    const flipped = buildComparePick([b, a], SPY)!;
    expect(flipped.leader).toBe(first!.leader);
    expect(flipped.ranking.map((place) => [place.symbol, place.score])).toEqual(first!.ranking.map((place) => [place.symbol, place.score]));
  });

  it("picks two stocks with figure-led reasons, where it loses and what the runner-up needs", () => {
    const pick = buildComparePick(
      [
        row("AMD", { call: "Add", rev_growth: 41.9, fwd_pe: 29.9, upside: 18.2, op_margin: 17.8, buy_pct: 84.9, s_momentum: 60.8, ret_1y: 132.8, vol_90d: 77.6 }),
        row("AVGO", { call: "Add", rev_growth: 48.7, fwd_pe: 16.9, upside: 51.6, op_margin: 48.8, buy_pct: 96.1, s_momentum: 52.8, ret_1y: -1.1, vol_90d: 46.7 }),
      ],
      SPY,
    )!;
    expect(pick.kind).toBe("pick");
    expect(pick.leader).toBe("AVGO");
    expect(pick.title).toBe("AVGO: faster growth at a lower P/E");
    expect(pick.reasons.map((reason) => reason.measure)).toEqual(["growth", "value", "upside"]);
    expect(pick.reasons[0]!.text).toBe("Sales growth +48.7% vs +41.9%");
    // A bar per stock in page order, the pick's highlighted.
    expect(pick.reasons[0]!.bars.map((bar) => [bar.symbol, bar.text, bar.lead])).toEqual([
      ["AMD", "+41.9%", false],
      ["AVGO", "+48.7%", true],
    ]);
    expect(pick.loses).toBe("AMD has a better past year, +132.8% vs −1.1%");
    expect(pick.ranking.map((place) => place.place)).toEqual([1, 2]);
    expect(pick.ranking[1]!.need).toBe("Would need faster sales growth, +41.9% vs +48.7%");
    checkBudgets(pick);
  });

  it("carries the S&P 500 on the 1-year return line and its bars", () => {
    const pick = buildComparePick(
      [row("AAA", { call: "Add", ret_1y: 40, rev_growth: 30 }), row("BBB", { call: "Hold", ret_1y: 5, rev_growth: 10 })],
      SPY,
    )!;
    const year = pick.reasons.find((reason) => reason.measure === "year")!;
    expect(year.text).toBe("1-year return +40.0% vs +5.0%, S&P 500 +12.4%");
    expect(year.mark).toEqual({ label: "S&P 500", value: 12.4, text: "+12.4%" });
  });

  describe("the call rule", () => {
    // The Sell some leads on every measure but one, by enough that the weights alone would put it first.
    const trim = row("TRM", { call: "Trim", rev_growth: 60, fwd_pe: 12, upside: 50, op_margin: 50, buy_pct: 95, s_momentum: 90, ret_1y: 80, vol_90d: 30 });
    const add = row("ADD", { call: "Add", rev_growth: 5, fwd_pe: 40, upside: 2, op_margin: 5, buy_pct: 40, s_momentum: 20, ret_1y: -20, vol_90d: 25 });

    it("never picks a Sell some over a Buy more it does not beat on every other measure", () => {
      const pick = buildComparePick([trim, add])!;
      // By the weights alone the Sell some is ahead...
      expect(pick.ranking.find((place) => place.symbol === "TRM")!.score).toBeGreaterThan(pick.ranking.find((place) => place.symbol === "ADD")!.score);
      // ...but the Buy more is the pick, and it is not called "too close".
      expect(pick.kind).toBe("pick");
      expect(pick.leader).toBe("ADD");
      expect(pick.callRuled).toBe(true);
      expect(pick.title).toBe("ADD: our only Buy more, with a steadier price");
      expect(pick.ranking[1]!.symbol).toBe("TRM");
    });

    it("lets a Sell some through only when it is clearly ahead on every other measure", () => {
      const pick = buildComparePick([{ ...trim, vol_90d: 20 }, add])!;
      expect(pick.leader).toBe("TRM");
      expect(pick.callRuled).toBe(false);
    });

    it("keeps a Buy more above a Sell some further down the order too", () => {
      const keep = row("KEP", { call: "Hold", rev_growth: 30, fwd_pe: 20, upside: 20, op_margin: 30, buy_pct: 80, s_momentum: 60, ret_1y: 20, vol_90d: 28 });
      const pick = buildComparePick([trim, keep, add])!;
      const order = pick.ranking.map((place) => place.symbol);
      expect(order.indexOf("ADD")).toBeLessThan(order.indexOf("TRM"));
    });
  });

  it("says too close to call when the top two are within the margin, with what each leads on", () => {
    const pick = buildComparePick([
      row("VVV", { call: "Hold", op_margin: 66, ret_1y: 27, upside: 20 }),
      row("MMM", { call: "Add", op_margin: 60, ret_1y: 19 }),
    ])!;
    expect(pick.kind).toBe("close");
    expect(pick.title).toBe("Too close to call");
    const [top, next] = pick.ranking;
    expect(Math.abs(top!.score - next!.score)).toBeLessThanOrEqual(CLOSE_MARGIN);
    expect(pick.reasons).toEqual([]);
    expect(pick.loses).toBeNull();
    expect(pick.close.map((item) => item.symbol).sort()).toEqual(["MMM", "VVV"]);
    expect(pick.close.find((item) => item.symbol === "MMM")!.reasons.map((reason) => reason.text)).toEqual(["Our call: Buy more vs Keep"]);
    expect(pick.close.find((item) => item.symbol === "VVV")!.reasons.map((reason) => reason.measure)).toEqual(["upside", "margin"]);
    // The close two have nothing they would need.
    expect(pick.ranking.every((place) => place.need === null)).toBe(true);
    checkBudgets(pick);
  });

  it("treats figures inside the noise band as a tie, never as a reason", () => {
    const pick = buildComparePick([
      row("AAA", { call: "Add", rev_growth: 20.5 }),
      row("BBB", { call: "Hold", rev_growth: 20 }),
    ])!;
    expect(pick.leader).toBe("AAA");
    expect(pick.reasons).toEqual([]);
    expect(pick.title).toBe("AAA: our only Buy more of these");
    expect(pick.loses).toBeNull();
    expect(pick.ranking[1]!.need).toBe("Would need our call to move up from Keep");
  });

  describe("thin data", () => {
    it("shows nothing with fewer than four measures every stock has", () => {
      const thin = (symbol: string, growth: number) =>
        ({ symbol, call: "Add", rev_growth: growth, op_margin: 20 }) as ScreenerRow;
      expect(buildComparePick([thin("AAA", 30), thin("BBB", 10)])).toBeNull();
      // A fourth measure only one of them has does not count.
      expect(buildComparePick([{ ...thin("AAA", 30), buy_pct: 80 }, thin("BBB", 10)])).toBeNull();
      expect(buildComparePick([{ ...thin("AAA", 30), buy_pct: 80 }, { ...thin("BBB", 10), buy_pct: 60 }])).not.toBeNull();
    });

    it("shows nothing for an uncovered stock or a single stock", () => {
      expect(buildComparePick([row("AAA"), null])).toBeNull();
      expect(buildComparePick([row("AAA")])).toBeNull();
      expect(buildComparePick([])).toBeNull();
    });

    it("drops a measure a loss-maker has no figure for, without dropping the pick", () => {
      const pick = buildComparePick([row("AAA", { call: "Add", rev_growth: 30 }), row("BBB", { fwd_pe: undefined })])!;
      expect(pick.measures).not.toContain("value");
      expect(pick.leader).toBe("AAA");
    });
  });

  it("ranks three stocks and names the other stock on each line", () => {
    const pick = buildComparePick(
      [
        row("AMD", { call: "Add", rev_growth: 41.9, fwd_pe: 29.9, upside: 18.2, op_margin: 17.8, buy_pct: 84.9, s_momentum: 60.8, ret_1y: 132.8, vol_90d: 77.6 }),
        row("AVGO", { call: "Add", rev_growth: 48.7, fwd_pe: 16.9, upside: 51.6, op_margin: 48.8, buy_pct: 96.1, s_momentum: 52.8, ret_1y: -1.1, vol_90d: 46.7 }),
        row("TSM", { call: "Add", rev_growth: 36.2, fwd_pe: 17.8, upside: 37.9, op_margin: 58, buy_pct: 95.2, s_momentum: 73.2, ret_1y: 43.4, vol_90d: 41.3 }),
      ],
      SPY,
    )!;
    expect(pick.kind).toBe("pick");
    expect(pick.leader).toBe("AVGO");
    expect(pick.ranking.map((place) => place.symbol)).toEqual(["AVGO", "TSM", "AMD"]);
    expect(pick.reasons[0]!.text).toBe("Sales growth +48.7% vs AMD +41.9%");
    expect(pick.reasons.every((reason) => reason.bars.length === 3)).toBe(true);
    expect(pick.ranking.slice(1).every((place) => place.need)).toBe(true);
    checkBudgets(pick);
  });

  it("ranks four stocks, scores between 0 and 100 in descending order unless the call rule moved one", () => {
    const pick = buildComparePick(
      [
        row("INTC", { call: "Add", rev_growth: 12.1, fwd_pe: 40.4, upside: 46.6, op_margin: 10.3, buy_pct: 26.5, s_momentum: 73.8, ret_1y: 65, vol_90d: 90.6 }),
        row("AVGO", { call: "Add", rev_growth: 48.7, fwd_pe: 16.9, upside: 51.6, op_margin: 48.8, buy_pct: 96.1, s_momentum: 52.8, ret_1y: -1.1, vol_90d: 46.7 }),
        row("NVDA", { call: "Hold", rev_growth: 83.4, fwd_pe: 15.4, upside: 85.5, op_margin: 65.2, buy_pct: 95.2, s_momentum: 57.1, ret_1y: -9.8, vol_90d: 42.2 }),
        row("TSM", { call: "Add", rev_growth: 36.2, fwd_pe: 17.8, upside: 37.9, op_margin: 58, buy_pct: 95.2, s_momentum: 73.2, ret_1y: 43.4, vol_90d: 41.3 }),
      ],
      SPY,
    )!;
    expect(pick.ranking).toHaveLength(4);
    expect(pick.ranking.map((place) => place.place)).toEqual([1, 2, 3, 4]);
    for (const place of pick.ranking) {
      expect(place.score).toBeGreaterThanOrEqual(0);
      expect(place.score).toBeLessThanOrEqual(100);
    }
    const scores = pick.ranking.map((place) => place.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(pick.ranking[3]!.symbol).toBe("INTC");
    checkBudgets(pick);
  });

  it("does not count shrinking sales as cheap for its growth", () => {
    const pick = buildComparePick([
      row("GROW", { rev_growth: 20, fwd_pe: 30 }),
      row("SHRK", { rev_growth: -5, fwd_pe: 8 }),
    ])!;
    // GROW pays 1.5× per point of growth; SHRK has none to pay for, so GROW leads on price for growth.
    expect(pick.leader).toBe("GROW");
    expect(pick.reasons.map((reason) => reason.measure)).toContain("value");
  });
  describe("found in the quality pass", () => {
    it("never sets a reason against a stock that is ahead of the pick", () => {
      const pick = buildComparePick([
        row("LDR", { call: "Add", rev_growth: 30, upside: 30, op_margin: 30 }),
        row("SEC", { rev_growth: 10, upside: 10, op_margin: 10 }),
        row("THR", { rev_growth: 60, upside: 5, op_margin: 5, buy_pct: 40 }),
      ])!;
      expect(pick.leader).toBe("LDR");
      for (const reason of pick.reasons) {
        const lead = reason.bars.find((bar) => bar.lead)!;
        const named = pick.ranking.map((place) => place.symbol).find((symbol) => symbol !== "LDR" && reason.text.includes(`vs ${symbol} `));
        if (named) expect(reason.bars.find((bar) => bar.symbol === named)!.text).not.toBe(lead.text);
      }
      // Only what LDR is best of all three on: not growth (THR is ahead), not buy ratings (a tie with SEC).
      expect(pick.reasons.map((reason) => reason.measure)).toEqual(["upside", "margin"]);
      expect(pick.reasons[0]!.text).toBe("+30.0% to the average analyst target, vs SEC +10.0%");
    });

    it("titles a pick that only the call rule put first by its call", () => {
      const strong = { rev_growth: 60, fwd_pe: 12, upside: 50, op_margin: 50, buy_pct: 95, s_momentum: 90, ret_1y: 80, vol_90d: 30 };
      const weak = { rev_growth: 5, fwd_pe: 40, upside: 2, op_margin: 5, buy_pct: 40, s_momentum: 20, ret_1y: -20, vol_90d: 30 };
      const pick = buildComparePick([row("TRM", { call: "Trim", ...strong }), row("AD1", { call: "Add", ...weak }), row("AD2", { call: "Add", ...weak, vol_90d: 60 })])!;
      expect(pick.leader).toBe("AD1");
      expect(pick.callRuled).toBe(true);
      expect(pick.title).toBe("AD1: our Buy more call, over TRM's Sell some");
    });

    it("never calls a Buy more against a Sell some too close", () => {
      const pick = buildComparePick([
        row("ADD", { call: "Add", rev_growth: 10, upside: 5 }),
        row("TRM", { call: "Trim", rev_growth: 30, upside: 20, op_margin: 30, buy_pct: 90 }),
      ])!;
      expect(pick.kind).toBe("pick");
      expect(pick.leader).toBe("ADD");
    });

    it("keeps the call rule when one stock has no call", () => {
      const pick = buildComparePick([
        row("TRM", { call: "Trim", rev_growth: 60, fwd_pe: 12, upside: 50, op_margin: 50, buy_pct: 95, s_momentum: 90, ret_1y: 80 }),
        row("ADD", { call: "Add", rev_growth: 5, fwd_pe: 40, upside: 2, op_margin: 5, buy_pct: 40, s_momentum: 20, ret_1y: -20 }),
        row("NOC", { call: undefined }),
      ])!;
      expect(pick.measures).not.toContain("call");
      const order = pick.ranking.map((place) => place.symbol);
      expect(order.indexOf("ADD")).toBeLessThan(order.indexOf("TRM"));
    });

    it("lets the better-scoring Buy more lead when the call rule holds a Sell some back", () => {
      const pick = buildComparePick([
        row("TRM", { call: "Trim", rev_growth: 60, fwd_pe: 12, upside: 50, op_margin: 50, buy_pct: 95, s_momentum: 90, ret_1y: 80, vol_90d: 30 }),
        row("AD1", { call: "Add", rev_growth: 30, fwd_pe: 20, upside: 20, op_margin: 30, buy_pct: 70, s_momentum: 60, ret_1y: 20, vol_90d: 40 }),
        row("AD2", { call: "Add", rev_growth: 5, fwd_pe: 40, upside: 2, op_margin: 5, buy_pct: 40, s_momentum: 20, ret_1y: -20, vol_90d: 25 }),
      ])!;
      expect(pick.ranking.map((place) => place.symbol)).toEqual(["AD1", "AD2", "TRM"]);
    });

    it("skips a lead whose printed figures read the same, and treats tiny growth as none", () => {
      const pick = buildComparePick([row("AAA", { call: "Add", rev_growth: 0.9 }), row("BBB", { rev_growth: 0.6 })])!;
      expect(pick.reasons.map((reason) => reason.text)).not.toContain("Forward P/E 20× on +1% growth, vs 20× on +1%");
      expect(pick.measures).toContain("value");
    });

    it("shows no card when a tie leaves nothing either side leads on", () => {
      expect(buildComparePick([row("AAA"), row("BBB")])).toBeNull();
    });

    it("never gives two runner-ups the same sentence", () => {
      const pick = buildComparePick([
        row("LDR", { call: "Add", rev_growth: 40, upside: 40 }),
        row("SEC", { rev_growth: 10, upside: 10 }),
        row("THR", { rev_growth: 10, upside: 10, s_momentum: 52 }),
      ])!;
      const needs = pick.ranking.slice(1).map((place) => place.need).filter(Boolean);
      expect(new Set(needs).size).toBe(needs.length);
    });
  });
  describe("council review", () => {
    // INTC, AVGO, NVDA and TSM as on the page on Nov 12.
    const four = [
      row("INTC", { call: "Add", rev_growth: 12.1, fwd_pe: 40.4, upside: 46.6, op_margin: 10.3, buy_pct: 26.5, s_momentum: 73.8, ret_1y: 65, vol_90d: 90.6 }),
      row("AVGO", { call: "Add", rev_growth: 48.7, fwd_pe: 16.9, upside: 51.6, op_margin: 48.8, buy_pct: 96.1, s_momentum: 52.8, ret_1y: -1.1, vol_90d: 46.7 }),
      row("NVDA", { call: "Hold", rev_growth: 83.4, fwd_pe: 15.4, upside: 85.5, op_margin: 65.2, buy_pct: 95.2, s_momentum: 57.1, ret_1y: -9.8, vol_90d: 42.2 }),
      row("TSM", { call: "Add", rev_growth: 36.2, fwd_pe: 17.8, upside: 37.9, op_margin: 58, buy_pct: 95.2, s_momentum: 73.2, ret_1y: 43.4, vol_90d: 41.3 }),
    ];

    it("never greens a stock other stocks beat: AVGO's −1.1% year is not a lead when INTC and TSM are far ahead", () => {
      const pick = buildComparePick(four, SPY)!;
      expect(pick.kind).toBe("close");
      const avgo = pick.close.find((side) => side.symbol === "AVGO")!;
      expect(avgo.reasons.map((reason) => reason.measure)).not.toContain("year");
      for (const side of pick.close) {
        for (const reason of side.reasons) {
          const leads = reason.bars.filter((bar) => bar.lead).map((bar) => bar.symbol);
          expect(leads).toContain(side.symbol);
        }
      }
      checkBudgets(pick);
    });

    it("draws price for growth as P/E per point of growth and greens the lowest", () => {
      const pick = buildComparePick([
        row("JPM", { call: "Add", rev_growth: 14.06, fwd_pe: 13.34 }),
        row("BAC", { call: "Trim", rev_growth: 6.14, fwd_pe: 9.89 }),
      ])!;
      const value = pick.reasons.find((reason) => reason.measure === "value")!;
      expect(value.text).toBe("Forward P/E per point of sales growth 0.95 vs 1.61");
      expect(value.bars.map((bar) => [bar.symbol, bar.text, bar.lead])).toEqual([
        ["JPM", "0.95", true],
        ["BAC", "1.61", false],
      ]);
      expect(value.bars[0]!.value!).toBeLessThan(value.bars[1]!.value!);
    });

    it("shows no bar for a stock with no growth to pay for", () => {
      const pick = buildComparePick([row("AAA", { call: "Add", rev_growth: 20 }), row("BBB", { rev_growth: -4 })])!;
      const value = pick.reasons.find((reason) => reason.measure === "value")!;
      expect(value.bars[1]).toMatchObject({ symbol: "BBB", value: null, text: "no growth", lead: false });
    });

    it("says 'at a lower P/E' only when the pick's P/E is the lowest of all", () => {
      const base = { call: "Add" as const, rev_growth: 60, fwd_pe: 18 };
      const lowest = buildComparePick([row("AAA", base), row("BBB", { rev_growth: 10, fwd_pe: 25 }), row("CCC", { rev_growth: 12, fwd_pe: 22 })])!;
      expect(lowest.title).toBe("AAA: our only Buy more, with faster sales growth");
      const notLowest = buildComparePick([row("AAA", { ...base, call: "Hold" }), row("BBB", { call: "Hold", rev_growth: 10, fwd_pe: 25 }), row("CCC", { call: "Hold", rev_growth: 8, fwd_pe: 12 })])!;
      expect(notLowest.leader).toBe("AAA");
      expect(notLowest.title).not.toMatch(/lower P\/E$/);
      const allLower = buildComparePick([row("AAA", { ...base, call: "Hold" }), row("BBB", { call: "Hold", rev_growth: 10, fwd_pe: 25 }), row("CCC", { call: "Hold", rev_growth: 8, fwd_pe: 22 })])!;
      expect(allLower.title).toBe("AAA: faster growth at a lower P/E");
    });

    it("calls a shown gap of 5 points or less too close, and only that (seeded random sets of 2 to 4)", () => {
      let seed = 7;
      const next = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      const calls = ["Add", "Hold", "Trim"] as const;
      let sawFive = false;
      for (let trial = 0; trial < 3000; trial += 1) {
        const n = 2 + Math.floor(next() * 3);
        const set = Array.from({ length: n }, (_, i) =>
          row(`S${i}`, {
            call: calls[Math.floor(next() * 3)],
            rev_growth: Math.round(next() * 60 - 10),
            fwd_pe: 5 + Math.round(next() * 40),
            upside: Math.round(next() * 60 - 10),
            op_margin: Math.round(next() * 60 - 10),
            buy_pct: Math.round(next() * 100),
            s_momentum: Math.round(next() * 100),
            ret_1y: Math.round(next() * 120 - 40),
            vol_90d: 15 + Math.round(next() * 70),
          }),
        );
        const pick = buildComparePick(set, SPY);
        if (!pick) continue;
        checkBudgets(pick);
        const [a, b] = pick.ranking;
        const split = [a!.call, b!.call].includes("Add") && [a!.call, b!.call].includes("Trim");
        const gapShown = Math.abs(a!.score - b!.score);
        if (gapShown === 5 && !split) sawFive = true;
        expect(pick.kind === "close").toBe(!split && gapShown <= CLOSE_MARGIN);
        if (pick.kind === "close") {
          // The group is the run from the top within the margin of the leader's shown score.
          const inGroup = pick.ranking.filter((place) => pick.close.some((side) => side.symbol === place.symbol));
          expect(inGroup.map((place) => place.place)).toEqual(inGroup.map((_, i) => i + 1));
          for (const place of inGroup) expect(a!.score - place.score).toBeLessThanOrEqual(CLOSE_MARGIN);
          const next = pick.ranking[inGroup.length];
          if (next && a!.score - next.score <= CLOSE_MARGIN) expect(inGroup.some((place) => [place.call, next.call].includes("Add") && [place.call, next.call].includes("Trim"))).toBe(true);
          expect(pick.close.reduce((sum, side) => sum + side.reasons.length, 0)).toBeLessThanOrEqual(4);
        }
      }
      expect(sawFive).toBe(true);
    });
  });
  describe("council review, round 3", () => {
    const four = [
      row("INTC", { call: "Add", rev_growth: 12.1, fwd_pe: 40.4, upside: 46.6, op_margin: 10.3, buy_pct: 26.5, s_momentum: 73.8, ret_1y: 65, vol_90d: 90.6 }),
      row("AVGO", { call: "Add", rev_growth: 48.7, fwd_pe: 16.9, upside: 51.6, op_margin: 48.8, buy_pct: 96.1, s_momentum: 52.8, ret_1y: -1.1, vol_90d: 46.7 }),
      row("NVDA", { call: "Hold", rev_growth: 83.4, fwd_pe: 15.4, upside: 85.5, op_margin: 65.2, buy_pct: 95.2, s_momentum: 57.1, ret_1y: -9.8, vol_90d: 42.2 }),
      row("TSM", { call: "Add", rev_growth: 36.2, fwd_pe: 17.8, upside: 37.9, op_margin: 58, buy_pct: 95.2, s_momentum: 73.2, ret_1y: 43.4, vol_90d: 41.3 }),
    ];

    it("puts every stock within 5 shown points of the leader in the too-close group", () => {
      const pick = buildComparePick(four, SPY)!;
      expect(pick.kind).toBe("close");
      expect(pick.ranking.map((place) => [place.symbol, place.score])).toEqual([
        ["NVDA", 56],
        ["AVGO", 55],
        ["TSM", 54],
        ["INTC", 35],
      ]);
      expect(pick.close.map((side) => side.symbol)).toEqual(["NVDA", "AVGO", "TSM"]);
      // Only INTC, clearly outside the group, gets a "would need" line.
      expect(pick.ranking.map((place) => place.need !== null)).toEqual([false, false, false, true]);
      checkBudgets(pick);
    });

    it("never shows a figure several stocks share as one stock's lead", () => {
      const pick = buildComparePick(four, SPY)!;
      // AVGO's Buy more is shared with INTC and TSM, so it is no one's lead, and AVGO leads nothing on its own here.
      for (const side of pick.close) expect(side.reasons.map((reason) => reason.measure)).not.toContain("call");
      expect(pick.close.find((side) => side.symbol === "AVGO")!.reasons).toEqual([]);
      // TSM's 73 price trend is within the noise band of INTC's 74, so it is not TSM's lead either.
      expect(pick.close.find((side) => side.symbol === "TSM")!.reasons.map((reason) => reason.measure)).not.toContain("trend");
    });

    it("lets a call lead only when the stock holds it alone", () => {
      const close = (calls: Array<"Add" | "Hold">) =>
        buildComparePick([
          row("AAA", { call: calls[0], op_margin: 30 }),
          row("BBB", { call: calls[1], upside: 25 }),
          row("CCC", { call: calls[2], ret_1y: 20, rev_growth: 13 }),
        ]);
      const shared = close(["Add", "Add", "Hold"])!;
      for (const side of shared.close) expect(side.reasons.map((reason) => reason.measure)).not.toContain("call");
      for (const reason of shared.reasons) expect(reason.measure).not.toBe("call");
    });
  });
});
