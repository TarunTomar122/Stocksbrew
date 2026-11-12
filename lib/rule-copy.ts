/** Copy helpers for the steady call's stored sentences. Pure and tiny, so client code can import it. */

/**
 * The steady call's stored "what would change it", without the rule's mechanics (owner rule 8): no "We plan to keep
 * this call until at least Nov 25." and its "After that, …" / "before then" / "sooner", and no market-wide drop ("or a
 * week in which the S&P 500 falls 4%"), which says nothing about the stock. backend/call_stability.py no longer
 * writes these; older stored text still has them.
 */
export function plainRuleChange(text: string): string {
  let out = text
    .replace(/\bWe plan to (?:keep|hold) this call until at least [^.;]*[.;]\s*/gi, "")
    .replace(/\s*After that, [^.]*\./g, "")
    .replace(/,?\s*or (?:a week|\d+ trading days) in which the S&P 500 falls [\d.]+%/g, (_match: string, offset: number, whole: string) => {
      // The list keeps its "or": when the market drop was its last item, the item before it takes the "or".
      const before = whole.slice(0, offset);
      const comma = before.lastIndexOf(", ");
      return comma >= 0 && !before.slice(comma).includes(" or ") ? "\u0000" : "";
    })
    .replace(/, ([^,]*)\u0000/g, " or $1")
    .replace(/\u0000/g, "")
    .replace(/^before then,?\s*/i, "")
    .replace(/ could change it sooner\./g, " could change it.")
    .replace(/\s+/g, " ")
    .trim();
  // "…or sooner after its next results or a day in which … or a week in which …": one "or", at the end.
  out = out.replace(/(sooner after [^.]*?results) or ([^.]+\.)$/, (whole: string, results: string, rest: string) => {
    const or = rest.lastIndexOf(" or ");
    if (or >= 0) return `${results}, ${rest}`;
    const comma = rest.lastIndexOf(", ");
    return comma >= 0 ? `${results}, ${rest.slice(0, comma)} or ${rest.slice(comma + 2)}` : whole;
  });
  out = out.replace(/^only (.+) could change it\.$/i, "$1 could change it.");
  // A list of what could change it keeps its "or": "A, B or C could change it."
  out = out.replace(/^(.*), ([^,]+) could change it\.$/, (whole: string, head: string, last: string) => (head.includes(" or ") || last.includes(" or ") ? whole : `${head} or ${last} could change it.`));
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : "";
}

