import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));

import { buildMemo } from "./build";
import { buildFacts, weekPerformance } from "./facts";
import { curveSlots, niceTicks, plainLeftOut, signedPct, signedPoints, weekGap } from "./format";
import { historyRow, readStoredMemo } from "./store";
import type { DailySeries, MemoHolding, MemoInputs } from "./types";
import { callShows, cardItems, gapWords, memoHeadline, pickMovers, readItemCard, readView } from "./view";
import { memoWeekFor } from "./week";
import { evidenceFor, unsupportedNumber } from "./word";

/* ── fixtures: Friday Nov 6, then Mon Nov 9 and Tue Nov 10 ──────────────── */

const DAYS = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"];
const series = (closes: number[]): DailySeries => ({ dates: DAYS.slice(0, closes.length), closes });

const HOLDINGS: MemoHolding[] = [
  { ticker: "NVDA", name: "NVIDIA", instrumentId: "US_NVDA", units: 10, fund: false, covered: true },
  { ticker: "AAPL", name: "Apple", instrumentId: "US_AAPL", units: 10, fund: false, covered: true },
  { ticker: "JPM", name: "JPMorgan Chase", instrumentId: "US_JPM", units: 10, fund: false, covered: true },
  { ticker: "XOM", name: "Exxon Mobil", instrumentId: "US_XOM", units: 10, fund: false, covered: true },
  { ticker: "KO", name: "Coca-Cola", instrumentId: "US_KO", units: 10, fund: false, covered: true },
];

