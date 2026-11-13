import HEADING_WORDS from "./heading-words.json";
import type { Comparison } from "./diff";
import type { FilingChangesDoc } from "./store";

/**
 * Some filers write every risk heading in Title Case ("We May Fail to Realize the Anticipated Benefits of the
 * Merger"). Shown on a page that is a shout, and the owner's rules keep Title Case off the site, so such a heading is
 * shown as a sentence: the same words, only the casing changed. A word is lowered only when it is one the risk
 * headings of 550 filers use in lower case (heading-words.json, read from tm_filing_changes in Nov 2026); names
 * (Coterra, Devon), acronyms (AI, U.S.), words with inner capitals (SoFiUSD) and the company's own name keep their
 * capitals. A heading that is not Title Case is left exactly as filed. Server only: the word list stays off the client.
 */

const COMMON = new Set<string>(HEADING_WORDS as string[]);

/** Whether a lower-case word is one the risk headings of 550 filers use in lower case: an ordinary word, not a name. */
export function isOrdinaryWord(word: string): boolean {
  return COMMON.has(word.toLowerCase().replace(/['’]s$/, ""));
}

/** Most words of four or more letters start with a capital. */
export function isTitleCase(text: string): boolean {
  const words = text.split(/\s+/).filter((word) => /^[A-Za-z]{4,}/.test(word));
  if (words.length < 3) return false;
  return words.filter((word) => /^[A-Z][a-z]/.test(word)).length / words.length >= 0.6;
}

export function asSentence(heading: string, company = ""): string {
  if (!isTitleCase(heading)) return heading;
  const own = new Set(company.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 2));
  let first = true;
  return heading.replace(/[A-Za-z][A-Za-z'’-]*/g, (word) => {
    if (first) {
      first = false;
      return word;
    }
    // Only a plain capitalised word ("Merger", "Could") is a candidate; "AI", "U.S", "SoFiUSD" are not.
    if (!/^[A-Z][a-z'’-]*$/.test(word)) return word;
    const lower = word.toLowerCase();
    const bare = lower.replace(/['’]s$/, "");
    if (own.has(bare) || !COMMON.has(bare)) return word;
    return lower;
  });
}

function comparisonAsSentences(comparison: Comparison, company: string): Comparison {
  const each = (list: string[]) => list.map((heading) => asSentence(heading, company));
  return {
    ...comparison,
    added: each(comparison.added),
    dropped: each(comparison.dropped),
    ...(comparison.repeated ? { repeated: each(comparison.repeated) } : {}),
    reworded: comparison.reworded.map((pair) => ({ ...pair, from: asSentence(pair.from, company), to: asSentence(pair.to, company) })),
  };
}

/** A stored document for display: every heading through asSentence. The stored copy stays as filed. */
export function docAsSentences(doc: FilingChangesDoc): FilingChangesDoc {
  return { ...doc, latest: comparisonAsSentences(doc.latest, doc.company), history: doc.history.map((entry) => comparisonAsSentences(entry, doc.company)) };
}
