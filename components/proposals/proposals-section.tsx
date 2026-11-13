import { ProposalCards } from "@/components/proposals/proposal-cards";
import { etToday } from "@/lib/day-words";
import type { ProposalCardsLoad } from "@/lib/proposals-server";

/**
 * "Needs you" on /agent: the signed-in person's agent proposals, compact (one line each, folded to the first row, as
 * on the briefing's desk) under the biggest things, with the agent's status as the tile that fills an odd row. The
 * page starts the load (lib/proposals-server.ts loadProposalCards) beside its own reads, so by the time the page's
 * content is ready this is too, and the section renders with it (no shift when it arrives). With nothing waiting it
 * shows nothing. An answered card moves into the record on the same page.
 */
export async function ProposalsSection({ load }: { load: Promise<ProposalCardsLoad | null> }) {
  const loaded = await load.catch(() => null);
  if (!loaded || loaded.cards.length === 0) return null;
  return <ProposalCards initial={loaded.cards} watch={loaded.watch} today={etToday()} recordOnPage compact fold={2} />;
}
