import { describe, expect, it } from "vitest";

import type { ResultRead } from "@/lib/results/types";

import { inboxRows, mergeInbox } from "./merge";
import { rowsAfterRead } from "./read";
import { findingItems, resultsItem } from "./words";

const TODAY = "2026-11-11";

const read = (patch: Partial<ResultRead> = {}): ResultRead => ({
  ticker: "CRWV",
  company: "CoreWeave, Inc.",
  reportDate: "2026-11-10",
  session: "amc",
  period: null,
  eps: { actual: -1.27, expected: -1.55, verdict: "beat", surprisePct: 18.1, source: "Yahoo Finance", asOf: "2026-11-10T23:00:28.738345+00:00" },
  revenue: null,
  guidance: null,
  move: { pct: 25.45, kind: "today", day: TODAY, nextDay: true, usualPct: 17.41, usualCount: 6, source: "Live price", asOf: "2026-11-11T19:03:00+00:00" },
  call: { status: "held", call: "Buy more", asOf: "2026-11-11T15:08:52Z" },
  reportHref: null,
  sources: [],
  ...patch,
});

describe("results items", () => {
  it("says in one line what the person's stock reported and how it moved", () => {
    const item = resultsItem(read(), "holding", "mine", TODAY)!;
    expect(item.kind).toBe("results");
    // One line, the result and the move (owner rule 8): no "which you own", no usual-move clause.
    expect(item.text).toBe("CRWV lost $1.27 a share, less than the $1.55 expected, and is up 25% today.");
    // Where the call stands is said once by the read, never on the row (owner rule 1).
    expect(item.detail).toBeNull();
    expect(item.tone).toBe("up");
    // Placed on the session its move belongs to (today, at the live quote), the day the sentence names, not on the
    // evening the figures were stored.
    expect(item.at).toBe("2026-11-11T19:03:00.000Z");
    expect(item.day).toBe(TODAY);
    expect(item.exact).toBe(false);
    expect(item.id).toBe("results:CRWV:2026-11-10");
    expect(item.href).toBe("/stock/CRWV");
  });

  it("names the example's stocks as the example's", () => {
    // The row's line names only the stock; the read above it, which tells the move, says whose stock it is.
    expect(resultsItem(read(), "holding", "example", TODAY)!.result!.figures.startsWith("CRWV, which the example portfolio holds, lost")).toBe(true);
    expect(resultsItem(read(), "watchlist", "mine", TODAY)!.result!.figures.startsWith("CRWV, which you watch, lost")).toBe(true);
    expect(resultsItem(read(), "holding", "example", TODAY)!.text.startsWith("CRWV lost")).toBe(true);
  });

  it("makes no item without figures or a report day", () => {
    expect(resultsItem(read({ eps: null }), "holding", "mine", TODAY)).toBeNull();
    expect(resultsItem(read({ reportDate: "not a day" }), "holding", "mine", TODAY)).toBeNull();
    // A stored time is not needed: the report day places the row.
    expect(resultsItem(read({ eps: { ...read().eps!, asOf: null } }), "holding", "mine", TODAY)).not.toBeNull();
  });

  it("keeps one item per report through the merge, the same id on every read", () => {
    const first = resultsItem(read(), "holding", "mine", TODAY)!;
    const later = resultsItem(read({ move: { ...read().move!, pct: 22 } }), "holding", "mine", TODAY)!;
    const merged = mergeInbox([[first], [later]], "2026-10-28T00:00:00Z", new Date("2026-11-11T20:00:00Z"));
    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe(first.id);
  });
});

