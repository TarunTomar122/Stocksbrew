"use client";

import Link from "next/link";
import * as React from "react";

import { StockLogo } from "@/components/stock-logo";
import { shortDate, type AgentEvaluation, type AgentJob } from "@/lib/agent-jobs";
import { presentRun, signedPct, VERDICT_LABEL, type AgentVerdict, type RunView } from "@/lib/agent-jobs-present";
import { AppLink } from "@/components/oa/app-link";

export type RunRow = AgentEvaluation & { key: string; day: string; ran_at?: string };

const NUM = "oa-mono tabular-nums";

const CHIP: Record<AgentVerdict, string> = {
  act: "border-[color:color-mix(in_srgb,var(--oa-primary)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--oa-primary)_12%,transparent)] text-oa-primary",
  look: "border-[color:color-mix(in_srgb,var(--oa-fg)_30%,transparent)] bg-oa-card text-oa-fg",
  quiet: "border-oa-border bg-oa-bg text-oa-muted-fg",
  blocked: "border-dashed border-[color:color-mix(in_srgb,var(--oa-fg)_30%,transparent)] bg-transparent text-oa-muted-fg",
};

/** The verdict in human words. The same four words everywhere on the page. */
export function VerdictChip({ verdict, className = "" }: { verdict: AgentVerdict; className?: string }) {
  return (
    <span
      className={`oa-mono inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded border px-1.5 text-[11.5px] font-medium uppercase tracking-[0.04em] ${CHIP[verdict]} ${className}`}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

function money(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StockCell({ ticker }: { ticker: string }) {
  return (
    <Link
      href={`/stock/${encodeURIComponent(ticker)}`}
      prefetch={false}
      className="inline-flex min-w-0 items-center gap-2 rounded text-oa-fg outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]"
    >
      <StockLogo ticker={ticker} size={18} />
      <span className={`${NUM} text-[13.5px] font-medium`}>{ticker}</span>
    </Link>
  );
}

const SHOW = 5;

/** The moves a run found, as a table: the biggest few, then the rest on request. */
function MovesTable({ view }: { view: RunView }) {
  const [all, setAll] = React.useState(false);
  const zoned = view.moves.some((row) => row.zone);
  const rows = all ? view.moves : view.moves.slice(0, SHOW);
  const hidden = view.moves.length - rows.length;
  const unlisted = view.movesTotal - view.moves.length;
  return (
    <div className="overflow-hidden rounded-lg border border-oa-border bg-oa-card">
      <table className="w-full table-fixed border-collapse text-[13.5px]">
        <thead>
          <tr className="border-b border-oa-border text-left">
            <th scope="col" className="oa-caption h-8 px-3 font-normal">Stock</th>
            <th scope="col" className="oa-caption h-8 w-[5.5rem] px-3 text-right font-normal">Move</th>
            <th scope="col" className="oa-caption h-8 w-[6.5rem] px-3 text-right font-normal">Close</th>
            {zoned ? <th scope="col" className="oa-caption hidden h-8 w-[11rem] px-3 text-right font-normal sm:table-cell">Level</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.ticker} className="border-b border-oa-border last:border-b-0 hover:bg-oa-accent">
              <td className="h-9 px-3">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2">
                  <StockCell ticker={row.ticker} />
                  {row.zone ? <ZoneNote zone={row.zone} level={row.level} className="sm:hidden" /> : null}
                </span>
              </td>
              <td
                className={`${NUM} h-9 px-3 text-right ${
                  row.change_pct == null ? "text-oa-muted-fg" : row.change_pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"
                }`}
              >
                {row.change_pct == null ? "" : signedPct(row.change_pct)}
              </td>
              <td className={`${NUM} h-9 px-3 text-right text-oa-fg`}>{money(row.close)}</td>
              {zoned ? <td className="hidden h-9 px-3 text-right sm:table-cell">{row.zone ? <ZoneNote zone={row.zone} level={row.level} /> : null}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 || unlisted > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-oa-border px-3 py-1.5 text-[12.5px] text-oa-muted-fg">
          {hidden > 0 ? (
            <button type="button" onClick={() => setAll(true)} className="cursor-pointer font-medium text-oa-fg hover:underline">
              {hidden} more
            </button>
          ) : (
            <span />
          )}
          {unlisted > 0 && (all || hidden === 0) ? <span>{unlisted} smaller moves not listed</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function ZoneNote({ zone, level, className = "" }: { zone: "add" | "trim"; level: number | null; className?: string }) {
  return (
    <span className={`oa-mono whitespace-nowrap text-[12px] font-medium text-oa-primary ${className}`}>
      {zone === "trim" ? "past trim" : "into add zone"}
      {level != null ? ` ${money(level)}` : ""}
    </span>
  );
}

function DatesTable({ view }: { view: RunView }) {
  return (
    <div className="overflow-hidden rounded-lg border border-oa-border bg-oa-card">
      <table className="w-full table-fixed border-collapse text-[13.5px]">
        <thead>
          <tr className="border-b border-oa-border text-left">
            <th scope="col" className="oa-caption h-8 px-3 font-normal">Reports earnings</th>
            <th scope="col" className="oa-caption h-8 w-[7rem] px-3 text-right font-normal">When</th>
            <th scope="col" className="oa-caption hidden h-8 w-[9rem] px-3 text-right font-normal sm:table-cell">Time</th>
          </tr>
        </thead>
        <tbody>
          {view.dates.map((row) => (
            <tr key={`${row.ticker}-${row.date}`} className="border-b border-oa-border last:border-b-0 hover:bg-oa-accent">
              <td className="h-9 px-3">
                <StockCell ticker={row.ticker} />
              </td>
              <td className={`${NUM} h-9 px-3 text-right text-oa-fg`}>
                {/^[A-Z][a-z]+day$/.test(row.when) ? `${row.when.slice(0, 3)} ${shortDate(row.date)}` : row.when === "today" || row.when === "tomorrow" ? row.when : shortDate(row.date)}
              </td>
              <td className="hidden h-9 px-3 text-right text-oa-muted-fg sm:table-cell">{row.time ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {view.datesTotal > view.dates.length ? (
        <p className="border-t border-oa-border px-3 py-1.5 text-[12.5px] text-oa-muted-fg">{view.datesTotal - view.dates.length} more not listed</p>
      ) : null}
    </div>
  );
}

/**
 * One run as an agent's report: the verdict, what happened, what to do,
 * then the evidence and one line on what it read and when.
 */
export function RunReport({ view, showHeadline = true }: { view: RunView; showHeadline?: boolean }) {
  return (
    <div className="grid min-w-0 gap-2.5">
      {showHeadline ? (
        <div>
          <p className="text-pretty text-[15px] font-medium leading-[22px] text-oa-fg">{view.headline}</p>
          <p className="mt-0.5 text-pretty text-[14px] leading-5 text-oa-muted-fg">{view.todo}</p>
        </div>
      ) : null}
      {view.moves.length > 0 ? <MovesTable view={view} /> : null}
      {view.dates.length > 0 ? <DatesTable view={view} /> : null}
      {view.notes.length > 0 ? (
        <ul className="divide-y divide-oa-border overflow-hidden rounded-lg border border-oa-border bg-oa-card">
          {view.notes.map((note, index) => (
            <li key={`${note.title}-${index}`} className="px-3 py-2 text-[13.5px] leading-5">
              <p className="font-medium text-oa-fg">
                {note.url ? (
                  <AppLink
                    href={note.url}
                    {...(/^https?:/.test(note.url) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="hover:underline"
                  >
                    {note.title}
                  </AppLink>
                ) : (
                  note.title
                )}
              </p>
              {note.detail ? <p className="text-oa-muted-fg">{note.detail}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="oa-mono text-[11.5px] leading-4 text-oa-muted-fg">{view.asOf}</p>
    </div>
  );
}

function RunLine({ run, job, replay }: { run: RunRow; job: (Pick<AgentJob, "trigger"> & Partial<Pick<AgentJob, "scope">>) | null; replay: boolean }) {
  const [open, setOpen] = React.useState(false);
  const view = React.useMemo(() => presentRun(run, job, { replay }), [run, job, replay]);
  return (
    <li className="border-b border-oa-border last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid min-h-10 w-full cursor-pointer grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 px-3.5 py-2 text-left outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:grid-cols-[3.25rem_7.5rem_minmax(0,1fr)] sm:px-4"
      >
        <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{shortDate(run.day)}</span>
        <span className="justify-self-start">
          <VerdictChip verdict={view.verdict} />
        </span>
        <span className={`col-span-2 min-w-0 text-[13.5px] leading-5 sm:col-span-1 ${open ? "" : "line-clamp-2 sm:line-clamp-1"} ${view.verdict === "quiet" ? "text-oa-muted-fg" : "text-oa-fg"}`}>
          {view.headline}
        </span>
      </button>
      {open ? (
        <div className="px-3.5 pb-3 sm:px-4 sm:pl-[14rem]">
          <p className="mb-2 text-[13.5px] leading-5 text-oa-muted-fg">{view.todo}</p>
          <RunReport view={view} showHeadline={false} />
        </div>
      ) : null}
    </li>
  );
}

/** Earlier runs, one line each, closed until clicked. */
export function RunList({
  runs,
  job,
  limit = 10,
  replay = false,
}: {
  runs: RunRow[];
  job: (Pick<AgentJob, "trigger"> & Partial<Pick<AgentJob, "scope">>) | null;
  limit?: number;
  replay?: boolean;
}) {
  const [all, setAll] = React.useState(false);
  const shown = all ? runs : runs.slice(0, limit);
  return (
    <>
      <ul>
        {shown.map((run) => (
          <RunLine key={run.key} run={run} job={job} replay={replay} />
        ))}
      </ul>
      {runs.length > limit && !all ? (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="w-full cursor-pointer border-t border-oa-border px-4 py-2 text-left text-[13px] font-medium text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
        >
          Show all {runs.length} runs
        </button>
      ) : null}
    </>
  );
}

/** One mark per check, oldest on the left: tall when it had something to say. */
export function SessionStrip({ runs, job }: { runs: RunRow[]; job: (Pick<AgentJob, "trigger"> & Partial<Pick<AgentJob, "scope">>) | null }) {
  const ordered = [...runs].reverse();
  if (ordered.length === 0) return null;
  // A tall bar is a day it would have told you; a short one a quiet day. Said under the strip, not in a legend box.
  return (
    <div className="flex flex-col items-end gap-1">
    <div className="flex items-end gap-[3px]" role="img" aria-label={`${ordered.length} market days, oldest first`}>
      {ordered.map((run) => {
        const verdict = presentRun(run, job, { replay: true }).verdict;
        return (
          <span
            key={run.key}
            title={`${shortDate(run.day)}: ${VERDICT_LABEL[verdict]}`}
            className={
              verdict === "act" || verdict === "look"
                ? `h-5 w-2 rounded-[2px] ${verdict === "act" ? "bg-oa-primary" : "bg-[color:color-mix(in_srgb,var(--oa-fg)_55%,transparent)]"}`
                : verdict === "quiet"
                  ? "h-2 w-2 rounded-[2px] bg-[color:color-mix(in_srgb,var(--oa-fg)_20%,transparent)]"
                  : "h-2 w-2 rounded-[2px] border border-dashed border-[color:color-mix(in_srgb,var(--oa-fg)_35%,transparent)]"
            }
          />
        );
      })}
    </div>
    <span className="text-[11.5px] leading-4 text-oa-muted-fg">Each bar is a market day; a tall bar is a day it would have emailed you</span>
    </div>
  );
}
