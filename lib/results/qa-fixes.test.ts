import { describe, expect, it } from "vitest";

import { resultLineDay } from "@/components/results/result-line";
import { figureColumns, figureSpan } from "@/components/results/results-block";

import { buildResult, callAfter, epsResult, eventFromDoc, isOvernight, pickMove } from "./build";
import type { ResultMove, ResultRead } from "./types";
import { briefingResultFact, figureCells, moveShort, resultFact, resultHeadline, resultSentence, signed, usualClause } from "./words";

/**
 * The nine QA findings that kept results night parked (docs/volaren-parity-hillclimb.md), one test each. The inbox's
 * own three (the headline, the repeated call line, a failed read cached as whole) are in lib/inbox/results.test.ts.
 */

const TODAY = "2026-11-12";

function read(patch: Partial<ResultRead> = {}): ResultRead {
  return {
    ticker: "CRWV",
    company: "CoreWeave, Inc.",
    reportDate: "2026-11-10",
    session: "amc",
    period: null,
    eps: { actual: -1.28, expected: -1.45, ...epsResult(-1.28, -1.45), source: "Alpha Vantage", asOf: "2026-11-11T23:00:18Z" },
    revenue: null,
    guidance: null,
    move: { pct: 24.85, kind: "day", day: "2026-11-11", nextDay: true, usualPct: 17.41, usualCount: 6, source: "last price of the session", asOf: "2026-11-11T20:59:00Z" },
    call: { status: "held", call: "Buy more", asOf: "2026-11-11" },
    reportHref: null,
    sources: [],
    ...patch,
  };
}

const move = (patch: Partial<ResultMove>): ResultMove => ({ ...read().move!, ...patch });

describe("bug 2: a move is said with its own day, never an undated 'the next day'", () => {
  it("dates the move", () => {
    expect(moveShort(move({}), TODAY)).toBe("up 25% yesterday");
    expect(moveShort(move({ day: "2026-11-10" }), TODAY)).toBe("up 25% on Tuesday");
    expect(moveShort(move({ day: "2026-11-03" }), TODAY)).toBe("up 25% on Nov 3");
    const sentence = resultSentence(read(), "CRWV", TODAY);
    expect(sentence).toContain("rose 25% yesterday");
    expect(sentence).not.toContain("the next day");
    expect(figureCells(read(), TODAY).find((cell) => cell.label === "The stock")!.sub).toBe("Yesterday, usually 17%");
  });

  it("takes the session's last snapshot (15:59) as the day's move once the session is over", () => {
    const base = { date: "2026-11-10", session: "amc" as const, today: TODAY, now: new Date("2026-11-12T08:30:00Z"), past: null, priceMeta: null, premarket: null };
    expect(pickMove({ ...base, quote: { pct: 24.85, capturedAt: "2026-11-11T20:59:00+00:00" } })).toMatchObject({ pct: 24.85, kind: "day", day: "2026-11-11" });
    // Read the same evening, it is the close too: "closed up 25% today", not "is up 25% today".
    const evening = pickMove({ ...base, today: "2026-11-11", now: new Date("2026-11-12T01:00:00Z"), quote: { pct: 24.85, capturedAt: "2026-11-11T20:59:00+00:00" } });
    expect(evening).toMatchObject({ kind: "day", day: "2026-11-11" });
    expect(resultSentence(read({ move: { ...evening!, usualPct: null, usualCount: 0 } }), "CRWV", "2026-11-11")).toContain("the stock closed up 25% today");
    // During the session the same kind of quote is still live.
    expect(pickMove({ ...base, today: "2026-11-11", now: new Date("2026-11-11T20:59:30Z"), quote: { pct: 24.85, capturedAt: "2026-11-11T20:59:00+00:00" } })).toMatchObject({ kind: "today" });
    // An earlier quote from that session is not how it ended.
    expect(pickMove({ ...base, quote: { pct: 20, capturedAt: "2026-11-11T19:00:00+00:00" } })).toBeNull();
  });
});

