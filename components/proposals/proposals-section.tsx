import { ProposalCards } from "@/components/proposals/proposal-cards";
import { etToday } from "@/lib/day-words";
import type { ProposalCardsLoad } from "@/lib/proposals-server";

/**
 * "Waiting for you": the signed-in person's agent proposals, for /agent and /inbox. The page starts the load
 * (lib/proposals-server.ts loadProposalCards) beside its own reads, so by the time the page's content is ready this
 * is too, and the section renders with it (no shift when it arrives, and the thread's scroll to today sees it).
 * Nothing waiting, or nothing read, nothing shown.
 */
export async function ProposalsSection({ load }: { load: Promise<ProposalCardsLoad | null> }) {
  const loaded = await load.catch(() => null);
  if (!loaded || loaded.cards.length === 0) return null;
  return <ProposalCards initial={loaded.cards} watch={loaded.watch} today={etToday()} />;
}
