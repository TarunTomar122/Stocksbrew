import { describe, expect, it } from "vitest";

import type { ResultRead } from "@/lib/results/types";

import { mergeInbox } from "./merge";
import { inboxReadTold, rowsAfterRead } from "./read";
import { resultsItem } from "./words";

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
  it("says what the person's stock reported, how it moved and where the call stands", () => {
    const item = resultsItem(read(), "holding", "mine", TODAY)!;
    expect(item.kind).toBe("results");
    expect(item.text).toBe(
      "CRWV, which you own, lost $1.27 a share, less than the $1.55 expected, and the stock is up 25% today, bigger than its usual 17% move after a report.",
    );
    // Where the call stands is said once by the read, never on the row (owner rule 1).
    expect(item.detail).toBeNull();
    expect(item.tone).toBe("up");
    // Placed at the report (after the close on Nov 10), or when the figures were stored if that was later.
    expect(item.at).toBe("2026-11-10T23:00:28.738Z");
    expect(item.exact).toBe(false);
    expect(item.id).toBe("results:CRWV:2026-11-10");
    expect(item.href).toBe("/stock/CRWV");
  });

  it("names the example's stocks as the example's", () => {
    expect(resultsItem(read(), "holding", "example", TODAY)!.text.startsWith("CRWV, which the example portfolio holds, lost")).toBe(true);
    expect(resultsItem(read(), "watchlist", "mine", TODAY)!.text.startsWith("CRWV, which you watch, lost")).toBe(true);
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

describe("results in the read (bugs 1 and 5)", () => {
  const SEEN = "2026-11-10T12:00:00Z";

  it("bug 1: a fresh result leads the headline, and its row keeps only the figures", () => {
    const item = resultsItem(read(), "holding", "mine", TODAY)!;
    const { read: theRead, told } = inboxReadTold([item], SEEN, false, { upcoming: [], today: TODAY });
    expect(theRead!.headline).toBe("CRWV lost less than expected and is up 25% today, bigger than its usual move after a report.");
    expect(theRead!.sub).toBe("Our call is still Buy more after the results.");
    const rows = rowsAfterRead([item], [], told, TODAY);
    expect(rows.items[0]!.text).toBe("CRWV, which you own, lost $1.27 a share, less than the $1.55 expected.");
  });

  it("bug 1: several results are named once, with the one that moved most", () => {
    const crwv = resultsItem(read(), "holding", "mine", TODAY)!;
    const ceg = resultsItem(
      read({ ticker: "CEG", reportDate: "2026-11-09", session: "bmo", eps: { actual: 5.06, expected: 3.9, verdict: "beat", surprisePct: 29.7, source: "x", asOf: null }, move: { pct: 10.46, kind: "day", day: "2026-11-10", nextDay: false, usualPct: 2.02, usualCount: 7, source: "x", asOf: null }, call: { status: "changed", call: "Keep", from: "Buy more", on: "2026-11-10", reason: null, asOf: "2026-11-10" } }),
      "holding",
      "mine",
      TODAY,
    )!;
    const { read: theRead, told } = inboxReadTold([crwv, ceg], "2026-11-01T00:00:00Z", false, { upcoming: [], today: TODAY });
    expect(theRead!.headline).toBe("CRWV and CEG reported results, and CRWV moved the most, up 25% today.");
    expect(theRead!.sub).toBe("After the results we moved our call on CEG to Keep, and kept it on CRWV.");
    // Each row still tells its own figures and move: they differ row to row.
    expect(rowsAfterRead([crwv, ceg], [], told, TODAY).items.map((row) => row.text)).toEqual([crwv.text, ceg.text]);
  });

  it("bug 5: the call line is never on the rows, so it is not repeated row after row", () => {
    const rows = ["CRWV", "QLYS", "CEG"].map((ticker) => resultsItem(read({ ticker }), "holding", "mine", TODAY)!);
    expect(rows.every((row) => row.detail === null)).toBe(true);
    const { read: theRead } = inboxReadTold(rows, "2026-11-01T00:00:00Z", false, { upcoming: [], today: TODAY });
    expect(theRead!.sub).toBe("Our call stayed the same on all three after the results.");
  });

  it("bug 5: a stock with no current call gets no call words", () => {
    const item = resultsItem(read({ call: null }), "holding", "mine", TODAY)!;
    expect(item.result!.call).toBeNull();
    expect(inboxReadTold([item], SEEN, false, { upcoming: [], today: TODAY }).read!.sub).toBeUndefined();
  });

  it("bug 2: sits under the report day, but a result stored after the person last looked is still new", () => {
    // CRWV reported Nov 10 after the close; the actual landed a day later, after they last looked.
    const late = resultsItem(read({ eps: { ...read().eps!, asOf: "2026-11-11T23:00:18Z" } }), "holding", "mine", TODAY)!;
    expect(late.day).toBe("2026-11-11");
    expect(inboxReadTold([late], "2026-11-11T20:00:00Z", false, { upcoming: [], today: TODAY }).read!.headline).toMatch(/^CRWV lost less than expected/);
    // Stored the same evening: the row sits under the report day.
    const prompt = resultsItem(read({ eps: { ...read().eps!, asOf: "2026-11-10T22:00:00Z" } }), "holding", "mine", TODAY)!;
    expect(prompt.day).toBe("2026-11-10");
  });

  it("leaves the headline to the day's news once the result has been seen", () => {
    const item = resultsItem(read(), "holding", "mine", TODAY)!;
    expect(inboxReadTold([item], "2026-11-11T20:00:00Z", false, { upcoming: [], today: TODAY }).read!.headline).toBe("Nothing new since you last looked.");
  });
});
