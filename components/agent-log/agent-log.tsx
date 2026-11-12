import * as React from "react";
import Link from "next/link";

import { FitRows } from "@/components/agent-log/fit-rows";
import { StockLogo } from "@/components/stock-logo";
import { Bar } from "@/components/oa/kit/skeleton";
import { getAgentLog } from "@/lib/agent-log/server";
import type { AgentLog } from "@/lib/agent-log/types";
import { entrySentence, marketCheckLead, marketCheckTitle, stripColumns, withOwnAgents, type OwnAgentRuns } from "@/lib/agent-log/words";

/**
 * "What the agent did today": the day's work across the market as a timeline. Each row is a link to its evidence
 * (owner rule 1: the row is the link, nothing repeated on it): the time, the count it went through as the figure,
 * and the sentence (no logo or icon on every row, owner rule 1). Renders nothing without a log, so a page never shows
 * an empty box. `narrow` (a side rail) keeps the phone layout at every width, so the sentence keeps its width; `fit` (the
 * briefing's rail) shows each run as a status line instead: kind, figure, time.
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
const FIT_LIST = "lg:min-h-0 lg:overflow-y-auto scrollbar-hide";

/**
 * The briefing rail's status line (`fit`), at every width: what ran, its figure, when (owner rule 10: agent status
 * reads in two seconds, the same on a phone as on a wide screen). The kind keeps its whole word; a long figure wraps
 * under itself rather than squeezing the kind to a letter.
 */
const STATUS_ROW = "grid grid-cols-[auto_minmax(0,1fr)_3.6rem] content-center items-baseline gap-x-3 py-2 lg:min-h-9";

/**
 * `strip`: the log across the page under the briefing (no side rail to sit in), one tile per run on a wide screen:
 * the kind and when on top, the figure under it, then the flagged stocks. As many columns as runs (up to six), so
 * every tile is the same width and the row ends full (owner rule 4). On a narrower screen, the rail's status lines.
 */
const STRIP_TILE =
  "lg:h-full lg:grid-cols-[minmax(0,1fr)_auto] lg:content-start lg:items-baseline lg:gap-y-1 lg:py-3 lg:[grid-template-areas:'kind_time'_'status_status'_'chips_chips']";

/** "+24.9%" / "−5.5%", one decimal. */
function chipPct(pct: number): string {
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
}

/**
 * The stocks a run flagged, as small logo chips with their move under its status line (owner rule 10), inside the
 * row's own link: the row opens the run's evidence, so the chips are not links of their own.
 */
