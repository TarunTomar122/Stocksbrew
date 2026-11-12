import { describe, expect, it } from "vitest";

import { clearableBy, groupByStock, mergeInbox, popoverItems, unreadRows } from "./merge";
import { inboxRead, inboxReadTold, rowsAfterRead } from "./read";
import type { UpcomingReport } from "./types";
import { findingItems, moveSentence, pastWhen, reportSentence, sessionBefore, type AgentRunRecord, type MoveContext, type RunFinding } from "./words";

const NOW = new Date("2026-11-11T23:00:00Z");
const SINCE = "2026-10-28T18:00:00.000Z";
const TODAY = "2026-11-11";

function move(ticker: string, pct: number, at = TODAY): RunFinding {
  return { ticker, headline: `${ticker} ${pct >= 0 ? "rose" : "fell"} ${Math.abs(pct)}% in the last session`, detail: "Closed at $1.", at, kind: "move", change_pct: pct };
}

function run(findings: RunFinding[], over: Partial<AgentRunRecord> = {}): AgentRunRecord {
  return { jobId: "job1", jobName: "Morning check", day: TODAY, ranAt: "2026-11-11T22:51:00Z", decision: "notify", summary: "Things moved.", tickers: [], findings, ...over };
}

const context = new Map<string, MoveContext>([
  ["MU", { normalPct: 4.27, reason: null }],
  ["DELL", { normalPct: 4.31, reason: { day: TODAY, pct: 11.77, line: "Dell rose as AI server demand picked up." } }],
  ["ASTS", { normalPct: 5.19, reason: { day: "2026-11-10", pct: 3, line: "An old reason." } }],
]);

describe("moves, stock by stock", () => {
  it("says the figure, the normal day only when the move is at least twice it, and when", () => {
    expect(moveSentence("MU", 11.89, TODAY, 4.27, TODAY)).toBe("MU rose 11.9% today, about three times a normal day.");
    expect(moveSentence("ASTS", 8.7, TODAY, 5.19, TODAY)).toBe("ASTS rose 8.7% today.");
    expect(moveSentence("NVDA", -5.47, "2026-11-10", null, TODAY)).toBe("NVDA fell 5.5% yesterday.");
    expect(pastWhen("2026-11-06", TODAY)).toBe("on Friday");
    expect(pastWhen("2026-11-02", TODAY)).toBe("on Nov 2");
  });

  it("makes one item per stock, with the reason only when it is confirmed for that same move", () => {
    const items = findingItems(run([move("MU", 11.89), move("DELL", 11.75), move("ASTS", 8.7)]), "mine", context, TODAY)!;
    expect(items.map((item) => item.text)).toEqual([
      "MU rose 11.9% today, about three times a normal day.",
      "DELL rose 11.8% today, about three times a normal day.",
      "ASTS rose 8.7% today.",
    ]);
    expect(items.map((item) => item.detail)).toEqual([null, "Dell rose as AI server demand picked up.", null]);
    expect(items[0]).toMatchObject({ id: "move:MU:2026-11-11", href: "/stock/MU", source: "Your agent", tone: "up", move: { pct: 11.89, day: TODAY, normalPct: 4.27 } });
  });

  it("reads older findings without a kind from their own words, keeps a report reminder only while it is ahead, and never calls a week's move a day's", () => {
    const items = findingItems(
      run([
        { ticker: "IREN", headline: "IREN rose 20.02% in the last session", detail: "Closed at $21.64 on Nov 6.", at: "2026-11-06" },
        { ticker: "CBRS", headline: "CBRS reports earnings in 3 days", detail: "Scheduled for Nov 12 after the close.", at: "2026-11-12" },
      ], { day: "2026-11-09", ranAt: "2026-11-09T11:00:00Z" }),
      "example",
      new Map(),
      TODAY,
    )!;
    expect(items.map((item) => item.text)).toEqual(["IREN rose 20.0% on Friday.", "CBRS reports tomorrow after the close."]);
    expect(items[0]!.source).toBe("Example agent");
    expect(items[1]).toMatchObject({ id: "report:CBRS:2026-11-12", kind: "results" });
    const past = findingItems(run([{ ticker: "CBRS", headline: "CBRS reports earnings tomorrow", detail: "Scheduled for Nov 10 before the open.", at: "2026-11-10", kind: "earnings" }]), "mine", new Map(), TODAY)!;
    // Nothing left to say stock by stock: the run's own summary is used instead (agentItem).
    expect(past).toBeNull();
    const [week] = findingItems(run([{ ticker: "MU", headline: "MU rose 12.03% over five sessions", detail: "", at: TODAY, kind: "move", change_pct: 12.03 }]), "mine", context, TODAY)!;
    expect(week).toMatchObject({ id: "span:MU:2026-11-11", text: "MU rose 12.0% over the five sessions to Nov 11.", move: null });
  });

  it("says a shared price level once for several stocks, and one stock's level with its own prices", () => {
    const level = (ticker: string, close: number, lvl: number): RunFinding => ({ ticker, headline: `${ticker} closed in its add zone`, detail: "", at: TODAY, kind: "level", change_pct: -2, close, zone: "add", level: lvl });
    const [many] = findingItems(run([level("SPCX", 139.75, 142.07), level("MSFT", 521.13, 530.61)]), "mine", new Map(), TODAY)!;
    expect(many!.text).toBe("SPCX and MSFT closed today at or below the price where our call says to buy more.");
    expect(many!.detail).toBe("SPCX at $139.75 against $142.07, MSFT at $521.13 against $530.61.");
    expect(many!.tickers).toEqual(["SPCX", "MSFT"]);
    const [one] = findingItems(run([level("SPCX", 139.75, 142.07)]), "mine", new Map(), TODAY)!;
    expect(one!.text).toBe("SPCX closed at $139.75 today, at or below $142.07, where our call says to buy more.");
  });

  it("falls back to the run's summary when the run has no findings to go on", () => {
    expect(findingItems(run([]), "mine")).toBeNull();
    expect(findingItems(run([{ ticker: null, headline: "Market fell", detail: "", at: TODAY }]), "mine")).toBeNull();
    expect(findingItems(run([move("MU", 4)], { decision: "nothing" }), "mine")).toEqual([]);
  });

  it("keeps one copy of a move two agents both reported", () => {
    const a = findingItems(run([move("MU", 11.89)]), "mine", context, TODAY)!;
    const b = findingItems(run([move("MU", 11.89)], { jobId: "job2", ranAt: "2026-11-11T22:52:00Z" }), "mine", context, TODAY)!;
    expect(mergeInbox([a, b], SINCE, NOW).filter((item) => item.tickers[0] === "MU")).toHaveLength(1);
  });
});

