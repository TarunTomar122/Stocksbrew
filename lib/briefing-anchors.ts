import { briefingSections, type Briefing, type BriefingStateMap } from "@/lib/briefing";
import { groupBriefingSections, type BriefingGroup } from "@/lib/briefing-groups";
import { briefingRead, comingUpAfterRead, holdingsFirst, readEarningsTickers, WORTH_KNOWING_FIRST } from "@/lib/briefing-read";

/**
 * Which stock cards in a personal briefing can be jumped to from the agents
 * strip (components/briefing/agents-strip.tsx): the first open, visible card
 * of each stock, in page order (Needs you, the shown part of Worth knowing,
 * Coming up). Settled cards and the ones behind "Show all" are left out, so a
 * link never points at something hidden, and each stock gets one `brief-<ticker>`
 * id. The view (components/briefing/briefing-view.tsx) and the page's strip
 * both use this. Pure.
 */

export { WORTH_KNOWING_FIRST };

/** The first card of each stock among `ordered` (the cards in page order), by object. */
export function anchorGroups(ordered: readonly BriefingGroup[]): Set<BriefingGroup> {
  const seen = new Set<string>();
  const out = new Set<BriefingGroup>();
  for (const group of ordered) {
    if (!group.ticker || seen.has(group.ticker)) continue;
    seen.add(group.ticker);
    out.add(group);
  }
  return out;
}

/**
 * The tickers of a personal briefing's first-load open, visible cards, for the strip's links. Empty in the market view.
 * Coming up leaves out the stocks whose report the read already names, as the view does (lib/briefing-read.ts).
 */
export function briefingAnchorTickers(
  briefing: Pick<Briefing, "mode" | "needs_you" | "also_today" | "portfolio" | "market" | "quiet" | "date">,
  state: BriefingStateMap | null | undefined,
  now: number = Date.now(),
): string[] {
  if (briefing.mode !== "personal") return [];
  const grouped = holdingsFirst(groupBriefingSections(briefingSections(briefing, state), "personal"));
  const comingUp = comingUpAfterRead(grouped.coming_up, readEarningsTickers(briefingRead(briefing, grouped, null, now)));
  const ordered = [...grouped.needs_you, ...grouped.worth_knowing.slice(0, WORTH_KNOWING_FIRST), ...comingUp];
  return [...anchorGroups(ordered)].map((group) => group.ticker as string);
}