describe("results rows (bugs 1, 2 and 5)", () => {
  const NOTHING = { moveIds: [], reasonIds: [], reports: [] };

  it("bug 1: a result told above the list keeps only its figures on its row", () => {
    const item = resultsItem(read(), "holding", "mine", TODAY)!;
    const rows = rowsAfterRead([item], [], { ...NOTHING, resultIds: [item.id] }, TODAY);
    expect(rows.items[0]!.text).toBe("CRWV, which you own, lost $1.27 a share, less than the $1.55 expected.");
  });

  it("bug 1: rows nobody told keep their own figures and move", () => {
    const crwv = resultsItem(read(), "holding", "mine", TODAY)!;
    const ceg = resultsItem(
      read({ ticker: "CEG", reportDate: "2026-11-09", session: "bmo", eps: { actual: 5.06, expected: 3.9, verdict: "beat", surprisePct: 29.7, source: "x", asOf: null }, move: { pct: 10.46, kind: "day", day: "2026-11-10", nextDay: false, usualPct: 2.02, usualCount: 7, source: "x", asOf: null }, call: { status: "changed", call: "Keep", from: "Buy more", on: "2026-11-10", reason: null, asOf: "2026-11-10" } }),
      "holding",
      "mine",
      TODAY,
    )!;
    expect(rowsAfterRead([crwv, ceg], [], NOTHING, TODAY).items.map((row) => row.text)).toEqual([crwv.text, ceg.text]);
  });

  it("bug 5: the call line is never on the rows, so it is not repeated row after row", () => {
    const rows = ["CRWV", "QLYS", "CEG"].map((ticker) => resultsItem(read({ ticker }), "holding", "mine", TODAY)!);
    expect(rows.every((row) => row.detail === null)).toBe(true);
  });

  it("bug 5: a stock with no current call gets no call words", () => {
    const item = resultsItem(read({ call: null }), "holding", "mine", TODAY)!;
    expect(item.result!.call).toBeNull();
  });

  it("bug 2: sits under the report day, but a result stored after the person last looked is still new", () => {
    // CRWV reported Nov 10 after the close; the actual landed a day later, after they last looked.
    const late = resultsItem(read({ eps: { ...read().eps!, asOf: "2026-11-11T23:00:18Z" } }), "holding", "mine", TODAY)!;
    expect(late.day).toBe("2026-11-11");
    // Stored the same evening, with no move yet: the row sits under the report day.
    const prompt = resultsItem(read({ move: null, eps: { ...read().eps!, asOf: "2026-11-10T22:00:00Z" } }), "holding", "mine", TODAY)!;
    expect(prompt.day).toBe("2026-11-10");
    // With its move, it sits under the move's session, the day the sentence names.
    expect(resultsItem(read({ eps: { ...read().eps!, asOf: "2026-11-10T22:00:00Z" } }), "holding", "mine", TODAY)!.day).toBe(TODAY);
  });
});

describe("one row, one session (council, Nov 12)", () => {
  // ASTS on Thu Nov 12: reported Monday after the close, fell 8.7% on Tuesday; the figures were stored Wednesday
  // evening, the same evening the agent saw Wednesday's +8.7%.
  const THURSDAY = "2026-11-12";
  const asts = read({
    ticker: "ASTS",
    company: "AST SpaceMobile",
    reportDate: "2026-11-09",
    eps: { actual: -0.44, expected: -0.41, verdict: "miss", surprisePct: -7.3, source: "Yahoo Finance", asOf: "2026-11-11T22:51:00Z" },
    move: { pct: -8.67, kind: "day", day: "2026-11-10", nextDay: true, usualPct: null, usualCount: 0, source: "Daily closes", asOf: null },
  });

  it("files the report under the session of its move, not the evening its figures landed", () => {
    const item = resultsItem(asts, "holding", "mine", THURSDAY)!;
    expect(item.day).toBe("2026-11-10");
    expect(item.text).toMatch(/fell 8\.7% on Tuesday/);
    // New since the figures landed Wednesday evening.
    expect(item.arrivedAt).toBe("2026-11-11T22:51:00.000Z");
  });

  it("never shares a row with another session's move of the same stock", () => {
    const result = resultsItem(asts, "holding", "mine", THURSDAY)!;
    const [agentMove] = findingItems(
      { jobId: "j", jobName: "Evening check", day: "2026-11-11", ranAt: "2026-11-11T22:51:00Z", decision: "notify", summary: "", tickers: ["ASTS"], findings: [{ ticker: "ASTS", headline: "", detail: "", at: "2026-11-11", kind: "move", change_pct: 8.7 }] },
      "mine",
      new Map(),
      THURSDAY,
    )!;
    const rows = inboxRows(mergeInbox([[result, agentMove!]], "2026-10-28T00:00:00Z", new Date("2026-11-12T20:00:00Z")), THURSDAY);
    const astsRows = rows.filter((row) => row.ticker === "ASTS");
    expect(astsRows.map((row) => [row.day, row.items.length])).toEqual([["2026-11-11", 1], ["2026-11-10", 1]]);
    for (const row of astsRows) {
      const signs = new Set(row.items.map((item) => (/\b(?:rose|up)\b/.test(item.text) ? "up" : /\b(?:fell|down)\b/.test(item.text) ? "down" : "?")));
      expect(signs.size).toBe(1);
    }
  });
});