describe("one row per stock", () => {
  it("puts a stock's items in one row, its move first, and leaves items about several stocks alone", () => {
    const items = findingItems(
      run([
        { ticker: "SPCX", headline: "", detail: "", at: TODAY, kind: "level", close: 139.75, zone: "add", level: 142.07, change_pct: -2.3 },
        move("SPCX", -4.1),
        move("MU", 11.89),
      ]),
      "mine",
      context,
      TODAY,
    )!;
    const rows = groupByStock(mergeInbox([items], SINCE, NOW));
    expect(rows.map((row) => [row.ticker, row.items.map((item) => item.id.split(":")[0])])).toEqual([
      ["MU", ["move"]],
      ["SPCX", ["move", "level"]],
    ]);
    const shared = { ...rows[0]!.items[0]!, id: "follow:1", tickers: ["MU", "SPCX"] };
    expect(groupByStock([shared, ...rows[0]!.items]).map((row) => row.ticker)).toEqual([null, "MU"]);
  });
});

describe("reports coming up", () => {
  const report = (over: Partial<UpcomingReport> = {}): UpcomingReport => ({ ticker: "NVDA", date: "2026-11-17", session: "amc", history: "has moved 3.2% on a typical report", usualPct: 3.2, vsDay: null, ...over });

  it("reads as prep, with the history only when it is measured", () => {
    expect(reportSentence(report(), TODAY)).toBe("NVDA reports on Nov 17 after the close, and it has moved 3.2% on a typical report.");
    expect(reportSentence(report({ ticker: "NBIS", date: "2026-11-12", session: "bmo", history: null }), TODAY)).toBe("NBIS reports tomorrow before the open.");
    expect(reportSentence(report({ date: "2026-11-13", session: "unknown" }), TODAY)).toBe("NVDA reports on Friday, and it has moved 3.2% on a typical report.");
  });

  it("leads the read with unusual moves and the week's reports, and cards the report that moves most", () => {
    const items = mergeInbox([findingItems(run([move("MU", 11.89), move("DELL", 11.75), move("ASTS", 8.7)]), "mine", context, TODAY)!], SINCE, NOW);
    const upcoming = [report({ ticker: "NBIS", date: "2026-11-12", session: "bmo", history: null, usualPct: null }), report({ ticker: "CBRS", date: "2026-11-12", history: "moved 16% on average after its last two reports", usualPct: 15.7 }), report()];
    const read = inboxRead(items, "2026-11-01T00:00:00Z", false, { upcoming, today: TODAY })!;
    // One idea in the headline: the moves lead, the week's reports go underneath.
    expect(read.headline).toBe("2 of your stocks moved at least twice as much as usual today.");
    expect(read.sub).toBe("3 of your stocks report earnings in the next week.");
    const [moves, reports] = read.insights;
    expect(moves).toMatchObject({ id: "inbox-moves", text: "MU rose 11.9% today, about three times a normal day.", soWhat: "DELL also moved at least twice as much as usual.", tickers: ["MU", "DELL"], figure: { value: "+11.9%", tone: "up" } });
    expect(reports).toMatchObject({ id: "inbox-reports", text: "CBRS reports tomorrow after the close, and it moved 16% on average after its last two reports.", figure: { value: "16%" } });
    expect(reports!.soWhat).toBe("NBIS and NVDA also report in the next week.");
  });

  it("says the soonest report in the headline when nothing moved, and a read with only reports still shows", () => {
    const read = inboxRead([], null, false, { upcoming: [report({ ticker: "NBIS", date: "2026-11-12", session: "bmo", history: null, usualPct: null }), report()], today: TODAY })!;
    expect(read.headline).toBe("NBIS reports tomorrow before the open, the first of 2 reports on your stocks in the next week.");
    expect(read.insights.map((insight) => insight.id)).toEqual(["inbox-reports"]);
  });

  it("never says the headline's sentence again: one move and its report are one stock card with both figures", () => {
    const items = mergeInbox([findingItems(run([move("NVDA", -5.47, "2026-11-10")]), "example", new Map([["NVDA", { normalPct: 2.02, reason: null }]]), TODAY)!], SINCE, NOW);
    const { read, stock } = inboxReadTold(items, null, true, { upcoming: [report()], today: TODAY });
    // The agent's flag in the briefing card's own words, with its date (judges, ship 44: one thread across pages).
    expect(read!.headline).toBe("Your agent flagged NVDA's 5.5% drop on Nov 10.");
    expect(read!.sub).toBe("It reports on Nov 17 after the close.");
    // One card for NVDA, not two cards wearing the same logo.
    expect(read!.insights).toEqual([]);
    expect(stock).toEqual({
      ticker: "NVDA",
      // One tap from the flag to our call, as from the briefing's card.
      href: "/stock/NVDA#call",
      figures: [
        { value: "−5.5%", tone: "down", text: "A normal day is a move of about 2.0% either way." },
        { value: "3.2%", tone: "flat", text: "Its usual move on a report." },
      ],
      note: "Check our call on NVDA before the report.",
    });
    // Nothing more to say about a report with no history: no card.
    expect(inboxRead(items, null, true, { upcoming: [report({ history: null, usualPct: null })], today: TODAY })!.insights.map((insight) => insight.id)).toEqual(["inbox-moves"]);
  });
});

