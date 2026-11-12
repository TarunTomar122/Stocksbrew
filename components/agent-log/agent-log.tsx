import * as React from "react";
import Link from "next/link";

import { Bar } from "@/components/oa/kit/skeleton";
import { getAgentLog } from "@/lib/agent-log/server";
import type { AgentLog } from "@/lib/agent-log/types";
import { entrySentence } from "@/lib/agent-log/words";

/**
 * "What the agent did today": the day's work across the market as a timeline. Each row is a link to its evidence
 * (owner rule 1: the row is the link, nothing repeated on it): the time, the count it went through as the figure,
 * and the sentence (no logo or icon on every row, owner rule 1). Renders nothing without a log, so a page never shows
 * an empty box. `narrow` (a side rail) keeps the phone layout at every width, so the sentence keeps its width.
 */

const CARD = "oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card";
/** Time, figure, sentence; on a phone the time sits under the figure so the sentence keeps its width. The figure column fits "12,345". */
const ROW_GRID = "grid grid-cols-[3.6rem_minmax(0,1fr)] items-start gap-x-3 sm:grid-cols-[4.5rem_4rem_minmax(0,1fr)]";
const ROW_GRID_NARROW = "grid grid-cols-[3.6rem_minmax(0,1fr)] items-start gap-x-3";

export function agentLogTitle(log: Pick<AgentLog, "when">): string {
  if (log.when === "today") return "What the agent did today";
  if (log.when === "yesterday") return "What the agent did yesterday";
  return `What the agent did on ${log.when}`;
}

/**
 * `fit`: in a wide side rail inside a box of fixed height (the briefing's rail ends with its main column), the card
 * is no taller than the box: its header stays and the rows scroll inside, with no visible bar (owner rule 5).
 */
const FIT_CARD = "lg:flex lg:max-h-full lg:min-h-0 lg:flex-col";
const FIT_LIST = "lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain scrollbar-hide";

export function AgentLogView({
  log,
  compact = false,
  narrow = false,
  fit = false,
  className = "",
}: {
  log: AgentLog | null;
  compact?: boolean;
  narrow?: boolean;
  fit?: boolean;
  className?: string;
}) {
  const grid = narrow ? ROW_GRID_NARROW : ROW_GRID;
  if (!log || log.entries.length === 0) return null;
  const title = agentLogTitle(log);
  return (
    <section aria-label={title} className={`${CARD} ${fit ? FIT_CARD : ""} ${className}`}>
      <header className={`shrink-0 ${compact ? "px-4 pb-2 pt-3" : "px-4 pb-2.5 pt-3.5 sm:px-5"}`}>
        <h2 className="text-[15px] font-semibold leading-6 text-oa-fg">{title}</h2>
        <p className="mt-0.5 text-pretty text-[14px] leading-5 text-oa-muted-fg">{log.lead}</p>
      </header>
      <ol className={`border-t border-oa-border ${fit ? FIT_LIST : ""}`}>
        {/* The compact log (home page) leaves out members' own agents: a handful of runs is true but reads small there. */}
        {log.entries.filter((entry) => !(compact && entry.source === "agents")).map((entry) => (
          <li key={entry.source} className="border-b border-oa-border last:border-b-0">
            <Link
              prefetch={false}
              href={entry.href}
              aria-label={`${entry.time}: ${entrySentence(entry)}`}
              className={`${grid} min-h-11 px-4 py-2 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-5 ${compact ? "" : "sm:py-2.5"}`}
            >
              <time dateTime={entry.at} className={`oa-mono hidden pt-px text-[12.5px] tabular-nums leading-5 text-oa-muted-fg ${narrow ? "" : "sm:block"}`}>
                {entry.time}
              </time>
              <span className={`flex flex-col ${narrow ? "" : "sm:items-end"}`}>
                <span className="oa-mono text-[15px] font-semibold tabular-nums leading-5 text-oa-fg">{entry.figure}</span>
                <span className={`oa-mono whitespace-nowrap text-[11px] tabular-nums leading-4 text-oa-muted-fg ${narrow ? "" : "sm:hidden"}`}>{entry.time}</span>
              </span>
              {/* Time, figure and sentence only: no logo or icon on every row (owner rule 1); the sentence names the stock. */}
              <span className="min-w-0 text-pretty text-[14px] leading-5 text-oa-fg">{entry.rest}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The log, read from its shared cache. Stream it inside <Suspense fallback={<AgentLogGhost />}>. */
export async function AgentLog({ compact = false, narrow = false, fit = false, className = "" }: { compact?: boolean; narrow?: boolean; fit?: boolean; className?: string }) {
  return <AgentLogView log={await getAgentLog()} compact={compact} narrow={narrow} fit={fit} className={className} />;
}

/** The log's shape while it loads: the same header and rows, so nothing jumps when it arrives. */
export function AgentLogGhost({ rows = 5, compact = false, narrow = false, className = "" }: { rows?: number; compact?: boolean; narrow?: boolean; className?: string }) {
  return (
    <div className={`${CARD} ${className}`} aria-hidden="true">
      <div className={compact ? "px-4 pb-2 pt-3" : "px-4 pb-2.5 pt-3.5 sm:px-5"}>
        <Bar className="mt-1 h-4 w-52" />
        <Bar className="mt-2 h-3.5 w-full max-w-[34rem]" />
      </div>
      <div className="border-t border-oa-border">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className={`${narrow ? ROW_GRID_NARROW : ROW_GRID} min-h-11 items-center border-b border-oa-border px-4 py-2 last:border-b-0 sm:px-5 ${compact ? "" : "sm:py-2.5"}`}>
            {narrow ? null : <Bar className="hidden h-3.5 w-14 sm:block" />}
            <Bar className={`h-4 w-10 ${narrow ? "" : "sm:ml-auto"}`} />
            <Bar className={`h-4 ${index % 2 ? "w-3/4" : "w-11/12"}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
