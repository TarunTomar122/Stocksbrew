import { describe, expect, it } from "vitest";

import { bigScore, biggestThings, fitLine, wordCount, type BigCandidate } from "@/lib/biggest";
import { briefingBiggest } from "@/lib/briefing-biggest";
import type { BriefingPosition } from "@/lib/briefing";
import type { OvernightCard } from "@/lib/briefing-overnight";
import type { InboxItem } from "@/lib/inbox/types";
import { resultsItem } from "@/lib/inbox/words";
import { threadBiggest } from "@/lib/thread/biggest";

import { buildResult, epsResult, eventFromDoc, pickMove, releaseEps, releaseParts } from "./build";
import type { ResultRead } from "./types";
import { figureCells, reportRatio, resultCardFacts, resultCardLines, resultCardsByTicker } from "./words";

/**
 * Results night in "Biggest things" (lib/biggest.ts): a report card says what was reported in at most 15 words and
 * ranks by its move against the stock's usual move after a report. The reads are the real ones from Nov 13, 2026.
 */

const TODAY = "2026-11-13";

function read(patch: Partial<ResultRead> = {}): ResultRead {
  return {
    ticker: "CEG",
    company: "Constellation Energy",
    reportDate: "2026-11-09",
    session: "bmo",
    period: null,
    eps: { actual: 5.06, expected: 3.9, ...epsResult(5.06, 3.9), source: "Alpha Vantage", asOf: "2026-11-11T23:00:41Z" },
    revenue: null,
    guidance: null,
    move: { pct: 10.46, kind: "day", day: "2026-11-09", nextDay: false, usualPct: 2.02, usualCount: 7, source: "daily closes from Yahoo Finance", asOf: "2026-11-09" },
    call: null,
    reportHref: null,
    sources: [],
    ...patch,
  };
}

const CBRS = read({
  ticker: "CBRS",
  company: "Cerebras Systems",
  reportDate: "2026-11-12",
  session: "amc",
  // The calendar's $0.13 is not said: the release shows a GAAP loss of $0.67 and no adjusted EPS (releaseEps).
  eps: null,
  revenue: { value: 210_809_000, yoyPct: 55.3, expected: null, verdict: null, surprisePct: null, source: "The company's 8-K release", url: "https://www.sec.gov/x", asOf: "2026-11-12T21:03:59Z" },
  guidance: { change: "raised", first: null, previous: null, fullYear: true, source: "The company's 8-K release", url: "https://www.sec.gov/x", asOf: "2026-11-12T21:03:59Z" },
  move: { pct: 11.51, kind: "before_open", day: TODAY, nextDay: true, usualPct: 15.73, usualCount: 2, source: "pre-market price", asOf: "2026-11-13T13:35:00Z" },
});

const QLYS = read({
  ticker: "QLYS",
  company: "Qualys",
  session: "amc",
  eps: { actual: 1.67, expected: 1.46, ...epsResult(1.67, 1.46), source: "Nasdaq earnings calendar", asOf: "2026-11-10T22:30:03Z" },
  move: { pct: -13.51, kind: "day", day: "2026-11-10", nextDay: true, usualPct: 3.65, usualCount: 7, source: "daily closes from Yahoo Finance", asOf: "2026-11-10" },
});