describe("QA round: stale quotes, rows, the bell", () => {
  it("drops a price older than the session before the run, so a stale quote never files under today", () => {
    expect(sessionBefore("2026-11-11")).toBe("2026-11-10");
    expect(sessionBefore("2026-11-09")).toBe("2026-11-06");
    // The Friday after Thanksgiving's session before is Wednesday.
    expect(sessionBefore("2026-11-27")).toBe("2026-11-25");
    const items = findingItems(run([move("NBIS", 9.36, "2026-11-09"), move("NVDA", -5.47, "2026-11-10"), move("MU", 11.89)]), "mine", context, TODAY)!;
    expect(items.map((item) => item.tickers[0])).toEqual(["NVDA", "MU"]);
  });

  it("counts unread rows, not items, and fills the popover by rows", () => {
    const items = mergeInbox(
      [findingItems(run([move("MU", 11.89), move("DELL", 11.75), move("ASTS", 8.7), { ticker: "MU", headline: "", detail: "", at: TODAY, kind: "level", close: 800, zone: "add", level: 820, change_pct: 11.89 }]), "mine", context, TODAY)!],
      SINCE,
      NOW,
    );
    expect(items).toHaveLength(4);
    expect(unreadRows(items, "2026-11-01T00:00:00Z", TODAY)).toBe(3);
    // One run, one time: the popover takes the whole run rather than half of it.
    expect(popoverItems(items, TODAY, 2).map((item) => item.tickers[0])).toEqual(["MU", "MU", "DELL", "ASTS"]);
    const later = { ...items.find((item) => item.tickers[0] === "ASTS")!, id: "move:AMD:2026-11-11", tickers: ["AMD"], at: "2026-11-11T23:30:00Z" };
    expect(popoverItems([later, ...items], TODAY, 1).map((item) => item.id)).toEqual(["move:AMD:2026-11-11"]);
  });

  it("lets the popover read itself only when nothing unread sits outside it at or before its newest item", () => {
    const at = (id: string, iso: string) => ({ ...findingItems(run([move("MU", 4)]), "mine", context, TODAY)![0]!, id, at: iso });
    const older = at("a", "2026-11-09T12:00:00Z");
    const newer = at("b", "2026-11-11T12:00:00Z");
    const newest = at("c", "2026-11-11T13:00:00Z");
    expect(clearableBy([older, newer, newest], [newer, newest], "2026-11-01T00:00:00Z")).toBe(false);
    expect(clearableBy([older, newer, newest], [newer, newest], "2026-11-10T00:00:00Z")).toBe(true);
    expect(clearableBy([older], [], "2026-11-01T00:00:00Z")).toBe(false);
  });

  it("leaves out of the rows what the read already says", () => {
    const items = mergeInbox([findingItems(run([move("NVDA", -5.47, "2026-11-10")]), "example", new Map([["NVDA", { normalPct: 2.02, reason: null }]]), TODAY)!], SINCE, NOW);
    const upcoming: UpcomingReport[] = [{ ticker: "NVDA", date: "2026-11-17", session: "amc", history: "has moved 3.2% on a typical report", usualPct: 3.2, vsDay: "about one and a half times a normal day" }];
    const { stock, told } = inboxReadTold(items, null, true, { upcoming, today: TODAY });
    expect(stock!.figures[1]!.value).toBe("3.2%");
    const rows = rowsAfterRead(items, upcoming, told, TODAY);
    // The read says the move and the report in full: no row for either, but the move still counts as shown.
    expect(rows.items[0]).toMatchObject({ text: "NVDA fell 5.5% yesterday.", detail: null, told: true });
    expect(rows.upcoming).toEqual([]);
  });

  it("drops the report card when the headline already says the report and there is no history to add", () => {
    const upcoming: UpcomingReport[] = ["NBIS", "XPEV"].map((ticker) => ({ ticker, date: "2026-11-12", session: "bmo" as const, history: null, usualPct: null, vsDay: null }));
    const read = inboxRead([], null, false, { upcoming, today: TODAY })!;
    expect(read.headline).toBe("NBIS reports tomorrow before the open, the first of 2 reports on your stocks in the next week.");
    expect(read.insights).toEqual([]);
  });

  it("keeps a reason the card does not give, and the history of a report only the headline names", () => {
    const ctx = new Map<string, MoveContext>([
      ["MU", { normalPct: 8, reason: { day: TODAY, pct: 13, line: "Micron rose on record memory prices." } }],
      ["AMD", { normalPct: 1, reason: { day: TODAY, pct: 3, line: "AMD rose after a new chip deal." } }],
    ]);
    // AMD is the one unusual move (headline); MU is the biggest (card), with its reason on the card.
    const items = mergeInbox([findingItems(run([move("MU", 13), move("AMD", 3)]), "mine", ctx, TODAY)!], SINCE, NOW);
    const upcoming: UpcomingReport[] = [{ ticker: "NBIS", date: "2026-11-12", session: "bmo", history: "rose 4.6% after its last report", usualPct: 4.6, vsDay: null }];
    const { told } = inboxReadTold(items, "2026-11-01T00:00:00Z", false, { upcoming, today: TODAY });
    const rows = rowsAfterRead(items, upcoming, told, TODAY);
    // The card tells MU's move and its reason: no row left to draw.
    expect(rows.items.find((item) => item.tickers[0] === "MU")).toMatchObject({ text: "MU rose 13.0% today.", detail: null, told: true });
    // The headline says AMD's move but never its reason: the row keeps it.
    const amd = rows.items.find((item) => item.tickers[0] === "AMD")!;
    expect(amd).toMatchObject({ text: "AMD rose 3.0% today.", detail: "AMD rose after a new chip deal." });
    expect(amd.told).toBeUndefined();
    // NBIS's day is under the headline and its history on its card: no row says either again.
    expect(rows.upcoming).toEqual([]);
    // Carded only (the day not named above): the row says only the day.
    expect(rowsAfterRead(items, upcoming, { ...told, reportDays: [] }, TODAY).upcoming[0]!.text).toBe("NBIS reports tomorrow before the open.");
    // Named above with no history carded: the row keeps the history.
    const onlyHeadline = rowsAfterRead(items, upcoming, { ...told, reports: [], reportDays: [] }, TODAY);
    expect(onlyHeadline.upcoming[0]!.text).toBe("NBIS reports tomorrow before the open, and it rose 4.6% after its last report.");
  });

  it("says one flagged move in the singular", () => {
    const items = mergeInbox([findingItems(run([move("MU", 4)]), "mine", new Map(), TODAY)!], SINCE, NOW);
    expect(inboxRead(items, "2026-11-01T00:00:00Z", false)!.headline).toBe("Since you last looked, your agents flagged a move in one of your stocks.");
  });
});
