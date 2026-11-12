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

/**
 * Company names by ticker, from the person's own list, so a row can say "SPCX Space Exploration" without a read of
 * its own. Empty for the signed-out example: the row then shows the ticker alone.
 */
export const StockNamesContext = React.createContext<Readonly<Record<string, string>>>({});

/**
 * The stocks a run found, one row each and the row is the link: logo, ticker and name, one short line (the level it
 * reached or when it reports), and on the right the close with the move into it. The run's date is said once, in the
 * line under the list (asOf), so no row carries one. About eight rows show, then the list scrolls.
 */
function StockRows({ view }: { view: RunView }) {
  const names = React.useContext(StockNamesContext);
  const unlisted = view.movesTotal - view.moves.length;
  const unlistedDates = view.datesTotal - view.dates.length;
  const more = [
    unlisted > 0 ? `${unlisted} smaller ${unlisted === 1 ? "move" : "moves"}` : "",
    unlistedDates > 0 ? `${unlistedDates} more ${unlistedDates === 1 ? "report" : "reports"}` : "",
  ].filter(Boolean);
  return (
    <div className="overflow-hidden rounded-lg border border-oa-border bg-oa-card">
      <ul className="scrollbar-hide max-h-[27rem] divide-y divide-oa-border overflow-y-auto">
        {view.rows.map((row) => (
          <li key={row.ticker}>
            <Link
              href={`/stock/${encodeURIComponent(row.ticker)}`}
              prefetch={false}
              className="grid min-h-[52px] grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
            >
              <StockLogo ticker={row.ticker} size={28} atOnce />
              <span className="min-w-0">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className={`${NUM} shrink-0 text-[13.5px] font-semibold text-oa-fg`}>{row.ticker}</span>
                  {names[row.ticker] ? <span className="min-w-0 truncate text-[12.5px] text-oa-muted-fg">{names[row.ticker]}</span> : null}
                </span>
                {row.line ? (
                  <span className={`block text-pretty text-[12.5px] leading-[17px] ${row.zone ? "font-medium text-oa-primary" : "text-oa-muted-fg"}`}>{row.line}</span>
                ) : null}
              </span>
              {row.close != null || row.change_pct != null ? (
                <span className="text-right leading-[18px]">
                  <span className={`${NUM} block text-[13.5px] text-oa-fg`}>{money(row.close)}</span>
                  {row.change_pct != null ? (
                    <span className={`${NUM} block text-[12.5px] ${row.change_pct > 0 ? "text-signal-bullish" : row.change_pct < 0 ? "text-signal-bearish" : "text-oa-muted-fg"}`}>
                      {signedPct(row.change_pct)}
                    </span>
                  ) : null}
                </span>
              ) : (
                <span />
              )}
            </Link>
          </li>
        ))}
      </ul>
      {more.length > 0 ? (
        <p className="border-t border-oa-border px-3 py-1.5 text-[12.5px] text-oa-muted-fg">
          {more.join(" and ")} not listed
        </p>
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
      {view.rows.length > 0 ? <StockRows view={view} /> : null}
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

