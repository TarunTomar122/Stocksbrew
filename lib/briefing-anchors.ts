import { briefingSections, type Briefing, type BriefingStateMap } from "@/lib/briefing";
import { groupBriefingSections, type BriefingGroup } from "@/lib/briefing-groups";

/**
 * Which stock cards in a personal briefing can be jumped to from the agents
 * strip (components/briefing/agents-strip.tsx): the first open, visible card
 * of each stock, in page order (Needs you, the shown part of Worth knowing,
 * Coming up). Settled cards and the ones behind "Show all" are left out, so a
 * link never points at something hidden, and each stock gets one `brief-<ticker>`
 * id. The view (components/briefing/briefing-view.tsx) and the page's strip
 * both use this. Pure.
 */

/** Worth knowing shows this many stocks before "Show all". */
export const WORTH_KNOWING_FIRST = 8;

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

/** The tickers of a personal briefing's first-load open, visible cards, for the strip's links. Empty in the market view. */
export function briefingAnchorTickers(briefing: Pick<Briefing, "mode" | "needs_you" | "also_today">, state: BriefingStateMap | null | undefined): string[] {
  if (briefing.mode !== "personal") return [];
  const grouped = groupBriefingSections(briefingSections(briefing, state), "personal");
  const ordered = [...grouped.needs_you, ...grouped.worth_knowing.slice(0, WORTH_KNOWING_FIRST), ...grouped.coming_up];
  return [...anchorGroups(ordered)].map((group) => group.ticker as string);
}