describe("bug 2 (planner): the report day is said in words", () => {
  it("says today, yesterday, the weekday, then the date", () => {
    expect(resultLineDay(TODAY, TODAY)).toBe("Today");
    expect(resultLineDay("2026-11-11", TODAY)).toBe("Yesterday");
    expect(resultLineDay("2026-11-09", TODAY)).toBe("Monday");
    expect(resultLineDay("2026-11-03", TODAY)).toBe("Nov 3");
  });
});

describe("bug 3: overnight means after the last close or before today's open", () => {
  it("leaves out the last session's morning reports", () => {
    expect(isOvernight("2026-11-11", "amc", TODAY)).toBe(true);
    expect(isOvernight("2026-11-12", "bmo", TODAY)).toBe(true);
    expect(isOvernight("2026-11-11", "bmo", TODAY)).toBe(false);
    expect(isOvernight("2026-11-11", "unknown", TODAY)).toBe(false);
    expect(isOvernight("2026-11-10", "amc", TODAY)).toBe(false);
    // Monday: Friday after the close and a weekend release are overnight; Friday morning is not.
    expect(isOvernight("2026-11-13", "amc", "2026-11-16")).toBe(true);
    expect(isOvernight("2026-11-14", "unknown", "2026-11-16")).toBe(true);
    expect(isOvernight("2026-11-13", "bmo", "2026-11-16")).toBe(false);
  });
});

describe("bug 4: every figure rounds the same way", () => {
  it("shows the same move in the figure and the sentence, and works the ratio out from the shown numbers", () => {
    const r = read({ move: move({ pct: 25.45 }) });
    expect(figureCells(r, TODAY).find((cell) => cell.label === "The stock")!.value).toBe("+25%");
    expect(resultFact(r, TODAY)).toBe("Beat by 12%, up 25% yesterday");
    expect(signed(9.96)).toBe("+10%");
    expect(signed(-3.14)).toBe("−3.1%");
    // 10% against 2% on the page is 5 times; the raw 10.46 / 2.02 would say 5.2.
    expect(usualClause(move({ pct: 10.46, usualPct: 2.02, usualCount: 7 }))).toBe("about 5 times its usual 2% move after a report");
  });

  it("rounds the surprise once", () => {
    // 14.45% stored as 14.5 then rounded again said 15%; rounded once it is 14%.
    const eps = { actual: 1.14450, expected: 1, ...epsResult(1.1445, 1), source: "x", asOf: null };
    expect(resultFact(read({ eps, move: null }), TODAY)).toBe("Beat by 14%");
  });
});

describe("bug 5 (results side): an old call is never said", () => {
  it("drops a call whose last run is weeks old, even when the document was touched today", () => {
    const stale = { call: "Add", session: "2026-09-22", updated_at: "2026-11-11T11:10:23Z", changes: [] };
    expect(callAfter(stale, "2026-11-10", "amc", TODAY)).toBeNull();
    expect(callAfter({ ...stale, session: "2026-11-11" }, "2026-11-10", "amc", TODAY)).toMatchObject({ status: "held", call: "Buy more" });
  });
});

