/**
 * Moving a conversation between the Ask panel and the full /ask page, in the
 * same tab, without a server round trip: the panel writes the conversation to
 * sessionStorage and opens /ask?from=panel, which reads it once and deletes it.
 * Also the one-line note that reopens the panel after a sign-in reload.
 *
 * Browser only. Every storage call is wrapped: a private window or full storage
 * just means nothing is carried, and the caller falls back to a plain link.
 */

import type { AskUIMessage } from "@/lib/ask-cards";

const HANDOFF_KEY = "stocksbrew:ask-handoff";
const REOPEN_KEY = "stocksbrew:ask-reopen";
/** A handoff older than this is from another visit, not the click that opened the page. */
const HANDOFF_MAX_AGE_MS = 5 * 60 * 1000;

export const ASK_HANDOFF_PARAM = "from";
export const ASK_HANDOFF_VALUE = "panel";

export type AskHandoff = {
  id: string;
  context: string | null;
  messages: AskUIMessage[];
  /** What was typed and not sent yet. */
  input: string;
};

export function writeAskHandoff(handoff: AskHandoff): boolean {
  try {
    window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ ...handoff, at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/** Read and delete. Null when there is none, it is stale, or it is not the shape we wrote. */
export function takeAskHandoff(): AskHandoff | null {
  try {
    const raw = window.sessionStorage.getItem(HANDOFF_KEY);
    window.sessionStorage.removeItem(HANDOFF_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<AskHandoff> & { at?: number };
    if (typeof data.at !== "number" || Date.now() - data.at > HANDOFF_MAX_AGE_MS) return null;
    if (typeof data.id !== "string" || !Array.isArray(data.messages)) return null;
    return {
      id: data.id,
      context: typeof data.context === "string" ? data.context : null,
      messages: data.messages,
      input: typeof data.input === "string" ? data.input : "",
    };
  } catch {
    return null;
  }
}

export type AskReopen = { question: string | null; context: string | null };

/** Before the sign-in reload: open the panel again on the page it came back to, with the question that was waiting. */
export function writeAskReopen(reopen: AskReopen): void {
  try {
    window.sessionStorage.setItem(REOPEN_KEY, JSON.stringify({ ...reopen, at: Date.now() }));
  } catch {
    // Nothing carried: the panel just stays closed after the reload.
  }
}

export function takeAskReopen(): AskReopen | null {
  try {
    const raw = window.sessionStorage.getItem(REOPEN_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(REOPEN_KEY);
    const data = JSON.parse(raw) as Partial<AskReopen> & { at?: number };
    if (typeof data.at !== "number" || Date.now() - data.at > HANDOFF_MAX_AGE_MS) return null;
    return { question: typeof data.question === "string" ? data.question : null, context: typeof data.context === "string" ? data.context : null };
  } catch {
    return null;
  }
}
