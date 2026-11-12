/**
 * What each briefing stock card says, worked out for a whole section at once so nothing is said twice: the one
 * sentence, the one highlighted fact, and any update several stocks share, said once above the cards instead of
 * on each (owner, Nov 11). Pure: no React, so it is tested on its own.
 */
import type { BriefingItem } from "@/lib/briefing";
import { moveRowText, plainCallWord, type BriefingGroup, type BriefingLine } from "@/lib/briefing-groups";
import { asSentence, firstFullSentence, hasTitleCaseLeftover, headlineCase, isBrandWord } from "@/lib/plain-copy";

export type CardWords = {
  /** The line the sentence comes from (it opens first when the card is opened). Null when it says nothing. */
  line: BriefingLine | null;
  sentence: string;
  fact: string | null;
  /**
   * The stock's next update, said on the card face under the sentence so nothing waits behind an "N more" (owner
   * rules 1 and 2). Null when the stock has no other update worth a line.
   */
  more: string | null;
  /** The line `more` comes from, so an opened card lists it with the rest (and the face stops saying it). */
  moreLine: BriefingLine | null;
  /**
   * Nothing of its own to say: no sentence, no fact, no next update and nothing more to open. With `chips`, the stock
   * is a small chip with its move instead of an empty card (owner rule 4).
   */
  bare: boolean;
};

export type SectionWords = {
  cards: Map<string, CardWords>;
  /** An update two or more stocks share, said once for the section ("Our call moved to Keep on AAPL and MSFT."). */
  shared: string[];
};