describe("the card's line", () => {
  it("says EPS against the estimate, revenue growth and the outlook, in 15 words or fewer", () => {
    // CBRS has only two earlier reports measured, so there is no usual move to compare with.
    expect(fitLine(resultCardLines(resultCardFacts(CBRS), 18.3))).toBe("Revenue rose 55% to $211M, and the full-year outlook was raised.");
  });

  it("compares the move with the stock's usual move after a report", () => {
    expect(fitLine(resultCardLines(resultCardFacts(read()), 10.46))).toBe("EPS was $5.06 vs $3.90 expected; the move is 5.2× its usual on results.");
    expect(fitLine(resultCardLines(resultCardFacts(QLYS), -13.51))).toBe("EPS was $1.67 vs $1.46 expected; the move is 3.7× its usual on results.");
    // ASTS fell 8.7% against a usual 6.6%: bigger, not a multiple.
    const asts = read({ ticker: "ASTS", eps: { actual: -0.44, expected: -0.41, ...epsResult(-0.44, -0.41), source: "x", asOf: null }, move: { ...read().move!, pct: -8.67, usualPct: 6.63 } });
    expect(fitLine(resultCardLines(resultCardFacts(asts), -8.67))).toBe("EPS was −$0.44 vs −$0.41 expected; the move is bigger than usual on results.");
    // About the usual size says nothing worth the words.
    expect(fitLine(resultCardLines(resultCardFacts(read()), 2.1))).toBe("EPS was $5.06 vs $3.90 expected.");
  });

  it("works the comparison out on the move the card shows, an after-hours print included", () => {
    // The read's own move is yesterday's; the card shows tonight's after-hours print.
    expect(fitLine(resultCardLines(resultCardFacts(read()), 4.4))).toBe("EPS was $5.06 vs $3.90 expected; the move is 2.2× its usual on results.");
    expect(reportRatio(4.4, 2.02)).toBeCloseTo(4.4 / 2.02, 6);
    // The card shows −13.5%; QLYS usually moves 3.65%: 3.7 times, not 3.8 from two rounded numbers.
    expect(reportRatio(-13.51, 3.65)).toBeCloseTo(3.699, 3);
    expect(reportRatio(0.01, 2.02)).toBeNull();
    expect(reportRatio(null, 2.02)).toBeNull();
    expect(reportRatio(5, null)).toBeNull();
  });

  it("drops the least telling parts to fit, never cutting a sentence", () => {
    const full = read({ revenue: CBRS.revenue, guidance: { ...CBRS.guidance!, change: "mixed" } });
    const lines = resultCardLines(resultCardFacts(full), 10.46);
    for (const line of lines) expect(line.endsWith(".")).toBe(true);
    const picked = fitLine(lines)!;
    expect(wordCount(picked)).toBeLessThanOrEqual(15);
    // The mixed outlook is too long to sit beside the EPS pair at all, so the reaction takes its place.
    expect(picked).toBe("EPS was $5.06 vs $3.90 expected; the move is 5.2× its usual on results.");
    expect(lines[0]).toBe("EPS was $5.06 vs $3.90 expected, revenue rose 55% to $211M, and the full-year outlook was raised in part and cut in part; the move is 5.2× its usual on results.");
    // A raised outlook outlasts revenue and the reaction: it is the bigger news.
    const raised = read({ revenue: CBRS.revenue, guidance: CBRS.guidance });
    expect(fitLine(resultCardLines(resultCardFacts(raised), 10.46))).toBe("EPS was $5.06 vs $3.90 expected, revenue rose 55%, and the full-year outlook was raised.");
    // A first outlook reads "a", never "a outlook" or "a full-year outlook" mixed up.
    expect(fitLine(resultCardLines(resultCardFacts(read({ guidance: { ...CBRS.guidance!, change: "issued", fullYear: false } })), null))).toBe("EPS was $5.06 vs $3.90 expected, and an outlook was given.");
    expect(fitLine(resultCardLines(resultCardFacts(read({ guidance: { ...CBRS.guidance!, change: "issued" } })), null))).toBe("EPS was $5.06 vs $3.90 expected, and a full-year outlook was given.");
    // Revenue alone (no EPS posted yet) still makes a line.
    expect(fitLine(resultCardLines(resultCardFacts(read({ eps: null, revenue: CBRS.revenue })), null))).toBe("Revenue rose 55% to $211M.");
  });

  it("says nothing without figures", () => {
    expect(resultCardFacts(read({ eps: null }))).toBeNull();
    expect(resultCardLines(null, 5)).toEqual([]);
    expect(resultCardsByTicker([read({ eps: null }), QLYS])).toEqual({ QLYS: resultCardFacts(QLYS) });
  });
});