function inputs(overrides: Partial<MemoInputs> = {}): MemoInputs {
  return {
    week: memoWeekFor("2026-11-10", "2026-11-11"),
    today: "2026-11-11",
    subject: "mine",
    holdings: HOLDINGS,
    series: new Map([
      ["NVDA", series([100, 100, 100, 100, 100, 104, 110])],
      ["AAPL", series([100, 100, 100, 100, 100, 101, 95])],
      ["JPM", series([100, 100, 100, 100, 100, 100, 102])],
      ["XOM", series([100, 100, 100, 100, 100, 99, 99])],
      ["KO", series([100, 100, 100, 100, 100, 100, 100])],
    ]),
    benchmark: series([500, 500, 500, 500, 500, 505, 510]),
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

/** Every kind of fact at once, for the card rules. */
const RICH = inputs({
  calls: [
    { ticker: "NVDA", date: "2026-11-09", from: "Hold", to: "Trim", text: "The stock has run ahead of its earnings." },
    { ticker: "JPM", date: "2026-11-10", from: "Trim", to: "Hold", text: null },
  ],
  moves: [
    { ticker: "AAPL", day: "2026-11-10", pct: -5.9, headline: "Apple fell after a weak China sales report", why: null },
    { ticker: "NVDA", day: "2026-11-10", pct: 5.8, headline: "NVIDIA rose on new chip orders", why: null },
  ],
  reports: [
    {
      ticker: "JPM",
      day: "2026-11-10",
      verdict: "beat",
      epsActual: 4.1,
      epsEstimate: 3.9,
      revenueYoyPct: 6,
      guidance: "raised",
      reactionPct: 2,
      reactionBasis: "report_day",
      typicalAbsPct: 3,
    },
  ],
  upcoming: [
    { ticker: "NVDA", date: "2026-11-18", time: "amc", typicalAbsPct: 6.4 },
    { ticker: "KO", date: "2026-11-19", time: "bmo", typicalAbsPct: 2 },
  ],
  funds: [{ ticker: "AAPL", fund: "Berkshire Hathaway", slug: "berkshire", action: "trimmed", changePct: -13, filedDate: "2026-11-09" }],
  insiders: [
    { ticker: "NVDA", insider: "A", action: "sell", valueUsd: 24_100_000, planned: false, filedDate: "2026-11-10" },
    { ticker: "XOM", insider: "B", action: "buy", valueUsd: 1_500_000, planned: false, filedDate: "2026-11-10" },
  ],
  congress: [{ ticker: "KO", person: "Jane Doe", action: "buy", amountLow: 15_001, amountHigh: 50_000, disclosureDate: "2026-11-10" }],
  exposure: {
    company: { ticker: "NVDA", name: "NVIDIA", pct: 31, fundPct: 4, via: ["Invesco QQQ Trust"] },
    sector: { sector: "Technology", pct: 56, benchmarkPct: 37 },
    asOf: "2026-09-30",
  },
  dividends: [
    { ticker: "KO", name: "Coca-Cola", exDate: "2026-11-14", payDate: "2026-12-01", perShare: 0.51, amount: 5.1, changePct: 5, atRisk: false, payout: 70 },
    { ticker: "XOM", name: "Exxon Mobil", exDate: null, payDate: null, perShare: null, amount: null, changePct: null, atRisk: true, payout: 92 },
  ],
  stress: { name: "Covid crash", start: "2020-02-19", end: "2020-03-23", portfolio: -38, market: -34 },
  reasons: [{ ticker: "AAPL", verdict: "weaker", finding: "Services growth slowed to 8% from 12%.", source: "Company filing", asOf: "2026-11-01", data: { growth_pct: 8 } }],
});

const words = (text: string) => text.trim().split(/\s+/).length;

/* ── the week's line ────────────────────────────────────────────────────── */

describe("the week's curve", () => {
  it("starts at 0 on the close before Monday and ends on the week's own figures", () => {
    const perf = weekPerformance(inputs())!;
    expect(perf.daily.map((point) => point.day)).toEqual(["2026-11-06", "2026-11-09", "2026-11-10"]);
    expect(perf.daily[0]).toEqual({ day: "2026-11-06", portfolio: 0, market: 0 });
    const last = perf.daily[perf.daily.length - 1]!;
    expect(last.portfolio).toBe(perf.portfolioPct);
    expect(last.market).toBe(perf.marketPct);
    // Monday: (104 + 101 + 100 + 99 + 100) / 500 - 1 = +0.8%; the S&P 500 +1%.
    expect(perf.daily[1]).toEqual({ day: "2026-11-09", portfolio: 0.8, market: 1 });
  });

  it("puts each close in its weekday's slot, so a holiday leaves a gap", () => {
    const slots = curveSlots([
      { day: "2026-11-06", portfolio: 0, market: 0 },
      { day: "2026-11-10", portfolio: 1, market: 1 },
      { day: "2026-11-13", portfolio: 2, market: 1 },
    ]);
    expect(slots.map((row) => row.slot)).toEqual([0, 2, 5]);
  });

  it("picks round ticks that always include zero", () => {
    expect(niceTicks(-0.4, 2.4)).toEqual([-1, 0, 1, 2, 3]);
    expect(niceTicks(0.2, 0.9)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceTicks(-9.5, -1)).toEqual([-10, -7.5, -5, -2.5, 0]);
    // A quiet week still gets round ticks.
    expect(niceTicks(0, 0.01)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceTicks(-0.02, 0.03)).toEqual([-0.5, -0.25, 0, 0.25, 0.5, 0.75]);
  });
});

/* ── the headline ───────────────────────────────────────────────────────── */

describe("memoHeadline", () => {
  it("says the way the week went and the gap, one number in twelve words or fewer", () => {
    expect(memoHeadline({ portfolioPct: 1.23, marketPct: 2.01 }, false)).toBe("Up so far, 0.8 points behind the S&P 500");
    expect(memoHeadline({ portfolioPct: -0.4, marketPct: -1.5 }, true)).toBe("Down this week, 1.1 points ahead of the S&P 500");
    expect(memoHeadline({ portfolioPct: 2.1, marketPct: 2.0 }, true)).toBe("Up this week, in step with the S&P 500");
    expect(memoHeadline({ portfolioPct: 0.01, marketPct: 1 }, true)).toBe("Flat this week, 1.0 point behind the S&P 500");
    expect(memoHeadline({ portfolioPct: 3, marketPct: null }, true)).toBe("Up 3.0% this week");
    expect(memoHeadline({ portfolioPct: 0.02, marketPct: null }, false)).toBe("Flat so far");
    expect(memoHeadline(null, false)).toBe("Not enough prices to measure this week yet");
    for (const [a, b] of [[12.4, -8.9], [-0.05, 0.3], [100, -100], [1.2, 0.4]] as const) {
      for (const complete of [true, false]) {
        const headline = memoHeadline({ portfolioPct: a, marketPct: b }, complete);
        expect(words(headline)).toBeLessThanOrEqual(12);
        expect(headline.match(/\d+(?:\.\d+)?/g)?.filter((n) => n !== "500")).toHaveLength(1);
      }
    }
  });

  it("rounds the gap once, so the headline, the chart and the weeks agree", () => {
    expect(gapWords(-3.3, -2.7)).toBe("0.6 points behind the S&P 500");
    expect(gapWords(0.1, 0)).toBe("in step with the S&P 500");
    // 0.2549 rounds to 0.25: ahead, everywhere.
    expect(weekGap(1.2549, 1)).toEqual({ points: 0.25, side: "ahead" });
    expect(gapWords(1.2549, 1)).toBe("0.3 points ahead of the S&P 500");
    expect(weekGap(1, 1.2449)).toEqual({ points: -0.24, side: "in step" });
  });
});

/* ── who moved it ───────────────────────────────────────────────────────── */

describe("pickMovers", () => {
  it("takes the top helpers first and the worst hurters last, leaving out zeros", () => {
    const moves = [
      { ticker: "A", contribution: 0.5 },
      { ticker: "B", contribution: -0.2 },
      { ticker: "C", contribution: 1.4 },
      { ticker: "D", contribution: 0 },
      { ticker: "E", contribution: -1.1 },
      { ticker: "F", contribution: 0.1 },
      { ticker: "G", contribution: 0.05 },
      { ticker: "H", contribution: -0.01 },
      { ticker: "I", contribution: -0.3 },
    ].map((row) => ({ ...row, name: row.ticker, pct: 0, weight: 10 }));
    expect(pickMovers({ moves }).map((move) => move.ticker)).toEqual(["C", "A", "F", "B", "I", "E"]);
    expect(pickMovers(null)).toEqual([]);
  });

  it("opens the report when a holding reported, else why it moved, else the stock", () => {
    const { memo } = buildMemo(RICH);
    const href = Object.fromEntries(memo.view!.movers.map((mover) => [mover.ticker, mover.href]));
    expect(href.JPM).toBe("/stock/JPM/earnings/2026-11-10");
    expect(href.AAPL).toBe("/stock/AAPL/moves/2026-11-10");
    expect(href.XOM).toBe("/stock/XOM");
  });
});

/* ── the view on the memo ───────────────────────────────────────────────── */

describe("buildView", () => {
  it("carries the headline, curve, movers and net call changes", () => {
    const { memo } = buildMemo(RICH);
    const view = memo.view!;
    expect(view.headline).toBe(memoHeadline(weekPerformance(RICH), false));
    expect(view.curve).toHaveLength(3);
    expect(view.portfolioPct).toBe(weekPerformance(RICH)!.portfolioPct);
    expect(view.calls).toEqual([
      { ticker: "NVDA", name: "NVIDIA", from: "Hold", to: "Trim", date: "2026-11-09", flip: null },
      { ticker: "JPM", name: "JPMorgan Chase", from: "Trim", to: "Hold", date: "2026-11-10", flip: null },
    ]);
    expect(view.footnote).toBeNull();
    // The movers' points are the week's own contributions.
    const sum = view.movers.reduce((total, mover) => total + mover.points, 0);
    expect(Math.abs(sum - weekPerformance(RICH)!.portfolioPct)).toBeLessThan(0.05);
  });

  it("puts the holding left out in a footnote, not the headline", () => {
    const short = inputs({ series: new Map([...inputs().series, ["KO", series([100, 100, 100, 100, 100, 100])]]) });
    const { memo } = buildMemo(short);
    expect(memo.view!.footnote).toBe("Coca-Cola isn't in this week's line: we have no prices for it after Monday.");
    expect(memo.view!.headline).not.toContain("Coca-Cola");
  });

  it("has no curve when the week cannot be priced", () => {
    const { memo } = buildMemo(inputs({ benchmark: null }));
    expect(memo.view!.curve).toEqual([]);
    expect(memo.view!.headline).toBe("Not enough prices to measure this week yet");
  });

  it("keeps calls and drivers off the cards once there is a view", () => {
    const { memo } = buildMemo(RICH);
    expect(cardItems(memo.hurt, true).some((item) => item.kind === "call")).toBe(false);
    expect(cardItems(memo.changed, true).some((item) => item.kind === "drivers")).toBe(false);
    // An older memo with no view still lists its call sentences as cards.
    expect(cardItems(memo.hurt, false).some((item) => item.kind === "call")).toBe(true);
  });
});

/* ── cards ──────────────────────────────────────────────────────────────── */

describe("cards", () => {
  const { facts } = buildFacts(RICH);
  const carded = facts.filter((fact) => fact.kind !== "performance" && fact.kind !== "drivers");

  it("gives every fact a figure and a line of ten words or fewer", () => {
    expect(carded.length).toBeGreaterThanOrEqual(14);
    for (const fact of carded) {
      expect(fact.card, fact.id).toBeTruthy();
      expect(fact.card!.figure.length, fact.id).toBeGreaterThan(0);
      expect(words(fact.card!.label), `${fact.id}: ${fact.card!.label}`).toBeLessThanOrEqual(10);
    }
  });

  it("cites only figures its own fact holds (the same numbers check as the wording)", () => {
    for (const fact of carded) {
      const evidence = evidenceFor([fact]);
      const card = fact.card!;
      // The card's text drops units the check reads ("+2.0%" is a percentage, "$24.1M" money).
      expect(unsupportedNumber(`${card.figure.replace("−", "-")} ${card.label}`, evidence), `${fact.id}: ${card.figure} ${card.label}`).toBeNull();
    }
  });

  it("writes the cards a person reads", () => {
    const card = (id: string) => facts.find((fact) => fact.id === id)!.card!;
    expect(card("sector:Technology")).toMatchObject({ figure: "56%", label: "in Technology, against 37% of the S&P 500" });
    expect(card("sector:Technology").visual).toEqual({ kind: "share", pct: 56, benchmarkPct: 37, label: "Technology" });
    expect(card("insider_sell:NVDA")).toMatchObject({ figure: "$24.1M", label: "of NVIDIA stock sold by insiders" });
    expect(card("move:AAPL:2026-11-10")).toMatchObject({ figure: "−5.9%", sign: "down", label: "for Apple on Tuesday" });
    expect(card("report:JPM:2026-11-10")).toMatchObject({ figure: "+2.0%", sign: "up", label: "for JPMorgan Chase after its report beat estimates" });
    expect(card("upcoming")).toMatchObject({ figure: "Nov 18", label: "NVIDIA reports after the close, then one more" });
    expect(card("stress")).toMatchObject({ figure: "−38%", label: "for today's mix in the Covid crash" });
    expect(card("congress:KO:2026-11-10").figure).toBe("$15K–$50K");
    expect(card("dividends")).toMatchObject({ figure: "$5.10", label: "from Coca-Cola, ex-dividend Nov 14" });
  });

  it("words a report with no move yet, and a flat move without a colour", () => {
    const report = (over: Partial<MemoInputs["reports"][number]>) =>
      buildFacts(inputs({ reports: [{ ...RICH.reports[0]!, guidance: null, ...over }] })).facts.find((fact) => fact.kind === "report")!.card!;
    expect(report({ reactionPct: null, verdict: "in_line" })).toMatchObject({ figure: "In line", label: "with estimates in JPMorgan Chase's report on Tuesday" });
    expect(report({ reactionPct: null, verdict: "beat" })).toMatchObject({ figure: "Beat", label: "estimates in JPMorgan Chase's report on Tuesday" });
    expect(report({ reactionPct: null, verdict: null })).toMatchObject({ figure: "Reported", label: "JPMorgan Chase's earnings on Tuesday" });
    expect(report({ reactionPct: 0.01 })).toMatchObject({ figure: "0.0%", sign: null });
  });

  it("keeps a line at ten words when a name is long", () => {
    const long = buildFacts(
      inputs({
        holdings: [...HOLDINGS.slice(0, 4), { ...HOLDINGS[4]!, name: "The Coca-Cola Company Consolidated Holdings" }],
        funds: [{ ticker: "AAPL", fund: "Renaissance Technologies Medallion Partners Fund LLC", slug: "rentec", action: "new", changePct: null, filedDate: "2026-11-09" }],
        upcoming: [{ ticker: "KO", date: "2026-11-19", time: "bmo", typicalAbsPct: 2 }],
      }),
    ).facts;
    expect(long.find((fact) => fact.kind === "fund")!.card!.label).toBe("A tracked fund bought Apple for the first time");
    expect(long.find((fact) => fact.kind === "upcoming")!.card!.label).toBe("The Coca-Cola Company Consolidated Holdings reports before the open");
    for (const fact of long) if (fact.card) expect(words(fact.card.label), fact.card.label).toBeLessThanOrEqual(10);
  });
});

/* ── formatting ─────────────────────────────────────────────────────────── */

describe("signed figures", () => {
  it("use a true minus and never print a signed zero", () => {
    expect(signedPct(1.234)).toBe("+1.2%");
    expect(signedPct(-12.6)).toBe("−13%");
    expect(signedPct(-0.01)).toBe("0.0%");
    expect(signedPoints(0.62)).toBe("+0.6");
    expect(signedPoints(-0.08)).toBe("−0.08");
    expect(signedPoints(0.001)).toBe("0.00");
  });
});

/* ── storage ────────────────────────────────────────────────────────────── */

describe("stored memos", () => {
  it("read back with their view and cards, and list with their figures", () => {
    const { memo } = buildMemo(RICH, new Date("2026-11-11T15:00:00Z"));
    const stored = readStoredMemo(JSON.parse(JSON.stringify({ memo, day: "2026-11-11", signature: "s" })))!;
    expect(stored.memo.view).toEqual(memo.view);
    expect(stored.memo.hurt.map((item) => item.card)).toEqual(memo.hurt.map((item) => readItemCard(item.card)));
    expect(stored.memo.hurt.every((item) => item.card)).toBe(true);
    expect(historyRow(stored.memo)).toMatchObject({ headline: memo.view!.headline, portfolioPct: memo.view!.portfolioPct });
    // The view the page draws survives a write and a read unchanged.
    expect(readView(JSON.parse(JSON.stringify(buildMemo(RICH).memo.view)))).toEqual(buildMemo(RICH).memo.view);
  });

  it("drop a malformed view or card rather than show it, and keep older memos", () => {
    // A bad point drops the line (never a line with a day missing); a bad row is skipped; no headline, no view.
    expect(readView({ headline: "x", curve: [{ day: "2026-11-06", portfolio: 0 }, { day: "nope", portfolio: 1 }], movers: [], calls: [] })!.curve).toEqual([]);
    expect(
      readView({ headline: "x", curve: [], movers: [], calls: [{ ticker: "A", from: "Buy", to: "Hold", date: "2026-11-10" }, { ticker: "B", from: "Add", to: "Hold", date: "2026-11-10" }] })!.calls,
    ).toEqual([{ ticker: "B", name: "B", from: "Add", to: "Hold", date: "2026-11-10", flip: null }]);
    expect(readView({ curve: [] })).toBeNull();
    expect(readItemCard({ figure: "", label: "x" })).toBeNull();
    expect(readItemCard({ figure: "5%", label: "x", visual: { kind: "pie" } })).toEqual({ figure: "5%", label: "x", sign: null, visual: null });
    const { memo } = buildMemo(inputs());
    const older = JSON.parse(JSON.stringify({ ...memo, view: undefined }));
    const stored = readStoredMemo({ memo: older, day: "2026-11-11", signature: "s" })!;
    expect(stored.memo.view).toBeNull();
    expect(historyRow(stored.memo).portfolioPct).toBeNull();
  });
});

describe("what a changed call shows", () => {
  it("shows the call it replaced only for a one-step move between Keep and Buy more", () => {
    expect(callShows({ from: "Hold", to: "Add" })).toEqual({ was: "Hold", flip: null });
    expect(callShows({ from: "Add", to: "Hold" })).toEqual({ was: "Add", flip: null });
    // Never a sale beside Keep or Buy more.
    expect(callShows({ from: "Trim", to: "Hold" }).was).toBeNull();
    expect(callShows({ from: "Hold", to: "Trim" }).was).toBeNull();
    // A stored memo with no flip kept still catches a skipped step.
    expect(callShows({ from: "Trim", to: "Add" })).toEqual({ was: null, flip: "skip" });
    expect(callShows({ from: "Hold", to: "Add", flip: "reversal" })).toEqual({ was: null, flip: "reversal" });
  });

  it("reads a stored flip back, and nothing else", () => {
    const calls = readView({ headline: "x", curve: [], movers: [], calls: [{ ticker: "A", from: "Trim", to: "Add", date: "2026-11-10", flip: "skip" }, { ticker: "B", from: "Hold", to: "Add", date: "2026-11-10", flip: "odd" }] })!.calls;
    expect(calls.map((call) => call.flip)).toEqual(["skip", null]);
  });
});

describe("who the week's figure leaves out", () => {
  it("rewrites the stored wording as a plain fact, inside a paragraph too", () => {
    expect(plainLeftOut("Together, eight of nine are down 0.1% so far this week. Vanguard S&P 500 ETF is left out because its prices stop at Monday's close. The thing to watch is X.", "figure")).toBe(
      "Together, eight of nine are down 0.1% so far this week. Vanguard S&P 500 ETF isn't in this week's figure: we have no prices for it after Monday. The thing to watch is X.",
    );
    expect(plainLeftOut("Nothing to change here.")).toBe("Nothing to change here.");
    expect(plainLeftOut("Amazon.com is left out because it has no share count.")).toBe("Amazon.com isn't in this week's line: it has no share count.");
  });
});
