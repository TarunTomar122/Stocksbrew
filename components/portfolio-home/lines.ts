import { firstSentence, monthWords, type MonthMove, type StockCard } from "@/lib/portfolio-home/stocks";

/**
 * What each holding card on My stocks says under its call (./stocks.tsx), within the owner's word budget (rule 8: one
 * sentence of at most 15 words), with a quiet card's month as bars instead of words (rule 4: a comparison gets a
 * bar), and a sentence that several cards share said once over them instead (rule 1).
 */

/** Words in a line, for the card budget. */
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const CARD_WORDS = 15;

/**
 * A fact cut to one sentence of at most 15 words: its first sentence, else its first clause when that still says a
 * whole thing ("Alphabet fell 17% over the past month."), else nothing rather than a cut-off sentence.
 */
export function shortLine(text: string): string | null {
  let first = firstSentence(text, 400);
  // firstSentence keeps "$1.5B. Guidance…" together (it won't split after a capital); cut there too, once the first
  // part says something on its own.
  const inner = first ? /^(.*?[.!?])\s+(?=[A-Z])/.exec(first) : null;
  if (inner && words(inner[1]!) >= 3) first = inner[1]!;
  // Never stop on an abbreviation ("Beat estimates vs.", "Shares of Apple Inc.").
  if (first && /\b(?:vs|Inc|Corp|Co|Ltd|etc|e\.g|i\.e)\.$/.test(first)) first = null;
  if (first && words(first) <= CARD_WORDS) return first;
  // Else its first clause, cut only where a clause truly ends (not at "and", which often carries the fact).
  const clause = (first ?? text).split(/,\s+|;\s+|\s+(?:while|but|though)\s+/)[0]!.trim().replace(/[.!?]$/, "");
  return words(clause) >= 3 && words(clause) <= CARD_WORDS && !/\b(?:vs|Inc|Corp|Co|Ltd)$/.test(clause) ? `${clause}.` : null;
}

export type CardLine = {
  /** The card's sentence, or null when it says nothing beyond its figures (or it is said once over the cards). */
  text: string | null;
  /** The stock's past month against the S&P 500, drawn as two bars. */
  month: MonthMove | null;
};

/** Kinds whose sentence is about how the stock has done, so its month bars go with it. */
const MONTHLY = new Set(["month", "size", "call-reason"]);

/** What a card says under its call: a short sentence, and for a quiet card its month as bars instead of in words. */
export function cardLine(card: StockCard, month: Record<string, MonthMove> | null | undefined): CardLine {
  const move = month?.[card.ticker] ?? null;
  const fact = card.fact;
  if (!fact) return { text: null, month: move };
  if (fact.kind === "month" && move) {
    // "Your biggest holding, 17% of your money, down 1.6% over the past month, in line with the S&P 500.": the month
    // is in the bars, so the sentence keeps only what comes before it, and a sentence that is only the month goes.
    const said = monthWords(move);
    if (fact.text.endsWith(`, ${said}.`)) return { text: shortLine(`${fact.text.slice(0, -(said.length + 3))}.`), month: move };
    // Worded some other way: keep only the clauses before the one about the past month.
    const clauses = fact.text.replace(/\.$/, "").split(/,\s+/);
    const at = clauses.findIndex((clause) => /past month|this month/i.test(clause));
    if (at === 0) return { text: null, month: move };
    if (at > 0) return { text: shortLine(`${clauses.slice(0, at).join(", ")}.`), month: move };
    return { text: shortLine(fact.text), month: move };
  }
  if (!MONTHLY.has(fact.kind) || !move) return { text: shortLine(fact.text), month: null };
  // The bars say the month; a sentence about the month from another source can disagree with them ("fell 17% over
  // the past month" beside a −14.8% bar), so it goes.
  const text = shortLine(fact.text);
  return { text: text && /past month|this month|over the month/i.test(text) ? null : text, month: move };
}

/**
 * "Reports Tuesday, after the close" said once over the cards it is true for, with their logos. `shown[view]` says
 * whether the line shows in that view (two or more of its cards on screen), so it never names a folded card.
 */
export type SharedLine = { text: string; members: number[]; shown: boolean[] };

/** At most this many shared lines over the cards, the ones true for the most cards; any others stay on their cards. */
const SHARED_LINES = 2;

/**
 * The same sentence on two or more cards on screen is said once above them instead (owner rule 1). Which cards are
 * on screen differs by width and with the fold open, so `views` lists each case as which cards show (a card index ->
 * shown); a line shows in a view only when two or more of its cards do, and only those cards drop the sentence there.
 * Returns each card's line (a card that may share its sentence also gets its month bars, so it never goes blank),
 * the shared lines, and for each card the views in which its sentence is said above it instead.
 */
export function sayOnce(
  lines: CardLine[],
  cards: StockCard[],
  month: Record<string, MonthMove> | null | undefined,
  views: boolean[][],
): { lines: CardLine[]; shared: SharedLine[]; saidAbove: boolean[][] } {
  const count = new Map<string, number>();
  for (const line of lines) if (line.text) count.set(line.text, (count.get(line.text) ?? 0) + 1);
  const texts = [...count]
    .filter(([, cardsSaying]) => cardsSaying >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, SHARED_LINES)
    .map(([text]) => text);
  const shared: SharedLine[] = texts
    .map((text) => {
      const members = lines.flatMap((line, index) => (line.text === text ? [index] : []));
      return { text, members, shown: views.map((view) => members.filter((index) => view[index]).length >= 2) };
    })
    // In card order, by each line's first card.
    .sort((a, b) => a.members[0]! - b.members[0]!);
  const groupOf = lines.map((_, index) => shared.find((group) => group.members.includes(index)) ?? null);
  return {
    lines: lines.map((line, index) => (groupOf[index] ? { text: line.text, month: line.month ?? month?.[cards[index]!.ticker] ?? null } : line)),
    shared,
    saidAbove: lines.map((_, index) => views.map((view, at) => Boolean(groupOf[index]?.shown[at] && view[index]))),
  };
}
