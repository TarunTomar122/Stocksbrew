import { ProposalCards } from "@/components/proposals/proposal-cards";
import { etToday } from "@/lib/day-words";
import type { ProposalCardsLoad } from "@/lib/proposals-server";

/**
 * "Needs you": the signed-in person's agent proposals, for /agent and /inbox, with the agent's status beside them.
 * The page starts the load (lib/proposals-server.ts loadProposalCards) beside its own reads, so by the time the page's
 * content is ready this is too, and the section renders with it (no shift when it arrives). With nothing waiting it
 * shows nothing, or (`statusAlone`, on /agent) only the status strip. On /agent an answered card moves into the record.
 */
export async function ProposalsSection({ load, statusAlone = false }: { load: Promise<ProposalCardsLoad | null>; statusAlone?: boolean }) {
  const loaded = await load.catch(() => null);
  if (!loaded || (loaded.cards.length === 0 && !statusAlone)) return null;
  return <ProposalCards initial={loaded.cards} watch={loaded.watch} today={etToday()} statusAlone={statusAlone} recordOnPage={statusAlone} />;
}
