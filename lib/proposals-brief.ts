import { afterResponse } from "@/lib/after-response";
import { waitingOf, type Proposal, type WatchSummary } from "@/lib/proposals";
import { listProposalsWithWatch, syncProposals } from "@/lib/proposals-server";

/**
 * What the briefing's line needs: how many proposals wait, and their stocks. The briefing's desk also takes the waiting
 * proposals themselves, every stored one (for what the person answered) and what the agent watches (lib/briefing-desk.ts).
 */
export type ProposalsBrief = {
  count: number;
  tickers: string[];
  waiting: Proposal[];
  all: Proposal[];
  watch: WatchSummary | null;
  /** The queue was worked out from a full read just now (or inside the sync's throttle after one): only then may a page say a stock needs nothing. */
  fresh: boolean;
};

/** How long the briefing waits for the count before going on without the line. */
const BRIEF_MS = 1200;

function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise.catch(() => null), late]).finally(() => clearTimeout(timer));
}

/**
 * The waiting proposals' count and stocks for the briefing. The briefing also works them out (syncProposals, throttled
 * the same way as /agent and /inbox), so someone who only reads the briefing gets them too. A sync that runs long goes
 * on in the background while the line shows what is stored. Null when even the store is slow or fails.
 */
export async function proposalsBrief(uid: string, now: Date = new Date()): Promise<ProposalsBrief | null> {
  const sync = syncProposals(uid, { now });
  // Kept alive past the response when it runs long (lib/after-response.ts).
  afterResponse("proposals sync", sync);
  // The stored ones are read beside the sync from the start: a slow sync never costs the line.
  const stored = within(listProposalsWithWatch(uid), BRIEF_MS + 300);
  const synced = await within(sync, BRIEF_MS);
  const fallback = synced ? null : await stored;
  const all: Proposal[] | null = synced ? synced.all : fallback?.proposals ?? null;
  if (!all) return null;
  const waiting = synced ? synced.waiting : waitingOf(all, now);
  return {
    count: waiting.length,
    tickers: [...new Set(waiting.flatMap((proposal) => (proposal.ticker ? [proposal.ticker] : [])))],
    waiting,
    all,
    watch: synced ? synced.watch : fallback?.watch ?? null,
    fresh: Boolean(synced?.complete),
  };
}
