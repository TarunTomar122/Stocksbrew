import { describe, expect, it } from "vitest";

import type { InboxItem, UpcomingReport } from "@/lib/inbox/types";
import { findingItems } from "@/lib/inbox/words";

import { againstMarket, buildThread, dayName, eventNote, sessionMoves, sessionSentence, upcomingNote, type ThreadInput } from "./build";
import { threadSuggestions } from "./suggest";

const TODAY = "2026-11-12"; // a Thursday

function item(partial: Partial<InboxItem> & Pick<InboxItem, "id" | "kind" | "text">): InboxItem {
  return {
    at: "2026-11-11T21:35:00.000Z",
    day: "2026-11-11",
    exact: true,
    tickers: [],
    detail: null,
    href: "/agents",
    external: false,
    source: "Your agent",
    tone: "flat",
    quiet: false,
    locked: false,
    dedupeKey: partial.id,
    weight: 1,
    thread: null,
    ...partial,
  };
}

function report(partial: Partial<UpcomingReport> & Pick<UpcomingReport, "ticker" | "date">): UpcomingReport {
  return { session: "amc", history: null, usualPct: null, vsDay: null, ...partial };
}

function input(partial: Partial<ThreadInput> = {}): ThreadInput {
  return {
    status: "ready",
    example: false,
    today: TODAY,
    items: [],
    upcoming: [],
    morning: null,
    sessions: [],
    group: { total: 3, holdings: true },
    calls: {},
    levels: () => true,
    stocks: 3,
    ...partial,
  };
}

const NVDA_DROP = item({
  id: "move:NVDA:2026-11-11",
  kind: "agent",
  tickers: ["NVDA"],
  text: "NVDA fell 5.5% on Wednesday, about three times a normal day for it.",
  detail: "Chip export limits widened to more of its parts.",
  href: "/stock/NVDA",
  tone: "down",
  move: { pct: -5.5, day: "2026-11-11", normalPct: 1.8, close: 139.8 },
});

describe("day words", () => {
  it("names days the way a conversation does", () => {
    expect(dayName(TODAY, TODAY)).toBe("Today");
    expect(dayName("2026-11-11", TODAY)).toBe("Yesterday");
    expect(dayName("2026-11-09", TODAY)).toBe("Monday");
    expect(dayName("2026-11-02", TODAY)).toBe("Nov 2");
  });

  it("sets a move against the S&P 500 in points, or in line", () => {
    expect(againstMarket(1.2, 0.8)).toBe("0.4 points better than the S&P 500");
    expect(againstMarket(-1.0, 0.0)).toBe("1.0 point worse than the S&P 500");
    expect(againstMarket(0.51, 0.49)).toBe("in line with the S&P 500");
    expect(againstMarket(0.5, null)).toBe("");
  });
});

describe("sessions from daily closes", () => {
  const series = new Map([
    ["NVDA", { dates: ["2026-11-10", "2026-11-11"], closes: [100, 95] }],
    ["AAPL", { dates: ["2026-11-10", "2026-11-11"], closes: [200, 202] }],
    ["MSFT", { dates: ["2026-11-10", "2026-11-11"], closes: [400, 404] }],
  ]);
  const benchmark = { dates: ["2026-11-10", "2026-11-11"], closes: [600, 603] };

  it("averages the stocks' close-to-close moves and reads the S&P 500 the same session", () => {
    const [move] = sessionMoves({ series, tickers: ["NVDA", "AAPL", "MSFT"], benchmark, today: TODAY });
    expect(move!.day).toBe("2026-11-11");
    expect(move!.pct).toBeCloseTo(-1, 5);
    expect(move!.marketPct).toBeCloseTo(0.5, 5);
    expect(sessionSentence(move!, TODAY, { total: 3, holdings: true })).toBe("Yesterday, your 3 holdings fell 1.0% on average, 1.5 points worse than the S&P 500.");
  });

  it("does not speak for a group it barely measured", () => {
    expect(sessionMoves({ series, tickers: ["NVDA", "X1", "X2", "X3"], benchmark, today: TODAY })).toEqual([]);
  });

  it("says how many of the group it counted when some are missing", () => {
    const [move] = sessionMoves({ series, tickers: ["NVDA", "AAPL", "MSFT", "ZZZ"], benchmark, today: TODAY });
    expect(sessionSentence(move!, TODAY, { total: 4, holdings: true })).toMatch(/^Yesterday, 3 of your 4 holdings fell/);
  });
});

