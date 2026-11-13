"use client";

import * as React from "react";

import { StockLogo } from "@/components/stock-logo";
import { HISTORY_ROWS, type HistoryRow } from "@/lib/agent-recipes/view";

const NUM = "oa-mono tabular-nums";

const MARK: Record<HistoryRow["decision"], string> = {
  notify: "bg-oa-primary",
  nothing: "bg-[color-mix(in_srgb,var(--oa-fg)_22%,transparent)]",
  could_not_check: "border border-dashed border-[color-mix(in_srgb,var(--oa-fg)_40%,transparent)] bg-transparent",
};

/**
 * An agent's dated history, one line per check, newest first: what it sent, or what it checked when it had nothing
 * to say ("Checked NVDA filings: nothing new"). About eight rows show, then one quiet "Show N more".
 */
export function JobHistory({ rows }: { rows: HistoryRow[] }) {
  const [all, setAll] = React.useState(false);
  const shown = all ? rows : rows.slice(0, HISTORY_ROWS);
  return (
    <>
      <ol className="divide-y divide-oa-border">
        {shown.map((row) => (
          <li key={row.day} className="grid min-h-10 grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-3 px-4 py-2 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <span className="flex items-start gap-2 text-[12.5px] leading-[18px] text-oa-muted-fg">
              <span className={`mt-[5px] size-2 shrink-0 rounded-full ${MARK[row.decision]}`} aria-hidden="true" />
              <span>
                {row.label}
                {row.checks > 1 ? <span className={`${NUM} block text-[11.5px]`}>{row.checks} checks</span> : null}
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-2">
              {row.decision === "notify" && row.tickers.length > 0 ? (
                <span className="flex shrink-0 -space-x-1.5">
                  {row.tickers.map((ticker) => (
                    <StockLogo key={ticker} ticker={ticker} size={20} atOnce className="ring-2 ring-oa-card" />
                  ))}
                </span>
              ) : null}
              <span className={`min-w-0 text-pretty text-[13.5px] leading-5 ${row.decision === "notify" ? "font-medium text-oa-fg" : "text-oa-muted-fg"}`}>{row.text}</span>
            </span>
          </li>
        ))}
      </ol>
      {rows.length > HISTORY_ROWS && !all ? (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="w-full cursor-pointer border-t border-oa-border px-4 py-2 text-left text-[13px] font-medium text-oa-muted-fg outline-none hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
        >
          Show {rows.length - HISTORY_ROWS} more
        </button>
      ) : null}
    </>
  );
}
