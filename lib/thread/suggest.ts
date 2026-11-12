import type { Thread } from "./types";

/**
 * Two things to say to the agent before the first reply, from the thread's own stocks: a question about the newest
 * move it reported, and an instruction it can set up. Nothing made up: with no stock in the thread, one general question.
 */
export function threadSuggestions(thread: Thread): string[] {
  const notes = thread.days.flatMap((day) => day.notes);
  const moved = [...notes].reverse().find((note) => note.kind === "event" && note.tickers.length === 1 && note.figure)?.tickers[0] ?? null;
  const upcoming = notes.find((note) => note.kind === "upcoming")?.tickers[0] ?? null;
  const any = moved ?? upcoming ?? notes.find((note) => note.tickers.length > 0)?.tickers[0] ?? null;
  const out: string[] = [];
  out.push(moved ? `Why did ${moved} move?` : "How did my stocks do this week?");
  if (upcoming && upcoming !== moved) out.push(`Tell me when ${upcoming} reports`);
  else if (any) out.push(`Watch ${any} for a 5% drop`);
  return out;
}