describe("event notes", () => {
  it("keeps the figure, the confirmed reason and a step that names the report when one is ahead", () => {
    const note = eventNote(NVDA_DROP, { levels: () => true, today: TODAY }, new Map([["NVDA", "2026-11-20"]]))!;
    expect(note.kind).toBe("event");
    expect(note.figure).toEqual({ value: "−5.5%", tone: "down" });
    expect(note.reason).toBe("Chip export limits widened to more of its parts.");
    expect(note.step).toEqual({ label: "Check our call on NVDA before Nov 20", href: "/stock/NVDA#call" });
    // The agent is the one talking: its own name is not a source line.
    expect(note.source).toBeNull();
  });

  it("names the weekday for a report this week", () => {
    const note = eventNote(NVDA_DROP, { levels: () => true, today: TODAY }, new Map([["NVDA", "2026-11-16"]]))!;
    expect(note.step!.label).toBe("Check our call on NVDA before Monday");
  });

  it("takes our levels out of a note on a stock the plan does not show them for", () => {
    const level = item({
      id: "level:AMD:2026-11-11:add",
      kind: "agent",
      tickers: ["AMD"],
      text: "AMD closed at $140.10 yesterday, at or below $142.07, where our call says to buy more. It is the lowest close in a month.",
      href: "/stock/AMD",
    });
    const shown = eventNote(level, { levels: () => true, today: TODAY }, new Map())!;
    expect(shown.text).toContain("$142.07");
    const hidden = eventNote(level, { levels: () => false, today: TODAY }, new Map())!;
    expect(hidden.text).not.toContain("$142.07");
    expect(hidden.text).toBe("It is the lowest close in a month.");
  });

  it("takes the closes-against-levels line off a gated level finding", () => {
    const level = item({ id: "level:job:2026-11-11:add", kind: "agent", tickers: ["AMD", "NVDA"], text: "AMD and NVDA closed yesterday at or below the price where our call says to buy more.", detail: "AMD at $140.10 against $142.07, NVDA at $120.00 against $125.00." });
    const note = eventNote(level, { levels: () => false, today: TODAY }, new Map());
    expect(note === null || (!JSON.stringify(note).includes("$142.07") && !JSON.stringify(note).includes("$125.00"))).toBe(true);
  });

  it("treats a note about no stock in particular as gated", () => {
    const memo = item({ id: "memo:1", kind: "memo", text: "This week's memo is out. Our buy-more level on AMD is $142.07. Two calls changed." });
    expect(eventNote(memo, { levels: () => false, today: TODAY }, new Map())!.text).toBe("This week's memo is out. Two calls changed.");
  });

  it("leaves out a note with nothing left once its levels are taken out", () => {
    const level = item({ id: "level:AMD", kind: "agent", tickers: ["AMD"], text: "AMD closed at or below $142.07, where our call says to buy more." });
    expect(eventNote(level, { levels: () => false, today: TODAY }, new Map())).toBeNull();
  });

  it("draws a quiet run as one line", () => {
    const quiet = item({ id: "quiet:2026-11-11", kind: "agent", quiet: true, text: "3 of your agents checked on Nov 11 and found nothing that needs you." });
    const note = eventNote(quiet, { levels: () => true, today: TODAY }, new Map())!;
    expect(note.kind).toBe("quiet");
    expect(note.step).toBeNull();
    expect(note.clock).toMatch(/ET$/);
  });

  it("keeps who said it when it was not the agent", () => {
    const call = item({ id: "call:AAPL:2026-11-11", kind: "call", tickers: ["AAPL"], source: "Our call", text: "Our call on AAPL moved from Keep to Buy more on Nov 11." });
    const note = eventNote(call, { levels: () => true, today: TODAY }, new Map())!;
    expect(note.source).toBe("Our call");
    expect(note.figure).toBeNull();
    expect(note.step!.label).toBe("See why our call on AAPL changed");
  });

  it("draws a saved sell or call watch firing as an ordinary note, with the stock, what happened and the price", () => {
    // From the real inbox builder, so the finding's shape is the one an agent run stores (lib/agent-jobs.ts).
    const [turned] = findingItems(
      {
        jobId: "job0000001",
        jobName: "When to sell AMD",
        day: "2026-11-11",
        ranAt: "2026-11-11T21:35:00Z",
        decision: "notify",
        summary: "Our call on AMD moved from Keep to Sell some.",
        tickers: ["AMD"],
        findings: [{ ticker: "AMD", headline: "Our call on AMD moved from Keep to Sell some", detail: "", at: "2026-11-11", kind: "call", call_from: "Keep", call_to: "Sell some" }],
      },
      "mine",
      new Map(),
      TODAY,
    )!;
    const call = eventNote(turned!, { levels: () => true, today: TODAY, prices: { AMD: 238.4 } }, new Map())!;
    expect(call).toMatchObject({ kind: "event", tickers: ["AMD"], text: "Our call on AMD moved from Keep to Sell some.", source: null });
    expect(call.figure).toEqual({ value: "$238.40", tone: "flat", label: "price now" });
    expect(call.step).toEqual({ label: "See why our call on AMD changed", href: "/stock/AMD#call" });
    // Without a price, the note still stands, with no figure made up.
    expect(eventNote(turned!, { levels: () => true, today: TODAY }, new Map())!.figure).toBeNull();

    const [zone] = findingItems(
      {
        jobId: "job0000002",
        jobName: "When to sell ORCL",
        day: "2026-11-11",
        ranAt: "2026-11-11T21:35:00Z",
        decision: "notify",
        summary: "ORCL closed at $251.20.",
        tickers: ["ORCL"],
        findings: [{ ticker: "ORCL", headline: "ORCL rose 3.10% to $251.20", detail: "", at: "2026-11-11", kind: "level", zone: "trim", level: 250, close: 251.2, change_pct: 3.1 }],
      },
      "mine",
      new Map(),
      TODAY,
    )!;
    const sell = eventNote(zone!, { levels: () => true, today: TODAY, prices: { ORCL: 251.2 } }, new Map())!;
    expect(sell.tickers).toEqual(["ORCL"]);
    expect(sell.text).toBe("ORCL closed at $251.20 yesterday, at or above $250, where our call says to sell some.");
    expect(sell.figure).toEqual({ value: "+3.1%", tone: "up" });
  });
});

