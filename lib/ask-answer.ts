import type { AskCard } from "@/lib/ask-cards";
import { AFTER_CLOSE_RUN_ET, afterCloseDayWords, afterCloseTimeEt, nextAfterCloseRun } from "@/lib/agent-schedule";

/**
 * How one Ask answer is laid out (components/ask/ask-workspace.tsx): the short
 * answer first, its actions beside it, and everything it was built from folded
 * under "Show the evidence". Pure, so the split can be tested without a page.
 *
 * The model writes the short answer as its first paragraph (lib/ask-prompt.ts).
 * Answers written before that rule (stored conversations, earlier example
 * answers) split the same way: their first paragraph leads. An answer that does
 * not open with a paragraph of prose (a list, a table) is shown whole.
 */

export type AnswerSplit = {
  /** The short answer, as markdown. Empty when the answer does not open with prose. */
  lead: string;
  /** Everything after it, as markdown: the detail that folds under "Show the evidence". */
  rest: string;
};

/** A block that is not a paragraph of prose: a list, a table, a quote, code, a rule. */
const NOT_PROSE = /^(?:[-*+]\s|\d+[.)]\s|\||>|```|~~~|(?:-{3,}|\*{3,}|_{3,})\s*$)/;
/** A heading line: "## Why", or a whole line in bold ("**Why it moved**"), with or without a colon. */
const HEADING = /^(?:#{1,6}\s+.*|\*\*[^*\n]+\*\*:?|__[^_\n]+__:?)$/;
/** A heading that only labels the short answer ("**Short answer**", "## Answer"). Any other heading is content. */
const LEAD_LABEL = /^(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:the\s+)?(?:short answer|answer|tl;?dr|summary|in short|bottom line)\s*:?\s*(?:\*\*|__)?:?$/i;

export function splitAnswer(markdown: string): AnswerSplit {
  const text = markdown.replace(/\r\n?/g, "\n").trim();
  if (!text) return { lead: "", rest: "" };
  const blocks = text.split(/\n[ \t]*\n+/);
  let first = blocks[0]!.trim();
  // A label over the short answer is dropped; the page sets the lead apart itself. A heading that says something
  // ("## NVIDIA beat estimates") is part of the answer, so an answer that opens with one is shown whole.
  const lines = first.split("\n");
  if (LEAD_LABEL.test(lines[0]!.trim())) {
    if (lines.length > 1) first = lines.slice(1).join("\n").trim();
    else if (blocks.length > 1) {
      blocks.shift();
      first = blocks[0]!.trim();
    }
  }
  if (!first || NOT_PROSE.test(first) || HEADING.test(first.split("\n")[0]!.trim())) return { lead: "", rest: text };
  // A paragraph that runs into a list on the next line keeps only its prose, unless the prose only introduces the
  // list ("It moved for two reasons:"): then the list is the answer and stays with it.
  const proseLines: string[] = [];
  const tail: string[] = [];
  for (const line of first.split("\n")) {
    if (tail.length > 0 || NOT_PROSE.test(line.trim())) tail.push(line);
    else proseLines.push(line);
  }
  const prose = proseLines.join("\n").trim();
  if (tail.length > 0 && prose.endsWith(":")) {
    return { lead: first, rest: blocks.slice(1).map((block) => block.trim()).filter(Boolean).join("\n\n") };
  }
  // Answers written before the three-sentence rule can open with a long paragraph: its first three sentences lead and
  // the others start the folded part, so nothing is cut, only moved.
  const [lead, overflow] = firstSentences(prose, LEAD_SENTENCES);
  const rest = [overflow, tail.join("\n"), ...blocks.slice(1)].map((block) => block.trim()).filter(Boolean).join("\n\n");
  return { lead, rest };
}

/** The most sentences the short answer holds (lib/ask-prompt.ts asks for at most three). */
export const LEAD_SENTENCES = 3;

/** Words that end in a full stop without ending a sentence. */
const ABBREVIATION = /(?:\b(?:Inc|Corp|Co|Ltd|vs|etc|approx|est|No|St|Mr|Ms|Dr|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)|\b[A-Z](?:\.[A-Z])*)\.$/;

/** The first `count` sentences of a paragraph and whatever follows them. A sentence ends at . ! or ? before a space and a capital, a digit or a quote. */
export function firstSentences(paragraph: string, count: number): [string, string] {
  const ends = /[.!?]["')\]*_]*(?=\s+["'(*_[]*[A-Z0-9$])/g;
  let found = 0;
  let match: RegExpExecArray | null;
  while ((match = ends.exec(paragraph))) {
    const end = match.index + match[0].length;
    if (ABBREVIATION.test(paragraph.slice(Math.max(0, end - 12), end).replace(/["')\]*_]+$/, ""))) continue;
    found += 1;
    if (found === count) {
      const head = paragraph.slice(0, end).trim();
      // A cut inside bold or italics would leave a dangling marker on both sides: keep the paragraph whole.
      if ((head.match(/\*\*/g)?.length ?? 0) % 2 === 1 || (head.match(/__/g)?.length ?? 0) % 2 === 1) return [paragraph, ""];
      return [head, paragraph.slice(end).trim()];
    }
  }
  return [paragraph, ""];
}

/** Cards that ask the person to do something. They sit with the short answer; every other card is evidence. */
const ACTION_CARDS = new Set<AskCard["card"]>(["watch", "action", "basket", "watch_idea", "sign_in"]);

export function isActionCard(card: AskCard): boolean {
  return ACTION_CARDS.has(card.card);
}

export type AnswerSource = { source: string; as_of: string | null; url: string | null };

/**
 * Where an answer's figures came from: one line per source and time, in the order the lookups ran. A source read at
 * two times is listed twice; the same source at the same time once.
 */
export function sourcesOf(cards: AskCard[]): AnswerSource[] {
  const out: AnswerSource[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    if (isActionCard(card) || card.card === "error" || card.card === "matches") continue;
    const source = typeof (card as { source?: unknown }).source === "string" ? (card as { source: string }).source.trim() : "";
    if (!source) continue;
    const asOf = (card as { as_of?: unknown }).as_of;
    const url = (card as { source_url?: unknown }).source_url;
    const entry: AnswerSource = { source, as_of: typeof asOf === "string" && asOf ? asOf : null, url: typeof url === "string" && url ? url : null };
    const key = `${entry.source}|${entry.as_of ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/* ── the watch rule, in words ───────────────────────────────────────────── */

/**
 * When an agent from Ask checks: every agent it offers is read by the after-close run (lib/agent-schedule.ts), so
 * the line is the real schedule. "Every weekday after the close, from 5:30 PM ET. The next check is today."
 */
export function watchWhenWords(now: Date = new Date()): string {
  const next = nextAfterCloseRun(now, { includeRunning: true });
  const day = afterCloseDayWords(next, now);
  const started = next.startsAt.getTime() <= now.getTime();
  return `Every weekday after the close, from ${afterCloseTimeEt(next)}. ${started ? "Tonight's check is running now." : `The next check is after ${day === "today" ? "today's" : day === "tomorrow" ? "tomorrow's" : `${day.replace(/^on /, "")}'s`} close.`}`;
}

/** The same schedule without the next check, for the first paint before the reader's clock is known. */
export const WATCH_WHEN_PLAIN = `Every weekday after the close, from ${AFTER_CLOSE_RUN_ET.hour % 12 || 12}:${String(AFTER_CLOSE_RUN_ET.minute).padStart(2, "0")} ${AFTER_CLOSE_RUN_ET.hour < 12 ? "AM" : "PM"} ET.`;

/** How an agent reports: the runner writes each finding to the Agents page and emails it. Quiet days send nothing. */
export const WATCH_HOW_WORDS = "An email and a note on your Agents page, only on a day it happens.";

/** Where the card's one-tap save stands. */
export type SaveState =
  | { phase: "idle" | "running" }
  | { phase: "on"; names: string[]; missed: string | null }
  /** `on` started and `paused` were saved paused; `message` is the plan's own line for filing and news agents. */
  | { phase: "paused"; on: number; paused: number; message: string | null; missed: string | null }
  | { phase: "already" }
  | { phase: "failed"; message: string };

/** What POST /api/agents/save answers. */
export type SaveResponse = {
  ok?: boolean;
  error?: string;
  jobs?: Array<{ name: string; enabled: boolean }>;
  already?: string[];
  failed?: string[];
  paused?: { count: number; limit: number; pro_only?: number; message?: string } | null;
};

/**
 * What the card says after the person taps "Save this watch", from the save route's answer: on, saved but paused
 * (the plan's running limit, or a filing or news agent on a plan without them), already there, or not saved.
 */
export function saveOutcome(ok: boolean, body: SaveResponse | null): SaveState {
  if (!ok || !body?.ok) return { phase: "failed", message: body?.error || "That didn't save. Nothing was set up. Try again in a moment." };
  const jobs = body.jobs ?? [];
  if (jobs.length === 0) return (body.already?.length ?? 0) > 0 ? { phase: "already" } : { phase: "failed", message: "That didn't save. Nothing was set up. Try again in a moment." };
  // Some saved and some not: say which did not, so the person can add it from the Agents page.
  const missed = body.failed?.length ? `${body.failed.map((name) => `“${name}”`).join(" and ")} didn't save. Add ${body.failed.length === 1 ? "it" : "them"} from the Agents page.` : null;
  const paused = jobs.filter((job) => !job.enabled).length;
  if (paused > 0) return { phase: "paused", on: jobs.length - paused, paused, message: body.paused?.pro_only ? (body.paused.message ?? null) : null, missed };
  return { phase: "on", names: jobs.map((job) => job.name), missed };
}
