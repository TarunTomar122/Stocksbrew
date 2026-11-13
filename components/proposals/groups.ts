import type { ProposalCard } from "@/lib/proposals";

/**
 * The waiting proposals as blocks: two or more cards that do the same thing (lib/proposals.ts groupOf) sit under one
 * heading that says the action once, so "Try buying X in your practice account" is never printed on four cards
 * (owner rule 1). Cards with no partner come first, in one block with no heading, then each group in the order its
 * first card had (the queue is sorted by priority).
 */
export type ProposalBlock = { key: string; heading: string | null; cards: ProposalCard[] };

export function proposalBlocks(cards: readonly ProposalCard[]): ProposalBlock[] {
  const byKey = new Map<string, ProposalCard[]>();
  for (const card of cards) {
    // A card without its group (an older client's queue) stands alone.
    const key = card.group?.key ?? `solo:${card.id}`;
    const list = byKey.get(key);
    if (list) list.push(card);
    else byKey.set(key, [card]);
  }
  const loose: ProposalCard[] = [];
  const groups: ProposalBlock[] = [];
  for (const [key, list] of byKey) {
    if (list.length >= 2 && list[0]!.group) groups.push({ key, heading: list[0]!.group.heading, cards: list });
    else loose.push(...list);
  }
  // Loose cards keep the queue's order.
  loose.sort((a, b) => cards.indexOf(a) - cards.indexOf(b));
  return [...(loose.length > 0 ? [{ key: "loose", heading: null, cards: loose }] : []), ...groups];
}

/**
 * A block as the grid lays it out, two across: its own cards, then `guests` (lone cards set in a group's last row to
 * fill its empty slot; each keeps its full title, so it never reads as one of the group), then the status tile when
 * `tile` is set.
 */
export type PlannedBlock = ProposalBlock & { guests: ProposalCard[]; tile: boolean };

/**
 * How the blocks fill whole rows two across, so no row ends with an empty column (owner rule 4). A group with an odd
 * number of cards takes a lone card into its last row (the last one, the least pressing), else the status tile; the
 * lone cards left, if odd, take the status tile. The tile goes in one place at most. With no status to show and
 * nothing left to move, an odd block keeps its one empty slot: nothing is made up to fill it.
 */
export function layoutPlan(blocks: readonly ProposalBlock[], hasStatus: boolean): PlannedBlock[] {
  const looseBlock = blocks.find((block) => block.heading === null);
  const loose = [...(looseBlock?.cards ?? [])];
  let tileFree = hasStatus;
  const groups: PlannedBlock[] = blocks
    .filter((block) => block.heading !== null)
    .map((block) => {
      if (block.cards.length % 2 === 0) return { ...block, guests: [], tile: false };
      const guest = loose.pop();
      if (guest) return { ...block, guests: [guest], tile: false };
      if (tileFree) {
        tileFree = false;
        return { ...block, guests: [], tile: true };
      }
      return { ...block, guests: [], tile: false };
    });
  const out: PlannedBlock[] = [];
  if (loose.length > 0) {
    const tile = tileFree && loose.length % 2 === 1;
    if (tile) tileFree = false;
    out.push({ key: looseBlock!.key, heading: null, cards: loose, guests: [], tile });
  }
  return [...out, ...groups];
}

/** Whether the status shows as a tile somewhere in the grid (else it is the strip above the cards). */
export function planHasTile(plan: readonly PlannedBlock[]): boolean {
  return plan.some((block) => block.tile);
}

/** What a card says as its action: the full title alone, under a heading only its own part (or nothing). */
export function cardAction(card: ProposalCard, grouped: boolean): string | null {
  if (!grouped) return card.title;
  return card.group?.short ?? null;
}
