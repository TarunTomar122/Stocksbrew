import { savedSentence } from "@/lib/agents-plain/save";

/**
 * The thread's reply box takes two things: a question, which goes to Ask, and a plain instruction for an agent
 * ("watch AMD for a 5% drop", "tell me when NVDA reports"), which goes to the agents' own reader and, once the person
 * says yes, to the same save path as the agents page. Pure, so the routing and the words are tested.
 */

export type ReplyRoute = "instruction" | "question";

/** Verbs a request for an agent starts with: "watch AMD for a 5% drop", "alert me if TSLA closes below 200". */
const INSTRUCTION_START =
  /^(?:(?:please|pls|can you|could you|would you)\s+)?(?:watch|track(?!\s+record)|monitor|alert me|notify me|ping me|warn me|email me|remind me|keep an eye|keep watch)\b/i;
/** "tell me when NVDA reports", "let me know if AMD drops 5%": only with when/if/before, never "tell me about NVDA". */
const WHEN_REQUEST = /\b(?:tell me|let me know|alert me|notify me|email me|warn me|remind me|ping me)\s+(?:when|if|before|once|as soon as)\b/i;

export function replyRoute(text: string): ReplyRoute {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "question";
  if (WHEN_REQUEST.test(clean)) return "instruction";
  // "Can you watch AMD?" is a request, though it ends in a question mark.
  if (INSTRUCTION_START.test(clean)) return "instruction";
  // Everything else is a question for Ask, which can also offer an agent when one fits.
  return "question";
}

/** What the save said back, as the agent says it in the thread. */
export function savedNote(input: {
  saved: Array<{ name: string; enabled: boolean }>;
  already: string[];
  failed?: string[];
  limit: number | null;
  proOnly?: string[];
}): string {
  const on = input.saved.filter((job) => job.enabled);
  const clean = on.length === input.saved.length && input.saved.length > 0 && input.already.length === 0 && !input.failed?.length;
  if (clean) {
    const names = on.map((job) => `“${job.name}”`);
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    return `Done. ${list} ${names.length === 1 ? "is" : "are"} on, and I'll write here when ${names.length === 1 ? "it finds" : "they find"} something.`;
  }
  const here = on.length > 1 ? "I'll write here when they find something." : "I'll write here when it finds something.";
  return savedSentence(input)
    .replace("Reports show up below after the next check.", here)
    .replace("Build it again and save: the ones already saved won't be added twice.", "Ask me again and I'll add it; the ones already saved won't be added twice.");
}
