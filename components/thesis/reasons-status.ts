import type { Verdict } from "@/lib/thesis-watch/rules";

/** Most words the reasons line above the holdings may use, the thesis count included (owner rule 8). */
export const REASONS_WORDS = 12;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * The reasons line above the holdings: the status in one short sentence, and how many holdings a thesis covers when
 * that still fits the word budget. The review button beside it is the action, so the line never says "review".
 * "Reasons on 2 of 10 holdings still hold." "1 reason looks broken and 1 is weaker." "Reasons on 3 of 10 holdings.
 * 2 checked still hold."
 */
export function reasonsStatus(input: { withReason: number; total: number; counts: Record<Verdict, number>; inThesis: number }): { text: string; thesis: string | null } {
  const { withReason, total, counts, inThesis } = input;
  const checked = counts.broken + counts.weaker + counts.played_out + counts.holds;
  let text: string;
  if (withReason === 0) {
    text = "Give each holding a reason for your agent to check.";
  } else {
    const problems: Array<[number, string, string]> = [
      [counts.broken, "looks broken", "look broken"],
      [counts.weaker, "is weaker", "are weaker"],
      [counts.played_out, "has played out", "have played out"],
    ];
    const parts = problems
      .filter(([count]) => count > 0)
      .map(([count, one, many], index) => (index === 0 ? `${count} ${count === 1 ? "reason" : "reasons"} ${count === 1 ? one : many}` : `${count} ${count === 1 ? one : many}`));
    const covered =
      total === 1
        ? "Your reason"
        : withReason === total
          ? `Reasons on all ${total} holdings`
          : withReason === 1
            ? `Your reason on 1 of ${total} holdings`
            : `Reasons on ${withReason} of ${total} holdings`;
    if (parts.length > 0) text = `${parts.join(", ").replace(/, ([^,]*)$/, " and $1")}.`;
    else if (checked === 0) text = total === 1 ? "You gave your one holding a reason." : `${covered}.`;
    else if (checked === withReason) text = `${covered} still ${withReason === 1 ? "holds" : "hold"}.`;
    else text = `${covered}. ${checked} checked still ${checked === 1 ? "holds" : "hold"}.`;
  }
  const thesis = inThesis > 0 ? `${inThesis} in your thesis.` : null;
  return { text, thesis: thesis && words(`${text} ${thesis}`) <= REASONS_WORDS ? thesis : null };
}
