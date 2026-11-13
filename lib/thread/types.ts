/**
 * The agent thread (/agent): one running, dated conversation from "your agent" about your stocks, newest at the
 * bottom. Every note is one real event the stores already hold (the morning read, an agent's finding, a call change,
 * a report coming up); nothing here is stored as a thread item. Types only, safe on the client.
 */

import type { BigThing } from "@/lib/biggest";

export type ThreadTone = "up" | "down" | "flat";

export type PlainCallWord = "Buy more" | "Keep" | "Sell some";

/** Our call on the note's stock, with its own level only when the viewer's plan shows levels ("below $142.07"). */
export type ThreadCall = { ticker: string; word: PlainCallWord; level: string | null };

/** The one next step a note offers. */
export type ThreadStep = { label: string; href: string; external?: boolean };

export type ThreadFigure = { value: string; tone: ThreadTone; label?: string };

/** A report coming up, as one row of a "coming up" note. */
export type ThreadReport = { ticker: string; date: string; text: string };

/** One recent session as a small chip on today's opener: "Mon +0.7%". */
export type ThreadSession = { day: string; label: string; value: string; tone: ThreadTone };

export type ThreadNoteKind = "opener" | "event" | "quiet" | "upcoming";

export type ThreadNote = {
  /** Stable between reads: built from the record it came from. */
  id: string;
  kind: ThreadNoteKind;
  /** When it happened (ISO), or null for a day's opener built from closes. */
  at: string | null;
  /** "4:35 PM ET" when the record has a real time of day. */
  clock: string | null;
  /** The stocks it is about, the first one leads. */
  tickers: string[];
  /** The note itself: one or two full sentences. */
  text: string;
  /** A quiet line under the opener's headline (the holdings that moved most). */
  sub: string | null;
  /** The one figure the note shows big. */
  figure: ThreadFigure | null;
  /** The confirmed reason, only when there is one. */
  reason: string | null;
  call: ThreadCall | null;
  step: ThreadStep | null;
  /** Today's opener: the sessions before it that had nothing else to say, oldest first. */
  recent: ThreadSession[];
  /** "upcoming" with several reports: one row each. */
  reports: ThreadReport[];
  /** Who reported it, when it is not the agent itself ("Our call", "SEC Form 4"). */
  source: string | null;
  /** Pro-only detail was left out. */
  locked: boolean;
  /** Today's morning note: drawn as the day's headline. */
  morning: boolean;
  /**
   * The market day the note is about, when it is filed under another day: the morning note before the open is filed
   * under today but tells the last session (lib/thread/record.ts files it under this day).
   */
  aboutDay?: string | null;
};

export type ThreadDay = {
  day: string;
  /** "Today", "Yesterday", "Tuesday". */
  label: string;
  /** "Nov 10". */
  date: string;
  notes: ThreadNote[];
};

export type ThreadStatus = "ready" | "no-stocks" | "pending" | "unavailable";

export type Thread = {
  status: ThreadStatus;
  /** The example portfolio's thread, for a visitor. */
  example: boolean;
  /** New York day the thread was read. */
  today: string;
  /** Oldest first, today last. */
  days: ThreadDay[];
  /** How many stocks the agent follows for this person (0 when unknown). */
  stocks: number;
  /** The biggest events on the person's stocks since the last trading day, strongest first (lib/thread/biggest.ts). */
  biggest?: BigThing[];
};
