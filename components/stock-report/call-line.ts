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

// The plain actions that start with their call word, said on from the word in one sentence.
const ON_FROM_WORD: Record<string, string> = {
  "keep what you own, don't buy more now": " what you own, but don't buy more for now.",
  "buy more on a dip, not here": " on a dip, not at today's price.",
  "sell some if it rises": " if the price rises.",
};

// Plain meanings that repeat the call in other words, said on from the call word.
const REWORD: Record<string, string> = {
  "we'd buy more": ".",
  "a good price to buy more": ": today's price is a good one to add at.",
  "we'd keep it, not buy more": " what you own, but don't buy more for now.",
  "we'd sell some, not buy more": ", and don't buy more.",
  "we'd sell some": ".",
  "don't buy more at this price": ", but don't buy more at this price.",
};

/**
 * The call as one heading (owner rule 6: no small call word over a second heading): the call word, toned, then the
 * rest of the same sentence ("[Buy more] on a dip, not at today's price."). An action that does not start with the
 * word follows it as its own sentence ("[Sell some]. Don't buy more at this price."). `rest` is "" when there is
 * nothing to add.
 */
export function callHeading(callWord: string, callAction: string | null): { word: string; rest: string } {
  const action = (callAction ?? "").trim();
  if (!action) return { word: callWord, rest: "" };
  const key = action.replace(/[.!]+$/, "").toLowerCase();
  // The default meanings (lib/plain-copy.ts CALL_MEANING and the engine's plain labels) say the call again in other
  // words ("We'd buy more"): said on from the word instead, so the call is said once.
  const reworded = REWORD[key];
  // Never "Buy more, but don't buy more": a meaning that contradicts the word falls through to its own sentence.
  if (reworded !== undefined && !(/^buy more$/i.test(callWord) && /don't buy more/.test(reworded))) return { word: callWord, rest: reworded };
  const known = ON_FROM_WORD[key];
  if (known && new RegExp(`^${callWord}\\b`, "i").test(action)) return { word: callWord, rest: known };
  if (/^[a-z ]+$/i.test(callWord) && new RegExp(`^${callWord}\\b`, "i").test(action)) {
    const after = action.slice(callWord.length).replace(/^[\s—–-]+/, " ").replace(/^\s*[:;]\s*/, ": ");
    // Only the word ("Keep."): nothing to add.
    const rest = after.replace(/^[\s.!]+$/, "").trim() ? (/[.!?]$/.test(after) ? after : `${after}.`) : "";
    return { word: callWord, rest: !rest || rest.startsWith(" ") || /^[,:.]/.test(rest) ? rest : ` ${rest}` };
  }
  const sentence = asSentence(action);
  return { word: callWord, rest: sentence ? `. ${sentence}` : "" };
}
