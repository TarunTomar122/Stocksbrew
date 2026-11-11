import { describe, expect, it } from "vitest";

import { buildMemo, ruleTopLine } from "./build";
import { buildFacts, callFlip, money, pct, weekdaysBetween, weekPerformance } from "./facts";
import type { DailySeries, MemoHolding, MemoInputs } from "./types";
import { addDays, memoWeekFor, mondayOfKey, weekKey } from "./week";
import { applyWording, evidenceFor, keepSupported, rejectSentence, unsupportedNumber, wordingPayload } from "./word";

/* ── fixtures ───────────────────────────────────────────────────────────── */

const DAYS = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"];

function series(closes: number[]): DailySeries {
  return { dates: DAYS.slice(0, closes.length), closes };
}

const HOLDINGS: MemoHolding[] = [
  { ticker: "NVDA", name: "NVIDIA", instrumentId: "US_NVDA", units: 10, fund: false, covered: true },
  { ticker: "AAPL", name: "Apple", instrumentId: "US_AAPL", units: 10, fund: false, covered: false },
  { ticker: "JPM", name: "JPMorgan Chase", instrumentId: "US_JPM", units: 10, fund: false, covered: true },
];

function inputs(overrides: Partial<MemoInputs> = {}): MemoInputs {
  return {
    // Nov 9 to Nov 13, with closes through Tuesday Nov 10.
    week: memoWeekFor("2026-11-10", "2026-11-11"),
    today: "2026-11-11",
    subject: "mine",
    holdings: HOLDINGS,
    series: new Map([
      // Friday Nov 6 close, then Mon and Tue.
      ["NVDA", series([100, 100, 100, 100, 100, 110, 110])],
      ["AAPL", series([100, 100, 100, 100, 100, 100, 95])],
      ["JPM", series([100, 100, 100, 100, 100, 100, 100])],
    ]),
    benchmark: series([500, 500, 500, 500, 500, 505, 505]),
    calls: [],
    moves: [],
    reports: [],
    upcoming: [],
    funds: [],
    insiders: [],
    congress: [],
    exposure: null,
    dividends: [],
    stress: null,
    ...overrides,
  };
}

/* ── week ───────────────────────────────────────────────────────────────── */

