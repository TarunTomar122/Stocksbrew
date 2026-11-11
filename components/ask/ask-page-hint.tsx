import { ASK_PAGE_HINT_ATTR, serializeAskPageHint, type AskPageQuestion } from "@/lib/ask-page-hint";

/**
 * Tells the shell's Ask panel what this page is about (lib/ask-page-hint.ts): the item a new conversation starts
 * from and the questions to offer first. Renders an inert JSON script and nothing visible, so the page itself has no
 * Ask box (owner rule 1). No hooks: server pages render it.
 */
export function AskPageHint({ context, questions = [] }: { context: string | null; questions?: AskPageQuestion[] }) {
  const props = { [ASK_PAGE_HINT_ATTR]: "" };
  return <script type="application/json" {...props} dangerouslySetInnerHTML={{ __html: serializeAskPageHint({ context, questions }) }} />;
}
