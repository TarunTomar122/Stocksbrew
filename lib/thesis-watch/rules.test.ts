import { describe, expect, it } from "vitest";

import { bigDropOf, callFacts, dividendFacts, emptyFacts, namesTrouble, priorYearGrowth, type StockFacts } from "./facts";
import { evaluate, ruleNote, verdictOf, whatChanged, type HoldingContext } from "./rules";
import { HISTORY_MAX, nextStoredCheck, readStoredCheck, toDoc } from "./store";
import { applyNote } from "./word";

const TODAY = "2026-11-11";
const NO_COST: HoldingContext = { avgCost: null, savedClose: null };

function facts(over: Partial<StockFacts> = {}): StockFacts {
  return { ...emptyFacts("NVDA", "US_NVDA", "Nvidia", TODAY), close: { value: 100, day: "2026-11-10" }, ...over };
}

const thesis = (kind: Parameters<typeof evaluate>[0]["kind"], reason: string | null = null, created = "2026-10-01T00:00:00.000Z") => ({ kind, reason, created_at: created });

describe("facts helpers", () => {
  it("finds a dividend cut and a stopped dividend, and nothing on a steady payer", () => {
    const steady = [
      { exDate: "2026-03-13", amount: 0.53 },
      { exDate: "2026-06-15", amount: 0.53 },
      { exDate: "2026-09-15", amount: 0.53 },
    ];
    expect(dividendFacts(steady, 4, TODAY)).toMatchObject({ dividendCut: null, dividendStop: null, lastDividend: { exDate: "2026-09-15", amount: 0.53 } });
    const cut = [...steady.slice(0, 2), { exDate: "2026-09-15", amount: 0.3 }];
    expect(dividendFacts(cut, 4, TODAY).dividendCut).toMatchObject({ day: "2026-09-15", from: 0.53, to: 0.3 });
    // A special payment is not the regular one.
    expect(dividendFacts([...steady, { exDate: "2026-10-01", amount: 0.1, special: true }], 4, TODAY).dividendCut).toBeNull();
    const stopped = steady.map((row) => ({ ...row, exDate: row.exDate.replace("2026", "2025") }));
    expect(dividendFacts(stopped, 4, TODAY).dividendStop).toMatchObject({ lastExDate: "2025-09-15", usualDays: 91 });
  });

  it("reads the call and a settled turn down to Trim", () => {
    const records = [
      { date: "2026-09-01", stance: "accumulate" },
      { date: "2026-10-01", stance: "accumulate" },
      { date: "2026-11-05", stance: "trim" },
    ];
    // A fresh turn waits two weeks: the call engine's turns to Trim often do not last.
    expect(callFacts(records, TODAY)).toEqual({ call: { word: "Trim", since: "2026-11-05", from: "Add" }, callTurnedDown: null });
    expect(callFacts(records, "2026-11-19").callTurnedDown).toEqual({ from: "Add", day: "2026-11-05" });
    // Records after the day are not known yet.
    expect(callFacts(records, "2026-10-15").call).toEqual({ word: "Add", since: "2026-09-01", from: null });
  });

  it("flags only a big unexplained fall", () => {
    const dates: string[] = [];
    const closes: number[] = [];
    let price = 100;
    for (let i = 0; i < 120; i++) {
      dates.push(`2026-${String(6 + Math.floor(i / 28)).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`);
      price *= i % 2 ? 1.01 : 0.99;
      closes.push(price);
    }
    closes[118] = closes[117]! * 0.9;
    closes[119] = closes[118]!;
    const series = { dates, closes };
    const day = dates[119]!;
    expect(bigDropOf(series, day)).toMatchObject({ day: dates[118] });
    expect(bigDropOf(series, day, (d) => d === dates[118])).toBeNull();
    // The same fall on a day the whole market fell as much is not the company's news.
    const market = { dates, closes: closes.map((close, i) => (i === 118 || i === 119 ? close : 100)) };
    market.closes[117] = 100;
    market.closes[118] = 90;
    market.closes[119] = 90;
    expect(bigDropOf(series, day, () => false, market)).toBeNull();
  });

  it("takes last fiscal year's growth, skipping the trailing-twelve-month row", () => {
    expect(
      priorYearGrowth([
        { label: "TTM", revenue: 300, eps: null, netIncome: null, fcf: null },
        { label: "FY 2026", revenue: 216, eps: null, netIncome: null, fcf: null },
        { label: "FY 2025", revenue: 120, eps: null, netIncome: null, fcf: null },
      ]),
    ).toEqual({ pct: 80, label: "fiscal 2026" });
    expect(priorYearGrowth([{ label: "FY 2026", revenue: 1, eps: null, netIncome: null, fcf: null }])).toBeNull();
    // The trailing year is the fiscal year just closed: the comparison is with the year before it.
    expect(
      priorYearGrowth([
        { label: "TTM", revenue: 216, eps: null, netIncome: null, fcf: null },
        { label: "FY 2026", revenue: 216, eps: null, netIncome: null, fcf: null },
        { label: "FY 2025", revenue: 120, eps: null, netIncome: null, fcf: null },
        { label: "FY 2024", revenue: 100, eps: null, netIncome: null, fcf: null },
      ]),
    ).toEqual({ pct: expect.closeTo(20, 6), label: "fiscal 2025" });
  });

  it("names trouble in an explanation, whole words only", () => {
    expect(namesTrouble("Shares fell after the FTC sued to block the deal")).toBe(true);
    expect(namesTrouble("Recall of 2 million vehicles")).toBe(true);
    expect(namesTrouble("Fell with the market on rate worries")).toBe(false);
    expect(namesTrouble("Banner quarter for the probe-free unit")).toBe(true);
    expect(namesTrouble("Bandwidth demand slowed")).toBe(false);
  });
});

