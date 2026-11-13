/**
 * The activity record on /agent: what the agent did, day by day, newest day first. One line per item: each proposal
 * the person accepted (with what it did) or dismissed, then the agent's notes on the stocks (the day's move, findings,
 * call changes, checks that found nothing) from the thread (lib/thread/build.ts). A proposal that went stale is not
 * listed (owner, Nov 13: "what I didn't need was the expired part"), and neither is an event the "Biggest things"
 * cards above already tell (the record is history; the top is today's biggest). Coming-up reports are not activity and
 * stay on the briefing and the inbox. Pure: safe on the client.
 */

import { capitalize, dayWords, etDayOf } from "@/lib/day-words";
import type { ProposalOutcome } from "@/lib/proposals";
import type { Thread, ThreadFigure, ThreadNote } from "@/lib/thread/types";

export type RecordItemKind = "accepted" | "dismissed" | "note" | "quiet";

export type RecordItem = {
  id: string;
  kind: RecordItemKind;
  /** The stock it is about (its logo leads the line), or null for the agent's own lines. */
  ticker: string | null;
  /** A line about several stocks: their tickers, the first few drawn as logos. */
  tickers?: string[];
  /** One sentence. */
  text: string;
  /** "Done", "Dismissed": a proposal's outcome, said once per line. */
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

/** The words that name `day` as seen from `today`: "today" (and "this morning", "tonight"), "yesterday", "on Monday". */
function dayNames(day: string, today: string): string[] {
  const words = dayWords(day, today).toLowerCase();
  if (words === "today") return ["today", "this morning", "tonight"];
  if (words === "yesterday") return ["yesterday"];
  return WEEKDAYS.split("|").some((name) => name.toLowerCase() === words) ? [`on ${words}`] : [];
}

/**
 * A line under its day's heading does not say that day again (owner rules 1 and 8): under "Today", "SMCI fell 11.3%
 * today, about twice a normal day." reads "SMCI fell 11.3%, about twice a normal day.", and a leading "Yesterday, " goes
 * under "Yesterday". Only the heading's own day is taken out: "on Friday" under "Today" stays, since it says something.
 */
export function withoutDayWords(text: string, day: string, today: string): string {
  const names = dayNames(day, today);
  if (names.length === 0) return text;
  const alternatives = names.map((name) => name.replace(/ /g, "\\s+")).join("|");
  let out = text
    .replace(new RegExp(`^(?:${alternatives}),\\s+`, "i"), "")
    .replace(new RegExp(`,?\\s+(?:${alternatives})\\b`, "gi"), "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (out && out !== text) out = `${out.charAt(0).toUpperCase()}${out.slice(1)}`;
  return out || text;
}

/**
 * The figure column already shows the move: the line does not say it again ("SMCI fell 11.3%, about twice a normal
 * day." beside −11.3% reads "SMCI fell, about twice a normal day."). One word for the person's stocks: "Your stocks".
 */
export function lineText(text: string, figure: ThreadFigure | null): string {
  let out = text.replace(/^Your (\d+ )?holdings\b/, (_match, count: string | undefined) => `Your ${count ?? ""}stocks`);
  const amount = figure?.value.replace(/^[+−-]/, "");
  if (amount && /\d/.test(amount)) {
    const escaped = amount.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\s+(?:by\\s+)?${escaped}(?!\\d)`), "");
  }
  return out.replace(/\s+([,.])/g, "$1");
}

/** A move this big (percent, either way) always keeps its own line, whatever its sentence says (volatile stocks often move 5-6% on a normal day). */
const ORDINARY_MAX_PCT = 10;

/**
 * A move of an ordinary size: one stock, a figure, no confirmed reason, and a sentence that only says the move
 * ("RKLB fell 3.1% today.", never "…, about twice a normal day."). The record leaves these out.
 */
export function ordinaryMove(note: ThreadNote): boolean {
  if (note.kind !== "event" || note.tickers.length !== 1 || !note.figure || reasonLine(note)) return false;
  // The sentence drops its "about N times a normal day" clause when the normal day could not be worked out (a slow
  // read, a new listing), so the size is checked too: a big move is never left out.
  const size = Math.abs(Number(note.figure.value.replace(/[−–]/g, "-").replace(/[^\d.-]/g, "")));
  if (!Number.isFinite(size) || size >= ORDINARY_MAX_PCT) return false;
  const ticker = note.tickers[0]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${ticker} (?:rose|fell) [\\d.,]+%(?: (?:today|yesterday|on [A-Z][a-z]+))?\\.$`).test(firstSentence(note.text));
}


/**
 * A stock's move with a confirmed reason says the reason ("Super Micro fell after DOJ China-smuggling probe."), when it
 * is one sentence of at most 15 words; null otherwise (a reason too long to say whole is not cut short).
 */
function reasonLine(note: ThreadNote): string | null {
  if (note.kind !== "event" || note.tickers.length !== 1 || !note.figure || !note.reason) return null;
  const line = firstSentence(note.reason);
  return line.trim().split(/\s+/).filter(Boolean).length <= 15 ? line : null;
}

function noteItem(note: ThreadNote, day: string, today: string): RecordItem | null {
  if (note.kind === "upcoming") return null;
  // A line about several stocks draws their logos and names them itself; it is nobody's own line.
  const ticker = note.tickers.length === 1 ? note.tickers[0]! : null;
  const reason = reasonLine(note);
  const base = withoutDayWords(reason ?? firstSentence(note.text), day, today);
  return {
    id: `note:${note.id}`,
    kind: note.kind === "quiet" ? "quiet" : "note",
    ticker: note.kind === "opener" ? null : ticker,
    ...(note.kind !== "opener" && note.tickers.length > 1 ? { tickers: [...note.tickers] } : {}),
    text: lineText(base, note.figure),
    tag: null,
    figure: note.figure,
    href: note.step?.href ?? (ticker && note.kind !== "opener" ? `/stock/${encodeURIComponent(ticker)}` : null),
  };
}

const OUTCOME_TAG = { accepted: "Done", dismissed: "Dismissed" } as const;

type AnsweredOutcome = ProposalOutcome & { status: "accepted" | "dismissed" };

function outcomeItem(outcome: AnsweredOutcome): RecordItem {
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
 * The record's days, newest first: on each day the proposals answered that day lead, then the day's
 * move, the findings newest first, and (today only) a check that found nothing. The morning note before the open is
 * filed under the session it tells (`aboutDay`), not under today. A past day with only a move (a chip on the opener)
 * keeps its own line. A day with nothing to say is left out.
 */
export function buildRecord(
  thread: Thread | null,
  outcomes: readonly ProposalOutcome[],
  today: string,
  /** Lines from elsewhere filed under their own day: a report-day check of the person's measurable lines (lib/thesis-watch/condition-record.ts). */
  extra: ReadonlyArray<{ day: string; item: RecordItem }> = [],
  /**
   * Today's quiet line across every kind of agent (lib/agent-recipes/quiet-server.ts): it stands in for the thread's
   * own "N of your agents checked" line. Null when none checked quietly today; left out, the thread's line stays.
   */
  agentsQuiet?: RecordItem | null,
): RecordDay[] {
  const byDay = new Map<string, { outcomes: RecordItem[]; openers: RecordItem[]; events: RecordItem[]; quiet: RecordItem[] }>();
  const slot = (day: string) => {
    let entry = byDay.get(day);
    if (!entry) byDay.set(day, (entry = { outcomes: [], openers: [], events: [], quiet: [] }));
    return entry;
  };
  for (const outcome of outcomes) {
    // A proposal that went stale is not something the agent or the person did: never a line.
    if (outcome.status === "expired") continue;
    const day = etDayOf(outcome.at);
    if (day) slot(day).outcomes.push(outcomeItem(outcome as AnsweredOutcome));
  }
  // The events the "Biggest things" cards tell are not told again under them.
  const told = new Set((thread?.biggest ?? []).flatMap((thing) => thing.ids ?? []));
  for (const day of thread?.days ?? []) {
    for (const note of day.notes) {
      if (told.has(note.id)) continue;
      const at = note.kind === "opener" && note.aboutDay && /^\d{4}-\d{2}-\d{2}$/.test(note.aboutDay) ? note.aboutDay : day.day;
      const item = noteItem(note, at, today);
      if (!item) continue;
      const entry = slot(at);
      if (note.kind === "opener") entry.openers.push(item);
      else if (ordinaryMove(note)) continue;
      else if (note.kind === "quiet") {
        // On past days it would say the same thing every day (owner rule 1).
        if (at === today && !(agentsQuiet !== undefined && item.id === `note:quiet:${today}`)) entry.quiet.push(item);
      } else entry.events.unshift(item); // the thread reads oldest first; the record, newest first
    }
  }
  for (const line of extra) slot(line.day).events.push(line.item);
  if (agentsQuiet) slot(today).quiet.push(agentsQuiet);
  // The sessions an opener lists as chips ("Mon +0.7%") are days with only a move: each keeps its own line, unless
  // that day already has its move.
  for (const day of thread?.days ?? []) {
    for (const note of day.notes) {
      for (const session of note.kind === "opener" ? note.recent : []) {
        if (byDay.get(session.day)?.openers.length) continue;
        slot(session.day).openers.push({
          id: `session:${session.day}`,
          kind: "note",
          ticker: null,
          text: session.tone === "flat" ? "Your stocks were flat." : `Your stocks ${session.tone === "up" ? "rose" : "fell"}.`,
          tag: null,
          figure: { value: session.value, tone: session.tone },
          href: `/briefing?day=${session.day}`,
        });
      }
    }
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, entry]) => ({
      day,
      label: capitalize(dayWords(day, today)) || day,
      // Ordinary moves are left out: the day's own line already says how the stocks did, and "moved about as much as a
      // normal day" says nothing (council). The record lists what stood out.
      items: [...entry.outcomes, ...entry.openers, ...entry.events, ...entry.quiet],
    }))
    .filter((day) => day.items.length > 0);
}

/** Whether the line already names the stock, as a whole word ("F" is not in "fell"). */
export function namesTicker(text: string, ticker: string): boolean {
  const escaped = ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9.])${escaped}(?![A-Za-z0-9])`).test(text);
}


/** How many lines the record shows before "Show N more". */
export const RECORD_LINES = 10;
