import type { RecordItem } from "@/lib/thread/record";

/** Sent on window when an agent proposal is answered (components/proposals), so the bell's count follows at once. */
export const PROPOSALS_CHANGED_EVENT = "stocksbrew:proposals-changed";

export type ProposalsChangedDetail = { waiting: number };

/**
 * Sent on window when a proposal on /agent is accepted, dismissed or found stale: the record ("What I did") shows its
 * line at once, before the page's refresh brings the stored one.
 */
export const PROPOSAL_ANSWERED_EVENT = "stocksbrew:proposal-answered";

export type ProposalAnsweredDetail = { item: RecordItem };