describe("the verdict", () => {
  it("is broken on one hard or two soft signals, played out before weaker", () => {
    expect(verdictOf([])).toBe("holds");
    expect(verdictOf([{ level: "soft" }])).toBe("weaker");
    expect(verdictOf([{ level: "soft" }, { level: "soft" }])).toBe("broken");
    expect(verdictOf([{ level: "hard" }])).toBe("broken");
    expect(verdictOf([{ level: "done" }, { level: "soft" }])).toBe("played_out");
    expect(verdictOf([{ level: "info" }])).toBe("holds");
  });
});

describe("rules per kind", () => {
  it("growth: holds with its evidence, weaker when growth slows by a third, broken when revenue shrinks", () => {
    const fine = evaluate(thesis("growth"), facts({ revenueGrowth: 83.4, revenueGrowthPrior: 65.5, priorLabel: "fiscal 2026", call: { word: "Hold", since: "2026-10-01", from: "Add" } }), NO_COST, TODAY);
    expect(fine.verdict).toBe("holds");
    expect(fine.checked.map((line) => line.text)).toEqual(["Revenue grew 83% over the last twelve months, against growth of 66% in fiscal 2026.", "Our call is Keep, since Oct 1."]);
    expect(ruleNote(fine)).toBe("Your reason for owning NVDA still holds. Nothing we check has turned against it. Revenue grew 83% over the last twelve months, against growth of 66% in fiscal 2026. Our call is Keep, since Oct 1.");

    const slow = evaluate(thesis("growth"), facts({ revenueGrowth: 4.2, revenueGrowthPrior: 15, priorLabel: "fiscal 2025" }), NO_COST, TODAY);
    expect(slow.verdict).toBe("weaker");
    expect(slow.signals[0]!.text).toBe("Revenue growth slowed to 4.2% over the last twelve months, from 15% in fiscal 2025.");

    // A small prior year is not a story to slow down from.
    expect(evaluate(thesis("growth"), facts({ revenueGrowth: 2, revenueGrowthPrior: 6, priorLabel: "fiscal 2025" }), NO_COST, TODAY).verdict).toBe("holds");
    expect(evaluate(thesis("growth"), facts({ revenueGrowth: -3 }), NO_COST, TODAY).verdict).toBe("broken");
  });

  it("growth: a month of Sell some breaks it, and replaces the fresh-turn signal", () => {
    const fresh = evaluate(thesis("growth"), facts({ call: { word: "Trim", since: "2026-10-20", from: "Add" }, callTurnedDown: { from: "Add", day: "2026-10-20" } }), NO_COST, TODAY);
    expect(fresh.verdict).toBe("weaker");
    expect(fresh.signals.map((s) => s.id)).toEqual(["call_turned_down"]);
    expect(fresh.signals[0]!.text).toBe("Our call changed from Buy more to Sell some on Oct 20 and has stayed there for 22 days.");
    const month = evaluate(thesis("growth"), facts({ call: { word: "Trim", since: "2026-10-01", from: "Add" } }), NO_COST, TODAY);
    expect(month.verdict).toBe("broken");
    expect(month.signals[0]!.text).toBe("Our call has been Sell some since Oct 1, 41 days now.");
  });

  it("dividend: a cut breaks it; a high payout or thin cash weakens it", () => {
    const cut = evaluate(thesis("dividend"), facts({ dividendCut: { day: "2026-09-15", from: 0.53, to: 0.3, pct: -43.4 } }), NO_COST, TODAY);
    expect(cut.verdict).toBe("broken");
    expect(cut.signals[0]!.text).toBe("The last payment was $0.30 a share, going ex on Sep 15. That is 43% less than the $0.53 before it.");
    const stretched = evaluate(thesis("dividend"), facts({ payout: 104, divYield: 4, marketCap: 10e9, fcf: 300e6 }), NO_COST, TODAY);
    expect(stretched.signals.map((s) => s.id)).toEqual(["payout_high", "cash_short"]);
    expect(stretched.verdict).toBe("broken");
    expect(evaluate(thesis("dividend"), facts({ payout: 58, lastDividend: { exDate: "2026-09-15", amount: 0.53 } }), NO_COST, TODAY).checked.map((s) => s.id)).toEqual(["last_dividend", "payout"]);
  });

  it("value: plays out when the P/E is back above its past, breaks on losses", () => {
    const done = evaluate(thesis("value"), facts({ pe: 28.4, pePercentile: 72, peMedian: 22 }), NO_COST, TODAY);
    expect(done.verdict).toBe("played_out");
    expect(done.signals[0]!.text).toBe("The stock is no longer cheap against its own past. Its P/E of 28.4 is higher than on 72% of the days in its stored history, where the middle is 22.");
    // The headline says what changed, not just "played out", and the note does not say the P/E twice.
    expect(done.headline).toBe("NVDA has done what you bought it for: it is no longer cheap, with a P/E higher than on 72% of past days.");
    expect(ruleNote(done)).toBe(`${done.headline} Its P/E is 28.4, and half the time it has been below 22.`);
    expect(whatChanged(done)).toMatchObject({ signal: "no_longer_cheap" });
    expect(whatChanged({ ...done, verdict: "broken" })).toBeNull();
    expect(evaluate(thesis("value"), facts({ netIncome: -2e9 }), NO_COST, TODAY).verdict).toBe("broken");
    expect(evaluate(thesis("value"), facts({ epsGrowth: -25, pe: 9, pePercentile: 20 }), NO_COST, TODAY).signals[0]!.id).toBe("value_trap");
  });

  it("short-term trade: against cost, days held and earnings without a plan", () => {
    const target = evaluate(thesis("trade"), facts({ close: { value: 120, day: "2026-11-10" } }), { avgCost: 100, savedClose: null }, TODAY);
    expect(target.verdict).toBe("played_out");
    expect(target.headline).toBe("NVDA has done what you bought it for as a short-term trade: it is up 20% on what you paid.");
    expect(ruleNote(target)).toBe(`${target.headline} It closed at $120.00, against your average cost of $100.00.`);
    // Just over the 15% line, with no cost entered (the close on the day the reason was saved is the basis).
    const atLine = evaluate(thesis("trade", null, "2026-11-02T15:00:00.000Z"), facts({ close: { value: 116, day: "2026-11-10" } }), { avgCost: null, savedClose: 100 }, TODAY);
    expect(atLine.verdict).toBe("played_out");
    expect(atLine.headline).toBe("NVDA has done what you bought it for as a short-term trade: it is up 16% since you saved this reason.");
    expect(ruleNote(atLine)).toContain("It closed at $116.00, against $100.00 when you saved it.");
    const stop = evaluate(thesis("trade"), facts({ close: { value: 80, day: "2026-11-10" } }), { avgCost: 100, savedClose: null }, TODAY);
    expect(stop.signals[0]!.text).toBe("It closed 20% below your average cost of $100.00.");
    const noCost = evaluate(thesis("trade", null, "2026-11-02T15:00:00.000Z"), facts({ close: { value: 80, day: "2026-11-10" } }), { avgCost: null, savedClose: 100 }, TODAY);
    expect(noCost.signals[0]!.text).toBe("It closed 20% below the $100.00 it closed at on Nov 2, when you saved this reason.");
    expect(evaluate(thesis("trade", null, "2026-08-01T00:00:00.000Z"), facts(), NO_COST, TODAY).signals.map((s) => s.id)).toEqual(["trade_too_long"]);
    const earnings = facts({ nextEarnings: { date: "2026-11-13", days: 2 } });
    expect(evaluate(thesis("trade"), earnings, NO_COST, TODAY).signals.map((s) => s.id)).toEqual(["earnings_no_plan"]);
    expect(evaluate(thesis("trade"), earnings, NO_COST, TODAY).verdict).toBe("weaker");
    expect(evaluate(thesis("trade", "Sell before the report"), earnings, NO_COST, TODAY).verdict).toBe("holds");
  });

  it("long-term: a deep loss only counts with a Sell some call", () => {
    const down = facts({ close: { value: 60, day: "2026-11-10" } });
    expect(evaluate(thesis("long_term"), down, { avgCost: 100, savedClose: null }, TODAY).verdict).toBe("holds");
    const trimmed = { ...down, call: { word: "Trim" as const, since: "2026-09-01", from: "Hold" as const } };
    expect(evaluate(thesis("long_term"), trimmed, { avgCost: 100, savedClose: null }, TODAY).signals[0]!.id).toBe("deep_loss");
    expect(evaluate(thesis("long_term"), facts({ revenueGrowth: -4, revenueGrowthPrior: -2, priorLabel: "fiscal 2025" }), NO_COST, TODAY).verdict).toBe("broken");
  });

  it("product: trouble in an explained move is soft alone and hard with falling revenue", () => {
    const trouble = { day: "2026-11-03", pct: -7.2, headline: "Shares fell after a recall of 2 million units", href: "/stock/NVDA/moves/2026-11-03" };
    expect(evaluate(thesis("product"), facts({ trouble }), NO_COST, TODAY).verdict).toBe("weaker");
    const both = evaluate(thesis("product"), facts({ trouble, revenueGrowth: -3 }), NO_COST, TODAY);
    expect(both.verdict).toBe("broken");
    expect(both.signals[0]!.text).toBe("It fell 7.2% on Nov 3, and our explanation was: “Shares fell after a recall of 2 million units.” Revenue also fell 3% over the last twelve months.");
    expect(evaluate(thesis("product"), facts({ news: { labelled: 10, negative: 7 } }), NO_COST, TODAY).signals[0]!.text).toBe("70% of the 10 headlines about it in the last two weeks were negative.");
    expect(evaluate(thesis("product"), facts({ news: { labelled: 5, negative: 5 } }), NO_COST, TODAY).verdict).toBe("holds");
  });

  it("every kind: insider sales outside plans, a fund leaving, an unexplained fall", () => {
    const f = facts({ insiderSales: { usd: 14_200_000, count: 3 } });
    const check = evaluate(thesis(null, "Everyone I know uses it"), f, NO_COST, TODAY);
    expect(check.signals[0]!.text).toBe("Insiders sold $14 million of stock in the last 30 days, outside pre-arranged trading plans.");
    expect(check.quote).toBe("You said: “Everyone I know uses it.”");
    expect(evaluate(thesis(null, "AI is the future!"), f, NO_COST, TODAY).quote).toBe("You said: “AI is the future!”");
    expect(evaluate(thesis("growth"), facts({ insiderSales: { usd: 9e6, count: 1 } }), NO_COST, TODAY).verdict).toBe("holds");
    const fund = evaluate(thesis("growth"), facts({ fundCut: { fund: "Akre Capital", href: "/follow/akre", action: "trimmed", changePct: -62, day: "2026-11-01" } }), NO_COST, TODAY);
    expect(fund.signals[0]!.text).toBe("Akre Capital cut its position by 62%, in a filing on Nov 1.");
    const drop = evaluate(thesis("growth"), facts({ bigDrop: { day: "2026-11-09", pct: -8.1, typicalPct: 1.4, marketPct: -0.6 } }), NO_COST, TODAY);
    expect(drop.signals[0]!.text).toBe("It fell 8.1% on Nov 9 while the S&P 500 fell 0.6%.");
  });
});

