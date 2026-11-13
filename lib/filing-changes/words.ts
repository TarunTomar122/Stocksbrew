/**
 * The words around a filing comparison. The risks themselves are always the company's own headings, never reworded:
 * a long one is only cut at a word boundary (with the whole heading kept for a hover title). Pure: safe on the client.
 */

import { absoluteDay, daysFromToday, weekdayName } from "@/lib/day-words";

import type { Comparison } from "./diff";

/** Most words of a heading shown inline. */
export const QUOTE_WORDS = 15;

// A cut never ends on a word that leads into the next one ("…export controls and").
const DANGLING = /^(?:a|an|the|and|or|but|nor|of|to|in|on|at|for|by|with|from|as|into|than|that|which|who|whose|its|our|their|is|are|be|been|may|could|can|will|would|including|such|other|if|when|while|because)$/i;

/**
 * A heading as shown: whole when it has at most `max` words, else cut with "…" at the last clause boundary (a comma,
 * semicolon or colon) within `max` words when that keeps at least half of them, otherwise at a word boundary that is
 * not a joining word. Returns the shown text and whether it was cut.
 */
export function quote(heading: string, max = QUOTE_WORDS): { text: string; cut: boolean } {
  const words = heading.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length <= max) return { text: words.join(" "), cut: false };
  let end = max;
  let clause = -1;
  for (let index = max - 1; index + 1 >= Math.ceil(max / 2) && clause < 0; index -= 1) if (/[,;:]$/.test(words[index]!)) clause = index;
  if (clause >= 0) end = clause + 1;
  else while (end > Math.ceil(max / 2) && DANGLING.test(words[end - 1]!.replace(/[^A-Za-z']/g, ""))) end -= 1;
  const text = words
    .slice(0, end)
    .join(" ")
    .replace(/[\s,;:(\-–—]+$/, "");
  return { text: `${text}…`, cut: true };
}

/** Dropped risks up to this many words are shown whole; longer ones are cut (and link to the filing that had them). */
export const WHOLE_WORDS = 25;

/** "1 risk", "3 risks". */
export function risks(count: number): string {
  return `${count} ${count === 1 ? "risk" : "risks"}`;
}

/** The section title, at most 10 words. It lists new and dropped risks alike, so it names neither. */
export function changesTitle(ticker: string): string {
  return `How ${ticker}'s risks changed`;
}

/** "today", "yesterday", "on Tuesday" within the week, else "on Nov 4" (with the year when it is not this one). */
export function filedWhen(day: string, today: string): string {
  const gap = daysFromToday(day, today);
  if (gap === 0) return "today";
  if (gap === -1) return "yesterday";
  if (gap !== null && gap < 0 && gap > -7) return `on ${weekdayName(day)}`;
  return `on ${absoluteDay(day, today)}`;
}

/**
 * One sentence for the inbox and the agent's record, at most 15 words, figures from the comparison:
 * "AMD's new 10-Q adds 2 risks and drops 1.", "LLY's new 10-Q lists no changes to its risks.". Null when there is
 * nothing to say (unreadable, or only rewording).
 */
export function recordLine(ticker: string, comparison: Comparison): string | null {
  const form = comparison.filing.form;
  if (comparison.status === "no_changes") return `${ticker}'s new ${form} lists no changes to its risks.`;
  if (comparison.status === "none_listed") return `${ticker}'s new ${form} lists no new risks.`;
  if (comparison.status !== "changes") return null;
  const added = comparison.added.length;
  const dropped = comparison.dropped.length;
  if (added > 0 && dropped > 0) return `${ticker}'s new ${form} adds ${risks(added)} and drops ${dropped}.`;
  if (added > 0) return `${ticker}'s new ${form} adds ${risks(added)}${comparison.scope === "partial" ? " since its 10-K" : ""}.`;
  if (dropped > 0) return `${ticker}'s new ${form} drops ${risks(dropped)}.`;
  const repeated = comparison.repeated?.length ?? 0;
  if (repeated > 0) return `${ticker}'s new ${form} repeats ${risks(repeated)} added after its 10-K.`;
  return null;
}

/** "10-Q filed yesterday", "10-K filed Feb 4": a filing named by its form and day (the words of its link). */
export function filingWords(form: string, filed: string, today: string): string {
  return `${form} filed ${filedWhen(filed, today).replace(/^on /, "")}`;
}

/**
 * The line about a newer filing that changed less than the one the lists come from, in time order: "Since then, its
 * 10-Q filed Nov 4 adds no new risks.", "Since then, its 10-Q filed Oct 29 lists no changes to its risks." Null when
 * there is nothing to say.
 */
export function quietLine(comparison: Comparison, today: string): string | null {
  const lead = `Since then, its ${filingWords(comparison.filing.form, comparison.filing.filed, today)}`;
  if (comparison.status === "no_changes") return `${lead} lists no changes to its risks.`;
  if (comparison.status === "none_listed") return `${lead} lists no new risks.`;
  if (comparison.status !== "changes" || comparison.added.length + (comparison.repeated?.length ?? 0) + comparison.dropped.length > 0) return null;
  return `${lead} adds no new risks.`;
}