describe("the ranking", () => {
  const card = (patch: Partial<BigCandidate>): BigCandidate => ({ ticker: "X", name: "X", kind: "results", pct: 10, session: null, price: 10, holding: true, line: null, day: TODAY, source: null, href: "/stock/X", ...patch });

  it("weighs a report's move against the stock's usual move after a report", () => {
    // CEG's 10% on a usual 2% outranks a 12% move on a stock that usually moves 17% on results.
    const things = biggestThings([card({ ticker: "CRWV", pct: 12, usualPct: 17.4 }), card({ ticker: "CEG", pct: 10.46, usualPct: 2.02 })]);
    expect(things.map((thing) => thing.ticker)).toEqual(["CEG", "CRWV"]);
  });

  it("is unchanged without a usual move (results night off)", () => {
    expect(bigScore(card({ pct: 10 }))).toBe(bigScore(card({ pct: 10, usualPct: null })));
    expect(bigScore(card({ pct: 10 }))).toBe(10 * 1.5 * 1.25);
    // A report with no reaction yet keeps its fixed size.
    expect(bigScore(card({ pct: null, usualPct: 4 }))).toBe(3 * 1.5 * 1.25);
  });
});

const position = (ticker: string): BriefingPosition => ({
  instrument_id: `US_${ticker}`,
  ticker,
  name: ticker,
  relation: "holding",
  price: 100,
  day_change_pct: 0,
  price_as_of: null,
  stance: null,
  call_summary: null,
  watch_out: null,
  add_below: null,
  breakout_above: null,
  trim_above: null,
  earnings_date: null,
  earnings_time: null,
  pre_earnings_headline: null,
});

const PRINT: OvernightCard = { ticker: "CBRS", name: "Cerebras Systems", session: "post", pct: 18.3, price: 115.68, asOf: "2026-11-13T00:59:56.000Z", line: "Reported after the close yesterday: raised its outlook and beat on earnings", holding: true };

describe("the briefing's report card", () => {
  const base = { positions: [position("CBRS")], overnight: [PRINT], moved: [], since: [], priceDay: "2026-11-12", reportDays: { CBRS: "2026-11-12" } };

  it("uses results night's figures with the after-hours print as its move", () => {
    const [thing] = briefingBiggest({ ...base, reports: { CBRS: "CBRS reported revenue of $211M, up 55% from a year ago and raised its outlook." }, cards: resultCardsByTicker([CBRS]) });
    expect(thing).toMatchObject({ ticker: "CBRS", kind: "results", session: "post", pct: 18.3, day: "2026-11-12", line: "Revenue rose 55% to $211M, and the full-year outlook was raised." });
  });

  it("keeps the module's line when results night is off", () => {
    const [thing] = briefingBiggest(base);
    expect(thing!.line).toBe("Reported after the close yesterday: raised its outlook and beat on earnings.");
    expect(thing!.usualPct).toBeNull();
  });
});

describe("/agent's report card", () => {
  const item = resultsItem(CBRS, "holding", "mine", TODAY)!;
  const input = { today: TODAY, holding: new Set(["CBRS"]), names: { CBRS: "Cerebras Systems" }, prices: { CBRS: 108.8 }, levels: () => true };

  it("carries the card's facts on the inbox item", () => {
    expect(item.result!.card).toEqual(resultCardFacts(CBRS));
  });

  it("says the figures, with the after-hours print as the move when there is one", () => {
    const [alone] = threadBiggest({ ...input, items: [item] });
    expect(alone).toMatchObject({ kind: "results", pct: 11.51, session: "pre", day: "2026-11-12", line: "Revenue rose 55% to $211M, and the full-year outlook was raised." });
    const [merged] = threadBiggest({ ...input, items: [item], overnight: [PRINT] });
    expect(merged).toMatchObject({ pct: 18.3, session: "post", price: 115.68, line: alone!.line });
  });

  it("reads an older item without facts as before", () => {
    const old: InboxItem = { ...item, result: { ...item.result!, card: undefined } };
    const [thing] = threadBiggest({ ...input, items: [old] });
    expect(thing!.line).toBe("Reported revenue of $211M, up 55% from a year ago and raised its outlook.");
    expect(thing!.usualPct).toBeNull();
  });
});