describe("the stored check", () => {
  const check = evaluate(thesis("growth"), facts({ revenueGrowth: 4.2, revenueGrowthPrior: 15, priorLabel: "fiscal 2025" }), NO_COST, TODAY);
  const input = { uid: "u1", check, reasonUpdatedAt: "2026-10-01T00:00:00.000Z", note: ruleNote(check), draft: ruleNote(check), wordTried: false, wordedBy: "rules" as const, day: TODAY, now: new Date("2026-11-11T15:00:00Z") };

  it("round-trips, skips a rewrite with nothing new the same day, and keeps changes only in the history", () => {
    const first = nextStoredCheck(null, input)!;
    expect(first.history).toEqual([{ day: TODAY, verdict: "weaker", signals: ["growth_slowing"] }]);
    const stored = readStoredCheck(toDoc(first));
    expect(stored).toEqual(first);
    expect(nextStoredCheck(stored, input)).toBeNull();
    const nextDay = nextStoredCheck(stored, { ...input, day: "2026-11-12" })!;
    expect(nextDay.day).toBe("2026-11-12");
    expect(nextDay.history).toHaveLength(1);
    const holds = evaluate(thesis("growth"), facts({ revenueGrowth: 30 }), NO_COST, TODAY);
    const changed = nextStoredCheck(nextDay, { ...input, check: holds, day: "2026-11-13" })!;
    expect(changed.history.map((row) => row.verdict)).toEqual(["weaker", "holds"]);
  });

  it("rewrites the same day when the figures change, and starts a fresh history for a changed reason", () => {
    const first = nextStoredCheck(null, input)!;
    const moved = evaluate(thesis("growth"), facts({ revenueGrowth: 3.9, revenueGrowthPrior: 15, priorLabel: "fiscal 2025" }), NO_COST, TODAY);
    const sameDay = nextStoredCheck(first, { ...input, check: moved, note: ruleNote(moved), draft: ruleNote(moved) })!;
    expect(sameDay.note).toContain("3.9%");
    expect(sameDay.history).toHaveLength(1);
    const edited = nextStoredCheck(first, { ...input, reasonUpdatedAt: "2026-11-11T12:00:00.000Z" })!;
    expect(edited.history).toEqual([{ day: TODAY, verdict: "weaker", signals: ["growth_slowing"] }]);
    const holds = evaluate(thesis("growth"), facts({ revenueGrowth: 30 }), NO_COST, TODAY);
    const changedReason = nextStoredCheck(first, { ...input, check: holds, reasonUpdatedAt: "2026-11-11T12:00:00.000Z" })!;
    expect(changedReason.history.map((row) => row.verdict)).toEqual(["holds"]);
  });

  it("keeps at most the last twenty changes", () => {
    let stored = nextStoredCheck(null, input)!;
    for (let i = 0; i < 30; i++) {
      const next = evaluate(thesis("growth"), facts({ revenueGrowth: i % 2 ? 30 : 4, revenueGrowthPrior: 15, priorLabel: "fiscal 2025" }), NO_COST, TODAY);
      stored = nextStoredCheck(stored, { ...input, check: next, day: `2026-12-${String(i + 1).padStart(2, "0")}` }) ?? stored;
    }
    expect(stored.history).toHaveLength(HISTORY_MAX);
  });
});

describe("wording under the numbers check", () => {
  const check = evaluate(thesis("growth", "Every big cloud is still buying its chips"), facts({ revenueGrowth: 4.2, revenueGrowthPrior: 15, priorLabel: "fiscal 2025" }), NO_COST, TODAY);

  it("keeps a rewording that only uses the facts", () => {
    const note = "Your reason for owning NVDA is weaker. Revenue growth slowed to 4.2% over the last twelve months, from 15% in fiscal 2025. That matters for the cloud buying you pointed to.";
    expect(applyNote(check, { note })).toMatchObject({ note, wordedBy: "model" });
  });

  it("falls back to the rules on an invented figure, another stock or a changed verdict", () => {
    for (const note of [
      "Your reason for owning NVDA is weaker. Revenue growth slowed to 4.2%, and margins fell 6%.",
      "Your reason for owning NVDA is weaker. AMD is taking share as growth slowed to 4.2%.",
      "Your reason for owning NVDA still holds. Growth slowed to 4.2% but that is fine.",
    ]) {
      expect(applyNote(check, { note })).toMatchObject({ note: ruleNote(check), wordedBy: "rules" });
    }
  });
});
