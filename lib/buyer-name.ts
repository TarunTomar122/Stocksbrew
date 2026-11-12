/** A buyer's name, cut at a word with "…" past 20 letters: "Nippon Life Insurance Co" is "Nippon Life…". */
export function shortBuyerName(name: string, max = 20): string {
  const text = name.trim();
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const cut = (/\s/.test(text.charAt(max)) ? head : head.replace(/\s+\S*$/, "")).replace(/[\s,.&-]+$/, "");
  return `${cut || text.slice(0, max)}…`;
}
