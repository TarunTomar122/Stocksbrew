import { describe, expect, it } from "vitest";

import type { ResultMove, ResultRead } from "./types";
import { callLine, figureCells, marginWords, moveShort, pctWords, reportedWords, resultFact, resultSentence, summarize, usualClause, verdictPhrase } from "./words";

const TODAY = "2026-11-11";

function read(patch: Partial<ResultRead> = {}): ResultRead {
  return {
    ticker: "CRWV",
    company: "CoreWeave, Inc.",
    reportDate: "2026-11-10",
    session: "amc",
    period: null,
    eps: { actual: -1.27, expected: -1.55, verdict: "beat", surprisePct: 18.1, source: "Yahoo Finance", asOf: "2026-11-10T23:00:28Z" },
    revenue: null,
    guidance: null,
    move: { pct: 25.45, kind: "today", day: TODAY, nextDay: true, usualPct: 17.41, usualCount: 6, source: "Live price", asOf: "2026-11-11T19:03:00Z" },
    call: { status: "held", call: "Buy more", asOf: "2026-11-11T15:08:52Z" },
    reportHref: null,
    sources: [],
    ...patch,
  };
}

const move = (patch: Partial<ResultMove>): ResultMove => ({ ...read().move!, ...patch });

describe("numbers", () => {
  it("rounds big percentages to whole numbers and keeps one decimal below ten", () => {
    expect(pctWords(18.1)).toBe("18%");
    expect(pctWords(-8.27)).toBe("8.3%");
    expect(pctWords(2)).toBe("2%");
  });

  it("says a surprise on a tiny estimate in dollars a share, not as a 133% beat", () => {
    expect(marginWords({ actual: 0.35, expected: 0.15, surprisePct: 133.3 })).toBe("$0.20 a share");
    expect(marginWords({ actual: 0.03, expected: 0.07, surprisePct: -57.1 })).toBe("$0.04 a share");
    expect(marginWords({ actual: 0.1, expected: 0, surprisePct: null })).toBe("$0.10 a share");
    expect(marginWords({ actual: 0.61, expected: 0.49, surprisePct: 24.5 })).toBe("25%");
  });

  it("names beats, misses and in-line results", () => {
    expect(verdictPhrase(read().eps!)).toBe("beat by 18%");
    expect(verdictPhrase({ ...read().eps!, actual: 1.45, expected: 1.46, verdict: "in_line", surprisePct: -0.7 })).toBe("in line");
    expect(verdictPhrase({ ...read().eps!, actual: 0.42, expected: 0.46, verdict: "miss", surprisePct: -8.7 })).toBe("missed by 8.7%");
  });
});

describe("the move", () => {
  it("says when the move happened", () => {
    expect(moveShort(move({}), TODAY)).toBe("up 25% today");
    expect(moveShort(move({ kind: "day", day: "2026-11-10", pct: -13.51 }), TODAY)).toBe("down 14% yesterday");
    expect(moveShort(move({ kind: "day", day: "2026-11-09", nextDay: false, pct: 10.46 }), TODAY)).toBe("up 10% on Monday");
    expect(moveShort(move({ kind: "before_open", pct: 4.2 }), TODAY)).toBe("up 4.2% before the open");
    expect(moveShort(move({ pct: 0.01 }), TODAY)).toBe("flat today");
  });

  it("compares with the usual report move only with enough history", () => {
    // From the numbers the page shows: 10% against 2% is 5 times, not the 5.2 the unrounded figures give.
    expect(usualClause(move({ pct: 10.46, usualPct: 2.02, usualCount: 7 }))).toBe("about 5 times its usual 2% move after a report");
    expect(usualClause(move({ pct: 25.45, usualPct: 17.41 }))).toBe("bigger than its usual 17% move after a report");
    expect(usualClause(move({ pct: -5, usualPct: 5.4 }))).toBe("about its usual 5.4% move after a report");
    expect(usualClause(move({ pct: 1, usualPct: 5.4 }))).toBe("smaller than its usual 5.4% move after a report");
    expect(usualClause(move({ usualCount: 2 }))).toBe("");
    expect(usualClause(move({ usualPct: null }))).toBe("");
  });
});