describe("EPS on results night, before the actuals job", () => {
  // TTEK, Nov 11: the calendar's pair stored with the release, before tm_earnings_events had its actual.
  const release = {
    ticker: "TTEK",
    event_date: "2026-11-11",
    generated_at: "2026-11-11T21:13:09Z",
    filing: { url: "https://www.sec.gov/x", filed_at: "2026-11-11T21:03:59Z" },
    eps: { actual: 0.49, estimate: 0.47, actual_source: "Nasdaq earnings calendar", estimate_source: "Nasdaq earnings calendar", gaap: { value: 0.51 }, adjusted: null },
    revenue: { value: 1_337_362_000, yoy_pct: 0.5 },
    guidance: { change: "issued", items: [] },
  };
  const row = { ticker: "TTEK", company: "Tetra Tech", event_date: "2026-11-11", market: "US", time: "amc", reported_eps: null, estimated_eps: null, eps_estimate: 0.47, captured_at: "2026-11-09T20:13:41Z" };
  const input = { today: TODAY, now: new Date("2026-11-12T13:40:00Z"), history: null, priceMeta: null, quote: null, premarket: null, stability: null };

  it("takes the pair the earnings day job stored with the release", () => {
    const built = buildResult({ ...input, event: eventFromDoc(row)!, release })!;
    expect(built.eps).toMatchObject({ actual: 0.49, expected: 0.47, verdict: "beat", source: "Nasdaq earnings calendar", asOf: "2026-11-11T21:13:09Z" });
    expect(built.sources[0]).toMatchObject({ label: "EPS and estimate", source: "Nasdaq earnings calendar" });
  });

  it("never a profit the release does not show", () => {
    // CBRS: the calendar's $0.13 against the release's GAAP loss of $0.67, with no adjusted EPS in it.
    const cbrs = { ...release, eps: { ...release.eps, actual: 0.13, estimate: -0.13, gaap: { value: -0.67 } } };
    expect(releaseEps(cbrs, -0.13)).toBeNull();
    // With an adjusted figure in the release, the provider's adjusted actual stands.
    expect(releaseEps({ ...cbrs, eps: { ...cbrs.eps, adjusted: { value: 0.12 } } }, -0.13)).toMatchObject({ actual: 0.13 });
  });

  it("never when the calendar has its own actual, a pair from two providers, or one on another basis", () => {
    // NBIS: the calendar has an actual, but its two estimates disagree, so no EPS is said at all.
    const nbis = eventFromDoc({ ...row, ticker: "NBIS", reported_eps: -0.13, estimated_eps: -1.24, eps_estimate: -0.61 })!;
    expect(nbis.eps).toBeNull();
    expect(buildResult({ ...input, event: nbis, release: { ...release, eps: { ...release.eps, actual: 0.3, estimate: -0.61 } } })!.eps).toBeNull();
    expect(releaseEps({ ...release, eps: { ...release.eps, estimate_source: "Yahoo Finance" } }, 0.47)).toBeNull();
    expect(releaseEps({ ...release, eps: { ...release.eps, estimate: -1.5 } }, 0.47)).toBeNull();
    expect(releaseEps(null, null)).toBeNull();
  });
});

describe("a full-year outlook", () => {
  const doc = (guidance: Record<string, unknown>) => ({ filing: { url: "https://www.sec.gov/x" }, guidance });
  it("is read from the lead item's period, or the release's headline when it lists no ranges", () => {
    expect(releaseParts(doc({ change: "raised", headline_quote: "Raises Full-Year Outlook", items: [] })).guidance!.fullYear).toBe(true);
    expect(releaseParts(doc({ change: "raised", items: [{ label: "Revenue", metric: "revenue", period: "Fiscal 2027", low: 7.98e9, high: 8.18e9, unit: "usd", direction: "raised" }] })).guidance!.fullYear).toBe(true);
    expect(releaseParts(doc({ change: "raised", items: [{ label: "Revenue", metric: "revenue", period: "Q4 2026", low: 3.1e8, high: 3.3e8, unit: "usd", direction: "raised" }] })).guidance!.fullYear).toBe(false);
    expect(releaseParts(doc({ change: "lowered", headline_quote: "Updates Outlook", items: [] })).guidance!.fullYear).toBe(false);
  });
});

