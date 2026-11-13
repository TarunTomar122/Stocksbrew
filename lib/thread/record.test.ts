import { describe, expect, it } from "vitest";

import type { ProposalOutcome } from "@/lib/proposals";

import { buildRecord, firstSentence, lineText, namesTicker, ordinaryMove, withoutDayWords } from "./record";
import type { Thread, ThreadNote } from "./types";

const TODAY = "2026-11-12";

const note = (patch: Partial<ThreadNote>): ThreadNote => ({
  id: "n",
  kind: "event",
  at: null,
  clock: null,
  tickers: [],
  text: "",
  sub: null,
  figure: null,
  reason: null,
  call: null,
  step: null,
  recent: [],
  reports: [],
  source: null,
  locked: false,
  morning: false,
  ...patch,
});

const thread: Thread = {
  status: "ready",
  example: false,
  today: TODAY,
  stocks: 3,
  days: [
    { day: "2026-11-10", label: "Tuesday", date: "Nov 10", notes: [note({ id: "a", tickers: ["AMD"], text: "AMD rose 11.0% on Tuesday, about three times a normal day. Our call is Keep." })] },
    {
      day: TODAY,
      label: "Today",
      date: "Nov 12",
      notes: [
        note({ id: "o", kind: "opener", tickers: ["NVDA"], text: "Your holdings fell 1.2% today.", figure: { value: "−1.2%", tone: "down" }, morning: true }),
        note({ id: "u", kind: "upcoming", text: "Two of your stocks report by Tuesday." }),
        note({ id: "q", kind: "quiet", text: "2 of your agents checked and found nothing." }),
      ],
    },
  ],
};

const outcome = (patch: Partial<ProposalOutcome>): ProposalOutcome => ({ id: "p1", status: "accepted", ticker: "NVDA", title: "Move NVDA's $142 alert down to $131.20", message: "Alert moved: NVDA below $131.20.", at: "2026-11-11T15:00:00.000Z", ...patch });