describe("the sentence", () => {
  it("says a loss against an expected loss as the loss", () => {
    expect(resultSentence(read(), "CoreWeave", TODAY)).toBe(
      "CoreWeave lost $1.27 a share, less than the $1.55 expected, and the stock is up 25% today, bigger than its usual 17% move after a report.",
    );
  });

  it("uses the past tense once the session is over", () => {
    const qlys = read({
      ticker: "QLYS",
      eps: { actual: 1.67, expected: 1.46, verdict: "beat", surprisePct: 14.4, source: "Nasdaq earnings calendar", asOf: null },
      move: move({ kind: "day", day: "2026-11-10", pct: -13.51, usualPct: 3.65, usualCount: 7 }),
    });
    expect(resultSentence(qlys, "Qualys", TODAY)).toBe("Qualys beat the EPS estimate by 14%, and the stock fell 14% yesterday, about 3.8 times its usual 3.7% move after a report.");
  });

  it("adds the outlook from the release and leaves the move out when there is none", () => {
    const ceg = read({
      ticker: "CEG",
      eps: { actual: 5.06, expected: 3.9, verdict: "beat", surprisePct: 29.7, source: "Alpha Vantage", asOf: null },
      guidance: { change: "raised", first: "Full year 2026 adjusted EPS $12.50 to $12.80", previous: null, source: "The company's 8-K release", url: "https://www.sec.gov/x", asOf: null },
      move: null,
    });
    expect(resultSentence(ceg, "Constellation Energy", TODAY)).toBe("Constellation Energy beat the EPS estimate by 30% and raised its outlook.");
    expect(resultFact(ceg, TODAY)).toBe("Beat by 30%");
  });

  it("says nothing without figures", () => {
    expect(resultSentence(read({ eps: null }), "CoreWeave", TODAY)).toBe("");
    expect(resultFact(read({ eps: null }), TODAY)).toBeNull();
    expect(summarize(read({ eps: null }), "CoreWeave", TODAY)).toBeNull();
  });

  it("falls back to revenue against a year ago", () => {
    const revenueOnly = read({ eps: null, move: null, revenue: { value: 1_497_000_000, yoyPct: -15.6, expected: null, verdict: null, surprisePct: null, source: "8-K", url: "https://www.sec.gov/x", asOf: null } });
    expect(resultSentence(revenueOnly, "Take-Two", TODAY)).toBe("Take-Two reported revenue of $1.50B, down 16% from a year ago.");
    expect(resultFact(revenueOnly, TODAY)).toBe("Revenue down 16% on a year ago");
  });

  it("says revenue against the estimate and a year ago, and the outlook with its numbers", () => {
    const revenue = { value: 269_348_000, yoyPct: 413.7, expected: 247_563_070, verdict: "beat" as const, surprisePct: 8.8, source: "The company's 8-K release", url: "https://www.sec.gov/x", asOf: null };
    const guidance = { change: "lowered" as const, first: "Fiscal 2026 adjusted EPS $2.90 to $2.95", previous: "$3.05 to $3.15", source: "The company's 8-K release", url: "https://www.sec.gov/x", asOf: null };
    const lunr = read({ ticker: "LUNR", eps: null, move: null, revenue });
    expect(resultSentence(lunr, "Intuitive Machines", TODAY)).toBe("Intuitive Machines reported revenue of $269M, above the $248M expected.");
    expect(resultFact(lunr, TODAY)).toBe("Revenue beat by 8.8%");
    const cells = figureCells(read({ revenue, guidance, move: null }), TODAY);
    expect(cells.map((cell) => [cell.label, cell.value, cell.sub, cell.tone])).toEqual([
      ["EPS", "−$1.27", "vs −$1.55 expected, beat by 18%", "up"],
      ["Revenue", "$269M", "vs $248M expected, beat by 8.8%, up 414% on a year ago", "up"],
      ["Outlook", "Cut", "Fiscal 2026 adjusted EPS $2.90 to $2.95, was $3.05 to $3.15", "down"],
    ]);
    // Every sub line stays within the owner's 15 words.
    expect(cells.every((cell) => cell.sub.split(/\s+/).length <= 15)).toBe(true);
    expect(cells[1]!.title).toContain("Yahoo Finance");
  });
});

describe("the call and the card", () => {
  it("says whether the results moved the call", () => {
    expect(callLine({ status: "held", call: "Keep", asOf: null }, TODAY)).toBe("Our call is still Keep after the results.");
    expect(callLine({ status: "pending", call: "Keep", asOf: null }, TODAY)).toBe("Our call is Keep.");
    expect(callLine({ status: "changed", call: "Buy more", from: "Keep", on: TODAY, reason: null, asOf: null }, TODAY)).toBe("We moved our call from Keep to Buy more today after the results.");
    expect(callLine({ status: "changed", call: "Keep", from: "Buy more", on: "2026-11-10", reason: null, asOf: null }, TODAY)).toBe("We moved our call from Buy more to Keep yesterday after the results.");
  });

  it("gives the card one fact and the row its figures", () => {
    expect(resultFact(read(), TODAY)).toBe("Beat by 18%, up 25% today");
    expect(figureCells(read(), TODAY)).toEqual([
      { label: "EPS", value: "−$1.27", sub: "vs −$1.55 expected, beat by 18%", title: "EPS and estimate: Yahoo Finance, Nov 10, 6:00 PM ET", tone: "up" },
      { label: "The stock", value: "+25%", sub: "Today, usually 17%", title: "Live price, Nov 11, 2:03 PM ET", tone: "up" },
    ]);
    expect(reportedWords(read(), TODAY)).toBe("Reported yesterday after the close");
  });
});