describe("memo week", () => {
  it("keys weeks the ISO way and round-trips the Monday", () => {
    expect(weekKey("2026-11-11")).toBe("2026-46");
    expect(mondayOfKey("2026-46")).toBe("2026-11-09");
    // The first ISO week of 2027 starts on Monday Jan 4.
    expect(weekKey("2027-01-01")).toBe("2026-53");
    expect(weekKey("2027-01-04")).toBe("2027-01");
    expect(mondayOfKey("2026-99")).toBeNull();
    expect(mondayOfKey("nope")).toBeNull();
  });

  it("is in progress mid-week and complete after Friday", () => {
    expect(memoWeekFor("2026-11-10", "2026-11-11").complete).toBe(false);
    expect(memoWeekFor("2026-11-13", "2026-11-13").complete).toBe(true);
    // Friday was a holiday: the Thursday close ends the week once Saturday comes.
    expect(memoWeekFor("2026-11-26", "2026-11-28").complete).toBe(true);
    // Before Monday's close the newest close is Friday's, so the memo is last week's.
    expect(memoWeekFor("2026-11-06", "2026-11-09").key).toBe("2026-45");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

/* ── performance ────────────────────────────────────────────────────────── */

describe("weekPerformance", () => {
  it("measures from the last close before Monday, value-weighted, against the S&P 500", () => {
    const perf = weekPerformance(inputs())!;
    expect(perf.from).toBe("2026-11-06");
    expect(perf.to).toBe("2026-11-10");
    // 1000 + 1000 + 1000 -> 1100 + 950 + 1000
    expect(perf.portfolioPct).toBeCloseTo(1.67, 2);
    expect(perf.marketPct).toBeCloseTo(1, 5);
    const nvda = perf.moves.find((move) => move.ticker === "NVDA")!;
    expect(nvda.contribution).toBeCloseTo(3.33, 2);
  });

  it("uses equal starting amounts when no holding has a share count", () => {
    const perf = weekPerformance(inputs({ holdings: HOLDINGS.map((holding) => ({ ...holding, units: null })) }))!;
    expect(perf.basis).toBe("equal");
    expect(perf.portfolioPct).toBeCloseTo((10 - 5 + 0) / 3, 2);
  });

  it("leaves out a holding whose closes stop before the week, and gives up below two", () => {
    const stale = inputs({ series: new Map([["NVDA", series([100, 100, 100, 100, 100])], ["AAPL", series([100, 100, 100, 100, 100, 100, 95])]]) });
    expect(weekPerformance(stale)).toBeNull();
  });
});

/* ── facts and the memo ─────────────────────────────────────────────────── */

describe("buildFacts", () => {
  it("names the driver and the drag, the week's direction first", () => {
    const { facts } = buildFacts(inputs());
    const drivers = facts.find((fact) => fact.kind === "drivers")!;
    expect(drivers.text).toBe("NVIDIA added the most: it rose 10%, worth 3.3 points of the week's move. Apple cost the most: it fell 5.0%, costing 1.7 points.");
  });

  it("groups calls that moved the same way, and gives the reason only on a covered stock", () => {
    const { facts, heldBack } = buildFacts(
      inputs({
        calls: [
          { ticker: "NVDA", date: "2026-11-09", from: "Hold", to: "Trim", text: "The stock has run ahead of what its earnings support for now." },
          { ticker: "AAPL", date: "2026-11-10", from: "Hold", to: "Trim", text: "Services growth slowed for a second quarter in a row." },
        ],
      }),
    );
    const grouped = facts.find((fact) => fact.kind === "call")!;
    expect(grouped.section).toBe("hurt");
    expect(grouped.text).toBe('Our call moved to "Sell some" on two of your holdings this week: NVIDIA (from "Keep") and Apple (from "Keep").');
    // A group gives no reasons to anyone, so nothing is held back.
    expect(heldBack).toBe(0);

    const uncovered = buildFacts(inputs({ calls: [{ ticker: "AAPL", date: "2026-11-10", from: "Hold", to: "Trim", text: "Services growth slowed for a second quarter in a row." }] }));
    expect(uncovered.facts.find((fact) => fact.kind === "call")!.text).toBe('Our call on Apple moved from "Keep" to "Sell some" on Tuesday, Nov 10.');
    expect(uncovered.heldBack).toBe(1);

    const single = buildFacts(inputs({ calls: [{ ticker: "NVDA", date: "2026-11-09", from: "Hold", to: "Add", text: "Data-center sales grew faster than the market expected." }] }));
    const fact = single.facts.find((row) => row.kind === "call")!;
    expect(fact.section).toBe("look");
    expect(fact.text).toContain('Our call on NVIDIA moved from "Keep" to "Buy more" on Monday, Nov 9.');
    expect(fact.text).toContain("Data-center sales grew");
  });

  it("drops a call that changed and changed back inside the week", () => {
    const { facts } = buildFacts(
      inputs({
        calls: [
          { ticker: "JPM", date: "2026-11-09", from: "Hold", to: "Add", text: null },
          { ticker: "JPM", date: "2026-11-10", from: "Add", to: "Hold", text: null },
        ],
      }),
    );
    expect(facts.some((fact) => fact.kind === "call")).toBe(false);
  });

  it("flags heavy insider selling and a big holding reporting soon, and nothing below the thresholds", () => {
    const { facts } = buildFacts(
      inputs({
        insiders: [
          { ticker: "NVDA", insider: "A", action: "sell", valueUsd: 12_000_000, planned: true, filedDate: "2026-11-10" },
          { ticker: "AAPL", insider: "B", action: "sell", valueUsd: 2_000_000, planned: false, filedDate: "2026-11-10" },
        ],
        upcoming: [{ ticker: "NVDA", date: "2026-11-19", time: "amc", typicalAbsPct: 6.4 }],
      }),
    );
    const sell = facts.find((fact) => fact.id === "insider_sell:NVDA")!;
    expect(sell.text).toBe("NVIDIA insiders sold $12.0 million of stock in Form 4s filed this week. $12.0 million of it was under trading plans set in advance.");
    expect(facts.some((fact) => fact.id === "insider_sell:AAPL")).toBe(false);
    const risk = facts.find((fact) => fact.kind === "upcoming_risk")!;
    expect(risk.section).toBe("hurt");
    expect(risk.text).toContain("Its shares have moved about 6.4% on a typical report day.");
  });

  it("formats figures the same way everywhere", () => {
    expect(pct(-2.345)).toBe("2.3%");
    expect(pct(12.6)).toBe("13%");
    expect(money(24_100_000)).toBe("$24.1 million");
    expect(money(42.5)).toBe("$42.50");
    expect(money(15_001)).toBe("$15,001");
  });
});

describe("buildMemo", () => {
  it("writes an honest quiet week", () => {
    const { memo } = buildMemo(inputs(), new Date("2026-11-11T15:00:00Z"));
    expect(memo.topLine).toBe(
      "Your holdings are up 1.7% so far this week, ahead of the S&P 500's 1.0% rise, with NVIDIA doing the most to lift it. Nothing else changed: no call changes, explained moves, earnings reports or filings in your stocks.",
    );
    expect(memo.hurt).toEqual([]);
    expect(memo.look).toEqual([]);
    // The week's return is the top line; "What changed" does not repeat it.
    expect(memo.changed.map((item) => item.kind)).toEqual(["drivers"]);
  });

  it("says the example portfolio in the singular", () => {
    const { memo } = buildMemo(inputs({ subject: "example" }));
    expect(memo.topLine.startsWith("The example portfolio is up 1.7% so far this week")).toBe(true);
    expect(buildFacts(inputs({ subject: "example" })).facts.find((fact) => fact.kind === "performance")!.linkLabel).toBe("The example portfolio");
  });

  it("leads the second sentence with the risk when there is one", () => {
    const { memo } = buildMemo(
      inputs({ exposure: { company: null, sector: { sector: "Technology", pct: 56, benchmarkPct: 37 }, asOf: "2026-09-30" } }),
    );
    expect(memo.topLine.endsWith("The thing to watch is that Technology is 56% of the portfolio.")).toBe(true);
    expect(memo.hurt[0]!.href).toBe("/portfolio/xray");
  });

  it("says so when the week cannot be priced", () => {
    const top = ruleTopLine({ subject: "mine", week: memoWeekFor("2026-11-10", "2026-11-11") }, null, { changed: [], hurt: [], look: [] });
    expect(top).toBe(
      "We cannot measure your week yet: fewer than two holdings have both a share count and this week's closes. Nothing else changed: no call changes, explained moves, earnings reports or filings in your stocks.",
    );
  });
});

/* ── the numbers check ──────────────────────────────────────────────────── */

describe("numbers check", () => {
  const built = buildMemo(inputs());
  const perfFact = built.chosen.find((fact) => fact.kind === "performance")!;
  const evidence = evidenceFor([perfFact]);

  it("rejects an invented figure", () => {
    expect(unsupportedNumber("Your holdings rose 4.2% this week.", evidence)).toMatch(/number not in the facts/);
    expect(rejectSentence("Your holdings are up 1.7% this week, and analysts see 12% more to come.", evidence)).toMatch(/number not in the facts/);
    // A spelled-out count that the facts do not hold.
    expect(unsupportedNumber("Five of your stocks drove it.", evidence)).toMatch(/number word/);
  });

  it("accepts the facts' own figures and honest rounding, but not a wrong decimal", () => {
    expect(unsupportedNumber("Your holdings are up 1.7% so far, against 1.0% for the S&P 500.", evidence)).toBeNull();
    expect(unsupportedNumber("Your holdings are up about 2% this week.", evidence)).toBeNull();
    expect(unsupportedNumber("Your holdings are up 1.8% this week.", evidence)).not.toBeNull();
  });

  it("does not let a date stand in for a percentage", () => {
    // 11 is in "2026-11-10", but 11% is not a figure in the facts.
    expect(unsupportedNumber("The market rose 11% this week.", evidence)).not.toBeNull();
    // The day of the month may come from a date.
    expect(unsupportedNumber("Through Tuesday, Nov 10.", evidence)).toBeNull();
  });

  it("rejects a stock the facts do not name, and filler", () => {
    expect(rejectSentence("Your holdings are up 1.7%, unlike TSLA.", evidence)).toMatch(/stock not in the facts: TSLA/);
    expect(rejectSentence("Your holdings are navigating a tricky landscape this week.", evidence)).toMatch(/filler/);
    expect(rejectSentence("Your holdings are up 1.7% — a good week.", evidence)).toMatch(/filler/);
  });

  it("drops only the bad sentence and keeps the rules' text when nothing survives", () => {
    const kept = keepSupported("Your holdings are up 1.7% so far this week. They should gain 9% by Friday.", evidence, 2);
    expect(kept.text).toBe("Your holdings are up 1.7% so far this week.");
    expect(kept.dropped).toHaveLength(1);

    const { memo, dropped } = applyWording(built, {
      top_line: "Your holdings are up 1.7% so far. NVIDIA will add 8% more next week.",
      items: [
        { id: "performance", text: "Your holdings gained 3.4% this week." },
        { id: "drivers", text: "NVIDIA did most of the lifting, up 10% and worth 3.3 points." },
      ],
    });
    // The week's return is not listed as an item, so its rewording is never used.
    expect(memo.changed.map((item) => item.id)).toEqual(["drivers"]);
    expect(memo.changed[0]!.text).toBe("NVIDIA did most of the lifting, up 10% and worth 3.3 points.");
    // A top line that loses a sentence is replaced whole.
    expect(memo.topLine).toBe(built.memo.topLine);
    expect(memo.wordedBy).toBe("model");
    expect(dropped.map((row) => row.id).sort()).toEqual(["top_line"]);
  });

  it("ignores junk from the model", () => {
    expect(applyWording(built, null).memo).toBe(built.memo);
    expect(applyWording(built, { items: "nope" as unknown as [] }).memo.changed).toEqual(built.memo.changed);
    expect(wordingPayload(built).items.map((item) => item.id)).toEqual(["performance", "drivers"]);
  });
});

/* ── fixes from the quality pass ────────────────────────────────────────── */

describe("quality-pass fixes", () => {
  it("says when the figure covers only part of the portfolio", () => {
    const holdings = [...HOLDINGS, { ticker: "XOM", name: "Exxon Mobil", instrumentId: "US_XOM", units: null, fund: false, covered: true }];
    const { memo, chosen } = buildMemo(inputs({ holdings }));
    // "Together": one figure for the group, and the holding left out is named with why.
    expect(chosen.find((fact) => fact.kind === "performance")!.text).toBe(
      "Together, three of your four holdings are up 1.7% so far this week, through Tuesday's close, against a 1.0% rise in the S&P 500. Exxon Mobil isn't in this week's figure: it has no share count.",
    );
    expect(memo.topLine.startsWith("Together, three of your four holdings are up 1.7%")).toBe(true);
    expect(memo.topLine).toContain("Exxon Mobil isn't in this week's figure: it has no share count.");
    expect(memo.changed.some((item) => item.kind === "performance")).toBe(false);
  });

  it("names a holding whose closes stop early, and keeps that in a reworded top line", () => {
    const short = series([100, 101, 102, 103, 104, 105, 106]);
    const early = { dates: short.dates.slice(0, -1), closes: short.closes.slice(0, -1) };
    const holdings = [...HOLDINGS, { ticker: "VOO", name: "Vanguard S&P 500 ETF", instrumentId: "US_VOO", units: 5, fund: true, covered: true }];
    const base = inputs({ holdings });
    const built = buildMemo({ ...base, series: new Map([...base.series, ["VOO", early]]) });
    expect(built.memo.topLine).toContain("Vanguard S&P 500 ETF isn't in this week's figure: we have no prices for it after Monday.");
    expect(built.topLineMustSay).toEqual(["Together", "Vanguard S&P 500 ETF"]);
    // A reworded top line that loses the holding left out is not used.
    const { memo } = applyWording(built, {
      top_line: "Your holdings are up 1.7% so far this week, ahead of the S&P 500's 1.0% rise. Nothing else changed in your stocks.",
    });
    expect(memo.topLine).toBe(built.memo.topLine);
    // One that keeps all three sentences, "Together" and the holding left out is used.
    const reworded = built.memo.topLine.replace("so far this week", "this week so far");
    expect(reworded).not.toBe(built.memo.topLine);
    expect(applyWording(built, { top_line: reworded }).memo.topLine).toBe(reworded);
    // The week's return stays on the memo for the share card, though "What changed" leaves it out.
    expect(built.memo.week?.kind).toBe("performance");
    expect(built.memo.changed.some((item) => item.kind === "performance")).toBe(false);
  });

  it("never says a flat week fell 0.0%", () => {
    const flat = inputs({
      series: new Map([
        ["NVDA", series([100, 100, 100, 100, 100, 100, 100.01])],
        ["AAPL", series([100, 100, 100, 100, 100, 100, 100])],
      ]),
      holdings: HOLDINGS.slice(0, 2),
    });
    expect(buildMemo(flat).memo.topLine).toContain("are up less than 0.1% so far this week");
  });

  it("keeps 'coming up' to the next week, and drops a report already out", () => {
    const { facts } = buildFacts(
      inputs({
        reports: [{ ticker: "AAPL", day: "2026-11-11", verdict: "beat", epsActual: 1.2, epsEstimate: 1.1, revenueYoyPct: null, guidance: null, reactionPct: null, reactionBasis: null, typicalAbsPct: null }],
        upcoming: [
          { ticker: "AAPL", date: "2026-11-11", time: "bmo", typicalAbsPct: null },
          { ticker: "JPM", date: "2026-11-19", time: null, typicalAbsPct: null },
          { ticker: "NVDA", date: "2026-12-02", time: null, typicalAbsPct: null },
        ],
      }),
    );
    expect(facts.find((fact) => fact.kind === "upcoming")!.text).toBe("Coming up: JPMorgan Chase reports on Thursday, Nov 19.");
  });

  it("does not hide a move days after a report", () => {
    const { facts } = buildFacts(
      inputs({
        reports: [{ ticker: "NVDA", day: "2026-11-09", verdict: null, epsActual: null, epsEstimate: null, revenueYoyPct: null, guidance: null, reactionPct: null, reactionBasis: null, typicalAbsPct: null }],
        moves: [
          { ticker: "NVDA", day: "2026-11-10", pct: 6, headline: "", why: null },
          { ticker: "NVDA", day: "2026-11-11", pct: -7, headline: "", why: null },
        ],
      }),
    );
    // Tuesday's move is the report's reaction; Wednesday's is its own news.
    expect(facts.filter((fact) => fact.kind === "move").map((fact) => fact.id)).toEqual(["move:NVDA:2026-11-11"]);
  });

  it("words a dividend paid while losing money", () => {
    const { facts } = buildFacts(
      inputs({ dividends: [{ ticker: "JPM", name: "JPMorgan Chase", exDate: null, payDate: null, perShare: null, amount: null, changePct: null, atRisk: true, payout: -20 }] }),
    );
    expect(facts.find((fact) => fact.kind === "dividend_risk")!.text).toBe(
      "JPMorgan Chase still pays a dividend while it is losing money, which is hard to keep up for long.",
    );
  });

  it("counts held-back reasons only on facts that made the memo", () => {
    const moves = ["2026-11-09", "2026-11-10"].flatMap((day, index) => [
      { ticker: "AAPL", day, pct: index ? -4 : -3, headline: "Apple fell after a product delay", why: null },
    ]);
    const { memo } = buildMemo(inputs({ moves }));
    expect(memo.heldBack).toBe(1);
  });

  describe("numbers check", () => {
    const built = buildMemo(inputs());
    const drivers = built.chosen.find((fact) => fact.kind === "drivers")!;
    const evidence = evidenceFor([drivers]);
    const perf = evidenceFor([built.chosen.find((fact) => fact.kind === "performance")!]);

    it("catches a figure in the wrong unit", () => {
      expect(unsupportedNumber("NVIDIA added 3.3 points.", evidence)).toBeNull();
      expect(unsupportedNumber("NVIDIA added 3.3% to the portfolio.", evidence)).toMatch(/pct/);
    });

    it("does not take a day of the month for a figure", () => {
      const withDate = evidenceFor([{ text: "Costco reports on Thursday, Nov 13.", data: {}, tickers: ["COST"] }]);
      expect(unsupportedNumber("Costco rose 13%.", withDate)).not.toBeNull();
      expect(unsupportedNumber("Costco reports on Nov 13.", withDate)).toBeNull();
    });

    it("checks 'a quarter of' but not 'third-quarter'", () => {
      expect(unsupportedNumber("Apple is now a quarter of the portfolio.", perf)).toMatch(/number word/);
      expect(unsupportedNumber("Apple's third-quarter results were strong.", perf)).toBeNull();
    });

    it("rejects a flipped direction, a wrong weekday and a company the facts do not name", () => {
      const rising = evidenceFor([{ text: "Apple rose 2.3% on Monday, Nov 9.", data: { move_pct: 2.3 }, tickers: ["AAPL"] }]);
      expect(rejectSentence("Apple fell 2.3% on Monday.", rising)).toMatch(/says down/);
      expect(rejectSentence("Apple rose 2.3% on Tuesday.", rising)).toMatch(/weekday/);
      expect(rejectSentence("Apple rose 2.3%, more than JPMorgan Chase did.", rising, ["Apple", "JPMorgan Chase"])).toMatch(/company/);
      expect(rejectSentence("Apple rose 2.3% on Monday.", rising, ["Apple", "JPMorgan Chase"])).toBeNull();
    });

    it("keeps the rules' item whole when any reworded sentence is dropped", () => {
      const { memo } = applyWording(built, {
        items: [{ id: "drivers", text: "NVIDIA did most of the lifting, up 10%. It will rise 20% next month." }],
      });
      expect(memo.changed[0]!.text).toBe(built.memo.changed[0]!.text);
      expect(memo.wordedBy).toBe("rules");
    });
  });
});

describe("callReason", () => {
  it("quotes today's company reason only for a recent change that led to today's call", async () => {
    const { callReason } = await import("./reason");
    const row = { call: "Hold" as const, call_reason: "The stock fell 18% over the past week, far more than other chip stocks." };
    expect(callReason(row, { to: "Hold", text: null, date: "2026-11-09" }, "2026-11-11")).toBe(row.call_reason);
    expect(callReason(row, { to: "Hold", text: null, date: "2026-10-29" }, "2026-11-11")).toBeNull();
    expect(callReason(row, { to: "Add", text: "Hold here.", date: "2026-11-09" }, "2026-11-11")).toBeNull();
  });
});

/* ── calls stay put (owner rule 9) ───────────────────────────────────────── */

describe("call flips", () => {
  it("marks a skipped step, a reversal within five sessions and two changes in a week", () => {
    expect(callFlip({ from: "Trim", to: "Add" }, [{ date: "2026-11-09", from: "Trim", to: "Add" }], 1)).toBe("skip");
    expect(callFlip({ from: "Hold", to: "Add" }, [{ date: "2026-11-09", from: "Hold", to: "Add" }], 1)).toBeNull();
    // Keep to Sell some on Thursday, back to Keep on Monday: three sessions apart.
    const back = [
      { date: "2026-11-05", from: "Hold" as const, to: "Trim" as const },
      { date: "2026-11-09", from: "Trim" as const, to: "Hold" as const },
    ];
    expect(callFlip({ from: "Trim", to: "Hold" }, back, 1)).toBe("reversal");
    // The same change after a month is a call that moved on, not a flip.
    expect(callFlip({ from: "Trim", to: "Hold" }, [{ ...back[0]!, date: "2026-10-09" }, back[1]!], 1)).toBeNull();
    // Two steps the same way is not a reversal.
    expect(callFlip({ from: "Hold", to: "Add" }, [{ date: "2026-11-05", from: "Trim", to: "Hold" }, { date: "2026-11-09", from: "Hold", to: "Add" }], 1)).toBeNull();
    expect(callFlip({ from: "Hold", to: "Add" }, [], 2)).toBe("twice");
    expect(weekdaysBetween("2026-11-06", "2026-11-09")).toBe(1);
  });

  it("says a flip as the call it is now, never the sale it came from", () => {
    const { facts } = buildFacts(inputs({ calls: [{ ticker: "AAPL", date: "2026-11-09", from: "Trim", to: "Add", text: null }] }));
    const fact = facts.find((row) => row.kind === "call")!;
    expect(fact.text).toBe('Our call on Apple changed to "Buy more" on Monday, Nov 9.');
    expect(fact.text).not.toContain("Sell some");
    expect(fact.card?.label).toBe("on Apple, since Monday");
    expect(fact.data.from).toBeUndefined();
    const view = buildMemo(inputs({ calls: [{ ticker: "AAPL", date: "2026-11-09", from: "Trim", to: "Add", text: null }] })).memo.view!;
    expect(view.calls[0]).toMatchObject({ ticker: "AAPL", to: "Add", flip: "skip" });
  });

  it("catches a change that undoes one from the week before", () => {
    const view = buildMemo(
      inputs({
        calls: [
          { ticker: "JPM", date: "2026-11-05", from: "Add", to: "Hold", text: null },
          { ticker: "JPM", date: "2026-11-09", from: "Hold", to: "Add", text: null },
        ],
      }),
    ).memo.view!;
    expect(view.calls).toEqual([expect.objectContaining({ ticker: "JPM", from: "Hold", to: "Add", flip: "reversal" })]);
  });

  it("keeps the latest call when it changed twice in the week", () => {
    const view = buildMemo(
      inputs({
        calls: [
          { ticker: "NVDA", date: "2026-11-09", from: "Hold", to: "Add", text: null },
          { ticker: "NVDA", date: "2026-11-10", from: "Add", to: "Trim", text: null },
        ],
      }),
    ).memo.view!;
    expect(view.calls).toEqual([expect.objectContaining({ ticker: "NVDA", from: "Hold", to: "Trim", date: "2026-11-10", flip: "twice" })]);
  });
});
