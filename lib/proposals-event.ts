/** Sent on window when an agent proposal is answered (components/proposals), so the bell's count follows at once. */
export const PROPOSALS_CHANGED_EVENT = "stocksbrew:proposals-changed";

export type ProposalsChangedDetail = { waiting: number };