describe("reports coming up", () => {
  it("is the stock's own note when there is one", () => {
    const note = upcomingNote([report({ ticker: "NVDA", date: "2026-11-17", usualPct: 6.2, history: "has moved 6.2% on a typical report" })], TODAY, { NVDA: { word: "Buy more", level: "below $142.07" } })!;
    expect(note.text).toMatch(/^NVDA reports on Tuesday after the close, and it has moved 6\.2% on a typical report\.$/);
    expect(note.figure).toEqual({ value: "6.2%", tone: "flat", label: "usual report move" });
    expect(note.call).toEqual({ ticker: "NVDA", word: "Buy more", level: "below $142.07" });
    expect(note.step!.href).toBe("/stock/NVDA#call");
  });

  it("says today when every report is today", () => {
    expect(upcomingNote([report({ ticker: "AAPL", date: TODAY }), report({ ticker: "NVDA", date: TODAY })], TODAY, {})!.text).toBe("Two of your stocks report today.");
  });

  it("shares one note between several, with a row each and one step for the soonest", () => {
    const note = upcomingNote([report({ ticker: "AAPL", date: "2026-11-16" }), report({ ticker: "NVDA", date: "2026-11-13" })], TODAY, {})!;
    expect(note.text).toBe("Two of your stocks report by Monday.");
    expect(note.reports.map((row) => row.ticker)).toEqual(["NVDA", "AAPL"]);
    expect(note.step!.label).toBe("Check our call on NVDA before tomorrow");
  });
});

