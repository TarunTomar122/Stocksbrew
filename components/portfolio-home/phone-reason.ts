/**
 * The one short line a closed finding card shows under its headline on a phone (components/portfolio-home/home.tsx
 * FindingCard), so the reader can judge a finding without opening it. Plain string work, kept here so it is tested.
 */

/** Words that end in a full stop without ending the sentence: "Apple Inc. beat", "after the U.S. close", "on Nov. 17". */
const ABBREVIATIONS = "Inc|Corp|Co|Ltd|Plc|U\\.S|U\\.K|vs|No|St|Mr|Mrs|Ms|Dr|e\\.g|i\\.e|approx|est|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
const SENTENCE_END = new RegExp(`(?<!\\b(?:${ABBREVIATIONS}))[.!?](?=\\s+[A-Z0-9$"“])`);

/** The first whole sentence of a line, punctuation included. "2.5%", "$1,110" and "Nov. 17" do not end one. */
export function leadSentence(text: string | null | undefined): string | null {
  const value = (text ?? "").trim().replace(/\s+/g, " ");
  if (!value) return null;
  const end = SENTENCE_END.exec(value);
  return end ? value.slice(0, end.index + 1) : value;
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Short enough to sit on a phone under a headline: about a dozen words. */
export const REASON_WORDS = 13;

// A clause reads as a sentence when it has a verb a person would say; a list of tickers or a bare label does not.
const VERB = /\b(?:is|are|was|were|has|have|had|would|will|can|could|did|does|do|makes|holds|sits|pays|reports|moved|rose|fell|grew|missed|beat)\b/;

/** The clause after a colon, when it is a sentence of its own ("…matters most: it is 11% of the portfolio."). */
function afterColon(sentence: string): string | null {
  const colon = sentence.indexOf(": ");
  if (colon <= 0) return null;
  const after = sentence.slice(colon + 2).trim();
  if (words(after) < 5 || !/^[a-z]/.test(after) || !VERB.test(after)) return null;
  const whole = /[.!?]$/.test(after) ? after : `${after}.`;
  return whole.charAt(0).toUpperCase() + whole.slice(1);
}

/** The clause before ", so", when it is a sentence of its own ("X is a similar fund to hold meanwhile, so…"). */
function beforeSo(sentence: string): string | null {
  const so = sentence.indexOf(", so ");
  if (so <= 0) return null;
  const before = sentence.slice(0, so).trim();
  return words(before) >= 4 && VERB.test(before) ? `${before}.` : null;
}

/** A sentence and its shorter parts that are whole sentences themselves, longest first. */
export function sentenceParts(sentence: string): string[] {
  return [sentence, afterColon(sentence), beforeSo(sentence)].filter((part): part is string => Boolean(part));
}

/**
 * From what the headline leaves out (`why`, only when the card has its own headline), else from the evidence: the
 * first whole sentence, or a whole-sentence part of it, of about a dozen words; when none is that short, the
 * shortest of them, whole. Never cut with an ellipsis. Null when there is nothing beyond the headline.
 */
export function phoneReason(item: { headline?: string | null; why?: string | null; evidence: string | null }, headline: string): string | null {
  const candidates = [item.headline ? leadSentence(item.why) : null, leadSentence(item.evidence)]
    .filter((line): line is string => Boolean(line) && line !== headline)
    .flatMap(sentenceParts);
  if (!candidates.length) return null;
  return candidates.find((line) => words(line) <= REASON_WORDS) ?? candidates.reduce((best, line) => (words(line) < words(best) ? line : best));
}