describe("the activity record", () => {
  it("reads newest day first, with each day's answered proposals before the agent's notes", () => {
    const days = buildRecord(thread, [outcome({}), outcome({ id: "p2", status: "dismissed", ticker: "META", title: "Get a reminder the day before META reports", message: null, at: "2026-11-12T16:00:00.000Z" })], TODAY);
    expect(days.map((day) => day.label)).toEqual(["Today", "Yesterday", "Tuesday"]);
    // Answered proposals, then the day's move, then findings, then today's "found nothing".
    expect(days[0]!.items.map((item) => [item.kind, item.tag, item.ticker])).toEqual([
      ["dismissed", "Dismissed", "META"],
      ["note", null, null],
      ["quiet", null, null],
    ]);
    expect(days[1]!.items[0]).toMatchObject({ kind: "accepted", tag: "Done", text: "Alert moved: NVDA below $131.20.", ticker: "NVDA" });
  });

  it("keeps one line per item: the first sentence, and no coming-up reports", () => {
    const days = buildRecord(thread, [], TODAY);
    expect(days[1]!.items[0]!.text).toBe("AMD rose 11.0%, about three times a normal day.");
    // The opener's line: the figure column carries the move.
    expect(days[0]!.items[0]!.text).toBe("Your stocks fell.");
    expect(days[0]!.items.some((item) => item.text.includes("report by"))).toBe(false);
    // The day's opener is the agent's own line (no logo), with its figure, and leads its day.
    expect(days[0]!.items[0]).toMatchObject({ ticker: null, figure: { value: "−1.2%" } });
  });

  // Owner, Nov 13: "what I didn't need was the expired part".
  it("never lists a proposal that went stale", () => {
    expect(buildRecord(null, [outcome({ status: "expired", message: null, at: "2026-11-09T12:00:00.000Z" })], TODAY)).toEqual([]);
    const days = buildRecord(null, [outcome({}), outcome({ id: "p2", status: "expired", message: null, at: "2026-11-11T16:00:00.000Z" })], TODAY);
    expect(days.flatMap((day) => day.items.map((item) => item.id))).toEqual(["proposal:p1"]);
  });

  it("leaves out an event the Biggest things cards above already tell", () => {
    const told: Thread = {
      ...thread,
      days: [{ day: TODAY, label: "Today", date: "Nov 12", notes: [note({ id: "big", tickers: ["SMCI"], text: "SMCI fell 11.3% today, about twice a normal day.", figure: { value: "−11.3%", tone: "down" } }), note({ id: "small", tickers: ["AMD"], text: "AMD rose 12.0% today, about three times a normal day.", figure: { value: "+12.0%", tone: "up" } })] }],
      biggest: [{ ticker: "SMCI", name: "Super Micro", kind: "news", pct: -11.3, session: null, price: 26.98, holding: true, line: "Super Micro fell after DOJ China-smuggling probe.", day: TODAY, source: null, href: "/stock/SMCI", ids: ["big"], score: 20 }],
    };
    expect(buildRecord(told, [], TODAY).flatMap((day) => day.items.map((item) => item.id))).toEqual(["note:small"]);
  });

  it("cuts at a sentence's end, not inside a figure, an abbreviation or an initial", () => {
    expect(firstSentence("NVDA fell 4.4% to $166.04. It closed under its level.")).toBe("NVDA fell 4.4% to $166.04.");
    expect(firstSentence("Insiders bought $1.2M of U.S. stock today")).toBe("Insiders bought $1.2M of U.S. stock today");
    expect(firstSentence("U.S. Steel rose 3%. More later.")).toBe("U.S. Steel rose 3%.");
    expect(firstSentence("Alphabet Inc. Class A shares rose. Then fell.")).toBe("Alphabet Inc. Class A shares rose.");
    expect(firstSentence("AMD vs. Nasdaq: up 2%. Next.")).toBe("AMD vs. Nasdaq: up 2%.");
    expect(firstSentence("2 insiders bought, led by John A. Smith. Our call is Keep.")).toBe("2 insiders bought, led by John A. Smith.");
    expect(firstSentence('He said "it is done." Then left.')).toBe('He said "it is done."');
  });

  it("a line under its day's heading does not say that day again, and only that day", () => {
    expect(withoutDayWords("SMCI fell 11.3% today, about twice a normal day.", TODAY, TODAY)).toBe("SMCI fell 11.3%, about twice a normal day.");
    expect(withoutDayWords("Yesterday, your 7 stocks fell 1%.", "2026-11-11", TODAY)).toBe("Your 7 stocks fell 1%.");
    expect(withoutDayWords("AMD rose 11.0% on Tuesday, about three times a normal day.", "2026-11-10", TODAY)).toBe("AMD rose 11.0%, about three times a normal day.");
    expect(withoutDayWords("2 of your agents checked today and found nothing.", TODAY, TODAY)).toBe("2 of your agents checked and found nothing.");
    // Another day's word says something: it stays.
    expect(withoutDayWords("Your stocks rose 1.2% on Friday.", TODAY, TODAY)).toBe("Your stocks rose 1.2% on Friday.");
    expect(withoutDayWords("About twice a normal day.", TODAY, TODAY)).toBe("About twice a normal day.");
  });

  it("does not repeat the figure column's move in the line, and says 'Your stocks'", () => {
    expect(lineText("SMCI fell 11.3%, about twice a normal day.", { value: "−11.3%", tone: "down" })).toBe("SMCI fell, about twice a normal day.");
    expect(lineText("Your 10 holdings rose 4.9% on average, 4.6 points better than the S&P 500.", { value: "+4.9%", tone: "up" })).toBe(
      "Your 10 stocks rose on average, 4.6 points better than the S&P 500.",
    );
    expect(lineText("Your holdings fell 1.2%.", { value: "−1.2%", tone: "down" })).toBe("Your stocks fell.");
    // Not the same number inside a longer one.
    expect(lineText("NVDA fell 11.25% to $1.2B.", { value: "−1.2%", tone: "down" })).toBe("NVDA fell 11.25% to $1.2B.");
    expect(lineText("No figure here.", null)).toBe("No figure here.");
  });

  it("leaves ordinary moves out; a move that stands out keeps its row, with its reason", () => {
    const moves: Thread = {
      ...thread,
      days: [
        {
          day: TODAY,
          label: "Today",
          date: "Nov 12",
          notes: [
            note({ id: "r", tickers: ["RKLB"], text: "RKLB fell 3.1% today.", figure: { value: "−3.1%", tone: "down" } }),
            note({ id: "a", tickers: ["ASTS"], text: "ASTS fell 5.8% today.", figure: { value: "−5.8%", tone: "down" } }),
            note({ id: "d", tickers: ["AMD"], text: "AMD rose 5.9% today.", figure: { value: "+5.9%", tone: "up" } }),
            note({ id: "s", tickers: ["SMCI"], text: "SMCI fell 11.3% today, about twice a normal day.", figure: { value: "−11.3%", tone: "down" }, reason: "Super Micro fell after DOJ China-smuggling probe." }),
            note({ id: "n", tickers: ["NVDA"], text: "NVDA fell 4.3% today, about twice a normal day.", figure: { value: "−4.3%", tone: "down" } }),
          ],
        },
      ],
    };
    const items = buildRecord(moves, [], TODAY)[0]!.items;
    expect(items.map((item) => item.text)).toEqual([
      "NVDA fell, about twice a normal day.",
      "Super Micro fell after DOJ China-smuggling probe.",
    ]);
    expect(items[1]).toMatchObject({ ticker: "SMCI", figure: { value: "−11.3%" } });
    expect(ordinaryMove(note({ tickers: ["F"], text: "F rose 2.1% on Monday.", figure: { value: "+2.1%", tone: "up" } }))).toBe(true);
    expect(ordinaryMove(note({ tickers: ["F"], text: "F rose 2.1% on Monday after a recall.", figure: { value: "+2.1%", tone: "up" } }))).toBe(false);
    // A reason too long to say whole does not keep its own row; a level finding's detail is never used as a reason.
    expect(ordinaryMove(note({ tickers: ["AMD"], text: "AMD rose 5.9% today.", figure: { value: "+5.9%", tone: "up" }, reason: "AMD rose after a long story with many words that go on and on past the budget." }))).toBe(true);
    const level = buildRecord({ ...thread, days: [{ day: TODAY, label: "Today", date: "Nov 12", notes: [note({ id: "l", tickers: ["CGNX", "LLY"], text: "CGNX and LLY closed at or below their buy-more level.", reason: "CGNX at $50.77 against $50.79." })] }] }, [], TODAY);
    expect(level[0]!.items[0]!).toMatchObject({ text: "CGNX and LLY closed at or below their buy-more level.", tickers: ["CGNX", "LLY"], ticker: null });
    // A big move whose sentence lost its "about N times a normal day" clause still keeps its row.
    expect(ordinaryMove(note({ tickers: ["SMCI"], text: "SMCI fell 18.2% today.", figure: { value: "−18.2%", tone: "down" } }))).toBe(false);
    expect(ordinaryMove(note({ tickers: ["SMCI"], text: "SMCI fell 6.2% today.", figure: { value: "−6.2%", tone: "down" } }))).toBe(true);
  });

  it("knows a line names its stock only as a whole word, so F, T, C and V still get their ticker", () => {
    expect(namesTicker("F fell 3%, about twice a normal day.", "F")).toBe(true);
    expect(namesTicker("Shares fell 3%.", "F")).toBe(false);
    expect(namesTicker("T's dividend was cut.", "T")).toBe(true);
    expect(namesTicker("The call moved to Keep.", "T")).toBe(false);
    expect(namesTicker("Insiders at BRK.B bought.", "B")).toBe(false);
    expect(namesTicker("Insiders at BRK.B bought.", "BRK.B")).toBe(true);
  });

  it("files the morning note before the open under the session it tells, not under today", () => {
    // Monday before the open: the briefing still tells Friday.
    const monday = "2026-11-16";
    const early: Thread = {
      ...thread,
      today: monday,
      days: [
        {
          day: monday,
          label: "Today",
          date: "Nov 16",
          notes: [note({ id: "o", kind: "opener", text: "Your holdings rose 1.2% on Friday, 0.3 points better than the S&P 500.", figure: { value: "+1.2%", tone: "up" }, morning: true, aboutDay: "2026-11-13" })],
        },
      ],
    };
    const days = buildRecord(early, [], monday);
    expect(days.map((day) => day.label)).toEqual(["Friday"]);
    expect(days[0]!.items[0]!.text).toBe("Your stocks rose, 0.3 points better than the S&P 500.");
  });

  it("is empty when the thread only has coming-up reports and past checks that found nothing", () => {
    const quietOnly: Thread = {
      ...thread,
      days: [
        { day: "2026-11-11", label: "Yesterday", date: "Nov 11", notes: [note({ id: "q", kind: "quiet", text: "Nothing found." })] },
        { day: TODAY, label: "Today", date: "Nov 12", notes: [note({ id: "u", kind: "upcoming", text: "NVDA reports Tuesday." })] },
      ],
    };
    expect(buildRecord(quietOnly, [], TODAY)).toEqual([]);
  });

  it("keeps past days that only had a move: today's opener's sessions each get their line", () => {
    const withSessions: Thread = {
      ...thread,
      days: [
        {
          day: TODAY,
          label: "Today",
          date: "Nov 12",
          notes: [note({ id: "o", kind: "opener", text: "Your holdings fell 1.2% today.", figure: { value: "−1.2%", tone: "down" }, recent: [{ day: "2026-11-09", label: "Mon", value: "+0.7%", tone: "up" }] })],
        },
      ],
    };
    const days = buildRecord(withSessions, [], TODAY);
    expect(days.map((day) => day.label)).toEqual(["Today", "Monday"]);
    expect(days[1]!.items[0]).toMatchObject({ text: "Your stocks rose.", figure: { value: "+0.7%", tone: "up" } });
  });

  it("keeps a past day's 'found nothing' out: it would repeat every day", () => {
    const past: Thread = { ...thread, days: [{ day: "2026-11-11", label: "Yesterday", date: "Nov 11", notes: [note({ id: "q2", kind: "quiet", text: "Nothing found." })] }] };
    expect(buildRecord(past, [], TODAY)).toEqual([]);
  });
});