const DAY_OR_MONTH = /^(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day$|^(?:January|February|March|April|May|June|July|August|September|October|November|December)$/;

/**
 * A headline in sentence case. It goes through `headlineCase` first: a whole Title Case headline through
 * `sentenceCase`, then stray capitals in a mixed one ("QQQ Holders Feel it even If they Never trade") through
 * `mixedCase`; both lower only common words, so names like Anthropic stay, and `names` (the other companies on the
 * page) keep theirs too. A leftover run ("Take-Two rose after GTA VI Preorders.") then loses the capital on the run's
 * last word only: acronyms, inner capitals, days, months, brands and the company's own name stay as written.
 */
const COMMON_ENDING = /(?:[^s]s|ing|ed|tion|sion|ment|ness|ity|ers)$/;

export function unTitle(input: string, companyName = "", names: readonly string[] = []): string {
  const text = headlineCase(input, companyName, names);
  if (!hasTitleCaseLeftover(text, companyName)) return text;
  const own = new Set([companyName, ...names].join(" ").toLowerCase().split(/[^a-z0-9'’-]+/).filter(Boolean));
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
      if (/^[A-Z][a-z’'-]{3,}$/.test(bare) && COMMON_ENDING.test(bare) && !own.has(bare.toLowerCase()) && !DAY_OR_MONTH.test(bare) && !isBrandWord(bare)) {
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
    // Common words elsewhere in the run were already lowered by headlineCase, which knows when a run is a name
    // ("The Trade Desk", "Best Buy"); this pass only looks at the run's last word.
    run.push(index);
    if (/[,.;:!?)]$/.test(raw)) flush();
  });
  flush();
  return out.join("");
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

/** Kinds whose line is a sentence we write ourselves, never a source's headline. */
const OWN_WORDS = new Set<BriefingItem["kind"]>(["call_changed", "zone_entered", "earnings_upcoming", "alert_triggered", "discussion_spike", "congress_trade", "agent_job"]);

/** The fallback `why` a Reddit item carries when there is no summary of the posts (lib/briefing.ts discussionItem). */
const NO_DISCUSSION_SUMMARY = /^People are posting about it, but we do not have a summary/i;

/**
 * What the Reddit posts say, from the item's summary, for an opened card only. A summary of posts is talk, not a
 * confirmed story, so it never leads a card face (owner rule 7): the face says the move and nothing else.
 */
function discussionWords(item: BriefingItem): string {
  const why = item.why.replace(/\s+/g, " ").trim();
  if (!why || NO_DISCUSSION_SUMMARY.test(why)) return "";
  return plainCardText(asSentence(firstFullSentence(why)));
}

/** The post count of a Reddit item, read from its headline ("… on Reddit: 11 posts in 5 days, mostly bearish"). */
function discussionCount(item: BriefingItem): { posts: number; days: number } | null {
  const match = /(\d+) posts in (\d+) days?(?:, mostly (bullish|bearish))?/i.exec(item.headline);
  if (!match) return null;
  return { posts: Number(match[1]), days: Number(match[2]) };
}

/**
 * "Reddit talk about AMD picked up: 6 posts in 5 days." The plain words when the talk is the point: the measured count
 * only. The scan's one-word mood for a stock is not a measured share of the posts, so it is not said (judges, ship 44).
 */
function discussionPlain(item: BriefingItem): string {
  const count = discussionCount(item);
  if (!count) return "";
  return `Reddit talk about ${item.ticker} picked up: ${count.posts} posts in ${count.days} days.`;
}

/** Reddit talk is the weakest thing a card can lead with: every other line is tried first. */
function byStrength(lines: readonly BriefingLine[]): BriefingLine[] {
  return [...lines.filter((line) => line.item.kind !== "discussion_spike"), ...lines.filter((line) => line.item.kind === "discussion_spike")];
}

/**
 * The line's words for a card: the decision, or a confirmed move company first, in sentence case. `names` are the
 * other companies in the section, so a headline naming one of them keeps its capitals.
 */
function lineWords(line: BriefingLine, group: BriefingGroup, names: readonly string[] = []): string {
  // Reddit talk is not a card's line (its mood is not measured); only when it is the card's decision, as a post count.
  if (line.item.kind === "discussion_spike") return line.decision ? discussionPlain(line.item) : "";
  const raw = line.decision ? line.text : moveRowText(line.item, { name: group.name, ticker: group.ticker }, group.day_change_pct);
  // Only words from a source (a headline, a researched reason) are re-cased: our own sentences capitalise the call
  // words on purpose ("Our call moved to Keep").
  const own = line.decision || OWN_WORDS.has(line.item.kind);
  const text = raw ? plainCardText(own ? raw : unTitle(raw, group.name, names)) : "";
  // Trim to Avoid reads "Sell some to Sell some" in plain words: no change to tell.
  const call = /\bfrom (Buy more|Keep|Sell some) to (Buy more|Keep|Sell some)\b/.exec(text);
  return call && call[1] === call[2] ? "" : text;
}

/** A line's words inside an opened card: its sentence, or for a stock its next step. Empty when it has none. */
export function rowWords(line: BriefingLine, group: BriefingGroup): string {
  // Inside an opened card the Reddit line can say what the posts say, plainly marked as talk.
  if (line.item.kind === "discussion_spike" && !line.decision) {
    const said = discussionWords(line.item);
    return said ? `On Reddit: ${said}` : discussionPlain(line.item);
  }
  return lineWords(line, group) || (group.ticker ? plainCardText(line.item.next_step.trim()) : "");
}

/** A next step that only points somewhere ("Open AMD to check the latest news", "Read why our call is Keep") is not news. */
const POINTER = /^(?:Open|Read|Treat)\b/;

/**
 * For a card whose first line is said for the section: the reason behind a changed call, which is the stock's
 * own. Other kinds' reasons are often the same sentence for every stock ("one of the most followed stocks"), so
 * they are not used.
 */
function whyWords(item: BriefingItem, group: BriefingGroup, names: readonly string[] = []): string {
  if (item.kind !== "call_changed") return "";
  const why = item.why.replace(/^The new call:\s*/i, "").trim();
  const first = asSentence(firstFullSentence(why));
  const text = first ? plainCardText(unTitle(first, group.name, names)) : "";
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

/**
 * A price fact (lib/briefing-move-facts.ts) as a card's sentence, when the card has nothing else to say: "That is
 * about twice its normal 1.1% day.", "It was its biggest gain since Sep 2.", "It is still down 7.2% over the
 * past month." Whole sentences (owner rule 8).
 */
export function factSentence(fact: string): string {
  const lower = `${fact.charAt(0).toLowerCase()}${fact.slice(1)}`;
  // "its normal day", with no trailing "for it" (judges, ship 50).
  if (/^About /.test(fact)) return `That is ${lower.replace(/ a normal /, " its normal ")}.`;
  if (/^Its biggest /.test(fact)) return `It was ${lower}.`;
  if (/^(?:Still )?(?:up|down|Up|Down) /.test(fact)) return `It is ${lower}.`;
  return /[.!?]$/.test(fact) ? fact : `${fact}.`;
}

/** Facts worth one chip, most useful first, leaving out anything the sentence already says. */
function factCandidates(
  group: BriefingGroup,
  sentence: string,
  personal: boolean,
  above = "",
  results: Readonly<Record<string, string>> = {},
  /** Stocks whose upcoming report the read above names. */
  readEarnings: ReadonlySet<string> = new Set(),
  /** The stock's price facts, most telling first (lib/briefing-move-facts.ts). */
  prices: readonly string[] = [],
): string[] {
  // What the card says, and what the section said for it above the cards.
  const said = `${above} ${sentence}`.toLowerCase();
  const own = sentence.toLowerCase();
  const out: string[] = [];
  // A held stock that reported overnight: the result is the fact ("Beat by 8%, up 6% today"), ahead of everything.
  const result = personal && group.relation === "holding" && group.ticker ? results[group.ticker.toUpperCase()] : undefined;
  if (result) out.push(result);
  // A report the read above already names is not said again on the card (owner rule 1).
  const earnings = group.items.find((item) => item.kind === "earnings_upcoming" && item.deadline_days != null && item.deadline_days <= 7 && !readEarnings.has(item.ticker));
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
  // Measured from the stock's own closes, so a move with no confirmed reason still has a fact of its own (owner rules
  // 3 and 7): its biggest move in a while, or how it compares with a normal day. All of them, so a card can fall back
  // to the next when a neighbour says the same words.
  for (const fact of prices) if (!said.includes(fact.toLowerCase())) out.push(fact);
  if (group.relation === "holding" && !/\byou hold\b/.test(said)) out.push("You hold it");
  return out;
}

/**
 * Words for every card in a section. A sentence on two or more cards is said once for the section and those
 * cards show what is different about each; a fact that would sit on three or more cards is left off them.
 */
export function sectionWords(
  groups: readonly BriefingGroup[],
  options: {
    personal: boolean;
    /** Overnight results on held stocks by ticker (lib/results), the cards' first fact. */
    results?: Readonly<Record<string, string>>;
    /** Stocks whose upcoming report the read above already names: their cards do not say it again (owner rule 1). */
    readEarnings?: ReadonlySet<string>;
    /** Price facts by ticker (lib/briefing-move-facts.ts), for a card with no other fact of its own. */
    moveFacts?: Readonly<Record<string, readonly string[]>>;
  },
): SectionWords {
  const readEarnings = options.readEarnings ?? new Set<string>();
  // A line the read above already says (a named report) is not a card's to say.
  const saidAbove = (line: BriefingLine) => line.item.kind === "earnings_upcoming" && !line.decision && readEarnings.has(line.item.ticker);
  const first = new Map<string, { line: BriefingLine | null; sentence: string }>();
  // Every company in the section: a headline that names one keeps its capitals (headlineCase).
  const names = groups.filter((group) => group.ticker).map((group) => group.name).filter(Boolean);
  for (const group of groups) {
    let line: BriefingLine | null = null;
    let sentence = "";
    for (const candidate of byStrength(group.lines)) {
      if (saidAbove(candidate)) continue;
      sentence = lineWords(candidate, group, names);
      if (sentence) {
        line = candidate;
        break;
      }
    }
    // A stock whose only news is a move with no reason: its next step when that is a fact (how far the price is from
    // its level, when it reports). A bare pointer ("Open AMD to check the latest news", "Read why our call is Keep")
    // is not news: the card then shows the move and its one fact, with no sentence (owner, round 6).
    // Reddit's next step ("Treat it as what people are saying…") is never a card's sentence.
    const stepLine = group.lines.find((candidate) => candidate.item.kind !== "discussion_spike" && !saidAbove(candidate));
    if (!sentence && group.ticker && stepLine) {
      line = stepLine;
      const step = levelSentence(plainCardText(stepLine.item.next_step.trim()));
      sentence = POINTER.test(step) ? "" : step;
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
      const other = byStrength(group.lines).find((candidate) => candidate !== line && lineWords(candidate, group, names));
      const fallback = line ? whyWords(line.item, group, names) : "";
      sentence = other ? lineWords(other, group, names) : fallback && normal(fallback) !== normal(sentence) ? fallback : "";
      if (other) line = other;
    }
    // The next update goes on the face. Reddit talk is never a card's next update, and nothing the section
    // said above is repeated.
    const above = normal(sharedKeys.get(group.key) ?? "");
    const next = group.lines.find((candidate) => {
      if (candidate === line || candidate.item.kind === "discussion_spike" || saidAbove(candidate)) return false;
      const words = normal(lineWords(candidate, group, names));
      return words !== "" && words !== normal(sentence) && words !== above;
    });
    const more = next ? lineWords(next, group, names) : null;
    cards.set(group.key, { line, sentence, fact: null, more, moreLine: next ?? null, bare: false });
    // The chip must not repeat the next-update line either ("Reports on Tuesday" under "…reports on Tuesday").
    facts.set(group.key, factCandidates(group, more ? `${sentence} ${more}` : sentence, options.personal, sharedKeys.get(group.key), options.results, readEarnings, group.ticker ? options.moveFacts?.[group.ticker.toUpperCase()] : undefined));
  }
  // A fact on two or more cards is not news on any of them (owner: no identical badge on several cards).
  const count = new Map<string, number>();
  for (const list of facts.values()) for (const fact of new Set(list)) count.set(fact, (count.get(fact) ?? 0) + 1);
  for (const group of groups) {
    const words = cards.get(group.key)!;
    const own = (facts.get(group.key) ?? []).filter((fact) => (count.get(fact) ?? 0) < 2);
    // A card with nothing confirmed to say leads with its price fact as its sentence ("That is about twice its normal
    // 1.1% day."), and the next one is its highlighted fact, so the card is not an empty box beside its neighbours (owner
    // rules 3, 4). Never a reason: only what the closes measure (lib/briefing-move-facts.ts).
    const prices = group.ticker ? options.moveFacts?.[group.ticker.toUpperCase()] ?? [] : [];
    const lead = !words.sentence && !words.more ? own.find((fact) => prices.includes(fact)) : undefined;
    if (lead) words.sentence = factSentence(lead);
    words.fact = own.find((fact) => fact !== lead) ?? null;
    // Bare: nothing on the face, and nothing past Reddit talk, a report the read names or a pointer to open when opened.
    words.bare =
      Boolean(group.ticker) &&
      !words.sentence &&
      !words.fact &&
      !words.more &&
      group.lines.every((line) => line === words.line || line.item.kind === "discussion_spike" || saidAbove(line) || POINTER.test(rowWords(line, group)) || !rowWords(line, group));
  }
  return { cards, shared };
}