function StockChips({ stocks, className = "" }: { stocks: NonNullable<AgentLog["entries"][number]["stocks"]>; className?: string }) {
  return (
    <span className={`col-span-full mt-1 flex flex-wrap gap-1.5 ${className}`}>
      {stocks.map((stock) => (
        <span key={stock.ticker} className="inline-flex h-6 items-center gap-1.5 rounded-md border border-oa-border bg-oa-bg pl-1 pr-2">
          <StockLogo ticker={stock.ticker} size={16} />
          <span className="oa-mono text-[12px] font-semibold leading-4 text-oa-fg">{stock.ticker}</span>
          {stock.pct !== null ? (
            <span className={`oa-mono text-[12px] tabular-nums leading-4 ${stock.pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>{chipPct(stock.pct)}</span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

/** In a fixed-height rail box the list is cut to whole rows (./fit-rows.tsx); anywhere else it is a plain list. */
function ListOf({ fit, className, style, children }: { fit: boolean; className: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return fit ? <FitRows className={className}>{children}</FitRows> : <ol className={className} style={style}>{children}</ol>;
}

export function AgentLogView({
  log,
  compact = false,
  narrow = false,
  fit = false,
  strip = false,
  market = false,
  className = "",
}: {
  log: AgentLog | null;
  compact?: boolean;
  narrow?: boolean;
  fit?: boolean;
  strip?: boolean;
  /** The landing: the log is the daily check of the whole market, told apart from the example's own three agents. */
  market?: boolean;
  className?: string;
}) {
  const grid = narrow ? ROW_GRID_NARROW : ROW_GRID;
  if (!log || log.entries.length === 0) return null;
  // The compact log (home page) leaves out members' own agents: a handful of runs is true but reads small there.
  const entries = log.entries.filter((entry) => !(compact && entry.source === "agents"));
  if (entries.length === 0) return null;
  // Only the briefing (`fit` in its rail, `strip` under it) uses the status line, and only for entries that carry one.
  const status = (entry: AgentLog["entries"][number]) => (fit || strip) && Boolean(entry.kind && entry.status);
  const tiles = strip && entries.every(status);
  const columns = stripColumns(entries.length);
  const spare = (columns - (entries.length % columns)) % columns;
  const title = market ? marketCheckTitle(log) : agentLogTitle(log);
  const lead = market ? log.marketLead ?? marketCheckLead(log) : log.lead;
  return (
    <section aria-label={title} className={`${CARD} ${fit ? FIT_CARD : ""} ${className}`}>
      <header className={`shrink-0 ${compact ? "px-4 pb-2 pt-3" : "px-4 pb-2.5 pt-3.5 sm:px-5"}`}>
        <h2 className="text-[15px] font-semibold leading-6 text-oa-fg">{title}</h2>
        {/* On the briefing the rows are status lines that read in two seconds (owner rule 10): no lead paragraph. */}
        {fit || strip ? null : <p className="mt-0.5 text-pretty text-[14px] leading-5 text-oa-muted-fg">{lead}</p>}
      </header>
      <ListOf
        fit={fit}
        className={`border-t border-oa-border ${fit ? FIT_LIST : ""} ${tiles ? "lg:grid lg:[grid-template-columns:repeat(var(--strip-cols),minmax(0,1fr))]" : ""}`}
        style={tiles ? ({ "--strip-cols": columns } as React.CSSProperties) : undefined}
      >
        {entries.map((entry, index) => (
          <li
            key={entry.source}
            className={`border-b border-oa-border last:border-b-0 ${
              tiles
                ? // Tiles: a line between columns, and between the two rows when there are two; never on the outer edge.
                  `${(index + 1) % columns === 0 || index === entries.length - 1 ? "" : "lg:border-r"} ${index < columns * (Math.ceil(entries.length / columns) - 1) ? "" : "lg:border-b-0"}`
                : ""
            }`}
            // Seven runs make rows of four and three: the last tile takes the spare column, so the row ends full.
            style={tiles && index === entries.length - 1 && spare > 0 ? { gridColumn: `span ${spare + 1}` } : undefined}
          >
            {status(entry) ? (
              // The briefing's status line: what ran, its one figure and when (owner rule 10), at every width.
              <Link
                prefetch={false}
                href={entry.href}
                // Starts with the words on screen (kind, figure, time), so voice control finds it; the sentence follows.
                aria-label={`${entry.kind}, ${entry.status}, ${entry.time}: ${entrySentence(entry)}`}
                className={`${STATUS_ROW} ${tiles ? STRIP_TILE : ""} min-h-11 px-4 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-5`}
              >
                <span className={`whitespace-nowrap text-[14px] leading-5 text-oa-fg ${tiles ? "lg:min-w-0 lg:truncate lg:[grid-area:kind]" : ""}`}>{entry.kind}</span>
                <span
                  className={`oa-mono text-pretty text-right text-[13px] font-semibold tabular-nums leading-5 text-oa-fg ${
                    tiles ? "lg:text-left lg:text-[15px] lg:leading-6 lg:[grid-area:status]" : ""
                  }`}
                >
                  {entry.status}
                </span>
                <time
                  dateTime={entry.at}
                  className={`oa-mono whitespace-nowrap text-right text-[12px] tabular-nums leading-5 text-oa-muted-fg ${tiles ? "lg:[grid-area:time]" : ""}`}
                >
                  {entry.time}
                </time>
                {entry.stocks && entry.stocks.length > 0 ? <StockChips stocks={entry.stocks} className={tiles ? "lg:mt-0.5 lg:[grid-area:chips]" : ""} /> : null}
              </Link>
            ) : (
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
            )}
          </li>
        ))}
      </ListOf>
    </section>
  );
}

/**
 * The log, read from its shared cache. Stream it inside <Suspense fallback={<AgentLogGhost />}>. `own`: one
 * portfolio's own agents (the example's, on the signed-out briefing), whose run and flagged stocks take the Agents row.
 */
export async function AgentLog({
  compact = false,
  narrow = false,
  fit = false,
  strip = false,
  market = false,
  className = "",
  own = null,
}: {
  compact?: boolean;
  narrow?: boolean;
  fit?: boolean;
  strip?: boolean;
  market?: boolean;
  className?: string;
  own?: OwnAgentRuns | null;
}) {
  return <AgentLogView log={withOwnAgents(await getAgentLog(), own)} compact={compact} narrow={narrow} fit={fit} strip={strip} market={market} className={className} />;
}

/**
 * The log's shape while it loads: the same header and rows, so nothing jumps when it arrives. `narrow` is the
 * briefing's rail, whose rows are status lines (kind, figure, time) and whose header has no lead line.
 */
export function AgentLogGhost({
  rows = 5,
  compact = false,
  narrow = false,
  strip = false,
  className = "",
}: {
  rows?: number;
  compact?: boolean;
  narrow?: boolean;
  /** The briefing's strip: status lines on a phone, one row of tiles on a wide screen. */
  strip?: boolean;
  className?: string;
}) {
  return (
    <div className={`${CARD} ${className}`} aria-hidden="true">
      <div className={compact ? "px-4 pb-2 pt-3" : "px-4 pb-2.5 pt-3.5 sm:px-5"}>
        <Bar className="mt-1 h-4 w-52" />
        {narrow || strip ? null : <Bar className="mt-2 h-3.5 w-full max-w-[34rem]" />}
      </div>
      {strip ? (
        <div className="hidden border-t border-oa-border lg:grid lg:[grid-template-columns:repeat(var(--strip-cols),minmax(0,1fr))]" style={{ "--strip-cols": rows } as React.CSSProperties}>
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="border-r border-oa-border px-5 py-3 last:border-r-0">
              <Bar className="h-4 w-20" />
              <Bar className="mt-2 h-5 w-28" />
            </div>
          ))}
        </div>
      ) : null}
      <div className={`border-t border-oa-border ${strip ? "lg:hidden" : ""}`}>
        {Array.from({ length: rows }, (_, index) =>
          narrow || strip ? (
            <div key={index} className={`grid min-h-11 grid-cols-[auto_minmax(0,1fr)_3.6rem] items-center gap-x-3 border-b lg:min-h-9 border-oa-border px-4 last:border-b-0 sm:px-5`}>
              <Bar className="h-4 w-16" />
              <Bar className="ml-auto h-4 w-24" />
              <Bar className="ml-auto h-3.5 w-12" />
            </div>
          ) : (
            <div key={index} className={`${ROW_GRID} min-h-11 items-center border-b border-oa-border px-4 py-2 last:border-b-0 sm:px-5 ${compact ? "" : "sm:py-2.5"}`}>
              <Bar className="hidden h-3.5 w-14 sm:block" />
              <Bar className="h-4 w-10 sm:ml-auto" />
              <Bar className={`h-4 ${index % 2 ? "w-3/4" : "w-11/12"}`} />
            </div>
          ),
        )}
      </div>
    </div>
  );
}
