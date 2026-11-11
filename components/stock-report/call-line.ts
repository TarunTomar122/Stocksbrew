/**
 * The call line in the stock header: the call word in its chip, then what it means as a whole sentence. When the
 * plain action starts with the call word ("Keep what you own, don't buy more now"), the line is said as a full
 * sentence ("Keep what you own, but don't buy more for now.") instead of trailing on as a lowercase fragment. It
 * uses the call word again on purpose, never "Hold" (owner rule 8). Call words are plain letters (Buy more, Keep,
 * Sell some); a word with anything else in it is never matched.
 */

// The plain actions (lib/plain-copy.ts) that start with their own call word, said without it.
const WITHOUT_WORD: Record<string, string> = {
  "keep what you own, don't buy more now": "Keep what you own, but don't buy more for now.",
  "buy more on a dip, not here": "Wait for a dip before adding.",
  "sell some if it rises": "Take some profit if the price rises.",
};

function asSentence(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const first = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(first) ? first : `${first}.`;
}

export function callMeaning(callWord: string | null, callAction: string | null): string | null {
  if (!callAction) return null;
  if (!callWord || !/^[a-z ]+$/i.test(callWord) || !new RegExp(`^${callWord}\\b`, "i").test(callAction)) return asSentence(callAction);
  const known = WITHOUT_WORD[callAction.trim().replace(/[.!]+$/, "").toLowerCase()];
  if (known) return known;
  const rest = callAction.slice(callWord.length).replace(/^[\s,.;:—–-]+/, "").trim();
  return rest ? asSentence(rest) : null;
}