describe("bug 7: 'Call reviewed' is the run's own day, not updated_at", () => {
  it("dates the review by the run, and says none before the first run after the results", () => {
    const event = eventFromDoc({ ticker: "CRWV", company: "CoreWeave", event_date: "2026-11-10", market: "US", time: "amc", reported_eps: -1.28, estimated_eps: -1.45, eps_estimate: -1.45, actuals_captured_at: "2026-11-11T23:00:18Z" })!;
    const input = { event, today: TODAY, now: new Date("2026-11-12T08:30:00Z"), history: null, priceMeta: null, quote: null, premarket: null, release: null };
    const held = buildResult({ ...input, stability: { call: "Add", session: "2026-11-11", updated_at: "2026-11-12T03:00:00Z", changes: [] } })!;
    expect(held.sources.find((source) => source.label === "Call reviewed")!.at).toBe("2026-11-11");
    const changed = buildResult({ ...input, stability: { call: "Hold", session: "2026-11-11", updated_at: "2026-11-12T03:00:00Z", changes: [{ date: "2026-11-11", from: "Add", to: "Hold" }] } })!;
    expect(changed.sources.find((source) => source.label === "Call reviewed")!.at).toBe("2026-11-11");
    const pending = buildResult({ ...input, today: "2026-11-11", stability: { call: "Add", session: "2026-11-10", updated_at: "2026-11-11T03:00:00Z", changes: [] } })!;
    expect(pending.call!.status).toBe("pending");
    expect(pending.sources.some((source) => source.label === "Call reviewed")).toBe(false);
  });
});

describe("bug 8: no empty figure slot", () => {
  it("gives the figures as many columns as there are figures", () => {
    expect(figureColumns(1)).toBe("grid-cols-1");
    expect(figureColumns(2)).toBe("grid-cols-2");
    expect(figureColumns(3)).toBe("grid-cols-2 sm:grid-cols-3");
    expect(figureColumns(4)).toBe("grid-cols-2 sm:grid-cols-4");
  });

  it("lets a phone's odd third figure take the whole row, and only that one", () => {
    expect(figureSpan(3, 2)).toBe("max-sm:col-span-2");
    expect([figureSpan(3, 0), figureSpan(3, 1), figureSpan(1, 0), figureSpan(4, 3), figureSpan(2, 1)]).toEqual(["", "", "", "", ""]);
  });
});

describe("bug 9: beat or miss is judged before rounding", () => {
  it("does not call a 0.96% surprise a beat", () => {
    expect(epsResult(1.0096, 1).verdict).toBe("in_line");
    expect(epsResult(0.9904, 1).verdict).toBe("in_line");
    expect(epsResult(1.01, 1).verdict).toBe("beat");
    expect(epsResult(0.99, 1).verdict).toBe("miss");
    expect(epsResult(1.0096, 1).surprisePct).toBeCloseTo(0.96, 6);
  });
});

describe("the morning-after read", () => {
  it("gives the inbox one short headline and the briefing card one fact", () => {
    expect(resultHeadline(read(), TODAY)).toBe("CRWV lost less than expected and rose 25% yesterday, bigger than its usual move after a report.");
    // A held call would be the same words on every card, so it is left out. The card's figure is today's move, so a
    // results move from an earlier session keeps its own number and day.
    expect(briefingResultFact(read(), TODAY)).toBe("Beat by 12%, up 25% yesterday, bigger than usual on results");
    // Only today's own results move goes without its number: the card's figure already is it.
    expect(briefingResultFact(read({ move: move({ kind: "today", day: TODAY }) }), TODAY)).toBe("Beat by 12%, and the move is bigger than usual on results");
    const ceg = read({ ticker: "CEG", eps: { actual: 5.06, expected: 3.9, ...epsResult(5.06, 3.9), source: "x", asOf: null }, move: move({ pct: 10.46, kind: "before_open", day: TODAY, usualPct: 2.02, usualCount: 7 }), call: { status: "changed", call: "Keep", from: "Buy more", on: TODAY, reason: null, asOf: TODAY } });
    expect(resultHeadline(ceg, TODAY)).toBe("CEG beat the EPS estimate and is up 10% before the open, about 5 times its usual move after a report.");
    // Before the open the chip gives the pre-market move itself: the card's figure is the last close, not this.
    expect(briefingResultFact(ceg, TODAY)).toBe("Beat by 30%, up 10% before the open, about 5 times its usual on results");
    expect(briefingResultFact(read({ call: { status: "pending", call: "Keep", asOf: null }, move: null }), TODAY)).toBe("Beat by 12%");
  });
});