describe("the minutes after the open", () => {
  const base = { date: "2026-11-12", session: "amc" as const, today: TODAY, past: null, priceMeta: null, quote: { pct: -3.24, capturedAt: "2026-11-12T20:59:00Z" } };
  const premarket = { pct: 12.85, date: TODAY, at: "2026-11-13T14:25:00Z", price: 110.31 };

  it("keeps the pre-market print until the session's first quote, up to 10:30", () => {
    expect(pickMove({ ...base, now: new Date("2026-11-13T14:35:00Z"), premarket })).toMatchObject({ pct: 12.85, kind: "before_open", price: 110.31 });
    expect(pickMove({ ...base, now: new Date("2026-11-13T15:31:00Z"), premarket })).toBeNull();
    // Once the session's own quote is in, that is the move.
    expect(pickMove({ ...base, now: new Date("2026-11-13T14:45:00Z"), premarket, quote: { pct: 9.1, capturedAt: "2026-11-13T14:40:00Z" } })).toMatchObject({ pct: 9.1, kind: "today" });
  });

  it("says the print's own price on the stock page's figure", () => {
    const cell = figureCells(CBRS, TODAY).find((one) => one.label === "The stock")!;
    expect(cell.sub).toBe("Before the open");
    const priced = figureCells({ ...CBRS, move: { ...CBRS.move!, price: 110.31 } }, TODAY).find((one) => one.label === "The stock")!;
    expect(priced.sub).toBe("Before the open, at $110.31");
  });
});

describe("an overnight report no module carries", () => {
  const positions = [{ ...position("CBRS"), name: "Cerebras Systems", price: 97.81 }];
  const read = { ...CBRS, move: { ...CBRS.move!, price: 110.31 } };

  it("is still a card on the briefing, with the read's move", () => {
    const [thing] = briefingBiggest({ positions, overnight: [], moved: [], since: [], priceDay: TODAY, cards: resultCardsByTicker([read]), reads: [read], today: TODAY });
    expect(thing).toMatchObject({ ticker: "CBRS", kind: "results", pct: 11.51, session: "pre", price: 110.31, day: "2026-11-12", line: "Revenue rose 55% to $211M, and the full-year outlook was raised." });
  });

  it("is not added twice, nor for an older report, nor with results night off", () => {
    expect(briefingBiggest({ positions, overnight: [PRINT], moved: [], since: [], priceDay: TODAY, cards: resultCardsByTicker([read]), reads: [read], today: TODAY })).toHaveLength(1);
    expect(briefingBiggest({ positions, overnight: [], moved: [], since: [], priceDay: TODAY, reads: [{ ...read, reportDate: "2026-11-10" }], today: TODAY })).toEqual([]);
    expect(briefingBiggest({ positions, overnight: [], moved: [], since: [], priceDay: TODAY, reads: [], today: TODAY })).toEqual([]);
  });
});

describe("the price beside a report's move", () => {
  it("is the move's own price on /agent, not the screener's older close", () => {
    const live = { ...CBRS, move: { ...CBRS.move!, pct: 14.4, kind: "today" as const, price: 111.82 } };
    const item = resultsItem(live, "holding", "mine", TODAY)!;
    expect(item.result!.movePrice).toBe(111.82);
    const [thing] = threadBiggest({ today: TODAY, items: [item], holding: new Set(["CBRS"]), names: {}, prices: { CBRS: 97.81 }, levels: () => true });
    expect(thing).toMatchObject({ pct: 14.4, price: 111.82, session: null });
    // Without one (an older item), the screener's price as before.
    const old: InboxItem = { ...item, result: { ...item.result!, movePrice: undefined } };
    expect(threadBiggest({ today: TODAY, items: [old], holding: new Set(["CBRS"]), names: {}, prices: { CBRS: 97.81 }, levels: () => true })[0]!.price).toBe(97.81);
  });

  it("comes from the live quote in the read", () => {
    const base = { date: "2026-11-12", session: "amc" as const, today: TODAY, past: null, priceMeta: null, premarket: null };
    expect(pickMove({ ...base, now: new Date("2026-11-13T14:40:00Z"), quote: { pct: 14.4, capturedAt: "2026-11-13T14:37:00Z", price: 111.82 } })).toMatchObject({ kind: "today", price: 111.82 });
  });
});
