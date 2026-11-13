/**
 * The agent's one line about a filing comparison, with the new risks' topics (./topics.ts): "SMR's new 10-K adds 5
 * risks (ENTRA1 deal and supply chain) and drops 9.". Server side: the topics read the word list in ./casing.ts, which
 * stays off the client.
 */

import { isOrdinaryWord } from "./casing";
import type { Comparison } from "./diff";
import { topicList, type TopicOptions } from "./topics";
import { andList, QUOTE_WORDS, risks, wordCount } from "./words";

/** Topic options with the server's word list. */
export function topicOptions(company = ""): TopicOptions {
  return { company, ordinary: isOrdinaryWord };
}

/**
 * `before` with the headings' topics (lib/filing-changes/topics.ts), as many as keep the whole within `max` words,
 * serious first: "SMR's new 10-K adds 5 risks" → "SMR's new 10-K adds 5 risks: ENTRA1 deal, supply chain and tariffs &
 * trade". `style` "colon" ends on the list; "aside" puts it in brackets and `after` follows ("… (debt) and drops 1").
 */
export function withTopics(before: string, headings: readonly string[], options: { style?: "colon" | "aside"; after?: string; max?: number; company?: string } = {}): string {
  const max = options.max ?? QUOTE_WORDS;
  const after = options.after ?? "";
  const topics = topicList(headings, 3, topicOptions(options.company));
  for (let count = topics.length; count > 0; count -= 1) {
    const list = andList(topics.slice(0, count));
    const line = options.style === "aside" ? `${before} (${list})${after}` : `${before}: ${list}${after}`;
    if (wordCount(line) <= max) return line;
  }
  return `${before}${after}`;
}

/**
 * One sentence for the inbox and the agent's record, at most 15 words, figures and topics from the comparison:
 * "SMR's new 10-K adds 5 risks (ENTRA1 deal and supply chain) and drops 9.", "AMD's new 10-Q adds 1 risk: debt.",
 * "LLY's new 10-Q lists no changes to its risks.". Null when there is nothing to say (unreadable, or only rewording).
 */
export function recordLine(ticker: string, comparison: Comparison, company = ""): string | null {
  const form = comparison.filing.form;
  if (comparison.status === "no_changes") return `${ticker}'s new ${form} lists no changes to its risks.`;
  if (comparison.status === "none_listed") return `${ticker}'s new ${form} lists no new risks.`;
  if (comparison.status !== "changes") return null;
  const added = comparison.added.length;
  const dropped = comparison.dropped.length;
  if (added > 0 && dropped > 0) return `${withTopics(`${ticker}'s new ${form} adds ${risks(added)}`, comparison.added, { style: "aside", after: ` and drops ${dropped}`, company })}.`;
  if (added > 0) {
    const since = comparison.scope === "partial" ? { style: "aside" as const, after: " since its 10-K" } : {};
    return `${withTopics(`${ticker}'s new ${form} adds ${risks(added)}`, comparison.added, { ...since, company })}.`;
  }
  if (dropped > 0) return `${withTopics(`${ticker}'s new ${form} drops ${risks(dropped)}`, comparison.dropped, { company })}.`;
  const repeated = comparison.repeated?.length ?? 0;
  if (repeated > 0) return `${ticker}'s new ${form} repeats ${risks(repeated)} added after its 10-K.`;
  return null;
}

