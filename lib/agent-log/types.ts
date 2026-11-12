/**
 * "What the agent did today": a dated log of the pipeline's own work across the market, built from what the jobs
 * stored (lib/agent-log/read.ts), worded by plain rules (lib/agent-log/words.ts). Types only, safe on the client.
 */

export type AgentLogSource = "premarket" | "briefs" | "calls" | "moves" | "filings" | "insiders" | "earnings" | "agents";

/** One line of the log. `figure` and `rest` together are the sentence: "72" + "stocks checked before the open; …". */
export type AgentLogEntry = {
  source: AgentLogSource;
  /** When the work was done (the job's own timestamp), ISO UTC. */
  at: string;
  /** "7:30 AM", New York time. */
  time: string;
  /** The count of what was gone through, formatted: "1,212". */
  figure: string;
  /** The rest of the sentence after the figure, ending in a full stop. */
  rest: string;
  /** What ran, in a word or two, for the side rail's status row: "Premarket", "Big moves". */
  kind: string;
  /** The run's outcome as one short figure for that row: "72 checked", "17 of 30 explained". */
  status: string;
  /** Where the evidence is. */
  href: string;
  /** A check that ran and found nothing new: kept only when the log has room. */
  quiet: boolean;
  /**
   * The stocks the run flagged, for the side rail's logo chips (owner rule 10): the move with it when the run measured
   * one (a premarket gap, the day's biggest explained move), else null. At most three.
   */
  stocks?: AgentLogStock[];
};

export type AgentLogStock = { ticker: string; pct: number | null };

export type AgentLog = {
  /** The New York trading day the log is about, "YYYY-MM-DD". */
  day: string;
  /** "today", "yesterday" or a weekday ("Friday"), for the title and lead. */
  when: string;
  /** One sentence summing up the day. */
  lead: string;
  /** Oldest first, as a timeline. */
  entries: AgentLogEntry[];
};
