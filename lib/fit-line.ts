/**
 * A sentence cut to fit a short box (two lines of a table cell), never mid-word (owner rule 8: no truncated words
 * like "alternativ…"). The main clause when it ends early enough ("Intuitive Machines rose after record revenue",
 * not the trailing ", as investors…"), which needs no ellipsis because it stands on its own; else the last whole word
 * that fits, with dangling little words dropped ("…look for", not "…look for the") and an ellipsis.
 */

// Where a clause can end, most natural first. Each is cut before the matched words.
const CLAUSE_ENDS = /\s*[;:]\s+|\s+[—–]\s+|,\s+|\s+(?:as|while|amid|despite|after|but|though|although|because|which|with|and)\s+/g;

// Little words a cut must not end on: "…prompting investors to look for", never "…look for the".
const DANGLING = new Set(
  "a an the and or but of to in on at by for from with as that this its their his her our is are was were be into over about after than while amid despite".split(" "),
);

/** At most `max` characters, ending at a clause or a whole word. Empty in, empty out. */
export function fitLine(text: string | null | undefined, max: number): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  // The latest clause end that fits and keeps at least 40% of the room, so the clause says something.
  let clause = -1;
  for (const match of clean.matchAll(CLAUSE_ENDS)) {
    const at = match.index ?? -1;
    if (at > max) break;
    if (at >= max * 0.4) clause = at;
  }
  if (clause > 0) return tidyEnd(clean.slice(0, clause));
  const words = clean.slice(0, max).split(" ");
  // The last word was cut through unless the next character is a space.
  if (clean.charAt(max) !== " ") words.pop();
  while (words.length > 1 && DANGLING.has(words[words.length - 1]!.toLowerCase().replace(/[^a-z]/g, ""))) words.pop();
  const head = tidyEnd(words.join(" "));
  return head ? `${head}…` : "";
}

/** No trailing comma, colon or dash left at the cut; a full stop stays. */
function tidyEnd(text: string): string {
  return text.replace(/[\s,;:—–-]+$/, "");
}