describe("the thread", () => {
  const morning = {
    headline: "Your holdings fell 1.2% today, 1.5 points worse than the S&P 500.",
    sessionDay: TODAY,
    pct: -1.2,
  };

  it("opens today with the morning read as one line, with no cards under it", () => {
    const thread = buildThread(input({ morning }));
    const today = thread.days[thread.days.length - 1]!;
    expect(today.label).toBe("Today");
    const opener = today.notes[0]!;
    expect(opener.kind).toBe("opener");
    expect(opener.text).toBe(morning.headline);
    expect(opener.figure).toEqual({ value: "−1.2%", tone: "down" });
    expect(opener.sub).toBeNull();
    expect(opener.step).toEqual({ label: "Open today's briefing", href: "/briefing" });
  });

  it("orders days oldest first and notes by time, the opener before them", () => {
    const later = item({ ...NVDA_DROP, id: "alert:1", kind: "alert", tickers: ["AAPL"], at: "2026-11-11T22:30:00.000Z", text: "AAPL rose above $230.", move: null });
    const sessions = [{ day: "2026-11-11", pct: 0.4, marketPct: 0.1, tickers: ["AAPL", "NVDA", "MSFT"] }];
    const thread = buildThread(input({ items: [later, NVDA_DROP], sessions, morning }));
    expect(thread.days.map((day) => day.day)).toEqual(["2026-11-11", TODAY]);
    expect(thread.days[0]!.notes.map((note) => note.kind)).toEqual(["opener", "event", "event"]);
    expect(thread.days[0]!.notes.map((note) => note.id)).toEqual(["opener:2026-11-11", "move:NVDA:2026-11-11", "alert:1"]);
    expect(thread.days[0]!.notes[0]!.text).toBe("Yesterday, your 3 holdings rose 0.4% on average, 0.3 points better than the S&P 500.");
  });

  it("drops an earlier session's own line when the morning read is about that session", () => {
    const sessions = [{ day: "2026-11-11", pct: 0.4, marketPct: 0.1, tickers: ["AAPL", "NVDA", "MSFT"] }];
    const thread = buildThread(input({ sessions, morning: { ...morning, sessionDay: "2026-11-11" } }));
    expect(thread.days.flatMap((day) => day.notes).filter((note) => note.kind === "opener").map((note) => note.id)).toEqual([`opener:${TODAY}`]);
  });

  it("puts today's close on the opener as a chip when the morning read is still about an earlier session", () => {
    const sessions = [{ day: TODAY, pct: -0.6, marketPct: 0.2, tickers: ["AAPL", "NVDA", "MSFT"] }];
    const thread = buildThread(input({ sessions, morning: { ...morning, sessionDay: "2026-11-11" } }));
    const notes = thread.days.flatMap((day) => day.notes);
    expect(notes.filter((note) => note.kind === "opener")).toHaveLength(1);
    expect(notes[0]!.recent).toEqual([{ day: TODAY, label: "Today", value: "−0.6%", tone: "down" }]);
  });

  it("keeps today's move as its own note now that the morning note is one line", () => {
    const todayDrop = item({ ...NVDA_DROP, id: "move:NVDA:today", day: TODAY, at: "2026-11-12T15:00:00.000Z", move: { pct: -4.1, day: TODAY, normalPct: 1.8 } });
    const thread = buildThread(input({ items: [todayDrop], morning }));
    expect(thread.days.flatMap((day) => day.notes).map((note) => note.id)).toContain("move:NVDA:today");
  });

  it("says our call once, beside the newest note on the stock, and a step once", () => {
    const second = item({ ...NVDA_DROP, id: "finding:NVDA:2", at: "2026-11-11T23:00:00.000Z", text: "NVDA filed an 8-K.", move: null });
    const thread = buildThread(input({ items: [NVDA_DROP, second], calls: { NVDA: { word: "Keep", level: null } }, upcoming: [report({ ticker: "NVDA", date: "2026-11-17" })] }));
    const notes = thread.days.flatMap((day) => day.notes);
    expect(notes.map((note) => note.call?.word ?? null)).toEqual([null, null, "Keep"]);
    // The move and the report would both say "Check our call on NVDA before Tuesday": only the newest does.
    expect(notes.map((note) => note.step?.label ?? null)).toEqual([null, null, "Check our call on NVDA before Tuesday"]);
  });

  it("closes today with what is coming up", () => {
    const upcoming = [report({ ticker: "AAPL", date: "2026-11-16" })];
    const thread = buildThread(input({ upcoming }));
    const last = thread.days[thread.days.length - 1]!;
    expect(last.day).toBe(TODAY);
    expect(last.notes[last.notes.length - 1]!.kind).toBe("upcoming");

    const withMorning = buildThread(input({ upcoming, morning }));
    expect(withMorning.days.flatMap((day) => day.notes).some((note) => note.kind === "upcoming")).toBe(true);
  });

  it("folds a past day with nothing but its close into a chip on today's opener", () => {
    const sessions = [
      { day: "2026-11-09", pct: 0.7, marketPct: 2.4, tickers: ["AAPL", "NVDA", "MSFT"] },
      { day: "2026-11-10", pct: -0.9, marketPct: -0.4, tickers: ["AAPL", "NVDA", "MSFT"] },
      { day: "2026-11-11", pct: 0.4, marketPct: 0.1, tickers: ["AAPL", "NVDA", "MSFT"] },
    ];
    const thread = buildThread(input({ sessions, items: [NVDA_DROP], morning }));
    expect(thread.days.map((day) => day.day)).toEqual(["2026-11-11", TODAY]);
    expect(thread.days[1]!.notes[0]!.recent).toEqual([
      { day: "2026-11-09", label: "Mon", value: "+0.7%", tone: "up" },
      { day: "2026-11-10", label: "Tue", value: "−0.9%", tone: "down" },
    ]);
    // Without a morning read the newest session's line takes the chips.
    const plain = buildThread(input({ sessions }));
    expect(plain.days.map((day) => day.day)).toEqual(["2026-11-11"]);
    expect(plain.days[0]!.notes[0]!.recent.map((chip) => chip.label)).toEqual(["Mon", "Tue"]);
  });

  it("keeps the newest days only", () => {
    const items = ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"].map((day) =>
      item({ id: `quiet:${day}`, kind: "agent", quiet: true, day, at: `${day}T23:00:00.000Z`, text: `Checked on ${day}.` }),
    );
    const thread = buildThread(input({ items, maxDays: 3 }));
    expect(thread.days.map((day) => day.day)).toEqual(["2026-11-06", "2026-11-09", "2026-11-10"]);
  });

  it("offers a question about the newest move and an instruction for the next report", () => {
    const thread = buildThread(input({ items: [NVDA_DROP], upcoming: [report({ ticker: "AAPL", date: "2026-11-16" })] }));
    expect(threadSuggestions(thread)).toEqual(["Why did NVDA move?", "Tell me when AAPL reports"]);
    expect(threadSuggestions(buildThread(input()))).toEqual(["How did my stocks do this week?"]);
  });
});
