/**
 * The activity record on /agent: what the agent did, day by day, newest day first. One line per item: each proposal
 * the person accepted (with what it did), dismissed, or that went stale, then the agent's notes on the stocks (the
 * day's move, findings, call changes, checks that found nothing) from the thread (lib/thread/build.ts). Coming-up
 * reports are not activity and stay on the briefing and the inbox. Pure: safe on the client.
 */

import { capitalize, dayWords, etDayOf } from "@/lib/day-words";
import type { ProposalOutcome } from "@/lib/proposals";
import type { Thread, ThreadFigure, ThreadNote } from "@/lib/thread/types";

export type RecordItemKind = "accepted" | "dismissed" | "expired" | "note" | "quiet";

export type RecordItem = {
  id: string;
  kind: RecordItemKind;
  /** The stock it is about (its logo leads the line), or null for the agent's own lines. */
  ticker: string | null;
  /** One sentence. */
  text: string;
  /** "Done", "Dismissed", "Expired": a proposal's outcome, said once per line. */
  tag: string | null;
  figure: ThreadFigure | null;
  href: string | null;
};

export type RecordDay = { day: string; label: string; items: RecordItem[] };

/** The first sentence of a note: the record is one line per item. */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  // A sentence ends at ". " (or '." ') followed by a capital letter or a digit. "$1.2M", "U.S.", "Inc.", "vs." and a
  // middle initial ("John A. Smith") do not end one.
  const match = /^(.+?(?<!\b(?:[A-Z]|Inc|Corp|Co|Ltd|Jr|Sr|Dr|Mr|Mrs|Ms|St|vs|No))[.!?]["”]?)\s+(?=[A-Z0-9"“$])/.exec(trimmed);
  return match ? match[1]! : trimmed;
}

const WEEKDAYS = "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday";

/**
 * A line under its day's heading does not say the day again (owner rules 1 and 8): "SMCI fell 11.3% today, about
 * twice a normal day." reads "SMCI fell 11.3%, about twice a normal day." under "Today". Leading "On Friday, " and
 * "Yesterday, " go the same way.
 */
export function withoutDayWords(text: string): string {
  let out = text
    .replace(new RegExp(`^(?:today|yesterday|this morning|on (?:${WEEKDAYS})),\\s+`, "i"), "")
    .replace(new RegExp(`,?\\s+(?:today|yesterday|tonight|this morning|on (?:${WEEKDAYS}))\\b`, "gi"), "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (out && out !== text) out = `${out.charAt(0).toUpperCase()}${out.slice(1)}`;
  return out || text;
}

function noteItem(note: ThreadNote): RecordItem | null {
  if (note.kind === "upcoming") return null;
  const ticker = note.tickers[0] ?? null;
  return {
    id: `note:${note.id}`,
    kind: note.kind === "quiet" ? "quiet" : "note",
    ticker: note.kind === "opener" ? null : ticker,
    text: withoutDayWords(firstSentence(note.text)),
    tag: null,
    figure: note.figure,
    href: note.step?.href ?? (ticker && note.kind !== "opener" ? `/stock/${encodeURIComponent(ticker)}` : null),
  };
}

const OUTCOME_TAG: Record<ProposalOutcome["status"], string> = { accepted: "Done", dismissed: "Dismissed", expired: "Expired" };

function outcomeItem(outcome: ProposalOutcome): RecordItem {
  const text = outcome.status === "accepted" && outcome.message ? outcome.message : outcome.title;
  return {
    id: `proposal:${outcome.id}`,
    kind: outcome.status,
    ticker: outcome.ticker,
    text: /[.!?]$/.test(text) ? text : `${text}.`,
    tag: OUTCOME_TAG[outcome.status],
    figure: null,
    href: outcome.ticker ? `/stock/${encodeURIComponent(outcome.ticker)}` : "/agents",
  };
}

/**
 * The record's days, newest first: on each day the proposals answered (or gone stale) that day lead, then the
 * agent's notes, newest first. A day with nothing to say is left out.
 */
export function buildRecord(thread: Thread | null, outcomes: readonly ProposalOutcome[], today: string): RecordDay[] {
  const byDay = new Map<string, { outcomes: RecordItem[]; notes: RecordItem[] }>();
  const slot = (day: string) => {
    let entry = byDay.get(day);
    if (!entry) byDay.set(day, (entry = { outcomes: [], notes: [] }));
    return entry;
  };
  for (const outcome of outcomes) {
    const day = etDayOf(outcome.at);
    if (day) slot(day).outcomes.push(outcomeItem(outcome));
  }
  // The sessions today's opener lists as chips ("Mon +0.7%") are days with only a move: each keeps its own line.
  for (const day of thread?.days ?? []) {
    for (const note of day.notes) {
      for (const session of note.kind === "opener" ? note.recent : []) {
        if (byDay.get(session.day)?.notes.length) continue;
        const pct = session.value.replace(/^[+−-]/, "");
        slot(session.day).notes.push({
          id: `session:${session.day}`,
          kind: "note",
          ticker: null,
          text: session.tone === "flat" ? "Your stocks were flat." : `Your stocks ${session.tone === "up" ? "rose" : "fell"} ${pct}.`,
          tag: null,
          figure: { value: session.value, tone: session.tone },
          href: `/briefing?day=${session.day}`,
        });
      }
    }
  }
  for (const day of thread?.days ?? []) {
    const of = (kind: ThreadNote["kind"]) => day.notes.filter((note) => note.kind === kind).map(noteItem).filter((item): item is RecordItem => item !== null);
    // The day's move leads, then the findings newest first (the thread reads oldest first), then a check that found
    // nothing, and that only today: on past days it would say the same thing every day (owner rule 1).
    const openers = of("opener");
    const events = of("event").reverse();
    const quiet = day.day === today ? of("quiet") : [];
    const ordered = [...openers, ...events, ...quiet];
    if (ordered.length > 0) slot(day.day).notes.push(...ordered);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, entry]) => ({ day, label: capitalize(dayWords(day, today)) || day, items: [...entry.outcomes, ...entry.notes] }))
    .filter((day) => day.items.length > 0);
}

/** How many lines the record shows before "Show N more". */
export const RECORD_LINES = 10;
