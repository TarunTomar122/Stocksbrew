/**
 * The owner's word budget (docs/owner-design-rules.md rule 8) as code, for the guard test (lib/word-budget.test.ts):
 * a page title is at most 10 words, nothing sits as a paragraph under a page title, and a card line is at most 15
 * words and one sentence. Pure string helpers, server and client safe.
 */

export const TITLE_WORDS = 10;
export const LINE_WORDS = 15;

/** Words as a reader counts them: runs with a letter or digit ("$1.2M", "S&P", "−4.4%" each count once). */
export function countWords(text: string | null | undefined): number {
  return (text ?? "").split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/** Sentences in a line: full stops, question and exclamation marks that end a word, not "$1.5" or "U.S.". */
export function countSentences(text: string | null | undefined): number {
  const clean = (text ?? "").trim();
  if (!clean) return 0;
  const ends = clean.match(/[a-z0-9%)”"'][.!?](?=\s+[A-Z“"]|\s*$)/g) ?? [];
  return Math.max(1, ends.length);
}

export type BudgetBreak = { where: string; rule: "title" | "under-title" | "line" | "sentences"; words: number; text: string };

/**
 * Every break of the budget in one piece of copy: its title, whatever sits under the title (any text there is a
 * break), and its card lines.
 */
export function budgetBreaks(
  where: string,
  copy: { title?: string | null; underTitle?: string | null; lines?: ReadonlyArray<string | null | undefined> },
  limits: { title?: number; line?: number } = {},
): BudgetBreak[] {
  const out: BudgetBreak[] = [];
  const titleMax = limits.title ?? TITLE_WORDS;
  const lineMax = limits.line ?? LINE_WORDS;
  if (copy.title && countWords(copy.title) > titleMax) out.push({ where, rule: "title", words: countWords(copy.title), text: copy.title });
  if (copy.underTitle && countWords(copy.underTitle) > 0) out.push({ where, rule: "under-title", words: countWords(copy.underTitle), text: copy.underTitle });
  for (const line of copy.lines ?? []) {
    if (!line) continue;
    if (countWords(line) > lineMax) out.push({ where, rule: "line", words: countWords(line), text: line });
    else if (countSentences(line) > 1) out.push({ where, rule: "sentences", words: countWords(line), text: line });
  }
  return out;
}

/** Text with tags dropped and entities a page head prints decoded. */
function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** A rendered PageHead's title (its h1) and the paragraph under it (`.oa-head-lede`), or null when there is none. */
export function headCopy(html: string): { title: string; underTitle: string | null } {
  const title = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "";
  const lede = /<p[^>]*class="[^"]*oa-head-lede[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? null;
  return { title: plain(title), underTitle: lede === null ? null : plain(lede) };
}
