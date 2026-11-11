/**
 * The call line in the stock header: the call word in its chip, then what it means. When the plain action already
 * starts with the call word ("Buy more on a dip, not here"), the chip carries the word and the line goes on from it
 * ("[Buy more] on a dip, not here"), so the call is never said twice. Call words are plain letters (Buy more, Keep,
 * Sell some); a word with anything else in it is never matched.
 */
export function callMeaning(callWord: string | null, callAction: string | null): string | null {
  if (!callAction) return null;
  if (!callWord || !/^[a-z ]+$/i.test(callWord) || !new RegExp(`^${callWord}\\b`, "i").test(callAction)) return callAction;
  const rest = callAction.slice(callWord.length).replace(/^[\s,.;:—–-]+/, "").trim();
  return rest || null;
}
