/**
 * What a page tells the shell's Ask panel about itself, when the address alone
 * cannot say it (lib/ask-page-context.ts covers the rest): the item Ask starts
 * from (`ctx`, lib/ask-context.ts) and the questions worth offering first. A
 * page puts one inert `<script type="application/json" data-ask-page-hint>`
 * on itself (components/ask/ask-page-hint.tsx); the panel reads it when it
 * opens. Pages carry no Ask box of their own (owner rule 1: one Ask per page),
 * so this is how a page's own questions still reach the panel.
 *
 * Pure and import-free: the panel, the page and the tests all read it.
 */

export const ASK_PAGE_HINT_ATTR = "data-ask-page-hint";

export type AskPageQuestion = { question: string; href: string };

export type AskPageHint = {
  /** The item a new conversation starts from, or null for none (the page is about nothing in particular). */
  context: string | null;
  /** Questions to offer first, each an /ask link carrying its own item. */
  questions: AskPageQuestion[];
};

const MAX_QUESTIONS = 6;

/** The hint as the page writes it: JSON with `<` escaped, so the text can never close the script element. */
export function serializeAskPageHint(hint: AskPageHint): string {
  return JSON.stringify({ context: hint.context, questions: hint.questions.slice(0, MAX_QUESTIONS) }).replace(/</g, "\\u003c");
}

/** Read a hint back, keeping only well-formed parts. Null when it is not a hint at all. */
export function parseAskPageHint(raw: string | null | undefined): AskPageHint | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { context, questions } = data as { context?: unknown; questions?: unknown };
  const cleanContext = typeof context === "string" && context.trim() ? context.trim() : null;
  const cleanQuestions = Array.isArray(questions)
    ? questions
        .filter(
          (item): item is AskPageQuestion =>
            Boolean(item) &&
            typeof (item as AskPageQuestion).question === "string" &&
            typeof (item as AskPageQuestion).href === "string" &&
            (item as AskPageQuestion).question.trim().length > 0 &&
            // Only links into Ask on this site.
            /^\/ask\?/.test((item as AskPageQuestion).href),
        )
        .slice(0, MAX_QUESTIONS)
        .map((item) => ({ question: item.question.trim(), href: item.href }))
    : [];
  return { context: cleanContext, questions: cleanQuestions };
}
