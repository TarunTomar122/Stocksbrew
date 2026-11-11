/**
 * What each briefing stock card says, worked out for a whole section at once so nothing is said twice: the one
 * sentence, the one highlighted fact, and any update several stocks share, said once above the cards instead of
 * on each (owner, Nov 11). Pure: no React, so it is tested on its own.
 */
import type { BriefingItem } from "@/lib/briefing";
import { moveRowText, plainCallWord, type BriefingGroup, type BriefingLine } from "@/lib/briefing-groups";
import { asSentence, firstFullSentence, hasTitleCaseLeftover, isTitleCase, sentenceCase } from "@/lib/plain-copy";

export type CardWords = {
  /** The line the sentence comes from (it opens first when the card is opened). Null when it says nothing. */
  line: BriefingLine | null;
  sentence: string;
  fact: string | null;
};

export type SectionWords = {
  cards: Map<string, CardWords>;
  /** An update two or more stocks share, said once for the section ("Our call moved to Keep on AAPL and MSFT."). */
  shared: string[];
};

const DAY_OR_MONTH = /^(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day$|^(?:January|February|March|April|May|June|July|August|September|October|November|December)$/;

/**
 * A headline in sentence case. A whole Title Case headline goes through `sentenceCase` (it lowercases only common
 * words, so names like Anthropic stay). A leftover run ("Take-Two rose after GTA VI Preorders.") loses the capital
 * on the run's last word only: acronyms, inner capitals, days, months and the company's own name stay as written.
 */
const COMMON_ENDING = /(?:[^s]s|ing|ed|tion|sion|ment|ness|ity|ers)$/;

export function unTitle(input: string, companyName = ""): string {
  const text = isTitleCase(input) ? sentenceCase(input, companyName) : input;
  if (!hasTitleCaseLeftover(text, companyName)) return text;
  const own = new Set(companyName.toLowerCase().split(/[^a-z0-9'’-]+/).filter(Boolean));
  const words = text.split(/(\s+)/);
  const out = [...words];
  const positions = words.map((_, index) => index).filter((index) => index % 2 === 0 && words[index]);
  let run: number[] = [];
  // A run's last capitalised word loses its capital only when it reads like a common word ("Preorders", "Earnings",
  // "Rising"), never when it could be a name ("Jensen Huang"): a lowercased surname reads worse than one capital too many.
  const flush = () => {
    const last = run[run.length - 1];
    if (run.length >= 2 && last != null) {
      const raw = words[last]!;
      const bare = raw.replace(/^["“(]+|["”),.;:!?]+$/g, "");
      if (/^[A-Z][a-z’'-]{3,}$/.test(bare) && COMMON_ENDING.test(bare) && !own.has(bare.toLowerCase()) && !DAY_OR_MONTH.test(bare)) {
        out[last] = raw.replace(bare, bare.toLowerCase());
      }
    }
    run = [];
  };
  positions.forEach((index, order) => {
    if (order === 0) return;
    const raw = words[index]!;
    const bare = raw.replace(/^["“(]+|["”),.;:!?]+$/g, "");
    const previous = words[positions[order - 1]!] ?? "";
    if (!/^[A-Z]/.test(bare) || /[.!?:]$/.test(previous)) return flush();
    // Common words lose their capital anywhere in the run ("Board Approves $1B Investment" -> "board approves ...").
    if (/^[A-Z][a-z’'-]+$/.test(bare) && !own.has(bare.toLowerCase())) out[index] = raw.replace(bare, commonLower(bare));
    run.push(index);
    if (/[,.;:!?)]$/.test(raw)) flush();
  });
  flush();
  return out.join("");
}

/**
 * The word in lower case when it is a common English word, as `sentenceCase` decides (it only lowers words on its
 * list, so names stay). `sentenceCase` only acts on a Title Case text, so the word is read inside one.
 */
function commonLower(word: string): string {
  const probe = sentenceCase(`Xxxx Yyyy Zzzz ${word}`);
  return probe.startsWith("Xxxx Yyyy Zzzz ") ? probe.slice(15) : word;
}

/** Mechanics and questions the cards never say (owner, Nov 11): "What would change it: ...", "Review?". */
const DROP_SENTENCE = /\bwhat would (?:change|break)\b|^revisit if\b/i;

/**
 * Briefings saved before the plain words still say "The call is Accumulate" and "Check the add zone at $207.49":
 * the card says them the way it would today.
 */
function plainOldWords(text: string): string {
  return text
    .replace(/\b(The|Our) call is (Accumulate|Hold|Trim|Avoid|Watch)\b/g, (_, the: string, word: string) => `${the} call is ${plainCallWord(word)}`)
    // Only our own call's words: "Analysts moved to Hold" is someone else's rating and stays as written.
    .replace(/\bcall (moved|changed) from (Accumulate|Hold|Trim|Avoid|Watch) to (Accumulate|Hold|Trim|Avoid|Watch)\b/g, (_, verb: string, from: string, to: string) => `call ${verb} from ${plainCallWord(from)} to ${plainCallWord(to)}`)
    .replace(/\bcall (moved|changed) to (Accumulate|Hold|Trim|Avoid|Watch)\b/g, (_, verb: string, word: string) => `call ${verb} to ${plainCallWord(word)}`)
    .replace(/\bIt is (Accumulate|Hold|Trim|Avoid|Watch)\b/g, (_, word: string) => `It is ${plainCallWord(word)}`)
    .replace(/\bCheck the add zone at (\$[\d,.]+)\. The price is ([\d.]+)% above it\b/, "The buy-more price is $1. The price is $2% above it")
    .replace(/\bCheck the trim zone at (\$[\d,.]+)\. The price is ([\d.]+)% below it\b/, "The sell-some price is $1. The price is $2% below it");
}

/** The sentence with question endings and mechanics notes taken out, as long as something is left. */
export function plainCardText(text: string): string {
  const sentences = plainOldWords(text.replace(/\s+/g, " ").trim()).split(/(?<=[.!?])\s+(?=[A-Z])/);
  const kept = sentences.filter((sentence) => !/\?$/.test(sentence) && !DROP_SENTENCE.test(sentence));
  const joined = kept.join(" ").trim();
  if (joined) return /[.!?]$/.test(joined) ? joined : `${joined}.`;
  // Only a question was there ("Is Nvidia a buy?"): a headline asking it says nothing to the reader.
  return "";
}

/** The line's words for a card: the decision, or a confirmed move company first, in sentence case. */
function lineWords(line: BriefingLine, group: BriefingGroup): string {
  const raw = line.decision ? line.text : moveRowText(line.item, { name: group.name, ticker: group.ticker }, group.day_change_pct);
  const text = raw ? plainCardText(unTitle(raw, group.name)) : "";
  // Trim to Avoid reads "Sell some to Sell some" in plain words: no change to tell.
  const call = /\bfrom (Buy more|Keep|Sell some) to (Buy more|Keep|Sell some)\b/.exec(text);
  return call && call[1] === call[2] ? "" : text;
}

/** A line's words inside an opened card: its sentence, or for a stock its next step. Empty when it has none. */
export function rowWords(line: BriefingLine, group: BriefingGroup): string {
  return lineWords(line, group) || (group.ticker ? plainCardText(line.item.next_step.trim()) : "");
}

/**
 * For a card whose first line is said for the section: the reason behind a changed call, which is the stock's
 * own. Other kinds' reasons are often the same sentence for every stock ("one of the most followed stocks"), so
 * they are not used.
 */
function whyWords(item: BriefingItem, group: BriefingGroup): string {
  if (item.kind !== "call_changed") return "";
  const why = item.why.replace(/^The new call:\s*/i, "").trim();
  const first = asSentence(firstFullSentence(why));
  const text = first ? plainCardText(unTitle(first, group.name)) : "";
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

/** "The buy-more price is $207.49. The price is 3.4% above it." -> "3.4% above the buy-more price of $207.49." */
function levelSentence(text: string): string {
  const match = /^The (buy-more|sell-some) price is (\$[\d,.]+)\. The price is ([\d.]+)% (above|below) it\.$/.exec(text);
  return match ? `The price is ${match[3]}% ${match[4]} the ${match[1]} price of ${match[2]}.` : text;
}

function normal(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9%$]+/g, " ").trim();
}

function joinAnd(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Reports tomorrow after the close" from "AAPL reports earnings tomorrow after the close". */
function earningsFact(item: BriefingItem): string | null {
  const match = /\breports earnings (.+)$/i.exec(item.headline.trim().replace(/\.$/, ""));
  return match ? `Reports ${match[1]}` : null;
}

/** "Call: Keep (was Buy more)" from "The call on AAPL changed from Buy more to Keep". */
function callFact(item: BriefingItem): string | null {
  const match = /changed from (.+) to (.+)$/i.exec(item.headline.trim().replace(/\.$/, ""));
  if (!match) return item.metric ? `Call: ${plainCallWord(item.metric)}` : null;
  const [to, from] = [plainCallWord(match[2]), plainCallWord(match[1])];
  return to === from ? `Call: ${to}` : `Call: ${to} (was ${from})`;
}

/** "3.4% above the buy-more price" from a next step that measured it (also reads the older "add zone" wording). */
function levelFact(item: BriefingItem): string | null {
  const step = item.next_step;
  const add = /(?:buy-more price|add zone) (?:is|at) \$[\d,.]+\. The price is ([\d.]+)% above it/i.exec(step);
  if (add) return `${add[1]}% above the buy-more price`;
  const trim = /(?:sell-some price|trim zone) (?:is|at) \$[\d,.]+\. The price is ([\d.]+)% below it/i.exec(step);
  if (trim) return `${trim[1]}% below the sell-some price`;
  return null;
}

/** Facts worth one chip, most useful first, leaving out anything the sentence already says. */
function factCandidates(group: BriefingGroup, sentence: string, personal: boolean, above = "", results: Readonly<Record<string, string>> = {}): string[] {
  // What the card says, and what the section said for it above the cards.
  const said = `${above} ${sentence}`.toLowerCase();
  const own = sentence.toLowerCase();
  const out: string[] = [];
  // A held stock that reported overnight: the result is the fact ("Beat by 8%, up 6% today"), ahead of everything.
  const result = personal && group.relation === "holding" && group.ticker ? results[group.ticker.toUpperCase()] : undefined;
  if (result) out.push(result);
  const earnings = group.items.find((item) => item.kind === "earnings_upcoming" && item.deadline_days != null && item.deadline_days <= 7);
  if (earnings && !/\b(?:reports?|earnings)\b/.test(said)) {
    const fact = earningsFact(earnings);
    if (fact) out.push(fact);
  }
  if (!personal) return out;
  const change = group.items.find((item) => item.kind === "call_changed");
  // A call change said above still gets its chip: where the call came from is what differs per card.
  if (change && !/\bour call\b/.test(own)) {
    const fact = callFact(change);
    if (fact) out.push(fact);
  }
  for (const item of group.items) {
    const fact = levelFact(item);
    if (fact && !said.includes("buy-more price") && !said.includes("sell-some price")) {
      out.push(fact);
      break;
    }
  }
  if (group.relation === "holding" && !/\byou hold\b/.test(said)) out.push("You hold it");
  return out;
}

/**
 * Words for every card in a section. A sentence on two or more cards is said once for the section and those
 * cards show what is different about each; a fact that would sit on three or more cards is left off them.
 */
export function sectionWords(
  groups: readonly BriefingGroup[],
  options: { personal: boolean; /** Overnight results on held stocks by ticker (lib/results), the cards' first fact. */ results?: Readonly<Record<string, string>> },
): SectionWords {
  const first = new Map<string, { line: BriefingLine | null; sentence: string }>();
  for (const group of groups) {
    let line: BriefingLine | null = null;
    let sentence = "";
    for (const candidate of group.lines) {
      sentence = lineWords(candidate, group);
      if (sentence) {
        line = candidate;
        break;
      }
    }
    // A stock whose only news is a move with no reason: its next step, so the card still says what to do.
    if (!sentence && group.ticker && group.lines[0]) {
      line = group.lines[0];
      sentence = levelSentence(plainCardText(group.lines[0].item.next_step.trim()));
    }
    first.set(group.key, { line, sentence });
  }

  // Sentences two or more cards would show word for word.
  const bySentence = new Map<string, BriefingGroup[]>();
  for (const group of groups) {
    const key = normal(first.get(group.key)?.sentence ?? "");
    if (!key) continue;
    bySentence.set(key, [...(bySentence.get(key) ?? []), group]);
  }
  const shared: string[] = [];
  // Each lifted stock and the sentence said for it above the cards, so its chip does not say it again.
  const sharedKeys = new Map<string, string>();
  for (const [, members] of bySentence) {
    if (members.length < 2) continue;
    const sentence = first.get(members[0]!.key)!.sentence;
    const names = members.map((group) => group.ticker ?? group.name);
    const call = /^Our call moved to (.+?)(, and you hold it)?\.$/.exec(sentence);
    const earnings = /^Reports earnings (.+?)(, and you hold it)?\.$/.exec(sentence);
    const reported = /^Reported earnings (.+?)\.$/.exec(sentence);
    const held = (match: RegExpExecArray) => (match[2] ? `, and you hold ${members.length === 2 ? "both" : "all of them"}` : "");
    shared.push(
      call
        ? `Our call moved to ${call[1]} on ${joinAnd(names)}${held(call)}.`
        : earnings
          ? `${joinAnd(names)} report earnings ${earnings[1]}${held(earnings)}.`
          : reported
            ? `${joinAnd(names)} reported earnings ${reported[1]}.`
            : `${joinAnd(names)}: ${sentence.replace(/, and you hold it\.$/, ".")}`,
    );
    for (const group of members) sharedKeys.set(group.key, sentence);
  }

  const cards = new Map<string, CardWords>();
  const facts = new Map<string, string[]>();
  for (const group of groups) {
    let { line, sentence } = first.get(group.key)!;
    if (sharedKeys.has(group.key)) {
      // Said above: this card shows its next update, or the reason behind the shared one.
      const other = group.lines.find((candidate) => candidate !== line && lineWords(candidate, group));
      const fallback = line ? whyWords(line.item, group) : "";
      sentence = other ? lineWords(other, group) : fallback && normal(fallback) !== normal(sentence) ? fallback : "";
      if (other) line = other;
    }
    cards.set(group.key, { line, sentence, fact: null });
    facts.set(group.key, factCandidates(group, sentence, options.personal, sharedKeys.get(group.key), options.results));
  }
  // A fact on two or more cards is not news on any of them (owner: no identical badge on several cards).
  const count = new Map<string, number>();
  for (const list of facts.values()) for (const fact of new Set(list)) count.set(fact, (count.get(fact) ?? 0) + 1);
  for (const group of groups) {
    const words = cards.get(group.key)!;
    words.fact = (facts.get(group.key) ?? []).find((fact) => (count.get(fact) ?? 0) < 2) ?? null;
  }
  return { cards, shared };
}
