import { describe, expect, it } from "vitest";

import type { ProposalOutcome } from "@/lib/proposals";

import { buildRecord, firstSentence, withoutDayWords } from "./record";
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
    const days = buildRecord(thread, [outcome({}), outcome({ id: "p2", status: "dismissed", ticker: "META", title: "Try buying META in your practice account", message: null, at: "2026-11-12T16:00:00.000Z" })], TODAY);
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
    expect(days[0]!.items.some((item) => item.text.includes("report by"))).toBe(false);
    // The day's opener is the agent's own line (no logo), with its figure, and leads its day.
    expect(days[0]!.items[0]).toMatchObject({ ticker: null, figure: { value: "−1.2%" } });
  });

  it("notes a proposal that went stale as expired, under the day it expired", () => {
    const days = buildRecord(null, [outcome({ status: "expired", message: null, at: "2026-11-09T12:00:00.000Z" })], TODAY);
    expect(days).toEqual([{ day: "2026-11-09", label: "Monday", items: [expect.objectContaining({ kind: "expired", tag: "Expired", text: "Move NVDA's $142 alert down to $131.20." })] }]);
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

  it("a line under its day's heading does not say the day again", () => {
    expect(withoutDayWords("SMCI fell 11.3% today, about twice a normal day.")).toBe("SMCI fell 11.3%, about twice a normal day.");
    expect(withoutDayWords("On Friday, your 10 holdings rose 4.9% on average.")).toBe("Your 10 holdings rose 4.9% on average.");
    expect(withoutDayWords("AMD rose 11.0% on Friday, about three times a normal day.")).toBe("AMD rose 11.0%, about three times a normal day.");
    expect(withoutDayWords("2 of your agents checked today and found nothing.")).toBe("2 of your agents checked and found nothing.");
    expect(withoutDayWords("About twice a normal day.")).toBe("About twice a normal day.");
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
    expect(days[1]!.items[0]).toMatchObject({ text: "Your stocks rose 0.7%.", figure: { value: "+0.7%", tone: "up" } });
  });

  it("keeps a past day's 'found nothing' out: it would repeat every day", () => {
    const past: Thread = { ...thread, days: [{ day: "2026-11-11", label: "Yesterday", date: "Nov 11", notes: [note({ id: "q2", kind: "quiet", text: "Nothing found." })] }] };
    expect(buildRecord(past, [], TODAY)).toEqual([]);
  });
});
