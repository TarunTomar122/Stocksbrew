import { evidenceFor, keepSupported } from "@/lib/memo/word";

import { ruleNote, type ReasonCheck } from "./rules";

/**
 * Wording a check's note, under the memo's numbers check (lib/memo/word.ts).
 * The rules chose the facts and wrote a note; a model may reword it so it
 * reads like a person, and may tie it to the person's own words, nothing
 * more. Every sentence it sends back must cite only figures, stocks,
 * weekdays and directions that are in the check's own facts. If any sentence
 * fails, the whole note keeps the rules' words. Pure.
 */

export type NotePayload = {
  ticker: string;
  verdict: string;
  /** The person's own words, quoted, or null. */
  quote: string | null;
  draft: string;
  facts: Array<{ id: string; text: string; data: Record<string, string | number | null> }>;
};

export type NoteReader = (payload: NotePayload) => Promise<{ note?: unknown } | null>;

/** Most sentences a reworded note may have: the headline, two facts and one on the person's words. */
export const NOTE_MAX_SENTENCES = 4;

export function notePayload(check: ReasonCheck): NotePayload {
  const facts = (check.signals.length > 0 ? check.signals : check.checked).map((signal) => ({ id: signal.id, text: signal.text, data: signal.data }));
  return { ticker: check.ticker, verdict: check.headline, quote: check.quote, draft: ruleNote(check), facts };
}

/** The model's note when every sentence passes and it keeps the verdict; otherwise the rules' note. */
export function applyNote(check: ReasonCheck, wording: { note?: unknown } | null | undefined): { note: string; wordedBy: "rules" | "model"; dropped: string[] } {
  const draft = ruleNote(check);
  if (!wording || typeof wording.note !== "string") return { note: draft, wordedBy: "rules", dropped: [] };
  const facts = [...check.signals, ...check.checked].map((signal) => ({ text: signal.text, data: signal.data, tickers: [check.ticker] }));
  // "The last twelve months" is the rules' own phrase for trailing figures, so twelve is always a known number.
  const evidence = evidenceFor(facts, [draft, check.quote ?? "", "12 months"]);
  const result = keepSupported(wording.note, evidence, NOTE_MAX_SENTENCES);
  const dropped = result.dropped.map((row) => `${row.why}: ${row.sentence}`);
  // The verdict is the rules' call: the note must open with the same headline.
  if (!result.text || result.dropped.length > 0 || !result.text.startsWith(check.headline)) return { note: draft, wordedBy: "rules", dropped };
  return { note: result.text, wordedBy: "model", dropped };
}

/** Rewords a note, or keeps the rules' words when there is no model or it fails. */
export async function wordNote(check: ReasonCheck, reader: NoteReader | null): Promise<{ note: string; wordedBy: "rules" | "model" }> {
  if (!reader) return { note: ruleNote(check), wordedBy: "rules" };
  try {
    const { note, wordedBy, dropped } = applyNote(check, await reader(notePayload(check)));
    if (dropped.length > 0) console.info(`[thesis-watch] ${check.ticker} model sentences dropped:`, dropped.join("; "));
    return { note, wordedBy };
  } catch (error) {
    console.warn("[thesis-watch] wording failed, rules stand:", error instanceof Error ? error.message : error);
    return { note: ruleNote(check), wordedBy: "rules" };
  }
}
