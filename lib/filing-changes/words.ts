/**
 * The words around a filing comparison. The risks themselves are always the company's own headings, never reworded:
 * a long one is only cut (to a sentence, a clause or its subject), never mid-clause and never with an ellipsis; a long
 * dropped one that no cut fits may be named by its own topic phrase ("A risk about …", droppedLine). Pure: safe on
 * the client.
 */

import { absoluteDay, daysFromToday, weekdayName } from "@/lib/day-words";

import type { Comparison } from "./diff";

/** Most words of a heading shown inline. */
export const QUOTE_WORDS = 15;

/** The shortest clause a heading is cut to: anything shorter says too little to stand for the risk. */
const MIN_CLAUSE_WORDS = 5;

// A clause never ends on a word that leads into the next one ("…export controls and.").
const DANGLING = /^(?:a|an|the|and|or|but|nor|of|to|in|on|at|for|by|with|from|as|into|than|that|which|who|whose|its|our|their|is|are|be|been|may|could|can|will|would|including|such|other|if|when|while|because)$/i;

// A heading that opens on one of these is a condition first ("If we fail to retain staff, …"): a comma never ends it.
const SUBORDINATE = /^(?:if|when|whenever|while|although|though|because|since|unless|until|as|after|before|despite|due|following|in|through|to|with|without|whether)$/i;

// After a comma, only these start something the sentence can do without: a trailing modifier ("…, including …").
const TRAILING = /^(?:including|which|such|particularly|especially|among|notably|whether)$/i;
// …or a second clause, when the comma is the heading's first (so it is not the end of a list: "attract, retain, and").
const JOINING = /^(?:and|but|while|whereas|or)$/i;

// A clause has a verb: a cut that leaves only a subject ("Our operations outside the U.S.") is no sentence.
const VERB = /\b(?:is|are|was|were|be|been|being|may|might|could|can|will|would|must|should|has|have|had|does|do|did|(?:depend|rel(?:y|ies)|face|compete|require|involve|expose|subject|affect|harm|hurt|operate|sell|generate|derive|make|use|need|expect|plan|intend|continue|remain|fail|rely|limit|increase|decrease|reduce|impact)(?:s|es|ed|d)?)\b/i;

/**
 * A heading as shown, never ending in an ellipsis: whole when it has at most `max` words; else its longest opening
 * clause within `max` words that stands as a sentence of its own, closed with a full stop. A clause ends at a
 * semicolon, colon or dash, or at a comma before a trailing modifier ("…, including …", "…, which …") or, for the
 * heading's first comma, before a second clause ("…, and any failure …"). It is at least MIN_CLAUSE_WORDS words with a
 * verb, never a lone opening condition ("If …"), never ends on a joining word, and never leaves a bracket open. When no
 * clause fits it is shown whole. `cut` says it was shortened (callers link the full text); `fits` that it is within
 * `max` words.
 */
