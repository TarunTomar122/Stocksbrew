/**
 * The first percent in a sentence, signed by the word just before it ("up 1.1%" → "+1.1%", "fell 5.47%" → "−5.47%",
 * "down about 2%" → "−2%", "18% of" → "18%"); a sign written on the number itself is kept ("−3%"). Undefined when
 * the sentence has no percent, so a card shows the sentence alone. With `signedOnly`, a percent with no direction
 * (a rule's threshold: "moved 5% or more") gives nothing.
 */
const UP = new Set(["up", "rose", "gained", "climbed", "jumped", "surged"]);
const DOWN = new Set(["down", "fell", "lost", "dropped", "slid", "sank"]);

export function leadPercent(text: string, options: { signedOnly?: boolean } = {}): string | undefined {
  const match = /(?:\b(up|down|rose|fell|gained|lost|dropped|climbed|jumped|surged|slid|sank)\s+(?:by\s+|about\s+|nearly\s+|almost\s+)?)?([+\u2212-])?(\d+(?:\.\d+)?)%/i.exec(text);
  if (!match) return undefined;
  const word = match[1]?.toLowerCase();
  // "makes up 41%" is a share, not a rise.
  const share = word === "up" && /\bmak(?:e|es|ing)\s+$/i.test(text.slice(0, match.index));
  // "a 10-15% drop": a dash right after a digit is a range, not a minus sign.
  const range = Boolean(match[2]) && /\d$/.test(text.slice(0, match.index));
  const written = range ? "" : match[2] === "-" || match[2] === "\u2212" ? "\u2212" : match[2] === "+" ? "+" : "";
  const sign = written || (!word || share ? "" : DOWN.has(word) ? "\u2212" : UP.has(word) ? "+" : "");
  if (options.signedOnly && !sign) return undefined;
  return `${sign}${match[3]}%`;
}