export function quote(heading: string, max = QUOTE_WORDS): { text: string; cut: boolean; fits: boolean } {
  const whole = heading.replace(/\s+/g, " ").trim();
  const words = whole.split(" ").filter(Boolean);
  if (words.length <= max) return { text: whole, cut: false, fits: true };
  const subordinate = SUBORDINATE.test(words[0]!.replace(/[^A-Za-z]/g, ""));
  let commas = 0;
  let best = -1;
  for (let index = 0; index < Math.min(max, words.length - 1); index += 1) {
    const word = words[index]!;
    const next = words[index + 1]!.replace(/[^A-Za-z]/g, "");
    const comma = /,$/.test(word);
    if (comma) commas += 1;
    const hard = /[;:]$/.test(word) || /^[—–]$/.test(words[index + 1]!) || /[—–]$/.test(word);
    const soft = comma && !subordinate && (TRAILING.test(next) || (commas === 1 && JOINING.test(next)));
    if (!hard && !soft) continue;
    const bare = word.replace(/[^A-Za-z']/g, "");
    const prefix = words.slice(0, index + 1).join(" ");
    const open = (prefix.match(/\(/g)?.length ?? 0) > (prefix.match(/\)/g)?.length ?? 0);
    if (index + 1 < MIN_CLAUSE_WORDS || DANGLING.test(bare) || open || !VERB.test(prefix)) continue;
    best = index;
  }
  if (best < 0) return { text: whole, cut: false, fits: false };
  const text = words
    .slice(0, best + 1)
    .join(" ")
    .replace(/[\s,;:(\-–—]+$/, "");
  return { text: /[.!?]$/.test(text) ? text : `${text}.`, cut: true, fits: true };
}

/** Dropped risks up to this many words are shown whole; longer ones are summed up in one line (and link to the filing that had them). */
export const WHOLE_WORDS = QUOTE_WORDS;

// Where a heading's subject ends: its first verb, or a modal or auxiliary before one ("may", "is", "could").
const SUBJECT_END = /^(?:is|are|was|were|has|have|had|may|might|could|can|will|would|must|should|does|do|did|continues?|remains?|depends?|rel(?:y|ies)|faces?|requires?|involves?|exposes?|subjects?|affects?|harms?|hurts?|limits?|increases?|decreases?|reduces?|impacts?|creates?|presents?|poses?|results?)$/i;

// Openings that are not a topic on their own: the filer itself ("We", "Our business") or a bare condition ("If we").
const VAGUE_SUBJECT = /^(?:we|it|they|our (?:business|company|operations|results|results of operations|financial condition|success|future success)|the company|the company's business)$/i;

// A phrase that names what a risk is about: "…relating to our Gigafactory New York", "…with respect to its ESG practices".
const ABOUT = /\b(?:related to|relating to|regarding|concerning|associated with|with respect to|arising from|in connection with)\s+(.+)$/i;

// What follows "is subject to", "depends on", "we face", "we may have": the thing the risk is about.
const OBJECT = /\b(?:(?:is|are) subject to|depends? (?:in part )?(?:up)?on|rel(?:y|ies) (?:up)?on|faces?|must manage|(?:may|could) (?:have|experience|incur))\s+(.+)$/i;

// Where a topic phrase surely ends: a clause break, or where the heading turns to what the topic could do.
const STRONG_END = /;|:|\s[—–]\s|\s(?:which|that|if|as well as|could|may|might|will|would|can)\s/i;
// Where it may end, when the phrase runs long, tried in this order: a comma or bracket, then "and", then "or" ("real
// or perceived" is one idea more often than "and" is).
const WEAK_ENDS = [/,|\s\(/g, /\s(?:and|as well as)\s/g, /\s(?:or)\s/g];

const PRONOUN_START = /^(?:we|it|they|i|us)\b/i;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * "our Apps" as we would say it of the company: "its Apps". Only the possessive is rewritten: a topic that still says
 * "we" or "us" would need its verb changed too ("we are" is not "it are"), so `fitPhrase`'s caller leaves it out.
 */
function asTheirs(text: string): string {
  return text.replace(/\bour\b/g, "its").replace(/\bOur\b/g, "Its");
}

const FIRST_PERSON = /\b(?:we|us)\b/i;

function endsClean(text: string): boolean {
  const last = text.split(/\s+/).pop() ?? "";
  const open = (text.match(/\(/g)?.length ?? 0) > (text.match(/\)/g)?.length ?? 0);
  return !open && !DANGLING.test(last.replace(/[^A-Za-z']/g, "")) && !/^(?:we|it|they|us)$/i.test(last.replace(/[^A-Za-z]/g, ""));
}

/**
 * A phrase of 2 to `max` words that ends cleanly: `text` up to its first clause break, and when that runs long, its
 * longest opening that ends before a comma, a bracket, "and" or "or" ("assumptions and estimates to calculate …").
 */
function fitPhrase(text: string, max: number): string | null {
  const strong = text.search(STRONG_END);
  const head = (strong >= 0 ? text.slice(0, strong) : text).replace(/[\s.,;:]+$/, "").trim();
  const fits = (phrase: string) => wordCount(phrase) >= 2 && wordCount(phrase) <= max && endsClean(phrase);
  if (fits(head)) return head;
  for (const pattern of WEAK_ENDS) {
    const cuts = [...head.matchAll(pattern)].map((match) => match.index ?? 0).reverse();
    for (const cut of cuts) {
      const phrase = head.slice(0, cut).replace(/[\s,;:]+$/, "").trim();
      if (fits(phrase)) return phrase;
    }
  }
  return null;
}

/**
 * A dropped risk as one line of at most `max` words that ends cleanly, made only of the company's own words (owner
 * rule 8; never reworded, never an ellipsis). In order: the heading whole when it fits; its first sentence; its
 * opening clause (`quote`); its subject, which is what the risk is about ("Intel Corporation's dominance of the
 * microprocessor market and its aggressive business practices."); else "A risk about" and the heading's own topic
 * phrase ("A risk about its Gigafactory New York."). `summed` says the line is not the whole heading (callers link the
 * filing that has it); null when no line fits, and the caller shows the heading whole.
 */
export function droppedLine(heading: string, max = QUOTE_WORDS): { text: string; summed: boolean } | null {
  const whole = heading.replace(/\s+/g, " ").trim();
  if (!whole) return null;
  if (wordCount(whole) <= max) return { text: whole, summed: false };
  // A heading of two sentences: the first, when it is a sentence of its own ("Our business is subject to … regulations.").
  const [first] = whole.split(/(?<=[a-z]{2}[.!?])\s+(?=[A-Z])/);
  if (first && first !== whole && wordCount(first) <= max && wordCount(first) >= 5 && VERB.test(first)) return { text: first, summed: true };
  const clause = quote(whole, max);
  if (clause.cut) return { text: clause.text, summed: true };
  const body = whole.replace(/[.!?]+$/, "");
  const words = body.split(" ");
  const lead = words[0]!.replace(/[^A-Za-z]/g, "");
  if (!SUBORDINATE.test(lead)) {
    const end = words.findIndex((word, index) => index > 0 && SUBJECT_END.test(word.replace(/[^A-Za-z]/g, "")));
    if (end > 0) {
      const subject = fitPhrase(words.slice(0, end).join(" "), max);
      if (subject && wordCount(subject) >= 3 && !VAGUE_SUBJECT.test(subject) && !PRONOUN_START.test(subject)) return { text: `${subject}.`, summed: true };
    }
  }
  // "A risk about" takes four words of the budget.
  // The phrase the heading reaches first, then the other.
  const matches = [ABOUT.exec(body), OBJECT.exec(body)].filter((match): match is RegExpExecArray => match !== null).sort((a, b) => a.index - b.index);
  for (const match of matches) {
    const topic = fitPhrase(match[1]!, max - 3);
    if (topic && !VAGUE_SUBJECT.test(topic) && !FIRST_PERSON.test(topic)) return { text: `A risk about ${asTheirs(topic)}.`, summed: true };
  }
  return null;
}

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
